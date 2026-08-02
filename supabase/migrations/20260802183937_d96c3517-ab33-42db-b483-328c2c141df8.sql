CREATE OR REPLACE FUNCTION public.wallet_funnel_report(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  win integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => win);
  result jsonb;
BEGIN
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
$function$;

REVOKE ALL ON FUNCTION public.wallet_funnel_report(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_funnel_report(integer) TO service_role;