-- Central authorization guard for privileged SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Trusted server-side callers (service role / owner) bypass the role check.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN;
  END IF;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.require_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_admin() TO authenticated, service_role;

-- 1. Ad creative report -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.ad_creative_report(_experiment text DEFAULT 'landing_hero'::text, _days integer DEFAULT 30)
RETURNS TABLE(variant text, creative_id text, impressions bigint, clicks bigint, signups bigint, visitors bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_admin();
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

-- 2. Ad funnel report -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ad_funnel_report(_days integer DEFAULT 30)
RETURNS TABLE(source text, medium text, campaign text, variant text, visitors bigint, cta_clicks bigint, signups bigint, activations bigint, avg_minutes_to_chart numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_admin();
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

-- 3. Landing page variant report -------------------------------------------
CREATE OR REPLACE FUNCTION public.lp_variant_report(_days integer DEFAULT 30)
RETURNS TABLE(variant text, impressions bigint, visitors bigint, cta_clicks bigint, cta_clickers bigint, signups bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_admin();
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

-- 4. Wallet funnel report ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_funnel_report(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  win integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => win);
  result jsonb;
BEGIN
  PERFORM public.require_admin();
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

-- 5. Privileged maintenance routines ---------------------------------------
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
  PERFORM public.require_admin();
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
  PERFORM public.require_admin();
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
  PERFORM public.require_admin();
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

-- Keep client-facing grants unchanged: these stay server/admin only.
REVOKE ALL ON FUNCTION public.ad_creative_report(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_creative_report(text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.ad_funnel_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_funnel_report(integer) TO service_role;
REVOKE ALL ON FUNCTION public.lp_variant_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lp_variant_report(integer) TO service_role;
REVOKE ALL ON FUNCTION public.wallet_funnel_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_funnel_report(integer) TO service_role;
REVOKE ALL ON FUNCTION public.grant_credits(uuid, integer, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.process_referral_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_rewards() TO service_role;
REVOKE ALL ON FUNCTION public.evaluate_storage_audit_alerts(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_storage_audit_alerts(integer, integer, integer) TO service_role;