CREATE TABLE public.seo_crawl_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  site_url text NOT NULL,
  sitemap_errors integer NOT NULL DEFAULT 0,
  sitemap_warnings integer NOT NULL DEFAULT 0,
  submitted_urls integer NOT NULL DEFAULT 0,
  indexed_urls integer NOT NULL DEFAULT 0,
  canonical_mismatches integer NOT NULL DEFAULT 0,
  urls_checked integer NOT NULL DEFAULT 0,
  crawl_errors integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX seo_crawl_snapshots_created_at_idx ON public.seo_crawl_snapshots (created_at DESC);

CREATE TABLE public.seo_crawl_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  snapshot_id uuid REFERENCES public.seo_crawl_snapshots(id) ON DELETE CASCADE,
  site_url text NOT NULL,
  metric text NOT NULL,
  previous_value numeric,
  current_value numeric,
  delta numeric,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX seo_crawl_alerts_created_at_idx ON public.seo_crawl_alerts (created_at DESC);

GRANT SELECT ON public.seo_crawl_snapshots TO authenticated;
GRANT ALL ON public.seo_crawl_snapshots TO service_role;
GRANT SELECT, UPDATE ON public.seo_crawl_alerts TO authenticated;
GRANT ALL ON public.seo_crawl_alerts TO service_role;

ALTER TABLE public.seo_crawl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_crawl_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seo_crawl_snapshots_admin_select"
  ON public.seo_crawl_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "seo_crawl_alerts_admin_select"
  ON public.seo_crawl_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "seo_crawl_alerts_admin_update"
  ON public.seo_crawl_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));