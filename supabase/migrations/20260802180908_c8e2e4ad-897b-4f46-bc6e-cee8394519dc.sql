CREATE TABLE public.app_feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  value_type text NOT NULL DEFAULT 'bool' CHECK (value_type IN ('bool','number','string')),
  value text NOT NULL DEFAULT 'false',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_feature_flags TO authenticated;
GRANT ALL ON public.app_feature_flags TO service_role;
ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read feature flags" ON public.app_feature_flags
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update feature flags" ON public.app_feature_flags
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert feature flags" ON public.app_feature_flags
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.app_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  source text NOT NULL DEFAULT 'control_panel',
  actor_id uuid,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.app_config_audit TO authenticated;
GRANT ALL ON public.app_config_audit TO service_role;
ALTER TABLE public.app_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read config audit" ON public.app_config_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins append config audit" ON public.app_config_audit
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_app_config_audit_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'app_config_audit is append-only';
END;
$$;

CREATE TRIGGER app_config_audit_append_only
  BEFORE UPDATE OR DELETE ON public.app_config_audit
  FOR EACH ROW EXECUTE FUNCTION public.tg_app_config_audit_append_only();

CREATE INDEX app_config_audit_created_idx ON public.app_config_audit (created_at DESC);
CREATE INDEX app_config_audit_flag_idx ON public.app_config_audit (flag_key, created_at DESC);

INSERT INTO public.app_feature_flags (key, label, description, category, value_type, value, sort_order) VALUES
 ('live_trading','Live trading','Allow real on-chain swaps via DEX routing. When off, every execution stays paper-only.','trading','bool','false',10),
 ('paper_trading','Paper trading','Simulated execution with mock fills. Recommended default.','trading','bool','true',20),
 ('max_trade_usd','Max trade size (USD)','Hard cap applied to any single live order.','trading','number','250',30),
 ('default_slippage_bps','Default slippage (bps)','Slippage tolerance used for swap quotes.','trading','number','50',40),
 ('scanner','Market scanner','Momentum scanner route and background refresh.','signals','bool','true',50),
 ('alerts','Alert rules & delivery','Scanner alert rules, history and replay.','signals','bool','true',60),
 ('live_momentum','Real-time momentum alerts','Streaming momentum spike detection and notifications.','signals','bool','true',70),
 ('anomaly_detection','Signal anomaly detection','Z-score spike detection on momentum series.','signals','bool','true',80),
 ('copilot','AI Copilot','In-app AI investing coach.','ai','bool','true',90),
 ('mcp_agents','Agent integrations (MCP)','External AI agents may call app tools.','ai','bool','true',100),
 ('mcp_account_call_limit','Agent calls per window','Default per-account MCP call limit.','ai','number','120',110),
 ('wallet_scan','Wallet threat scanning','Phishing/drainer scans on wallet connect.','security','bool','true',120),
 ('wallet_scan_interval_min','Background scan interval (min)','How often connected wallets are rescanned.','security','number','60',130),
 ('pump_rewards','PUMP rewards','Quests, perks and PUMP balance features.','growth','bool','true',140),
 ('waitlist','Landing waitlist','Email waitlist capture on marketing pages.','growth','bool','true',150),
 ('ad_preview','Landing ad preview','Auto-play mascot ad on the landing page.','growth','bool','true',160),
 ('onboarding_wizard','Onboarding wizard','First-run guided setup for new users.','experience','bool','true',170),
 ('guided_tour','Guided tour','Nine-step interactive product tour.','experience','bool','true',180);