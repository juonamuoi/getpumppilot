-- Quest catalog
CREATE TABLE public.pump_quests (
  key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  reward integer NOT NULL CHECK (reward > 0 AND reward <= 100000),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pump_quests TO anon, authenticated;
GRANT ALL ON public.pump_quests TO service_role;
ALTER TABLE public.pump_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Quest catalog is public" ON public.pump_quests FOR SELECT USING (true);

-- Balances
CREATE TABLE public.pump_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned bigint NOT NULL DEFAULT 0,
  lifetime_sent bigint NOT NULL DEFAULT 0,
  lifetime_received bigint NOT NULL DEFAULT 0,
  payout_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.pump_balances TO authenticated;
GRANT ALL ON public.pump_balances TO service_role;
ALTER TABLE public.pump_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own pump balance readable" ON public.pump_balances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own pump balance payout address" ON public.pump_balances FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER pump_balances_updated_at BEFORE UPDATE ON public.pump_balances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ledger (append-only for clients)
CREATE TABLE public.pump_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta bigint NOT NULL,
  balance_after bigint NOT NULL,
  kind text NOT NULL,
  quest_key text,
  counterparty_id uuid,
  memo text,
  external_ref text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pump_ledger_user_created_idx ON public.pump_ledger (user_id, created_at DESC);
GRANT SELECT ON public.pump_ledger TO authenticated;
GRANT ALL ON public.pump_ledger TO service_role;
ALTER TABLE public.pump_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own pump ledger readable" ON public.pump_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Quest claims
CREATE TABLE public.pump_quest_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_key text NOT NULL REFERENCES public.pump_quests(key) ON DELETE CASCADE,
  awarded integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quest_key)
);
GRANT SELECT ON public.pump_quest_claims TO authenticated;
GRANT ALL ON public.pump_quest_claims TO service_role;
ALTER TABLE public.pump_quest_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own pump quest claims readable" ON public.pump_quest_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Account bootstrap + signup bonus
CREATE OR REPLACE FUNCTION public.pump_ensure_account(_user_id uuid, _signup_bonus integer DEFAULT 500)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted boolean := false;
  bonus integer := LEAST(GREATEST(COALESCE(_signup_bonus, 0), 0), 100000);
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.pump_balances (user_id, balance, lifetime_earned)
  VALUES (_user_id, bonus, bonus)
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted AND bonus > 0 THEN
    INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, memo, external_ref)
    VALUES (_user_id, bonus, bonus, 'signup_bonus', 'Welcome to PumpPilot', 'pump_signup:' || _user_id::text)
    ON CONFLICT (external_ref) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_pump_account_for_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.pump_ensure_account(NEW.id, 500);
  RETURN NEW;
END;
$$;

CREATE TRIGGER pump_account_for_new_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_pump_account_for_new_profile();

-- Summary for the signed-in user
CREATE OR REPLACE FUNCTION public.pump_my_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  b public.pump_balances%ROWTYPE;
  tag text;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT * INTO b FROM public.pump_balances WHERE user_id = uid;
  SELECT code INTO tag FROM public.referral_codes WHERE user_id = uid LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true,
    'tag', COALESCE(tag, substring(uid::text, 1, 8)),
    'balance', COALESCE(b.balance, 0),
    'lifetime_earned', COALESCE(b.lifetime_earned, 0),
    'lifetime_sent', COALESCE(b.lifetime_sent, 0),
    'lifetime_received', COALESCE(b.lifetime_received, 0),
    'payout_address', b.payout_address,
    'quests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', q.key, 'title', q.title, 'description', q.description,
        'reward', q.reward,
        'claimed', c.user_id IS NOT NULL,
        'claimed_at', c.created_at
      ) ORDER BY q.sort_order, q.key)
      FROM public.pump_quests q
      LEFT JOIN public.pump_quest_claims c ON c.quest_key = q.key AND c.user_id = uid
      WHERE q.active
    ), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'delta', l.delta, 'balance_after', l.balance_after,
        'kind', l.kind, 'quest_key', l.quest_key, 'memo', l.memo, 'created_at', l.created_at
      ) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.pump_ledger WHERE user_id = uid ORDER BY created_at DESC LIMIT 50) l
    ), '[]'::jsonb)
  );
END;
$$;

-- Claim a quest reward
CREATE OR REPLACE FUNCTION public.pump_claim_quest(_quest_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  q public.pump_quests%ROWTYPE;
  newbal bigint;
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

  RETURN jsonb_build_object('ok', true, 'awarded', q.reward, 'balance', newbal);
END;
$$;

-- Peer transfer by PUMP tag
CREATE OR REPLACE FUNCTION public.pump_transfer(_to_tag text, _amount integer, _memo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  target uuid;
  amt bigint := COALESCE(_amount, 0);
  cur bigint;
  from_bal bigint;
  to_bal bigint;
  tag text := lower(trim(COALESCE(_to_tag, '')));
  ref text := gen_random_uuid()::text;
  recent bigint;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF amt <= 0 OR amt > 1000000 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount'); END IF;

  SELECT user_id INTO target FROM public.referral_codes WHERE lower(code) = tag LIMIT 1;
  IF target IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_recipient'); END IF;
  IF target = uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_transfer'); END IF;

  PERFORM public.pump_ensure_account(uid, 500);
  PERFORM public.pump_ensure_account(target, 500);

  SELECT COALESCE(SUM(-delta), 0) INTO recent
  FROM public.pump_ledger
  WHERE user_id = uid AND kind = 'transfer_out' AND created_at > now() - interval '24 hours';
  IF recent + amt > 100000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit', 'limit', 100000, 'used', recent);
  END IF;

  SELECT balance INTO cur FROM public.pump_balances WHERE user_id = uid FOR UPDATE;
  IF cur < amt THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'balance', cur);
  END IF;

  UPDATE public.pump_balances
     SET balance = balance - amt, lifetime_sent = lifetime_sent + amt
   WHERE user_id = uid RETURNING balance INTO from_bal;
  UPDATE public.pump_balances
     SET balance = balance + amt, lifetime_received = lifetime_received + amt
   WHERE user_id = target RETURNING balance INTO to_bal;

  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, counterparty_id, memo, external_ref)
  VALUES (uid, -amt, from_bal, 'transfer_out', target, left(_memo, 200), 'pump_tx_out:' || ref);
  INSERT INTO public.pump_ledger (user_id, delta, balance_after, kind, counterparty_id, memo, external_ref)
  VALUES (target, amt, to_bal, 'transfer_in', uid, left(_memo, 200), 'pump_tx_in:' || ref);

  RETURN jsonb_build_object('ok', true, 'sent', amt, 'balance', from_bal, 'to_tag', tag);
END;
$$;

-- Save payout wallet address
CREATE OR REPLACE FUNCTION public.pump_set_payout_address(_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  addr text := NULLIF(trim(COALESCE(_address, '')), '');
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF addr IS NOT NULL AND addr !~ '^0x[0-9a-fA-F]{40}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_address');
  END IF;
  PERFORM public.pump_ensure_account(uid, 500);
  UPDATE public.pump_balances SET payout_address = addr WHERE user_id = uid;
  RETURN jsonb_build_object('ok', true, 'payout_address', addr);
END;
$$;

INSERT INTO public.pump_quests (key, title, description, reward, sort_order) VALUES
  ('connect_wallet', 'Connect a wallet', 'Link a read-only wallet so PumpPilot can price your holdings.', 250, 10),
  ('first_scan', 'Run your first scan', 'Use the market scanner to find momentum candidates.', 150, 20),
  ('security_scan', 'Run a wallet security scan', 'Check your wallet for drainers and phishing approvals.', 200, 30),
  ('create_alert', 'Create an alert rule', 'Set up a momentum or price alert.', 150, 40),
  ('paper_trade', 'Place a paper trade', 'Practise risk-free in paper trading mode.', 200, 50),
  ('complete_tour', 'Finish the guided tour', 'Learn the dashboard end to end.', 100, 60),
  ('refer_friend', 'Refer a friend', 'Share your referral link and get a friend on board.', 500, 70);