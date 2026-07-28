CREATE OR REPLACE FUNCTION public.lp_variant_report(_days integer DEFAULT 30)
RETURNS TABLE(
  variant text,
  impressions bigint,
  visitors bigint,
  cta_clicks bigint,
  cta_clickers bigint,
  signups bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT * FROM public.ad_creative_events
    WHERE created_at > now() - make_interval(days => LEAST(GREATEST(COALESCE(_days, 30), 1), 365))
  ),
  v AS (
    SELECT DISTINCT variant FROM e WHERE variant <> ''
  )
  SELECT v.variant,
    (SELECT count(*) FROM e WHERE e.variant = v.variant AND e.event = 'impression')::bigint,
    (SELECT count(DISTINCT e.visitor_id) FROM e WHERE e.variant = v.variant)::bigint,
    (SELECT count(*) FROM e WHERE e.variant = v.variant AND e.event IN ('cta_click_raw','click'))::bigint,
    (SELECT count(DISTINCT e.visitor_id) FROM e WHERE e.variant = v.variant AND e.event IN ('cta_click','cta_click_raw','click'))::bigint,
    (SELECT count(DISTINCT COALESCE(e.user_id::text, e.visitor_id)) FROM e WHERE e.variant = v.variant AND e.event IN ('signup','signup_attributed'))::bigint
  FROM v
  ORDER BY 2 DESC, 1;
$function$;

REVOKE ALL ON FUNCTION public.lp_variant_report(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.lp_variant_report(integer) TO authenticated, service_role;