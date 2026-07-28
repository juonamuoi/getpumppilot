CREATE TABLE public.lead_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  consent boolean NOT NULL DEFAULT false,
  variant text,
  placement text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  page_path text,
  visitor_id text,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.lead_captures TO anon, authenticated;
GRANT ALL ON public.lead_captures TO service_role;

ALTER TABLE public.lead_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a lead"
ON public.lead_captures
FOR INSERT
TO anon, authenticated
WITH CHECK (
  consent = true
  AND length(email) BETWEEN 5 AND 254
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (variant IS NULL OR length(variant) <= 64)
  AND (placement IS NULL OR length(placement) <= 64)
  AND (utm_source IS NULL OR length(utm_source) <= 64)
  AND (utm_medium IS NULL OR length(utm_medium) <= 64)
  AND (utm_campaign IS NULL OR length(utm_campaign) <= 64)
  AND (utm_content IS NULL OR length(utm_content) <= 64)
  AND (referrer IS NULL OR length(referrer) <= 512)
  AND (page_path IS NULL OR length(page_path) <= 256)
  AND (visitor_id IS NULL OR length(visitor_id) <= 64)
  AND (user_id IS NULL OR user_id = auth.uid())
);

CREATE INDEX idx_lead_captures_created_at ON public.lead_captures (created_at DESC);
CREATE INDEX idx_lead_captures_variant ON public.lead_captures (variant);