
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- strategies
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_public BOOLEAN NOT NULL DEFAULT true,
  likes_count INT NOT NULL DEFAULT 0,
  forks_count INT NOT NULL DEFAULT 0,
  parent_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.strategies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategies TO authenticated;
GRANT ALL ON public.strategies TO service_role;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public strategies viewable by all" ON public.strategies FOR SELECT USING (is_public = true OR auth.uid() = author_id);
CREATE POLICY "Authors insert own strategies" ON public.strategies FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update own strategies" ON public.strategies FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors delete own strategies" ON public.strategies FOR DELETE USING (auth.uid() = author_id);
CREATE INDEX strategies_author_idx ON public.strategies(author_id);
CREATE INDEX strategies_likes_idx ON public.strategies(likes_count DESC);

-- likes
CREATE TABLE public.strategy_likes (
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, user_id)
);
GRANT SELECT ON public.strategy_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.strategy_likes TO authenticated;
GRANT ALL ON public.strategy_likes TO service_role;
ALTER TABLE public.strategy_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes viewable by everyone" ON public.strategy_likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.strategy_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike own" ON public.strategy_likes FOR DELETE USING (auth.uid() = user_id);

-- Maintain likes_count via trigger
CREATE OR REPLACE FUNCTION public.tg_strategy_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.strategies SET likes_count = likes_count + 1 WHERE id = NEW.strategy_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.strategies SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.strategy_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER strategy_likes_count_ins AFTER INSERT ON public.strategy_likes FOR EACH ROW EXECUTE FUNCTION public.tg_strategy_likes_count();
CREATE TRIGGER strategy_likes_count_del AFTER DELETE ON public.strategy_likes FOR EACH ROW EXECUTE FUNCTION public.tg_strategy_likes_count();

-- follows
CREATE TABLE public.strategy_follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, author_id),
  CHECK (follower_id <> author_id)
);
GRANT SELECT ON public.strategy_follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.strategy_follows TO authenticated;
GRANT ALL ON public.strategy_follows TO service_role;
ALTER TABLE public.strategy_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Follows viewable by everyone" ON public.strategy_follows FOR SELECT USING (true);
CREATE POLICY "Users can follow" ON public.strategy_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.strategy_follows FOR DELETE USING (auth.uid() = follower_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER strategies_updated_at BEFORE UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
