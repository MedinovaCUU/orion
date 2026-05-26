create table if not exists public.reactivo_rendimientos_catalogo (
  codigo text primary key,
  modelo_familia text not null check (modelo_familia in ('BAX00', 'AX5')),
  descripcion text not null,
  descripcion_normalizada text not null,
  presentacion text not null default '',
  rendimiento_total integer,
  rendimiento_util integer,
  rendimiento_util_seguro integer,
  source_sheet text not null default '',
  actualizado_en timestamptz not null default now()
);

create index if not exists reactivo_rendimientos_catalogo_modelo_desc_idx
  on public.reactivo_rendimientos_catalogo (modelo_familia, descripcion_normalizada);

create table if not exists public.reactivo_test_aliases (
  alias_normalizado text not null,
  modelo_familia text not null check (modelo_familia in ('BAX00', 'AX5', 'ALL')),
  descripcion_normalizada text not null,
  notas text,
  actualizado_en timestamptz not null default now(),
  primary key (alias_normalizado, modelo_familia)
);

create index if not exists reactivo_test_aliases_desc_idx
  on public.reactivo_test_aliases (descripcion_normalizada);

alter table if exists public.consumo_reactivos_hora
  add column if not exists modelo text;

alter table if exists public.consumo_reactivos_hora
  add column if not exists monitor_name text;

alter table if exists public.consumo_reactivos_hora
  add column if not exists machine_name text;

update public.consumo_reactivos_hora
set monitor_name = coalesce(nullif(monitor_name, ''), 'ax00-consumption-monitor')
where monitor_name is null or monitor_name = '';

alter table if exists public.consumo_reactivos_hora
  alter column monitor_name set default 'ax00-consumption-monitor';

alter table if exists public.consumo_reactivos_hora
  alter column monitor_name set not null;

create or replace function public.normalize_reagent_test_name(raw_value text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                upper(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(coalesce(raw_value, ''), '_', ' '),
                          '-', ' '
                        ),
                        '/', ' '
                      ),
                      '(', ' '
                    ),
                    ')', ' '
                  )
                ),
                '(^| )BAX00( |$)',
                ' ',
                'g'
              ),
              '(^| )AX5( |$)',
              ' ',
              'g'
            ),
            '(^| )VERIF( |$)',
            ' ',
            'g'
          ),
          '(^| )VERIFY( |$)',
          ' ',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

delete from public.reactivo_test_aliases;

insert into public.reactivo_test_aliases (alias_normalizado, modelo_familia, descripcion_normalizada, notas)
values
  ('ALBUMIN MAU', 'ALL', 'ALBUMIN MICROALBUMINURIA', 'Alias de microalbuminuria observado en LogConsum.'),
  ('AMYLASE DIRECT', 'ALL', 'ALPHA AMYLASE DIRECT', 'Nombre corto exportado por algunos analizadores.'),
  ('AST', 'ALL', 'AST GOT', 'Se genera tras remover el sufijo VERIF en archivos históricos.'),
  ('CHOL HDL DIRECT', 'ALL', 'HDL DIRECT', 'Alias observado en consumo BAx00.'),
  ('CHOL LDL DIRECT', 'ALL', 'LDL DIRECT', 'Alias previsto para variantes directas LDL.'),
  ('COMPLEMNT C3', 'ALL', 'COMPLEMENT COMPONENT C3', 'Corrige abreviatura observada en consumo histórico.'),
  ('COMPLEMTE C4', 'ALL', 'COMPLEMENT COMPONENT C4', 'Corrige abreviatura observada en consumo histórico.'),
  ('CRPHS', 'ALL', 'C REACTIVE PROTEIN CRP', 'HS-CRP se aproxima al reactivo de CRP del catálogo.'),
  ('IG A', 'ALL', 'INMUNOGLOBULIN A IGA', 'Alias observado en consumo histórico.'),
  ('IG G', 'ALL', 'INMUNOGLOBULIN G IGG', 'Alias observado en consumo histórico.'),
  ('IG M', 'ALL', 'INMUNOGLOBULIN M IGM', 'Alias observado en consumo histórico.'),
  ('IRON', 'ALL', 'IRON FERROZINE', 'Alias observado después de remover VERIF.'),
  ('LIPASE', 'ALL', 'LIPASE DGGR', 'Alias simplificado observado en consumo histórico.'),
  ('PROTEIN TOTALBIR', 'ALL', 'PROTEIN TOTAL', 'Nombre exportado por algunos equipos BAx00.'),
  ('TRANFERRINA', 'ALL', 'TRANSFERRIN', 'Alias en español observado en consumo histórico.'),
  ('UREA BUN UV', 'ALL', 'UREA UV', 'Nombre alterno observado en consumo histórico.'),
  ('URIC', 'ALL', 'URIC ACID', 'Alias observado después de remover VERIF.');

delete from public.reactivo_rendimientos_catalogo;

insert into public.reactivo_rendimientos_catalogo (
  codigo,
  modelo_familia,
  descripcion,
  descripcion_normalizada,
  presentacion,
  rendimiento_total,
  rendimiento_util,
  rendimiento_util_seguro,
  source_sheet
)
values
  ('21503', 'BAX00', 'GLUCOSE BAX00', 'GLUCOSE', '10x60 mL', 2000, 1900, 1710, 'Hoja1'),
  ('23503', 'BAX00', 'GLUCOSE BAX00', 'GLUCOSE', '4x60 mL', 800, 760, 680, 'Hoja1'),
  ('12503', 'AX5', 'GLUCOSE AX5', 'GLUCOSE', '10x50 mL', null, 1600, 1440, 'Hoja2'),
  ('21516', 'BAX00', 'UREA UV BAX00', 'UREA UV', '8x60 mL + 8x15 mL', 2000, 1733, 1560, 'Hoja1'),
  ('23516', 'BAX00', 'UREA UV BAX00', 'UREA UV', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('12516', 'AX5', 'UREA UV AX5', 'UREA UV', '5x40 mL + 5x10 mL', null, 800, 720, 'Hoja2'),
  ('21502', 'BAX00', 'CREATININE BAX00', 'CREATININE', '5x60 mL + 5x60 mL', 2000, 1900, 1710, 'Hoja1'),
  ('23502', 'BAX00', 'CREATININE BAX00', 'CREATININE', '5x20 mL + 5x20 mL', 666, 600, 540, 'Hoja1'),
  ('12502', 'AX5', 'CREATININE AX5', 'CREATININE', '5x50 mL + 5x50 mL', null, 1600, 1440, 'Hoja2'),
  ('21521', 'BAX00', 'URIC ACID BAX00', 'URIC ACID', '10x60 mL', 2000, 1900, 1710, 'Hoja1'),
  ('23521', 'BAX00', 'URIC ACID BAX00', 'URIC ACID', '4x60 mL', 800, 760, 680, 'Hoja1'),
  ('12521', 'AX5', 'URIC ACID AX5', 'URIC ACID', '10x50 mL', null, 1600, 1440, 'Hoja2'),
  ('21505', 'BAX00', 'CHOLESTEROL BAX00', 'CHOLESTEROL', '10x60 mL', 2000, 1900, 1710, 'Hoja1'),
  ('23505', 'BAX00', 'CHOLESTEROL BAX00', 'CHOLESTEROL', '4x60 mL', 800, 760, 680, 'Hoja1'),
  ('12505', 'AX5', 'CHOLESTEROL AX5', 'CHOLESTEROL', '10x50 mL', null, 1600, 1440, 'Hoja2'),
  ('21528', 'BAX00', 'TRIGLYCERIDES BAX00', 'TRIGLYCERIDES', '10x60 mL', 2000, 1900, 1710, 'Hoja1'),
  ('23528', 'BAX00', 'TRIGLYCERIDES BAX00', 'TRIGLYCERIDES', '4x60 mL', 800, 760, 680, 'Hoja1'),
  ('12528', 'AX5', 'TRIGLYCERIDES AX5', 'TRIGLYCERIDES', '10x50 mL', null, 1600, 1440, 'Hoja2'),
  ('21557', 'BAX00', 'HDL-DIRECT BAX00', 'HDL DIRECT', '2x60 mL + 2x20 mL', 400, 360, 320, 'Hoja1'),
  ('23557', 'BAX00', 'HDL-DIRECT BAX00', 'HDL DIRECT', '1x60 mL + 1x20 mL', 200, 180, 160, 'Hoja1'),
  ('12557', 'AX5', 'HDL-DIRECT AX5', 'HDL DIRECT', '4x20 mL', null, 180, 160, 'Hoja2'),
  ('21594', 'BAX00', 'HDL-DIRECT TOOS BAX00', 'HDL DIRECT TOOS', '4x60 mL + 4x20 mL', 800, 720, 640, 'Hoja1'),
  ('23594', 'BAX00', 'HDL-DIRECT TOOS BAX00', 'HDL DIRECT TOOS', '1x60 mL + 1x20 mL', 200, 180, 160, 'Hoja1'),
  ('12757', 'AX5', 'HDL-DIRECT TOOS AX5', 'HDL DIRECT TOOS', '4x20 mL', null, 180, 160, 'Hoja2'),
  ('21585', 'BAX00', 'LDL-DIRECT BAX00', 'LDL DIRECT', '2x60 mL + 2x20 mL', 400, 360, 320, 'Hoja1'),
  ('23585', 'BAX00', 'LDL-DIRECT BAX00', 'LDL DIRECT', '1x60 mL + 1x20 mL', 200, 180, 160, 'Hoja1'),
  ('12585', 'AX5', 'LDL-DIRECT AX5', 'LDL DIRECT', '4x20 mL', null, 180, 160, 'Hoja2'),
  ('21785', 'BAX00', 'LDL-DIRECT TOOS BAX00', 'LDL DIRECT TOOS', '2x60 mL + 2x20 mL', 400, 360, 320, 'Hoja1'),
  ('23785', 'BAX00', 'LDL-DIRECT TOOS BAX00', 'LDL DIRECT TOOS', '1x60 mL + 1x20 mL', 200, 180, 160, 'Hoja1'),
  ('12785', 'AX5', 'LDL-DIRECT TOOS AX5', 'LDL DIRECT TOOS', '4x20 mL', null, 180, 160, 'Hoja2'),
  ('21533', 'BAX00', 'ALT-GPT BAX00', 'ALT GPT', '8x60 mL + 8x15 mL', 3000, 2600, 2340, 'Hoja1'),
  ('23533', 'BAX00', 'ALT-GPT BAX00', 'ALT GPT', '4x60 mL + 4x15 mL', 1500, 1300, 1170, 'Hoja1'),
  ('12533', 'AX5', 'ALT-GPT AX5', 'ALT GPT', '5x40 mL + 5x10 mL', null, 800, 720, 'Hoja2'),
  ('21531', 'BAX00', 'AST-GOT BAX00', 'AST GOT', '8x60 mL + 8x15 mL', 3000, 2600, 2340, 'Hoja1'),
  ('23531', 'BAX00', 'AST-GOT BAX00', 'AST GOT', '4x60 mL + 4x15 mL', 1500, 1300, 1170, 'Hoja1'),
  ('12531', 'AX5', 'AST-GOT AX5', 'AST GOT', '5x40 mL + 5x10 mL', null, 800, 720, 'Hoja2'),
  ('21506', 'BAX00', 'BILI TOTAL DPD BAX00', 'BILI TOTAL DPD', '8x60 mL + 8x15 mL', 2000, 1733, 1560, 'Hoja1'),
  ('23506', 'BAX00', 'BILI TOTAL DPD BAX00', 'BILI TOTAL DPD', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('12506', 'AX5', 'BILI TOTAL DPD AX5', 'BILI TOTAL DPD', '5x40 mL + 5x10 mL', null, 800, 720, 'Hoja2'),
  ('21504', 'BAX00', 'BILI DIRECT DPD BAX00', 'BILI DIRECT DPD', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('23504', 'BAX00', 'BILI DIRECT DPD BAX00', 'BILI DIRECT DPD', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('12504', 'AX5', 'BILI DIRECT DPD AX5', 'BILI DIRECT DPD', '5x40 mL + 5x10 mL', null, 800, 720, 'Hoja2'),
  ('21547', 'BAX00', 'ALBUMIN BAX00', 'ALBUMIN', '10x60 mL', 2000, 1900, 1710, 'Hoja1'),
  ('23547', 'BAX00', 'ALBUMIN BAX00', 'ALBUMIN', '4x60 mL', 800, 760, 680, 'Hoja1'),
  ('12547', 'AX5', 'ALBUMIN AX5', 'ALBUMIN', '5x50 mL', null, 800, 720, 'Hoja2'),
  ('21513', 'BAX00', 'PROTEIN TOTAL BAX00', 'PROTEIN TOTAL', '2x60 mL + 2x20 mL', 533, 480, 430, 'Hoja1'),
  ('23513', 'BAX00', 'PROTEIN TOTAL BAX00', 'PROTEIN TOTAL', '1x60 mL + 1x20 mL', 266, 240, 210, 'Hoja1'),
  ('12500', 'AX5', 'PROTEIN TOTAL AX5', 'PROTEIN TOTAL', '10x50 mL', null, 1600, 1440, 'Hoja2'),
  ('21520', 'BAX00', 'GAMMA-GT BAX00', 'GAMMA GT', '4x60 mL + 4x15 mL', 1500, 1300, 1170, 'Hoja1'),
  ('23520', 'BAX00', 'GAMMA-GT BAX00', 'GAMMA GT', '2x60 mL + 2x15 mL', 750, 650, 580, 'Hoja1'),
  ('12520', 'AX5', 'GAMMA-GT AX5', 'GAMMA GT', '5x50 mL', null, 800, 720, 'Hoja2'),
  ('21580', 'BAX00', 'LDH BAX00', 'LDH', '8x60 mL + 8x15 mL', 3000, 2600, 2340, 'Hoja1'),
  ('23580', 'BAX00', 'LDH BAX00', 'LDH', '4x60 mL + 4x15 mL', 1500, 1300, 1170, 'Hoja1'),
  ('12580', 'AX5', 'LDH AX5', 'LDH', '5x50 mL', null, 800, 720, 'Hoja2'),
  ('21586', 'BAX00', 'LDH-IFCC BAX00', 'LDH IFCC', '8x60 mL + 8x15 mL', 2000, 1733, 1560, 'Hoja1'),
  ('23586', 'BAX00', 'LDH-IFCC BAX00', 'LDH IFCC', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('11586', 'AX5', 'LDH-IFCC AX5', 'LDH IFCC', '1x40 mL + 1x10 mL', null, 133, 120, 'Hoja2'),
  ('21592', 'BAX00', 'ALP-AMP BAX00', 'ALP AMP', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('23592', 'BAX00', 'ALP-AMP BAX00', 'ALP AMP', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('12518', 'AX5', 'ALP-AMP AX5', 'ALP AMP', '5x20 mL', null, 300, 270, 'Hoja2'),
  ('21590', 'BAX00', 'ALP-DEA BAX00', 'ALP DEA', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('23590', 'BAX00', 'ALP-DEA BAX00', 'ALP DEA', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('12514', 'AX5', 'ALP-DEA AX5', 'ALP DEA', '5x20 mL', null, 300, 270, 'Hoja2'),
  ('21570', 'BAX00', 'CALCIUM-ARSENAZO BAX00', 'CALCIUM ARSENAZO', '10x60 mL', 2000, 1900, 1710, 'Hoja1'),
  ('23570', 'BAX00', 'CALCIUM-ARSENAZO BAX00', 'CALCIUM ARSENAZO', '4x60 mL', 800, 760, 680, 'Hoja1'),
  ('12570', 'AX5', 'CALCIUM-ARSENAZO AX5', 'CALCIUM ARSENAZO', '10x50 mL', null, 1600, 1440, 'Hoja2'),
  ('21518', 'BAX00', 'PHOSPHORUS BAX00', 'PHOSPHORUS', '4x50 mL + 4x20 mL', 888, 800, 720, 'Hoja1'),
  ('23518', 'BAX00', 'PHOSPHORUS BAX00', 'PHOSPHORUS', '1x50 mL + 1x20 mL', 222, 200, 180, 'Hoja1'),
  ('12508', 'AX5', 'PHOSPHORUS AX5', 'PHOSPHORUS', '3x24 mL + 2x15 mL', null, 289, 260, 'Hoja2'),
  ('21797', 'BAX00', 'MAGNESIUM BAX00', 'MAGNESIUM', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('23797', 'BAX00', 'MAGNESIUM BAX00', 'MAGNESIUM', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('12797', 'AX5', 'MAGNESIUM AX5', 'MAGNESIUM', '5x20 mL', null, 300, 270, 'Hoja2'),
  ('21550', 'BAX00', 'ALPHA-AMYLASE DIRECT BAX00', 'ALPHA AMYLASE DIRECT', '8x20 mL', 533, 480, 430, 'Hoja1'),
  ('23550', 'BAX00', 'ALPHA-AMYLASE DIRECT BAX00', 'ALPHA AMYLASE DIRECT', '4x20 mL', 266, 240, 210, 'Hoja1'),
  ('12550', 'AX5', 'ALPHA-AMYLASE DIRECT AX5', 'ALPHA AMYLASE DIRECT', '5x20 mL', null, 300, 270, 'Hoja2'),
  ('21534', 'BAX00', 'ALPHA-AMYLASE EPS BAX00', 'ALPHA AMYLASE EPS', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('12535', 'AX5', 'ALPHA-AMYLASE EPS AX5', 'ALPHA AMYLASE EPS', '1x40 mL', 133, 126, 110, 'Hoja1'),
  ('21760', 'BAX00', 'LIPASE DGGR BAX00', 'LIPASE DGGR', '1x20 mL + 1x10 mL', 100, 80, 70, 'Hoja1'),
  ('12760', 'AX5', 'LIPASE DGGR AX5', 'LIPASE DGGR', '1x20 mL + 1x10 mL', null, 80, 70, 'Hoja2'),
  ('21790', 'BAX00', 'CK BAX00', 'CK', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('23790', 'BAX00', 'CK BAX00', 'CK', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('12524', 'AX5', 'CK AX5', 'CK', '3x15 mL', null, 130, 110, 'Hoja2'),
  ('21792', 'BAX00', 'CK-MB BAX00', 'CK MB', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('23792', 'BAX00', 'CK-MB BAX00', 'CK MB', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('12566', 'AX5', 'CK-MB AX5', 'CK MB', '3x15 mL', null, 130, 110, 'Hoja2'),
  ('22047', 'BAX00', 'HBA1C-DIRECT BAX00', 'HBA1C DIRECT', '2x60 mL + 2x12 mL', 600, 500, 450, 'Hoja1'),
  ('22147', 'BAX00', 'HBA1C-DIRECT BAX00', 'HBA1C DIRECT', '1x60 mL + 1x12 mL', 300, 250, 220, 'Hoja1'),
  ('13047', 'AX5', 'HBA1C-DIRECT AX5', 'HBA1C DIRECT', '1x50 mL + 1x10 mL', null, 200, 180, 'Hoja2'),
  ('22922', 'BAX00', 'RHEUMATOID FACTORS (RF) BAX00', 'RHEUMATOID FACTORS RF', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('23922', 'BAX00', 'RHEUMATOID FACTORS (RF) BAX00', 'RHEUMATOID FACTORS RF', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13922', 'AX5', 'RHEUMATOID FACTORS (RF) AX5', 'RHEUMATOID FACTORS RF', '1x40 mL + 1x10 mL', 166, 133, 120, 'Hoja1'),
  ('22921', 'BAX00', 'C-REACTIVE PROTEIN (CRP) BAX00', 'C REACTIVE PROTEIN CRP', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('23921', 'BAX00', 'C-REACTIVE PROTEIN (CRP) BAX00', 'C REACTIVE PROTEIN CRP', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13921', 'AX5', 'C-REACTIVE PROTEIN (CRP) AX5', 'C REACTIVE PROTEIN CRP', '2x50 mL', 227, 218, 190, 'Hoja1'),
  ('22923', 'BAX00', 'ANTI-STREPTOLYSIN O (ASO) BAX00', 'ANTI STREPTOLYSIN O ASO', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('23923', 'BAX00', 'ANTI-STREPTOLYSIN O (ASO) BAX00', 'ANTI STREPTOLYSIN O ASO', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13923', 'AX5', 'ANTI-STREPTOLYSIN O (ASO) AX5', 'ANTI STREPTOLYSIN O ASO', '1x50 mL', 166, 160, 140, 'Hoja1'),
  ('23103', 'BAX00', 'COMPLEMENT COMPONENT C3 BAX00', 'COMPLEMENT COMPONENT C3', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13084', 'AX5', 'COMPLEMENT COMPONENT C3 AX5', 'COMPLEMENT COMPONENT C3', '1x50 mL', 166, 160, 140, 'Hoja1'),
  ('23104', 'BAX00', 'COMPLEMENT COMPONENT C4 BAX00', 'COMPLEMENT COMPONENT C4', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13085', 'AX5', 'COMPLEMENT COMPONENT C4 AX5', 'COMPLEMENT COMPONENT C4', '1x50 mL', 166, 160, 140, 'Hoja1'),
  ('23101', 'BAX00', 'INMUNOGLOBULIN A (IGA) BAX00', 'INMUNOGLOBULIN A IGA', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13082', 'AX5', 'INMUNOGLOBULIN A (IGA) AX5', 'INMUNOGLOBULIN A IGA', '1x50 mL', 113, 109, 90, 'Hoja1'),
  ('23100', 'BAX00', 'INMUNOGLOBULIN G (IGG) BAX00', 'INMUNOGLOBULIN G IGG', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13081', 'AX5', 'INMUNOGLOBULIN G (IGG) AX5', 'INMUNOGLOBULIN G IGG', '1x50 mL', 113, 109, 90, 'Hoja1'),
  ('23102', 'BAX00', 'INMUNOGLOBULIN M (IGM) BAX00', 'INMUNOGLOBULIN M IGM', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13083', 'AX5', 'INMUNOGLOBULIN M (IGM) AX5', 'INMUNOGLOBULIN M IGM', '1x50 mL', 166, 160, 140, 'Hoja1'),
  ('21509', 'BAX00', 'IRON FERROZINE BAX00', 'IRON FERROZINE', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('23509', 'BAX00', 'IRON FERROZINE BAX00', 'IRON FERROZINE', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('12509', 'AX5', 'IRON FERROZINE AX5', 'IRON FERROZINE', '5x40 mL + 5x10 mL', 833, 666, 600, 'Hoja1'),
  ('22934', 'BAX00', 'FERRITIN BAX00', 'FERRITIN', '2x40 mL + 2x20 mL', 500, 450, 400, 'Hoja1'),
  ('23924', 'BAX00', 'FERRITIN BAX00', 'FERRITIN', '1x40 mL + 1x20 mL', 250, 225, 200, 'Hoja1'),
  ('13934', 'AX5', 'FERRITIN AX5', 'FERRITIN', '1x45 mL', 187, 179, 160, 'Hoja1'),
  ('22105', 'BAX00', 'TRANSFERRIN BAX00', 'TRANSFERRIN', '2x60 mL + 2x15 mL', 500, 433, 390, 'Hoja1'),
  ('23105', 'BAX00', 'TRANSFERRIN BAX00', 'TRANSFERRIN', '1x60 mL + 1x15mL', 250, 216, 190, 'Hoja1'),
  ('13091', 'AX5', 'TRANSFERRIN AX5', 'TRANSFERRIN', '1x50 mL', 113, 109, 90, 'Hoja1'),
  ('23804', 'BAX00', 'FIBRINOGENO BAX00', 'FIBRINOGENO', '1 x 60 mL + 1 x 15 mL', 250, 216, 190, 'Hoja1'),
  ('13600', 'AX5', 'FIBRINOGENO AX5', 'FIBRINOGENO', '1 x 50 mL', 166, 133, 120, 'Hoja1'),
  ('11795', 'AX5', 'CITRATE AX5 (mismo rendimiento en BAX00)', 'CITRATE MISMO RENDIMIENTO EN', '2x25 mL', 166, 100, 90, 'Hoja1'),
  ('11895', 'AX5', 'CITRATE AX5 (mismo rendimiento en BAX00)', 'CITRATE MISMO RENDIMIENTO EN', '1x25 mL', 83, 50, 40, 'Hoja1'),
  ('12539', 'AX5', 'OXALATE AX5 (mismo rendimiento en BAX00; Limitado al pre-tratamiento de la muestra)', 'OXALATE MISMO RENDIMIENTO EN ; LIMITADO AL PRE TRATAMIENTO DE LA MUESTRA', '1x20 mL + 1x10 mL', 20, 20, 20, 'Hoja1'),
  ('31095', 'BAX00', 'APOLIPOPROTEIN A-I (APO A-I)', 'APOLIPOPROTEIN A I APO A I', '1x40 mL + 1x10 mL', 111, 88, 80, 'Hoja1'),
  ('23095', 'BAX00', 'APOLIPOPROTEIN A-I (APO A-I)', 'APOLIPOPROTEIN A I APO A I', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('31098', 'BAX00', 'APOLIPOPROTEIN B (APO B)', 'APOLIPOPROTEIN B APO B', '1x40 mL + 1x10 mL', 166, 133, 120, 'Hoja1'),
  ('23098', 'BAX00', 'APOLIPOPROTEIN B (APO B)', 'APOLIPOPROTEIN B APO B', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('21558', 'BAX00', 'DIOXIDO DE CARBONO', 'DIOXIDO DE CARBONO', '2X60 mL', 400, 380, 342, 'Hoja1'),
  ('11558', 'BAX00', 'DIOXIDO DE CARBONO', 'DIOXIDO DE CARBONO', '1X50 mL', 166, 156, 140, 'Hoja1'),
  ('22324', 'BAX00', 'ALBUMIN (MICROALBUMINURIA) BAX00', 'ALBUMIN MICROALBUMINURIA', '4x60 mL + 4x15 mL', 1000, 866, 780, 'Hoja1'),
  ('23324', 'BAX00', 'ALBUMIN (MICROALBUMINURIA) BAX00', 'ALBUMIN MICROALBUMINURIA', '1x60 mL + 1x15 mL', 250, 216, 190, 'Hoja1'),
  ('13324', 'AX5', 'ALBUMIN (MICROALBUMINURIA) AX5', 'ALBUMIN MICROALBUMINURIA', '1x40 mL + 1x10 mL', 119, 114, 100, 'Hoja1'),
  ('21512', 'BAX00', 'PROTEIN URINE BAX00', 'PROTEIN URINE', '8x20 mL', 533, 480, 430, 'Hoja1'),
  ('23512', 'BAX00', 'PROTEIN URINE BAX00', 'PROTEIN URINE', '4x20 mL', 266, 240, 210, 'Hoja1'),
  ('12501', 'AX5', 'PROTEIN URINE AX5', 'PROTEIN URINE', '5x50 mL', 833, 800, 720, 'Hoja1');

create or replace view public.v_equipment_reagent_consumption_detail as
with aggregated as (
  select
    crh.numero_serie,
    coalesce(nullif(crh.modelo, ''), case
      when crh.numero_serie like '834%' then 'BA400'
      when crh.numero_serie like '832%' then 'BA200'
      when crh.numero_serie like '83105%' then 'A15'
      when crh.numero_serie like '83101%' then 'A25'
      else null
    end) as modelo,
    case
      when coalesce(crh.modelo, '') in ('BA200', 'BA400') then 'BAX00'
      when coalesce(crh.modelo, '') in ('A15', 'A25', 'Y15', 'Y25') then 'AX5'
      when crh.numero_serie like '834%' or crh.numero_serie like '832%' then 'BAX00'
      when crh.numero_serie like '83105%' or crh.numero_serie like '83101%' then 'AX5'
      else 'BAX00'
    end as modelo_familia,
    crh.test_name,
    public.normalize_reagent_test_name(crh.test_name) as test_name_normalizado,
    sum(crh.pipetting_count) as pruebas_registradas,
    sum(crh.patient_count) as muestras_paciente,
    sum(crh.blank_count) as blancos,
    sum(crh.calib_count) as calibraciones,
    sum(crh.ctrl_count) as controles,
    sum(crh.vr1_total_ul) as vr1_total_ul,
    sum(crh.vr2_total_ul) as vr2_total_ul,
    sum(crh.sample_volume_total_ul) as volumen_muestra_total_ul,
    min(crh.first_event_at) as first_event_at,
    max(crh.last_event_at) as last_event_at
  from public.consumo_reactivos_hora crh
  group by
    crh.numero_serie,
    coalesce(nullif(crh.modelo, ''), case
      when crh.numero_serie like '834%' then 'BA400'
      when crh.numero_serie like '832%' then 'BA200'
      when crh.numero_serie like '83105%' then 'A15'
      when crh.numero_serie like '83101%' then 'A25'
      else null
    end),
    case
      when coalesce(crh.modelo, '') in ('BA200', 'BA400') then 'BAX00'
      when coalesce(crh.modelo, '') in ('A15', 'A25', 'Y15', 'Y25') then 'AX5'
      when crh.numero_serie like '834%' or crh.numero_serie like '832%' then 'BAX00'
      when crh.numero_serie like '83105%' or crh.numero_serie like '83101%' then 'AX5'
      else 'BAX00'
    end,
    crh.test_name,
    public.normalize_reagent_test_name(crh.test_name)
),
preferred_catalog as (
  select distinct on (modelo_familia, descripcion_normalizada)
    codigo,
    modelo_familia,
    descripcion,
    descripcion_normalizada,
    presentacion,
    coalesce(rendimiento_util_seguro, rendimiento_util, rendimiento_total) as rendimiento_referencia,
    rendimiento_total,
    rendimiento_util,
    rendimiento_util_seguro
  from public.reactivo_rendimientos_catalogo
  order by
    modelo_familia,
    descripcion_normalizada,
    coalesce(rendimiento_util_seguro, rendimiento_util, rendimiento_total) desc nulls last,
    codigo asc
),
catalog_stats as (
  select
    rc.modelo_familia,
    rc.descripcion_normalizada,
    count(*) as presentaciones_catalogo,
    min((s.precio_contado_con_iva / nullif(coalesce(rc.rendimiento_util_seguro, rc.rendimiento_util, rc.rendimiento_total), 0)::numeric)) as costo_prueba_con_iva_min,
    max((s.precio_contado_con_iva / nullif(coalesce(rc.rendimiento_util_seguro, rc.rendimiento_util, rc.rendimiento_total), 0)::numeric)) as costo_prueba_con_iva_max,
    min((s.precio_contado_sin_iva / nullif(coalesce(rc.rendimiento_util_seguro, rc.rendimiento_util, rc.rendimiento_total), 0)::numeric)) as costo_prueba_sin_iva_min,
    max((s.precio_contado_sin_iva / nullif(coalesce(rc.rendimiento_util_seguro, rc.rendimiento_util, rc.rendimiento_total), 0)::numeric)) as costo_prueba_sin_iva_max
  from public.reactivo_rendimientos_catalogo rc
  join public.secret s
    on s.codigo = rc.codigo
  group by rc.modelo_familia, rc.descripcion_normalizada
),
resolved as (
  select
    aggregated.*,
    alias.descripcion_normalizada as alias_descripcion_normalizada,
    case when alias.descripcion_normalizada is not null then 'alias'
      when preferred_direct.codigo is not null then 'direct'
      else 'unmapped'
    end as match_source,
    coalesce(alias.descripcion_normalizada, preferred_direct.descripcion_normalizada, aggregated.test_name_normalizado) as descripcion_resuelta
  from aggregated
  left join lateral (
    select rta.descripcion_normalizada
    from public.reactivo_test_aliases rta
    where rta.alias_normalizado = aggregated.test_name_normalizado
      and rta.modelo_familia in (aggregated.modelo_familia, 'ALL')
    order by case when rta.modelo_familia = aggregated.modelo_familia then 0 else 1 end, rta.descripcion_normalizada
    limit 1
  ) alias on true
  left join preferred_catalog preferred_direct
    on preferred_direct.modelo_familia = aggregated.modelo_familia
   and preferred_direct.descripcion_normalizada = aggregated.test_name_normalizado
),
priced as (
  select
    resolved.numero_serie,
    resolved.modelo,
    resolved.modelo_familia,
    resolved.test_name,
    resolved.test_name_normalizado,
    resolved.pruebas_registradas,
    resolved.muestras_paciente,
    resolved.blancos,
    resolved.calibraciones,
    resolved.controles,
    resolved.vr1_total_ul,
    resolved.vr2_total_ul,
    resolved.volumen_muestra_total_ul,
    resolved.first_event_at,
    resolved.last_event_at,
    resolved.match_source,
    resolved.descripcion_resuelta,
    catalog.codigo as reactivo_codigo_referencia,
    catalog.descripcion as reactivo_descripcion_referencia,
    catalog.presentacion as presentacion_referencia,
    catalog.rendimiento_referencia,
    catalog.rendimiento_total,
    catalog.rendimiento_util,
    catalog.rendimiento_util_seguro,
    prices.precio_contado_sin_iva,
    prices.precio_contado_con_iva,
    stats.presentaciones_catalogo,
    stats.costo_prueba_con_iva_min,
    stats.costo_prueba_con_iva_max,
    stats.costo_prueba_sin_iva_min,
    stats.costo_prueba_sin_iva_max
  from resolved
  left join preferred_catalog catalog
    on catalog.modelo_familia = resolved.modelo_familia
   and catalog.descripcion_normalizada = resolved.descripcion_resuelta
  left join public.secret prices
    on prices.codigo = catalog.codigo
  left join catalog_stats stats
    on stats.modelo_familia = resolved.modelo_familia
   and stats.descripcion_normalizada = resolved.descripcion_resuelta
)
select
  numero_serie,
  modelo,
  modelo_familia,
  test_name,
  test_name_normalizado,
  descripcion_resuelta as descripcion_catalogo_normalizada,
  reactivo_codigo_referencia,
  reactivo_descripcion_referencia,
  presentacion_referencia,
  rendimiento_referencia,
  rendimiento_total,
  rendimiento_util,
  rendimiento_util_seguro,
  presentaciones_catalogo,
  match_source,
  (reactivo_codigo_referencia is not null and precio_contado_con_iva is not null and rendimiento_referencia is not null) as tiene_precio,
  pruebas_registradas,
  muestras_paciente,
  blancos,
  calibraciones,
  controles,
  vr1_total_ul,
  vr2_total_ul,
  volumen_muestra_total_ul,
  first_event_at,
  last_event_at,
  round((precio_contado_sin_iva / nullif(rendimiento_referencia, 0)::numeric)::numeric, 6) as costo_prueba_referencia_sin_iva,
  round((precio_contado_con_iva / nullif(rendimiento_referencia, 0)::numeric)::numeric, 6) as costo_prueba_referencia_con_iva,
  round((pruebas_registradas::numeric * precio_contado_sin_iva / nullif(rendimiento_referencia, 0)::numeric)::numeric, 2) as valor_estimado_total_sin_iva,
  round((pruebas_registradas::numeric * precio_contado_con_iva / nullif(rendimiento_referencia, 0)::numeric)::numeric, 2) as valor_estimado_total_con_iva,
  round((muestras_paciente::numeric * precio_contado_sin_iva / nullif(rendimiento_referencia, 0)::numeric)::numeric, 2) as valor_estimado_pacientes_sin_iva,
  round((muestras_paciente::numeric * precio_contado_con_iva / nullif(rendimiento_referencia, 0)::numeric)::numeric, 2) as valor_estimado_pacientes_con_iva,
  round((pruebas_registradas::numeric * costo_prueba_sin_iva_min)::numeric, 2) as valor_estimado_total_sin_iva_min,
  round((pruebas_registradas::numeric * costo_prueba_sin_iva_max)::numeric, 2) as valor_estimado_total_sin_iva_max,
  round((pruebas_registradas::numeric * costo_prueba_con_iva_min)::numeric, 2) as valor_estimado_total_con_iva_min,
  round((pruebas_registradas::numeric * costo_prueba_con_iva_max)::numeric, 2) as valor_estimado_total_con_iva_max
from priced;

create or replace view public.v_equipment_reagent_consumption_summary as
select
  numero_serie,
  max(modelo) as modelo,
  max(modelo_familia) as modelo_familia,
  sum(pruebas_registradas) as pruebas_registradas,
  sum(muestras_paciente) as muestras_paciente,
  sum(blancos) as blancos,
  sum(calibraciones) as calibraciones,
  sum(controles) as controles,
  count(*) as pruebas_distintas,
  count(*) filter (where tiene_precio) as pruebas_distintas_con_precio,
  count(*) filter (where not tiene_precio) as pruebas_distintas_sin_precio,
  sum(case when tiene_precio then pruebas_registradas else 0 end) as pruebas_con_precio,
  sum(case when not tiene_precio then pruebas_registradas else 0 end) as pruebas_sin_precio,
  round(sum(coalesce(valor_estimado_total_sin_iva, 0))::numeric, 2) as valor_estimado_total_sin_iva,
  round(sum(coalesce(valor_estimado_total_con_iva, 0))::numeric, 2) as valor_estimado_total_con_iva,
  round(sum(coalesce(valor_estimado_pacientes_sin_iva, 0))::numeric, 2) as valor_estimado_pacientes_sin_iva,
  round(sum(coalesce(valor_estimado_pacientes_con_iva, 0))::numeric, 2) as valor_estimado_pacientes_con_iva,
  round(sum(coalesce(valor_estimado_total_sin_iva_min, 0))::numeric, 2) as valor_estimado_total_sin_iva_min,
  round(sum(coalesce(valor_estimado_total_sin_iva_max, 0))::numeric, 2) as valor_estimado_total_sin_iva_max,
  round(sum(coalesce(valor_estimado_total_con_iva_min, 0))::numeric, 2) as valor_estimado_total_con_iva_min,
  round(sum(coalesce(valor_estimado_total_con_iva_max, 0))::numeric, 2) as valor_estimado_total_con_iva_max,
  min(first_event_at) as first_event_at,
  max(last_event_at) as last_event_at
from public.v_equipment_reagent_consumption_detail
group by numero_serie;
