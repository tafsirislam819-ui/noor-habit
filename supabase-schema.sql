-- ========================================================
-- NOOR HABIT — SUPABASE DATABASE SCHEMA (v2 with Avatars & Realtime)
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ahyiwiguhpmyoyavhyrv/sql
-- ========================================================

-- 1. Helper function to generate a random 6-character uppercase alphanumeric friend code
CREATE OR REPLACE FUNCTION generate_friend_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 2. Profiles Table (with avatar_url)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Muslim Friend',
    friend_code TEXT UNIQUE NOT NULL DEFAULT generate_friend_code(),
    avatar_url TEXT,
    birth DATE,
    goal TEXT,
    streak INT DEFAULT 0,
    prayed_today INT DEFAULT 0,
    habits_today INT DEFAULT 0,
    weekly_prayer_rate INT DEFAULT 0,
    weekly_habit_rate INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration check in case profiles already exists without avatar_url
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Ensure friend code is never null and is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_friend_code ON public.profiles(friend_code);

-- 3. Friendships Table
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);

-- 4. Daily Logs Table (for sync & analytics)
CREATE TABLE IF NOT EXISTS public.daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    prayers_completed INT DEFAULT 0,
    habits_completed INT DEFAULT 0,
    total_habits INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON public.daily_logs(user_id, log_date);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
CREATE POLICY "Allow public read access to profiles" 
    ON public.profiles FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view friendships" ON public.friendships;
CREATE POLICY "Users can view friendships" 
    ON public.friendships FOR SELECT 
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can create friendships" ON public.friendships;
CREATE POLICY "Users can create friendships" 
    ON public.friendships FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update friendships" ON public.friendships;
CREATE POLICY "Users can update friendships" 
    ON public.friendships FOR UPDATE 
    USING (auth.uid() = friend_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete friendships" ON public.friendships;
CREATE POLICY "Users can delete friendships" 
    ON public.friendships FOR DELETE 
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Allow read access to daily logs" ON public.daily_logs;
CREATE POLICY "Allow read access to daily logs" 
    ON public.daily_logs FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Users can insert own logs" ON public.daily_logs;
CREATE POLICY "Users can insert own logs" 
    ON public.daily_logs FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own logs" ON public.daily_logs;
CREATE POLICY "Users can update own logs" 
    ON public.daily_logs FOR UPDATE 
    USING (auth.uid() = user_id);

-- 7. Trigger to automatically create a profile when a new user signs up via Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, friend_code)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Muslim Friend'),
        generate_friend_code()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Add Tables to Realtime Publication for instant friend & leaderboard updates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'friendships'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
    END IF;
END $$;
