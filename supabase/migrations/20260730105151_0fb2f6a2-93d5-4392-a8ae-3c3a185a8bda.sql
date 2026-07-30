CREATE TABLE public.storage_audit_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule text NOT NULL CHECK (rule IN ('deny_spike','owner_mismatch')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  bucket text NOT NULL,
  path_pattern text NOT NULL DEFAULT '*',
  window_start timestamptz NOT NULL,
  window_minutes integer NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  distinct_users integer NOT NULL DEFAULT 0,
  threshold integer NOT NULL,
  message text NOT NULL,
  sample jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule, bucket, path_pattern, window_start)
);

CREATE INDEX storage_audit_alerts_created_idx
  ON public.storage_audit_alerts (created_at DESC);

GRANT SELECT, UPDATE ON public.storage_audit_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.storage_audit_alerts TO service_role;

ALTER TABLE public.storage_audit_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storage_alerts_admin_select"
  ON public.storage_audit_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "storage_alerts_admin_ack"
  ON public.storage_audit_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Detection: scans the append-only audit trail and raises deduplicated alerts.
CREATE OR REPLACE FUNCTION public.evaluate_storage_audit_alerts(
  _window_minutes integer DEFAULT 15,
  _deny_threshold integer DEFAULT 10,
  _mismatch_threshold integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  win integer := LEAST(GREATEST(COALESCE(_window_minutes, 15), 1), 1440);
  deny_thr integer := LEAST(GREATEST(COALESCE(_deny_threshold, 10), 1), 10000);
  mis_thr integer := LEAST(GREATEST(COALESCE(_mismatch_threshold, 3), 1), 10000);
  win_start timestamptz := date_trunc('minute', now()) - make_interval(mins => win);
  created integer := 0;
  r record;
BEGIN
  -- Rule 1: denial spike per bucket
  FOR r IN
    SELECT bucket,
           count(*)::int AS events,
           count(DISTINCT user_id)::int AS users,
           min(reason) AS sample_reason,
           min(object_path) AS sample_path
    FROM public.storage_access_audit
    WHERE created_at >= win_start AND decision = 'deny'
    GROUP BY bucket
    HAVING count(*) >= deny_thr
  LOOP
    INSERT INTO public.storage_audit_alerts (
      rule, severity, bucket, path_pattern, window_start, window_minutes,
      event_count, distinct_users, threshold, message, sample
    ) VALUES (
      'deny_spike',
      CASE WHEN r.events >= deny_thr * 3 THEN 'critical' ELSE 'warning' END,
      r.bucket, '*', win_start, win,
      r.events, r.users, deny_thr,
      format('%s storage denials in %s (%s min) across %s caller(s)',
             r.events, r.bucket, win, r.users),
      jsonb_build_object('reason', r.sample_reason, 'object_path', r.sample_path)
    )
    ON CONFLICT (rule, bucket, path_pattern, window_start) DO UPDATE
      SET event_count = EXCLUDED.event_count,
          distinct_users = EXCLUDED.distinct_users,
          severity = EXCLUDED.severity,
          message = EXCLUDED.message;
    created := created + 1;
  END LOOP;

  -- Rule 2: repeated owner mismatches for a bucket + path pattern
  FOR r IN
    SELECT bucket,
           regexp_replace(object_path,
             '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
             '{owner}', 'g') AS pattern,
           count(*)::int AS events,
           count(DISTINCT user_id)::int AS users,
           min(object_path) AS sample_path,
           min(user_id::text) AS sample_user
    FROM public.storage_access_audit
    WHERE created_at >= win_start
      AND user_id IS NOT NULL
      AND path_owner_id IS NOT NULL
      AND path_owner_id <> user_id
    GROUP BY 1, 2
    HAVING count(*) >= mis_thr
  LOOP
    INSERT INTO public.storage_audit_alerts (
      rule, severity, bucket, path_pattern, window_start, window_minutes,
      event_count, distinct_users, threshold, message, sample
    ) VALUES (
      'owner_mismatch', 'critical',
      r.bucket, left(r.pattern, 512), win_start, win,
      r.events, r.users, mis_thr,
      format('%s owner-mismatch attempts on %s in %s (%s min)',
             r.events, left(r.pattern, 120), r.bucket, win),
      jsonb_build_object('object_path', r.sample_path, 'caller', r.sample_user)
    )
    ON CONFLICT (rule, bucket, path_pattern, window_start) DO UPDATE
      SET event_count = EXCLUDED.event_count,
          distinct_users = EXCLUDED.distinct_users,
          message = EXCLUDED.message;
    created := created + 1;
  END LOOP;

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_storage_audit_alerts(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_storage_audit_alerts(integer, integer, integer) TO service_role;