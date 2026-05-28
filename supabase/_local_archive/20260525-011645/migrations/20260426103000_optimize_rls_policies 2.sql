BEGIN;

CREATE OR REPLACE FUNCTION public.current_auth_uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_auth_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '');
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol IN ('admin', 'tecnico')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol = 'admin'
  );
$$;

DROP POLICY IF EXISTS "Un usuario puede actualizar su propio perfil" ON public.profiles;
CREATE POLICY "Un usuario puede actualizar su propio perfil"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Los usuarios pueden ver sus propios tickets y los admins/ti pueden ver todos" ON public.tickets;
DROP POLICY IF EXISTS "Los usuarios pueden crear tickets" ON public.tickets;
DROP POLICY IF EXISTS "Cualquiera puede crear tickets anonimamente" ON public.tickets;
DROP POLICY IF EXISTS "Admins y tecnicos actualizan tickets" ON public.tickets;

CREATE POLICY "Los usuarios pueden ver sus propios tickets y los admins/ti pueden ver todos"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR (SELECT public.is_staff())
);

CREATE POLICY "Los usuarios pueden crear tickets"
ON public.tickets
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Cualquiera puede crear tickets anonimamente"
ON public.tickets
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

CREATE POLICY "Admins y tecnicos actualizan tickets"
ON public.tickets
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Admins y tecnicos pueden gestionar servicios" ON public.servicios;
DROP POLICY IF EXISTS "Clientes ven servicios de sus tickets" ON public.servicios;

CREATE POLICY "Clientes y staff ven servicios relacionados"
ON public.servicios
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_staff())
  OR EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE tickets.id = servicios.ticket_id
      AND tickets.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Staff inserta servicios"
ON public.servicios
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff actualiza servicios"
ON public.servicios
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff elimina servicios"
ON public.servicios
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Solo admins pueden modificar tutoriales" ON public.tutoriales;

CREATE POLICY "Admins insertan tutoriales"
ON public.tutoriales
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins actualizan tutoriales"
ON public.tutoriales
FOR UPDATE
TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins eliminan tutoriales"
ON public.tutoriales
FOR DELETE
TO authenticated
USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Modificable por admins y tecnicos" ON public.diagnosticos;

CREATE POLICY "Staff inserta diagnosticos"
ON public.diagnosticos
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff actualiza diagnosticos"
ON public.diagnosticos
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff elimina diagnosticos"
ON public.diagnosticos
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Usuarios ven sus propias solicitudes" ON public.refacciones_solicitudes;
DROP POLICY IF EXISTS "Usuarios pueden crear solicitudes" ON public.refacciones_solicitudes;
DROP POLICY IF EXISTS "Admins y tecnicos actualizan solicitudes" ON public.refacciones_solicitudes;

CREATE POLICY "Usuarios ven sus propias solicitudes"
ON public.refacciones_solicitudes
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR (SELECT public.is_staff())
);

CREATE POLICY "Usuarios pueden crear solicitudes"
ON public.refacciones_solicitudes
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins y tecnicos actualizan solicitudes"
ON public.refacciones_solicitudes
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Admins gestionan clientes" ON public.clientes;

CREATE POLICY "Staff inserta clientes"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff actualiza clientes"
ON public.clientes
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff elimina clientes"
ON public.clientes
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Admins gestionan equipos" ON public.equipos;

CREATE POLICY "Staff inserta equipos"
ON public.equipos
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff actualiza equipos"
ON public.equipos
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Staff elimina equipos"
ON public.equipos
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Inserción de servicios historial" ON public.servicios_historial;
CREATE POLICY "Inserción de servicios historial"
ON public.servicios_historial
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Inserción de refacciones usadas" ON public.servicios_refacciones;
CREATE POLICY "Inserción de refacciones usadas"
ON public.servicios_refacciones
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "acceso_exclusivo_rmontanez" ON public.secret;
CREATE POLICY "acceso_exclusivo_rmontanez"
ON public.secret
FOR ALL
TO authenticated
USING ((SELECT public.current_auth_email()) = 'rmontanez@biosystems.com.mx')
WITH CHECK ((SELECT public.current_auth_email()) = 'rmontanez@biosystems.com.mx');

DROP POLICY IF EXISTS "client_service_units_select_authenticated" ON public.client_service_units;
DROP POLICY IF EXISTS "client_service_units_manage_staff" ON public.client_service_units;

CREATE POLICY "client_service_units_select_authenticated"
ON public.client_service_units
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "client_service_units_insert_staff"
ON public.client_service_units
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "client_service_units_update_staff"
ON public.client_service_units
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "client_service_units_delete_staff"
ON public.client_service_units
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "service_reports_select_owner_or_staff" ON public.service_reports;
DROP POLICY IF EXISTS "service_reports_insert_authenticated" ON public.service_reports;
DROP POLICY IF EXISTS "service_reports_update_owner_or_staff" ON public.service_reports;

CREATE POLICY "service_reports_select_owner_or_staff"
ON public.service_reports
FOR SELECT
TO authenticated
USING (
  engineer_id = (SELECT auth.uid())
  OR created_by = (SELECT auth.uid())
  OR (SELECT public.is_staff())
);

CREATE POLICY "service_reports_insert_authenticated"
ON public.service_reports
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "service_reports_update_owner_or_staff"
ON public.service_reports
FOR UPDATE
TO authenticated
USING (
  engineer_id = (SELECT auth.uid())
  OR created_by = (SELECT auth.uid())
  OR (SELECT public.is_staff())
)
WITH CHECK (
  engineer_id = (SELECT auth.uid())
  OR created_by = (SELECT auth.uid())
  OR (SELECT public.is_staff())
);

DROP POLICY IF EXISTS "travel_policies_manage_admin_tecnico" ON public.travel_policies;
DROP POLICY IF EXISTS "travel_policies_read_authenticated" ON public.travel_policies;

CREATE POLICY "travel_policies_read_authenticated"
ON public.travel_policies
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "travel_policies_insert_admin_tecnico"
ON public.travel_policies
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "travel_policies_update_admin_tecnico"
ON public.travel_policies
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "travel_policies_delete_admin_tecnico"
ON public.travel_policies
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "travel_requests_select_owner_or_staff" ON public.travel_requests;
DROP POLICY IF EXISTS "travel_requests_insert_authenticated" ON public.travel_requests;
DROP POLICY IF EXISTS "travel_requests_update_owner_or_staff" ON public.travel_requests;

CREATE POLICY "travel_requests_select_owner_or_staff"
ON public.travel_requests
FOR SELECT
TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR engineer_id = (SELECT auth.uid())
  OR (SELECT public.is_staff())
);

CREATE POLICY "travel_requests_insert_authenticated"
ON public.travel_requests
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "travel_requests_update_owner_or_staff"
ON public.travel_requests
FOR UPDATE
TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR engineer_id = (SELECT auth.uid())
  OR (SELECT public.is_staff())
)
WITH CHECK (
  created_by = (SELECT auth.uid())
  OR engineer_id = (SELECT auth.uid())
  OR (SELECT public.is_staff())
);

DROP POLICY IF EXISTS "flight_sessions_select_related" ON public.flight_search_sessions;
DROP POLICY IF EXISTS "flight_sessions_insert_authenticated" ON public.flight_search_sessions;

CREATE POLICY "flight_sessions_select_related"
ON public.flight_search_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = flight_search_sessions.travel_request_id
      AND (
        travel_requests.created_by = (SELECT auth.uid())
        OR travel_requests.engineer_id = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

CREATE POLICY "flight_sessions_insert_authenticated"
ON public.flight_search_sessions
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "flight_snapshots_select_related" ON public.flight_offer_snapshots;
DROP POLICY IF EXISTS "flight_snapshots_insert_authenticated" ON public.flight_offer_snapshots;

CREATE POLICY "flight_snapshots_select_related"
ON public.flight_offer_snapshots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = flight_offer_snapshots.travel_request_id
      AND (
        travel_requests.created_by = (SELECT auth.uid())
        OR travel_requests.engineer_id = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

CREATE POLICY "flight_snapshots_insert_authenticated"
ON public.flight_offer_snapshots
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "travel_history_select_related" ON public.travel_request_status_history;
DROP POLICY IF EXISTS "travel_history_insert_authenticated" ON public.travel_request_status_history;

CREATE POLICY "travel_history_select_related"
ON public.travel_request_status_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = travel_request_status_history.travel_request_id
      AND (
        travel_requests.created_by = (SELECT auth.uid())
        OR travel_requests.engineer_id = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

CREATE POLICY "travel_history_insert_authenticated"
ON public.travel_request_status_history
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "travel_notes_select_related" ON public.travel_admin_notes;
DROP POLICY IF EXISTS "travel_notes_insert_authenticated" ON public.travel_admin_notes;

CREATE POLICY "travel_notes_select_related"
ON public.travel_admin_notes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = travel_admin_notes.travel_request_id
      AND (
        travel_requests.created_by = (SELECT auth.uid())
        OR travel_requests.engineer_id = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

CREATE POLICY "travel_notes_insert_authenticated"
ON public.travel_admin_notes
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "service_report_materials_select_owner_or_staff" ON public.service_report_materials;
DROP POLICY IF EXISTS "service_report_materials_insert_owner_or_staff" ON public.service_report_materials;
DROP POLICY IF EXISTS "service_report_materials_update_owner_or_staff" ON public.service_report_materials;
DROP POLICY IF EXISTS "service_report_materials_delete_owner_or_staff" ON public.service_report_materials;

CREATE POLICY "service_report_materials_select_owner_or_staff"
ON public.service_report_materials
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = (SELECT auth.uid())
        OR service_reports.created_by = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

CREATE POLICY "service_report_materials_insert_owner_or_staff"
ON public.service_report_materials
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = (SELECT auth.uid())
        OR service_reports.created_by = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

CREATE POLICY "service_report_materials_update_owner_or_staff"
ON public.service_report_materials
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = (SELECT auth.uid())
        OR service_reports.created_by = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = (SELECT auth.uid())
        OR service_reports.created_by = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

CREATE POLICY "service_report_materials_delete_owner_or_staff"
ON public.service_report_materials
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = (SELECT auth.uid())
        OR service_reports.created_by = (SELECT auth.uid())
        OR (SELECT public.is_staff())
      )
  )
);

COMMIT;
