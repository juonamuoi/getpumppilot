ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS pump_awarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS pump_activation_key text,
  ADD COLUMN IF NOT EXISTS pump_referrer_award integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pump_referred_award integer NOT NULL DEFAULT 0;

-- Internal helper: pays the PUMP referral bonus once the referred member
-- completes the required activation action. Not callable by clients.
CREATE OR REPLACE FUNCTION public.pump_settle_referral(_user_id uuid, _activation_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.referrals%ROWTYPE;
  referrer_award integer := 750;
  referred_award integer := 250;
  bal bigint;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_user'); END IF;

  SELECT * INTO r FROM public.referrals
   WHERE referred_user_id = _user_id AND pump_awarded_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_referral'); END IF;
  IF r.referrer_id = r.referred_user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_referral'); END IF;

  PERFORM public.pump_ensure_account(r.referrer_id, 500);
  PERFORM public.pump_ensure_account(r.referred_user_id, 500);

  UPDATE public.pump_balances
     SET balance = balance + referrer_award,
         lifetime_earned = lifetime_earned + referrer_award
   WHERE user_id = r.referrer_id
   RETURNING balance INTO bal;
  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, counterparty_id, memo, external_ref)
  VALUES (r.referrer_id, referrer_award, bal, 'referral', r.referred_user_id,
          'Referral activated: ' || COALESCE(_activation_key, 'activation'),
          'pump_referral_referrer:' || r.id::text)
  ON CONFLICT (external_ref) DO NOTHING;

  UPDATE public.pump_balances
     SET balance = balance + referred_award,
         lifetime_earned = lifetime_earned + referred_award
   WHERE user_id = r.referred_user_id
   RETURNING balance INTO bal;
  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, counterparty_id, memo, external_ref)
  VALUES (r.referred_user_id, referred_award, bal, 'referral', r.referrer_id,
          'Welcome referral bonus', 'pump_referral_referred:' || r.id::text)
  ON CONFLICT (external_ref) DO NOTHING;

  UPDATE public.referrals
     SET pump_awarded_at = now(),
         pump_activation_key = _activation_key,
         pump_referrer_award = referrer_award,
         pump_referred_award = referred_award,
         qualified_at = COALESCE(qualified_at, now())
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'referrer_award', referrer_award,
                            'referred_award', referred_award, 'balance', bal);
END;
$function$;

REVOKE ALL ON FUNCTION public.pump_settle_referral(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pump_settle_referral(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pump_settle_referral(uuid, text) FROM authenticated;

-- Quest claims now trigger the referral payout on the required first action.
CREATE OR REPLACE FUNCTION public.pump_claim_quest(_quest_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  q public.pump_quests%ROWTYPE;
  newbal bigint;
  referral jsonb := NULL;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT * INTO q FROM public.pump_quests WHERE key = _quest_key AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_quest'); END IF;

  PERFORM public.pump_ensure_account(uid, 500);

  INSERT INTO public.pump_quest_claims (user_id, quest_key, awarded)
  VALUES (uid, q.key, q.reward)
  ON CONFLICT (user_id, quest_key) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed'); END IF;

  UPDATE public.pump_balances
     SET balance = balance + q.reward,
         lifetime_earned = lifetime_earned + q.reward
   WHERE user_id = uid
   RETURNING balance INTO newbal;

  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, quest_key, memo, external_ref)
  VALUES (uid, q.reward, newbal, 'quest', q.key, q.title, 'pump_quest:' || uid::text || ':' || q.key);

  IF q.key = 'connect_wallet' THEN
    referral := public.pump_settle_referral(uid, q.key);
    SELECT balance INTO newbal FROM public.pump_balances WHERE user_id = uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'awarded', q.reward, 'balance', newbal, 'referral', referral);
END;
$function$;

REVOKE ALL ON FUNCTION public.pump_claim_quest(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pump_claim_quest(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pump_claim_quest(text) TO authenticated;

-- Signed-in view of referral bonus progress.
CREATE OR REPLACE FUNCTION public.pump_referral_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  tag text;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT code INTO tag FROM public.referral_codes WHERE user_id = uid LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'tag', tag,
    'activation_key', 'connect_wallet',
    'activation_title', (SELECT title FROM public.pump_quests WHERE key = 'connect_wallet'),
    'referrer_award', 750,
    'referred_award', 250,
    'invited', (SELECT count(*) FROM public.referrals WHERE referrer_id = uid),
    'activated', (SELECT count(*) FROM public.referrals WHERE referrer_id = uid AND pump_awarded_at IS NOT NULL),
    'pending', (SELECT count(*) FROM public.referrals WHERE referrer_id = uid AND pump_awarded_at IS NULL),
    'pump_earned', COALESCE((
      SELECT SUM(delta) FROM public.pump_ledger WHERE user_id = uid AND kind = 'referral' AND delta > 0
    ), 0),
    'my_bonus_awarded', EXISTS (
      SELECT 1 FROM public.referrals WHERE referred_user_id = uid AND pump_awarded_at IS NOT NULL
    ),
    'i_was_referred', EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = uid),
    'referrals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id,
        'created_at', x.created_at,
        'status', CASE WHEN x.pump_awarded_at IS NOT NULL THEN 'awarded' ELSE 'pending' END,
        'awarded_at', x.pump_awarded_at,
        'activation_key', x.pump_activation_key,
        'pump', x.pump_referrer_award
      ) ORDER BY x.created_at DESC)
      FROM (SELECT * FROM public.referrals WHERE referrer_id = uid ORDER BY created_at DESC LIMIT 50) x
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pump_referral_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pump_referral_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.pump_referral_status() TO authenticated;