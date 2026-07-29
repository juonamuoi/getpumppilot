CREATE TABLE public.storage_access_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  bucket text NOT NULL,
  object_path text NOT NULL,
  operation text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allow','deny')),
  reason text,
  path_owner_id uuid,
  correlation_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX storage_access_audit_created_at_idx ON public.storage_access_audit (created_at DESC);
CREATE INDEX storage_access_audit_user_idx ON public.storage_access_audit (user_id, created_at DESC);
CREATE INDEX storage_access_audit_bucket_idx ON public.storage_access_audit (bucket, created_at DESC);

GRANT SELECT ON public.storage_access_audit TO authenticated;
GRANT ALL ON public.storage_access_audit TO service_role;

ALTER TABLE public.storage_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storage_audit_own_select"
  ON public.storage_access_audit FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "storage_audit_admin_select"
  ON public.storage_access_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));