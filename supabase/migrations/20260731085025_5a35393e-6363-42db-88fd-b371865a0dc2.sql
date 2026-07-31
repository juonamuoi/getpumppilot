CREATE TABLE IF NOT EXISTS public.pump_perks (
  key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  cost integer NOT NULL CHECK (cost > 0),
  duration_days integer,
  credits integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'feature',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pump_perks TO authenticated;
GRANT ALL ON public.pump_perks TO service_role;
ALTER TABLE public.pump_perks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perk catalog readable by signed-in users"
  ON public.pump_perks FOR SELECT TO authenticated USING (active);

CREATE TABLE IF NOT EXISTS public.pump_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  perk_key text NOT NULL REFERENCES public.pump_perks(key),
  cost integer NOT NULL,
  credits_granted integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pump_redemptions_user_idx
  ON public.pump_redemptions (user_id, created_at DESC);
GRANT SELECT ON public.pump_redemptions TO authenticated;
GRANT ALL ON public.pump_redemptions TO service_role;
ALTER TABLE public.pump_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own redemptions"
  ON public.pump_redemptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.pump_perks (key, title, description, cost, duration_days, credits, category, sort_order) VALUES
  ('extended_alerts', 'Extended alerts', 'Unlock unlimited wallet + scanner alert rules and longer delivery history for 30 days.', 2000, 30, 0, 'feature', 10),
  ('premium_dashboard', 'Premium dashboards', 'Advanced momentum, allocation and risk dashboards with extended history for 30 days.', 3500, 30, 0, 'feature', 20),
  ('priority_scans', 'Priority wallet scans', 'Faster background wallet security scans with shorter intervals for 7 days.', 1000, 7, 0, 'feature', 30),
  ('credit_pack_100', '100 app credits', 'Convert PUMP into 100 app credits usable across AI copilot and premium scans.', 2500, NULL, 100, 'credits', 40)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pump_redeem(_perk_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  p public.pump_perks%ROWTYPE;
  cur bigint;
  newbal bigint;
  base timestamptz;
  ends timestamptz;
  rid uuid;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;

  SELECT * INTO p FROM public.pump_perks WHERE key = _perk_key AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_perk'); END IF;

  PERFORM public.pump_ensure_account(uid, 500);

  SELECT balance INTO cur FROM public.pump_balances WHERE user_id = uid FOR UPDATE;
  IF cur < p.cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'balance', cur, 'required', p.cost);
  END IF;

  UPDATE public.pump_balances
     SET balance = balance - p.cost, lifetime_sent = lifetime_sent
   WHERE user_id = uid
   RETURNING balance INTO newbal;

  IF p.duration_days IS NOT NULL THEN
    SELECT GREATEST(COALESCE(max(expires_at), now()), now()) INTO base
      FROM public.pump_redemptions
     WHERE user_id = uid AND perk_key = p.key AND expires_at IS NOT NULL;
    ends := COALESCE(base, now()) + make_interval(days => p.duration_days);
  END IF;

  INSERT INTO public.pump_redemptions (user_id, perk_key, cost, credits_granted, expires_at)
  VALUES (uid, p.key, p.cost, p.credits, ends)
  RETURNING id INTO rid;

  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, memo, external_ref)
  VALUES (uid, -p.cost, newbal, 'redeem', p.title, 'pump_redeem:' || rid::text);

  IF p.credits > 0 THEN
    PERFORM public.grant_credits(uid, p.credits, 'pump_redeem', 'Redeemed ' || p.title,
                                 'pump_redeem_credits:' || rid::text, jsonb_build_object('perk', p.key));
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'perk', p.key, 'title', p.title, 'spent', p.cost,
    'balance', newbal, 'expires_at', ends, 'credits_granted', p.credits
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pump_redeem(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pump_redeem(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pump_my_perks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'balance', COALESCE((SELECT balance FROM public.pump_balances WHERE user_id = uid), 0),
    'perks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', p.key, 'title', p.title, 'description', p.description,
        'cost', p.cost, 'duration_days', p.duration_days, 'credits', p.credits,
        'category', p.category,
        'active_until', (
          SELECT max(r.expires_at) FROM public.pump_redemptions r
           WHERE r.user_id = uid AND r.perk_key = p.key AND r.expires_at > now()
        ),
        'times_redeemed', (
          SELECT count(*) FROM public.pump_redemptions r
           WHERE r.user_id = uid AND r.perk_key = p.key
        )
      ) ORDER BY p.sort_order, p.key)
      FROM public.pump_perks p WHERE p.active
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'perk_key', r.perk_key, 'title', p.title, 'cost', r.cost,
        'credits_granted', r.credits_granted, 'created_at', r.created_at,
        'expires_at', r.expires_at
      ) ORDER BY r.created_at DESC)
      FROM public.pump_redemptions r
      JOIN public.pump_perks p ON p.key = r.perk_key
      WHERE r.user_id = uid
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pump_my_perks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pump_my_perks() TO authenticated;