-- 1. Tighten privileges: no UPDATE/DELETE/TRUNCATE for anyone via the API
REVOKE ALL ON public.storage_access_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.storage_access_audit TO authenticated;
GRANT SELECT, INSERT ON public.storage_access_audit TO service_role;

-- 2. RLS: no UPDATE/DELETE policies exist; add explicit restrictive denials so
--    any future permissive policy cannot re-open mutation of past entries.
ALTER TABLE public.storage_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_access_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storage_audit_no_update" ON public.storage_access_audit;
CREATE POLICY "storage_audit_no_update"
  ON public.storage_access_audit AS RESTRICTIVE FOR UPDATE TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "storage_audit_no_delete" ON public.storage_access_audit;
CREATE POLICY "storage_audit_no_delete"
  ON public.storage_access_audit AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- service_role bypasses RLS, so FORCE RLS alone is not enough: block mutations
-- with a trigger that fires for every role, including the table owner.
CREATE OR REPLACE FUNCTION public.tg_storage_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'storage_access_audit is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS storage_audit_no_mutate ON public.storage_access_audit;
CREATE TRIGGER storage_audit_no_mutate
  BEFORE UPDATE OR DELETE ON public.storage_access_audit
  FOR EACH ROW EXECUTE FUNCTION public.tg_storage_audit_append_only();

DROP TRIGGER IF EXISTS storage_audit_no_truncate ON public.storage_access_audit;
CREATE TRIGGER storage_audit_no_truncate
  BEFORE TRUNCATE ON public.storage_access_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_storage_audit_append_only();