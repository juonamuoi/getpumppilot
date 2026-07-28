-- 1) Internal helper: not meant to be callable directly by signed-in users.
-- It is invoked from SECURITY DEFINER functions (which run as owner), so
-- revoking authenticated EXECUTE does not break the app.
REVOKE EXECUTE ON FUNCTION public.mcp_effective_limits(uuid, text) FROM authenticated, anon, PUBLIC;

-- 2) Explicit, ownership-scoped access control on private storage buckets.

-- threat-reports: files are stored under "<user_id>/..." by the server.
DROP POLICY IF EXISTS "threat_reports_owner_select" ON storage.objects;
CREATE POLICY "threat_reports_owner_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'threat-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "threat_reports_owner_insert" ON storage.objects;
CREATE POLICY "threat_reports_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'threat-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "threat_reports_owner_update" ON storage.objects;
CREATE POLICY "threat_reports_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'threat-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'threat-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "threat_reports_owner_delete" ON storage.objects;
CREATE POLICY "threat_reports_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'threat-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- database_export_28_07_26: admin read-only; no client writes.
DROP POLICY IF EXISTS "database_export_admin_select" ON storage.objects;
CREATE POLICY "database_export_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'database_export_28_07_26'
    AND public.has_role(auth.uid(), 'admin')
  );