CREATE TABLE public.ad_creative_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment text NOT NULL,
  variant text NOT NULL,
  creative_id text NOT NULL,
  event text NOT NULL CHECK (event IN ('impression','click','signup')),
  visitor_id text NOT NULL,
  user_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ad_creative_events_lookup_idx
  ON public.ad_creative_events (experiment, variant, creative_id, event, created_at DESC);

GRANT INSERT ON public.ad_creative_events TO anon, authenticated;
GRANT ALL ON public.ad_creative_events TO service_role;

ALTER TABLE public.ad_creative_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a creative event"
  ON public.ad_creative_events FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(experiment) <= 64
    AND length(variant) <= 64
    AND length(creative_id) <= 64
    AND length(visitor_id) <= 64
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.ad_creative_report(_experiment text DEFAULT 'landing_hero', _days integer DEFAULT 30)
RETURNS TABLE (
  variant text,
  creative_id text,
  impressions bigint,
  clicks bigint,
  signups bigint,
  visitors bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.ad_creative_report(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_creative_report(text, integer) TO authenticated, service_role;