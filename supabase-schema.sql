-- ========================================================
-- NOOR HABIT — SUPABASE DATABASE SCHEMA
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

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Muslim Friend',
    friend_code TEXT UNIQUE NOT NULL DEFAULT generate_friend_code(),
    birth DATE,
    goal TEXT,
    streak INT DEFAULT 0,
    prayed_today INT DEFAULT 0,
    habits_today INT DEFAULT 0,
    weekly_prayer_rate INT DEFAULT 0,
    weekly_habit_rate INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure friend code is never null and is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_friend_code ON public.profiles(friend_code);

-- 3. Friendships Table
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')) DEFAULT 'accepted',
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
-- Profiles: Anyone authenticated can read profiles (needed for friends & ranking)
CREATE POLICY "Allow public read access to profiles" 
    ON public.profiles FOR SELECT 
    USING (true);

-- Profiles: Users can update only their own profile
CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Profiles: Users can insert their own profile
CREATE POLICY "Users can insert their own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- Friendships: Users can read friendships they are part of
CREATE POLICY "Users can view friendships" 
    ON public.friendships FOR SELECT 
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Friendships: Users can insert a friendship request
CREATE POLICY "Users can create friendships" 
    ON public.friendships FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Friendships: Users can update their incoming friendships
CREATE POLICY "Users can update friendships" 
    ON public.friendships FOR UPDATE 
    USING (auth.uid() = friend_id OR auth.uid() = user_id);

-- Friendships: Users can delete friendships
CREATE POLICY "Users can delete friendships" 
    ON public.friendships FOR DELETE 
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Daily Logs: Anyone can read logs for leaderboard calculations
CREATE POLICY "Allow read access to daily logs" 
    ON public.daily_logs FOR SELECT 
    USING (true);

-- Daily Logs: Users can insert / update their own logs
CREATE POLICY "Users can insert own logs" 
    ON public.daily_logs FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

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

