-- 1. Audit table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.definer_call_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  user_id uuid,
  db_role text NOT NULL DEFAULT current_user,
  allowed boolean NOT NULL DEFAULT true,
  reason text,
  correlation_id text,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.definer_call_audit TO authenticated;
GRANT ALL ON public.definer_call_audit TO service_role;

ALTER TABLE public.definer_call_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read definer call audit" ON public.definer_call_audit;
CREATE POLICY "Admins read definer call audit"
  ON public.definer_call_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS definer_call_audit_created_idx
  ON public.definer_call_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS definer_call_audit_fn_idx
  ON public.definer_call_audit (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS definer_call_audit_user_idx
  ON public.definer_call_audit (user_id, created_at DESC);

-- Append-only: no updates or deletes, even for privileged roles.
CREATE OR REPLACE FUNCTION public.tg_definer_call_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'definer_call_audit is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS definer_call_audit_append_only ON public.definer_call_audit;
CREATE TRIGGER definer_call_audit_append_only
  BEFORE UPDATE OR DELETE ON public.definer_call_audit
  FOR EACH ROW EXECUTE FUNCTION public.tg_definer_call_audit_append_only();

-- 2. Logging helper ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_definer_call(
  _function text,
  _allowed boolean DEFAULT true,
  _reason text DEFAULT NULL,
  _args jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  headers jsonb;
  ctx jsonb;
BEGIN
  BEGIN
    headers := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  EXCEPTION WHEN others THEN
    headers := '{}'::jsonb;
  END;

  ctx := jsonb_strip_nulls(jsonb_build_object(
    'method', current_setting('request.method', true),
    'path', current_setting('request.path', true),
    'client_ip', headers->>'x-forwarded-for',
    'user_agent', left(COALESCE(headers->>'user-agent', ''), 300),
    'origin', headers->>'origin',
    'client_id', headers->>'x-client-info',
    'application_name', current_setting('application_name', true)
  ));

  INSERT INTO public.definer_call_audit (
    function_name, user_id, db_role, allowed, reason, correlation_id, args, request
  ) VALUES (
    left(_function, 200),
    auth.uid(),
    current_user,
    COALESCE(_allowed, true),
    left(_reason, 300),
    NULLIF(left(COALESCE(headers->>'x-correlation-id', headers->>'x-request-id', ''), 100), ''),
    COALESCE(_args, '{}'::jsonb),
    ctx
  );
EXCEPTION WHEN others THEN
  -- Auditing must never break the caller.
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_definer_call(text, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_definer_call(text, boolean, text, jsonb) TO service_role;

-- 3. Admin guard records every attempt -------------------------------------
CREATE OR REPLACE FUNCTION public.require_admin(_function text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  fname text := COALESCE(_function, 'require_admin');
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    PERFORM public.log_definer_call(fname, true, 'service_role', '{}'::jsonb);
    RETURN;
  END IF;
  IF uid IS NULL THEN
    PERFORM public.log_definer_call(fname, false, 'unauthenticated', '{}'::jsonb);
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(uid, 'admin') THEN
    PERFORM public.log_definer_call(fname, false, 'missing_admin_role', '{}'::jsonb);
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.log_definer_call(fname, true, 'admin', '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.require_admin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_admin(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.require_admin();

-- Report functions are STABLE; make them VOLATILE so the guard can audit.
CREATE OR REPLACE FUNCTION public.ad_creative_report(_experiment text DEFAULT 'landing_hero'::text, _days integer DEFAULT 30)
RETURNS TABLE(variant text, creative_id text, impressions bigint, clicks bigint, signups bigint, visitors bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_admin('ad_creative_report');
  RETURN QUERY
  SELECT e.variant,
         e.creative_id,
         count(*) FILTER (WHERE e.event = 'impression') AS impressions,
         count(*) FILTER (WHERE e.event = 'click') AS clicks,
         count(*) FILTER (WHERE e.event = 'signup') AS signups,
         count(DISTINCT e.visitor_id) AS visitors
  FROM public.ad_creative_events e
  WHERE e.experiment = _experiment
    AND e.created_at > now() - make_interval(days => LEAST(GREATEST(COALESCE(_days, 30), 1), 365))
  GROUP BY e.variant, e.creative_id
  ORDER BY e.variant, e.creative_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ad_funnel_report(_days integer DEFAULT 30)
RETURNS TABLE(source text, medium text, campaign text, variant text, visitors bigint, cta_clicks bigint, signups bigint, activations bigint, avg_minutes_to_chart numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_admin('ad_funnel_report');
  RETURN QUERY
  WITH e AS (
    SELECT * FROM public.ad_creative_events
    WHERE experiment = 'signup_funnel'
      AND created_at > now() - make_interval(days => LEAST(GREATEST(COALESCE(_days, 30), 1), 365))
  ),
  first_touch AS (
    SELECT DISTINCT ON (visitor_id)
      visitor_id,
      COALESCE(NULLIF(utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(utm_medium, ''), 'none') AS medium,
      COALESCE(NULLIF(utm_campaign, ''), 'none') AS campaign,
      variant
    FROM e
    ORDER BY visitor_id, created_at ASC
  ),
  steps AS (
    SELECT visitor_id,
      min(created_at) FILTER (WHERE event = 'cta_click') AS clicked_at,
      min(created_at) FILTER (WHERE event = 'signup') AS signed_up_at,
      min(created_at) FILTER (WHERE event = 'first_chart') AS charted_at
    FROM e
    GROUP BY visitor_id
  )
  SELECT f.source, f.medium, f.campaign, f.variant,
    count(*)::bigint AS visitors,
    count(*) FILTER (WHERE s.clicked_at IS NOT NULL)::bigint AS cta_clicks,
    count(*) FILTER (WHERE s.signed_up_at IS NOT NULL)::bigint AS signups,
    count(*) FILTER (WHERE s.charted_at IS NOT NULL)::bigint AS activations,
    round(
      avg(EXTRACT(epoch FROM (s.charted_at - s.signed_up_at)) / 60.0)
        FILTER (WHERE s.charted_at IS NOT NULL AND s.signed_up_at IS NOT NULL)::numeric,
      1
    ) AS avg_minutes_to_chart
  FROM first_touch f
  JOIN steps s USING (visitor_id)
  GROUP BY 1, 2, 3, 4
  ORDER BY visitors DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.lp_variant_report(_days integer DEFAULT 30)
RETURNS TABLE(variant text, impressions bigint, visitors bigint, cta_clicks bigint, cta_clickers bigint, signups bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_admin('lp_variant_report');
  RETURN QUERY
  WITH e AS (
    SELECT * FROM public.ad_creative_events
    WHERE created_at > now() - make_interval(days => LEAST(GREATEST(COALESCE(_days, 30), 1), 365))
  ),
  v AS (
    SELECT DISTINCT ec.variant FROM e ec WHERE ec.variant <> ''
  )
  SELECT v.variant,
    (SELECT count(*) FROM e WHERE e.variant = v.variant AND e.event = 'impression')::bigint,
    (SELECT count(DISTINCT e.visitor_id) FROM e WHERE e.variant = v.variant)::bigint,
    (SELECT count(*) FROM e WHERE e.variant = v.variant AND e.event IN ('cta_click_raw','click'))::bigint,
    (SELECT count(DISTINCT e.visitor_id) FROM e WHERE e.variant = v.variant AND e.event IN ('cta_click','cta_click_raw','click'))::bigint,
    (SELECT count(DISTINCT COALESCE(e.user_id::text, e.visitor_id)) FROM e WHERE e.variant = v.variant AND e.event IN ('signup','signup_attributed'))::bigint
  FROM v
  ORDER BY 2 DESC, 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_funnel_report(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  win integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => win);
  result jsonb;
BEGIN
  PERFORM public.require_admin('wallet_funnel_report');
  WITH e AS (
    SELECT * FROM public.ad_creative_events
    WHERE experiment = 'wallet_funnel' AND created_at > since
  ),
  per_visitor AS (
    SELECT visitor_id,
      COALESCE(NULLIF(min(utm_source), ''), 'direct') AS source,
      COALESCE(NULLIF(min(utm_campaign), ''), 'none') AS campaign,
      min(variant) AS variant,
      min(created_at) FILTER (WHERE event = 'wallet_create_started') AS started_at,
      min(created_at) FILTER (WHERE event = 'wallet_created') AS created_at2,
      min(created_at) FILTER (WHERE event = 'wallet_backup_confirmed') AS backed_at,
      min(created_at) FILTER (WHERE event = 'wallet_unlocked') AS unlocked_at,
      min(created_at) FILTER (WHERE event = 'wallet_removed') AS removed_at
    FROM e
    GROUP BY visitor_id
  )
  SELECT jsonb_build_object(
    'ok', true,
    'days', win,
    'generated_at', now(),
    'total_events', (SELECT count(*) FROM e),
    'steps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('step', s.step, 'events', s.events, 'visitors', s.visitors)
             ORDER BY s.ord)
      FROM (
        SELECT x.step, x.ord,
          (SELECT count(*) FROM e WHERE e.event = x.step)::bigint AS events,
          (SELECT count(DISTINCT e.visitor_id) FROM e WHERE e.event = x.step)::bigint AS visitors
        FROM (VALUES
          ('wallet_create_started', 1),
          ('wallet_created', 2),
          ('wallet_backup_confirmed', 3),
          ('wallet_unlocked', 4),
          ('wallet_locked_idle', 5),
          ('wallet_password_rotated', 6),
          ('wallet_removed', 7)
        ) AS x(step, ord)
      ) s
    ), '[]'::jsonb),
    'active_wallets', (SELECT count(*) FROM per_visitor WHERE unlocked_at IS NOT NULL AND removed_at IS NULL)::bigint,
    'churned', (SELECT count(*) FROM per_visitor WHERE removed_at IS NOT NULL)::bigint,
    'avg_minutes_to_active', (
      SELECT round(avg(EXTRACT(epoch FROM (unlocked_at - started_at)) / 60.0)::numeric, 1)
      FROM per_visitor WHERE unlocked_at IS NOT NULL AND started_at IS NOT NULL AND unlocked_at >= started_at
    ),
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'source', t.source, 'campaign', t.campaign,
        'started', t.started, 'created', t.created, 'backed_up', t.backed_up, 'active', t.active
      ) ORDER BY t.started DESC, t.source)
      FROM (
        SELECT source, campaign,
          count(*) FILTER (WHERE started_at IS NOT NULL)::bigint AS started,
          count(*) FILTER (WHERE created_at2 IS NOT NULL)::bigint AS created,
          count(*) FILTER (WHERE backed_at IS NOT NULL)::bigint AS backed_up,
          count(*) FILTER (WHERE unlocked_at IS NOT NULL)::bigint AS active
        FROM per_visitor
        GROUP BY source, campaign
      ) t
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d.day, 'started', d.started, 'created', d.created, 'active', d.active) ORDER BY d.day)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day,
          count(DISTINCT visitor_id) FILTER (WHERE event = 'wallet_create_started')::bigint AS started,
          count(DISTINCT visitor_id) FILTER (WHERE event = 'wallet_created')::bigint AS created,
          count(DISTINCT visitor_id) FILTER (WHERE event = 'wallet_unlocked')::bigint AS active
        FROM e GROUP BY 1
      ) d
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- Privileged maintenance routines keep their guard (now named).
CREATE OR REPLACE FUNCTION public.process_referral_rewards()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  granted INTEGER := 0;
  r RECORD;
BEGIN
  PERFORM public.require_admin('process_referral_rewards');
  FOR r IN
    SELECT ref.id, ref.referrer_id, ref.referred_user_id
    FROM public.referrals ref
    JOIN auth.users u ON u.id = ref.referred_user_id
    WHERE ref.reward_granted_at IS NULL
      AND ref.created_at < now() - INTERVAL '7 days'
      AND u.last_sign_in_at IS NOT NULL
      AND u.last_sign_in_at > ref.created_at + INTERVAL '7 days'
      AND ref.referrer_id <> ref.referred_user_id
  LOOP
    INSERT INTO public.referral_rewards (user_id, referral_id, months, reason)
    VALUES
      (r.referrer_id,      r.id, 1, 'referral_qualified_referrer'),
      (r.referred_user_id, r.id, 1, 'referral_qualified_referred');

    UPDATE public.referrals
    SET qualified_at = COALESCE(qualified_at, now()),
        reward_granted_at = now(),
        status = 'rewarded'
    WHERE id = r.id;

    granted := granted + 1;
  END LOOP;

  RETURN granted;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount integer, _kind text, _description text DEFAULT NULL::text, _external_ref text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  amt integer := GREATEST(COALESCE(_amount, 0), 0);
  newbal integer;
BEGIN
  PERFORM public.require_admin('grant_credits');
  IF _user_id IS NULL OR amt = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  IF _external_ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.credit_ledger WHERE external_ref = _external_ref) THEN
    SELECT balance INTO newbal FROM public.credit_balances WHERE user_id = _user_id;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'balance', newbal);
  END IF;

  PERFORM public.ensure_credit_account(_user_id, 100);

  UPDATE public.credit_balances
     SET balance = balance + amt,
         lifetime_purchased = lifetime_purchased + (CASE WHEN _kind = 'purchase' THEN amt ELSE 0 END),
         low_balance_notified_at = NULL,
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING balance INTO newbal;

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, kind, description, external_ref, metadata)
  VALUES (_user_id, amt, newbal, COALESCE(_kind, 'grant'), _description, _external_ref, COALESCE(_metadata, '{}'::jsonb));

  RETURN jsonb_build_object('ok', true, 'balance', newbal, 'granted', amt);
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_storage_audit_alerts(_window_minutes integer DEFAULT 15, _deny_threshold integer DEFAULT 10, _mismatch_threshold integer DEFAULT 3)
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
  PERFORM public.require_admin('evaluate_storage_audit_alerts');
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

-- 4. User-facing definer functions log their own invocations ---------------
CREATE OR REPLACE FUNCTION public.consume_credits(_amount integer, _feature text, _description text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  amt integer := LEAST(GREATEST(COALESCE(_amount, 0), 0), 100000);
  cur integer;
  newbal integer;
BEGIN
  PERFORM public.log_definer_call('consume_credits', uid IS NOT NULL,
    CASE WHEN uid IS NULL THEN 'unauthenticated' ELSE 'self' END,
    jsonb_build_object('amount', amt, 'feature', _feature));
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  PERFORM public.ensure_credit_account(uid, 100);

  SELECT balance INTO cur FROM public.credit_balances WHERE user_id = uid FOR UPDATE;

  IF amt = 0 THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0, 'balance', cur);
  END IF;

  IF cur < amt THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'balance', cur, 'required', amt);
  END IF;

  newbal := cur - amt;
  UPDATE public.credit_balances
     SET balance = newbal,
         lifetime_spent = lifetime_spent + amt,
         updated_at = now()
   WHERE user_id = uid;

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, kind, feature, description, metadata)
  VALUES (uid, -amt, newbal, 'spend', _feature, _description, COALESCE(_metadata, '{}'::jsonb));

  RETURN jsonb_build_object('ok', true, 'charged', amt, 'balance', newbal);
END;
$$;

CREATE OR REPLACE FUNCTION public.pump_claim_quest(_quest_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  q public.pump_quests%ROWTYPE;
  newbal bigint;
  referral jsonb := NULL;
BEGIN
  PERFORM public.log_definer_call('pump_claim_quest', uid IS NOT NULL,
    CASE WHEN uid IS NULL THEN 'unauthenticated' ELSE 'self' END,
    jsonb_build_object('quest_key', _quest_key));
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT * INTO q FROM public.pump_quests WHERE key = _quest_key AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_quest'); END IF;

  PERFORM public.pump_ensure_account(uid, 500);

  INSERT INTO public.pump_quest_claims (user_id, quest_key, awarded)
  VALUES (uid, q.key, q.reward)
  ON CONFLICT (user_id, quest_key) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed'); END IF;

  UPDATE public.pump_balances
     SET balance = balance + q.reward,
         lifetime_earned = lifetime_earned + q.reward
   WHERE user_id = uid
   RETURNING balance INTO newbal;

  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, quest_key, memo, external_ref)
  VALUES (uid, q.reward, newbal, 'quest', q.key, q.title, 'pump_quest:' || uid::text || ':' || q.key);

  IF q.key = 'connect_wallet' THEN
    referral := public.pump_settle_referral(uid, q.key);
    SELECT balance INTO newbal FROM public.pump_balances WHERE user_id = uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'awarded', q.reward, 'balance', newbal, 'referral', referral);
END;
$$;

CREATE OR REPLACE FUNCTION public.pump_redeem(_perk_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  p public.pump_perks%ROWTYPE;
  cur bigint;
  newbal bigint;
  base timestamptz;
  ends timestamptz;
  rid uuid;
BEGIN
  PERFORM public.log_definer_call('pump_redeem', uid IS NOT NULL,
    CASE WHEN uid IS NULL THEN 'unauthenticated' ELSE 'self' END,
    jsonb_build_object('perk_key', _perk_key));
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;

  SELECT * INTO p FROM public.pump_perks WHERE key = _perk_key AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_perk'); END IF;

  PERFORM public.pump_ensure_account(uid, 500);

  SELECT balance INTO cur FROM public.pump_balances WHERE user_id = uid FOR UPDATE;
  IF cur < p.cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'balance', cur, 'required', p.cost);
  END IF;

  UPDATE public.pump_balances
     SET balance = balance - p.cost, lifetime_sent = lifetime_sent
   WHERE user_id = uid
   RETURNING balance INTO newbal;

  IF p.duration_days IS NOT NULL THEN
    SELECT GREATEST(COALESCE(max(expires_at), now()), now()) INTO base
      FROM public.pump_redemptions
     WHERE user_id = uid AND perk_key = p.key AND expires_at IS NOT NULL;
    ends := COALESCE(base, now()) + make_interval(days => p.duration_days);
  END IF;

  INSERT INTO public.pump_redemptions (user_id, perk_key, cost, credits_granted, expires_at)
  VALUES (uid, p.key, p.cost, p.credits, ends)
  RETURNING id INTO rid;

  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, memo, external_ref)
  VALUES (uid, -p.cost, newbal, 'redeem', p.title, 'pump_redeem:' || rid::text);

  IF p.credits > 0 THEN
    PERFORM public.grant_credits(uid, p.credits, 'pump_redeem', 'Redeemed ' || p.title,
                                 'pump_redeem_credits:' || rid::text, jsonb_build_object('perk', p.key));
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'perk', p.key, 'title', p.title, 'spent', p.cost,
    'balance', newbal, 'expires_at', ends, 'credits_granted', p.credits
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pump_transfer(_to_tag text, _amount integer, _memo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  target uuid;
  amt bigint := COALESCE(_amount, 0);
  cur bigint;
  from_bal bigint;
  to_bal bigint;
  tag text := lower(trim(COALESCE(_to_tag, '')));
  ref text := gen_random_uuid()::text;
  recent bigint;
BEGIN
  PERFORM public.log_definer_call('pump_transfer', uid IS NOT NULL,
    CASE WHEN uid IS NULL THEN 'unauthenticated' ELSE 'self' END,
    jsonb_build_object('to_tag', tag, 'amount', amt));
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF amt <= 0 OR amt > 1000000 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount'); END IF;

  SELECT user_id INTO target FROM public.referral_codes WHERE lower(code) = tag LIMIT 1;
  IF target IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_recipient'); END IF;
  IF target = uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_transfer'); END IF;

  PERFORM public.pump_ensure_account(uid, 500);
  PERFORM public.pump_ensure_account(target, 500);

  SELECT COALESCE(SUM(-delta), 0) INTO recent
  FROM public.pump_ledger
  WHERE user_id = uid AND kind = 'transfer_out' AND created_at > now() - interval '24 hours';
  IF recent + amt > 100000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit', 'limit', 100000, 'used', recent);
  END IF;

  SELECT balance INTO cur FROM public.pump_balances WHERE user_id = uid FOR UPDATE;
  IF cur < amt THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'balance', cur);
  END IF;

  UPDATE public.pump_balances
     SET balance = balance - amt, lifetime_sent = lifetime_sent + amt
   WHERE user_id = uid RETURNING balance INTO from_bal;
  UPDATE public.pump_balances
     SET balance = balance + amt, lifetime_received = lifetime_received + amt
   WHERE user_id = target RETURNING balance INTO to_bal;

  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, counterparty_id, memo, external_ref)
  VALUES (uid, -amt, from_bal, 'transfer_out', target, left(_memo, 200), 'pump_tx_out:' || ref);
  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, counterparty_id, memo, external_ref)
  VALUES (target, amt, to_bal, 'transfer_in', uid, left(_memo, 200), 'pump_tx_in:' || ref);

  RETURN jsonb_build_object('ok', true, 'sent', amt, 'balance', from_bal, 'to_tag', tag);
END;
$$;

CREATE OR REPLACE FUNCTION public.pump_set_payout_address(_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  addr text := NULLIF(trim(COALESCE(_address, '')), '');
  prev text;
  ts timestamptz;
BEGIN
  PERFORM public.log_definer_call('pump_set_payout_address', uid IS NOT NULL,
    CASE WHEN uid IS NULL THEN 'unauthenticated' ELSE 'self' END, '{}'::jsonb);
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF addr IS NOT NULL AND addr !~ '^0x[0-9a-fA-F]{40}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_address');
  END IF;
  PERFORM public.pump_ensure_account(uid, 500);
  SELECT payout_address, payout_address_updated_at INTO prev, ts
    FROM public.pump_balances WHERE user_id = uid;
  IF prev IS DISTINCT FROM addr THEN
    ts := now();
    UPDATE public.pump_balances
      SET payout_address = addr, payout_address_updated_at = ts
      WHERE user_id = uid;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'payout_address', addr,
    'previous_address', prev,
    'changed', prev IS DISTINCT FROM addr,
    'payout_address_updated_at', ts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_set_rate_limits(_account_limit integer DEFAULT NULL::integer, _client_limit integer DEFAULT NULL::integer, _window_seconds integer DEFAULT NULL::integer, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  d jsonb;
  cur public.mcp_rate_limit_settings%ROWTYPE;
  old_acct integer; old_cli integer; old_win integer;
  new_acct integer; new_cli integer; new_win integer;
BEGIN
  PERFORM public.log_definer_call('mcp_set_rate_limits', uid IS NOT NULL,
    CASE WHEN uid IS NULL THEN 'unauthenticated' ELSE 'self' END,
    jsonb_build_object('account_limit', _account_limit, 'client_limit', _client_limit, 'window_seconds', _window_seconds));
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  d := public.mcp_plan_defaults(uid);

  SELECT * INTO cur FROM public.mcp_rate_limit_settings WHERE user_id = uid;
  IF FOUND THEN
    old_acct := cur.account_limit; old_cli := cur.client_limit; old_win := cur.window_seconds;
  ELSE
    old_acct := (d->>'account_limit')::int; old_cli := (d->>'client_limit')::int; old_win := (d->>'window_seconds')::int;
  END IF;

  new_acct := LEAST(GREATEST(COALESCE(_account_limit, old_acct), 1), (d->>'max_account_limit')::int);
  new_cli  := LEAST(GREATEST(COALESCE(_client_limit, old_cli), 1), (d->>'max_client_limit')::int);
  new_win  := LEAST(GREATEST(COALESCE(_window_seconds, old_win), 10), 3600);
  IF new_cli > new_acct THEN new_cli := new_acct; END IF;

  INSERT INTO public.mcp_rate_limit_settings (user_id, account_limit, client_limit, window_seconds)
  VALUES (uid, new_acct, new_cli, new_win)
  ON CONFLICT (user_id) DO UPDATE
    SET account_limit = EXCLUDED.account_limit,
        client_limit = EXCLUDED.client_limit,
        window_seconds = EXCLUDED.window_seconds,
        updated_at = now();

  IF new_acct IS DISTINCT FROM old_acct THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, field, old_value, new_value, reason, plan)
    VALUES (uid, 'tenant', 'account_limit', old_acct, new_acct, left(_reason, 300), d->>'plan');
  END IF;
  IF new_cli IS DISTINCT FROM old_cli THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, field, old_value, new_value, reason, plan)
    VALUES (uid, 'tenant', 'client_limit', old_cli, new_cli, left(_reason, 300), d->>'plan');
  END IF;
  IF new_win IS DISTINCT FROM old_win THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, field, old_value, new_value, reason, plan)
    VALUES (uid, 'tenant', 'window_seconds', old_win, new_win, left(_reason, 300), d->>'plan');
  END IF;

  RETURN jsonb_build_object('ok', true, 'limits', public.mcp_effective_limits(uid, NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_set_agent_rate_limit(_client_id text, _call_limit integer DEFAULT NULL::integer, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  d jsonb;
  eff jsonb;
  cid text := NULLIF(left(COALESCE(_client_id,''), 128), '');
  old_limit integer;
  new_limit integer;
BEGIN
  PERFORM public.log_definer_call('mcp_set_agent_rate_limit', uid IS NOT NULL,
    CASE WHEN uid IS NULL THEN 'unauthenticated' ELSE 'self' END,
    jsonb_build_object('client_id', cid, 'call_limit', _call_limit));
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF cid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_client'); END IF;
  d := public.mcp_plan_defaults(uid);
  eff := public.mcp_effective_limits(uid, NULL);

  SELECT call_limit INTO old_limit FROM public.mcp_agent_rate_limits WHERE user_id = uid AND client_id = cid;

  IF _call_limit IS NULL THEN
    DELETE FROM public.mcp_agent_rate_limits WHERE user_id = uid AND client_id = cid;
    IF old_limit IS NOT NULL THEN
      INSERT INTO public.mcp_rate_limit_audit (user_id, scope, client_id, field, old_value, new_value, reason, plan)
      VALUES (uid, 'agent', cid, 'call_limit', old_limit, NULL, left(_reason,300), d->>'plan');
    END IF;
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;

  new_limit := LEAST(GREATEST(_call_limit, 1), (eff->>'account_limit')::int);

  INSERT INTO public.mcp_agent_rate_limits (user_id, client_id, call_limit)
  VALUES (uid, cid, new_limit)
  ON CONFLICT (user_id, client_id) DO UPDATE SET call_limit = EXCLUDED.call_limit, updated_at = now();

  IF new_limit IS DISTINCT FROM old_limit THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, client_id, field, old_value, new_value, reason, plan)
    VALUES (uid, 'agent', cid, 'call_limit', old_limit, new_limit, left(_reason,300), d->>'plan');
  END IF;

  RETURN jsonb_build_object('ok', true, 'client_id', cid, 'call_limit', new_limit);
END;
$$;