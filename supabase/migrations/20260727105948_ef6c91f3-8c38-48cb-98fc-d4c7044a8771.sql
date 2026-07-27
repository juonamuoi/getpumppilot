CREATE INDEX IF NOT EXISTS ad_creative_events_exp_created_idx
  ON public.ad_creative_events (experiment, created_at DESC);

CREATE OR REPLACE FUNCTION public.ad_funnel_report(_days integer DEFAULT 30)
RETURNS TABLE(
  source text,
  medium text,
  campaign text,
  variant text,
  visitors bigint,
  cta_clicks bigint,
  signups bigint,
  activations bigint,
  avg_minutes_to_chart numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.ad_funnel_report(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_funnel_report(integer) TO service_role;