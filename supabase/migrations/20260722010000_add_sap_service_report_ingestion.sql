alter table public.service_reports
  add column if not exists external_source text,
  add column if not exists external_key text,
  add column if not exists external_document_number text,
  add column if not exists external_activity_folio text,
  add column if not exists source_imported_at timestamptz;

create unique index if not exists service_reports_external_key_unique_idx
  on public.service_reports (external_key)
  where external_key is not null;

create table if not exists public.sap_service_reports (
  id uuid primary key default gen_random_uuid(),
  service_report_id uuid not null unique references public.service_reports(id) on delete cascade,
  report_number text not null,
  activity_folio text not null,
  service_kind text not null check (service_kind in ('preventivo', 'correctivo', 'otro')),
  description text,
  assistance_type text,
  start_date date,
  end_date date,
  client_code text,
  client_name text,
  client_address text,
  equipment_serial text not null,
  equipment_model text,
  equipment_installed_on date,
  firmware_version text,
  software_version text,
  technician_name text,
  client_signer_name text,
  technician_signer_name text,
  total_duration_minutes integer not null default 0 check (total_duration_minutes >= 0),
  final_observation text,
  efforts jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  latest_file_sha256 text not null,
  latest_storage_path text,
  first_imported_at timestamptz not null default timezone('utc', now()),
  last_imported_at timestamptz not null default timezone('utc', now()),
  unique (report_number, activity_folio)
);

create table if not exists public.sap_service_report_imports (
  id uuid primary key default gen_random_uuid(),
  sap_service_report_id uuid not null references public.sap_service_reports(id) on delete cascade,
  file_name text not null,
  file_size bigint not null check (file_size > 0),
  file_sha256 text not null unique,
  storage_path text,
  source_message_id text,
  source_sender text,
  extraction_method text not null check (extraction_method in ('embedded_text', 'ocr')),
  parser_version text not null,
  normalized_payload jsonb not null,
  imported_at timestamptz not null default timezone('utc', now())
);

create index if not exists sap_service_reports_serial_date_idx
  on public.sap_service_reports (equipment_serial, end_date desc);

create index if not exists sap_service_reports_kind_date_idx
  on public.sap_service_reports (service_kind, end_date desc);

create index if not exists sap_service_report_imports_message_idx
  on public.sap_service_report_imports (source_message_id)
  where source_message_id is not null;

alter table public.sap_service_reports enable row level security;
alter table public.sap_service_report_imports enable row level security;

create policy "authenticated can read sap service reports"
on public.sap_service_reports for select to authenticated using (true);

create policy "authenticated can read sap service report imports"
on public.sap_service_report_imports for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sap-service-reports', 'sap-service-reports', false, 20971520, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "authenticated can read sap service report files"
on storage.objects for select to authenticated
using (bucket_id = 'sap-service-reports');

create or replace function public.ingest_sap_service_report(
  p_payload jsonb,
  p_storage_path text,
  p_source_message_id text default null,
  p_source_sender text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_import public.sap_service_report_imports%rowtype;
  v_service_report_id uuid;
  v_sap_report_id uuid;
  v_import_id uuid;
  v_external_key text;
  v_equipment_id text;
  v_client_id integer;
  v_material jsonb;
  v_material_index integer := 0;
  v_solution text;
begin
  if coalesce(p_payload->>'schema_version', '') <> 'sap-fsm-service-v1' then
    raise exception 'unsupported payload schema';
  end if;
  if nullif(trim(p_payload->>'report_number'), '') is null
     or nullif(trim(p_payload->>'activity_folio'), '') is null
     or nullif(trim(p_payload#>>'{equipment,serial_number}'), '') is null then
    raise exception 'report_number, activity_folio and equipment serial are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_payload->>'file_sha256', 0));

  select * into v_existing_import
  from public.sap_service_report_imports
  where file_sha256 = p_payload->>'file_sha256';
  if found then
    return jsonb_build_object(
      'status', 'duplicate_file',
      'import_id', v_existing_import.id,
      'sap_service_report_id', v_existing_import.sap_service_report_id
    );
  end if;

  v_external_key := concat('sap_fsm:', p_payload->>'report_number', ':', p_payload->>'activity_folio');
  perform pg_advisory_xact_lock(hashtextextended(v_external_key, 0));

  select id, cliente_id into v_equipment_id, v_client_id
  from public.equipos
  where public.normalize_equipment_serial(numero_serie) = public.normalize_equipment_serial(p_payload#>>'{equipment,serial_number}')
  order by actualizado_en desc nulls last
  limit 1;

  select id into v_service_report_id
  from public.service_reports
  where external_key = v_external_key;

  v_solution := coalesce(
    nullif(trim(p_payload->>'final_observation'), ''),
    concat('Checklist SAP: ', jsonb_array_length(coalesce(p_payload->'checklist', '[]'::jsonb)), ' conceptos registrados.')
  );

  if v_service_report_id is null then
    insert into public.service_reports (
      report_type, status, service_type, report_reference, service_reference, subject,
      service_date, client_id, client_name, site_address, equipment_id, equipment_serial, equipment_name,
      solution, software_version, firmware_version, attachment_bucket, attachment_path,
      attachment_filename, report_payload, external_source, external_key,
      external_document_number, external_activity_folio, source_imported_at
    ) values (
      'servicio', 'registrado', p_payload->>'service_kind', p_payload->>'report_number',
      p_payload->>'activity_folio', p_payload->>'description',
      coalesce((p_payload->>'end_date')::date, (p_payload->>'start_date')::date), v_client_id,
      p_payload#>>'{client,name}', p_payload#>>'{client,address}', v_equipment_id,
      p_payload#>>'{equipment,serial_number}', p_payload#>>'{equipment,model}',
      v_solution, p_payload#>>'{equipment,software_version}', p_payload#>>'{equipment,firmware_version}',
      'sap-service-reports', p_storage_path, p_payload->>'file_name', p_payload,
      'sap_fsm', v_external_key, p_payload->>'report_number', p_payload->>'activity_folio', timezone('utc', now())
    ) returning id into v_service_report_id;
  else
    update public.service_reports set
      status = 'registrado',
      service_type = p_payload->>'service_kind',
      subject = p_payload->>'description',
      service_date = coalesce((p_payload->>'end_date')::date, (p_payload->>'start_date')::date),
      client_id = coalesce(v_client_id, client_id),
      client_name = p_payload#>>'{client,name}',
      site_address = p_payload#>>'{client,address}',
      equipment_id = coalesce(v_equipment_id, equipment_id),
      equipment_serial = p_payload#>>'{equipment,serial_number}',
      equipment_name = p_payload#>>'{equipment,model}',
      solution = v_solution,
      software_version = p_payload#>>'{equipment,software_version}',
      firmware_version = p_payload#>>'{equipment,firmware_version}',
      attachment_bucket = 'sap-service-reports',
      attachment_path = p_storage_path,
      attachment_filename = p_payload->>'file_name',
      report_payload = p_payload,
      source_imported_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = v_service_report_id;
  end if;

  insert into public.sap_service_reports (
    service_report_id, report_number, activity_folio, service_kind, description, assistance_type,
    start_date, end_date, client_code, client_name, client_address, equipment_serial,
    equipment_model, equipment_installed_on, firmware_version, software_version, technician_name,
    client_signer_name, technician_signer_name,
    total_duration_minutes, final_observation, efforts, checklist, materials, normalized_payload,
    latest_file_sha256, latest_storage_path
  ) values (
    v_service_report_id, p_payload->>'report_number', p_payload->>'activity_folio', p_payload->>'service_kind',
    p_payload->>'description', p_payload->>'assistance_type', (p_payload->>'start_date')::date,
    (p_payload->>'end_date')::date, p_payload#>>'{client,code}', p_payload#>>'{client,name}',
    p_payload#>>'{client,address}', p_payload#>>'{equipment,serial_number}', p_payload#>>'{equipment,model}',
    (p_payload#>>'{equipment,installed_on}')::date, p_payload#>>'{equipment,firmware_version}',
    p_payload#>>'{equipment,software_version}', p_payload->>'technician',
    p_payload#>>'{signatures,client_name}', p_payload#>>'{signatures,technician_name}',
    coalesce((p_payload->>'total_duration_minutes')::integer, 0), p_payload->>'final_observation',
    coalesce(p_payload->'efforts', '[]'::jsonb), coalesce(p_payload->'checklist', '[]'::jsonb),
    coalesce(p_payload->'materials', '[]'::jsonb), p_payload, p_payload->>'file_sha256', p_storage_path
  )
  on conflict (report_number, activity_folio) do update set
    service_report_id = excluded.service_report_id,
    service_kind = excluded.service_kind,
    description = excluded.description,
    assistance_type = excluded.assistance_type,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    client_code = excluded.client_code,
    client_name = excluded.client_name,
    client_address = excluded.client_address,
    equipment_serial = excluded.equipment_serial,
    equipment_model = excluded.equipment_model,
    equipment_installed_on = excluded.equipment_installed_on,
    firmware_version = excluded.firmware_version,
    software_version = excluded.software_version,
    technician_name = excluded.technician_name,
    client_signer_name = excluded.client_signer_name,
    technician_signer_name = excluded.technician_signer_name,
    total_duration_minutes = excluded.total_duration_minutes,
    final_observation = excluded.final_observation,
    efforts = excluded.efforts,
    checklist = excluded.checklist,
    materials = excluded.materials,
    normalized_payload = excluded.normalized_payload,
    latest_file_sha256 = excluded.latest_file_sha256,
    latest_storage_path = excluded.latest_storage_path,
    last_imported_at = timezone('utc', now())
  returning id into v_sap_report_id;

  insert into public.sap_service_report_imports (
    sap_service_report_id, file_name, file_size, file_sha256, storage_path,
    source_message_id, source_sender, extraction_method, parser_version, normalized_payload
  ) values (
    v_sap_report_id, p_payload->>'file_name', (p_payload->>'file_size')::bigint,
    p_payload->>'file_sha256', p_storage_path, p_source_message_id, p_source_sender,
    p_payload->>'extraction_method', p_payload->>'parser_version', p_payload
  ) returning id into v_import_id;

  delete from public.service_report_materials where service_report_id = v_service_report_id;
  for v_material in select value from jsonb_array_elements(coalesce(p_payload->'materials', '[]'::jsonb))
  loop
    v_material_index := v_material_index + 1;
    insert into public.service_report_materials (
      service_report_id, item_id, material_kind, quantity, product_name, reference_code,
      catalog_code, notes, metadata
    ) values (
      v_service_report_id, concat('sap-', v_material_index), 'refaccion',
      greatest(1, ceil(coalesce((v_material->>'quantity')::numeric, 1)))::integer,
      v_material->>'description', v_material->>'code', v_material->>'code',
      concat('Importado de actividad SAP ', p_payload->>'activity_folio'), v_material
    );
  end loop;

  return jsonb_build_object(
    'status', 'processed',
    'import_id', v_import_id,
    'sap_service_report_id', v_sap_report_id,
    'service_report_id', v_service_report_id
  );
end;
$$;

revoke all on function public.ingest_sap_service_report(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.ingest_sap_service_report(jsonb, text, text, text) to service_role;
