ALTER TABLE public.ad_creative_events
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS placement text;

CREATE INDEX IF NOT EXISTS ad_creative_events_placement_idx
  ON public.ad_creative_events (experiment, placement, created_at DESC);

CREATE OR REPLACE FUNCTION public.ad_placement_report(_days integer DEFAULT 30)
RETURNS TABLE(
  creative text,
  placement text,
  source text,
  campaign text,
  variant text,
  clicks bigint,
  click_visitors bigint,
  signups bigint,
  signup_rate numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_admin('ad_placement_report');
  RETURN QUERY
  WITH e AS (
    SELECT * FROM public.ad_creative_events
    WHERE experiment = 'signup_funnel'
      AND created_at > now() - make_interval(days => LEAST(GREATEST(COALESCE(_days, 30), 1), 365))
  ),
  clicks AS (
    SELECT
      COALESCE(NULLIF(utm_content, ''), 'none') AS creative,
      COALESCE(NULLIF(placement, ''), replace(creative_id, 'cta:', '')) AS placement,
      COALESCE(NULLIF(utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(utm_campaign, ''), 'none') AS campaign,
      variant,
      visitor_id
    FROM e
    WHERE event = 'cta_click_raw'
  ),
  signups AS (
    SELECT DISTINCT
      COALESCE(NULLIF(utm_content, ''), 'none') AS creative,
      COALESCE(NULLIF(placement, ''), replace(creative_id, 'cta:', '')) AS placement,
      COALESCE(NULLIF(utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(utm_campaign, ''), 'none') AS campaign,
      variant,
      visitor_id
    FROM e
    WHERE event = 'signup_attributed'
  ),
  click_agg AS (
    SELECT creative, placement, source, campaign, variant,
           count(*)::bigint AS clicks,
           count(DISTINCT visitor_id)::bigint AS click_visitors
    FROM clicks GROUP BY 1,2,3,4,5
  ),
  signup_agg AS (
    SELECT creative, placement, source, campaign, variant,
           count(*)::bigint AS signups
    FROM signups GROUP BY 1,2,3,4,5
  ),
  keys AS (
    SELECT creative, placement, source, campaign, variant FROM click_agg
    UNION
    SELECT creative, placement, source, campaign, variant FROM signup_agg
  )
  SELECT k.creative, k.placement, k.source, k.campaign, k.variant,
    COALESCE(c.clicks, 0)::bigint,
    COALESCE(c.click_visitors, 0)::bigint,
    COALESCE(s.signups, 0)::bigint,
    CASE WHEN COALESCE(c.click_visitors, 0) > 0
      THEN round(100.0 * COALESCE(s.signups, 0) / c.click_visitors, 1)
      ELSE NULL END AS signup_rate
  FROM keys k
  LEFT JOIN click_agg c USING (creative, placement, source, campaign, variant)
  LEFT JOIN signup_agg s USING (creative, placement, source, campaign, variant)
  ORDER BY COALESCE(s.signups, 0) DESC, COALESCE(c.clicks, 0) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.ad_placement_report(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_placement_report(integer) TO service_role;