-- 1. Roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2. Internal-only SECURITY DEFINER routines: server/trigger use only.
REVOKE ALL ON FUNCTION public.ad_creative_report(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ad_funnel_report(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lp_variant_report(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_credits(uuid, integer, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_credit_account(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_begin_call(uuid, uuid, text, text, jsonb, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_finish_call(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_plan_defaults(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_referral_rewards() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_referral_code_for_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_credit_account_for_new_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_strategy_likes_count() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ad_creative_report(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ad_funnel_report(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lp_variant_report(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_credit_account(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_begin_call(uuid, uuid, text, text, jsonb, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_finish_call(uuid, uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_plan_defaults(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_referral_rewards() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO service_role;

-- 3. User-facing routines: signed-in users only, never anonymous.
REVOKE ALL ON FUNCTION public.consume_credits(integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer, text, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mcp_rate_limit_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_rate_limit_status(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mcp_effective_limits(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_effective_limits(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mcp_set_rate_limits(integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_set_rate_limits(integer, integer, integer, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mcp_set_agent_rate_limit(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_set_agent_rate_limit(text, integer, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.my_referral_reward_months() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_reward_months() TO authenticated, service_role;