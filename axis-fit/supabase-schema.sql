-- AXIS Fit Database Schema
-- Run this in Supabase SQL Editor

-- 1. PROFILES TABLE (Athlete profiles with codes)
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_code TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_emoji TEXT DEFAULT '💪',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    total_volume NUMERIC DEFAULT 0,
    total_workouts INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_workout_date DATE,
    UNIQUE(user_id)
);

-- 2. WORKOUTS TABLE (Synced workout logs)
CREATE TABLE workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    workout_date DATE NOT NULL,
    workout_type TEXT NOT NULL,
    title TEXT,
    exercises JSONB DEFAULT '[]',
    total_volume NUMERIC DEFAULT 0,
    duration_minutes INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CONNECTIONS TABLE (Friend relationships)
CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(requester_id, target_id)
);

-- 4. TEAMS TABLE (Gyms/Groups)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    avatar_emoji TEXT DEFAULT '🏋️',
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    member_count INTEGER DEFAULT 0
);

-- 5. TEAM MEMBERS TABLE
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, profile_id)
);

-- 6. PERSONAL RECORDS TABLE
CREATE TABLE personal_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN ('weight', 'reps', 'volume', 'time')),
    value NUMERIC NOT NULL,
    previous_value NUMERIC,
    achieved_at TIMESTAMPTZ DEFAULT NOW(),
    workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
    UNIQUE(profile_id, exercise_name, record_type)
);

-- 7. ACTIVITY FEED VIEW
CREATE OR REPLACE VIEW activity_feed AS
SELECT 
    w.id,
    w.profile_id,
    p.display_name,
    p.avatar_emoji,
    p.athlete_code,
    w.workout_type,
    w.title,
    w.total_volume,
    w.duration_minutes,
    w.workout_date,
    w.created_at,
    'workout' as activity_type
FROM workouts w
JOIN profiles p ON w.profile_id = p.id
ORDER BY w.created_at DESC;

-- 8. LEADERBOARD VIEW (Weekly)
CREATE OR REPLACE VIEW weekly_leaderboard AS
SELECT 
    p.id as profile_id,
    p.display_name,
    p.avatar_emoji,
    p.athlete_code,
    COALESCE(SUM(w.total_volume), 0) as weekly_volume,
    COUNT(w.id) as workout_count,
    p.current_streak
FROM profiles p
LEFT JOIN workouts w ON p.id = w.profile_id 
    AND w.workout_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY p.id, p.display_name, p.avatar_emoji, p.athlete_code, p.current_streak
ORDER BY weekly_volume DESC;

-- 9. INDEXES FOR PERFORMANCE
CREATE INDEX idx_workouts_profile_id ON workouts(profile_id);
CREATE INDEX idx_workouts_date ON workouts(workout_date DESC);
CREATE INDEX idx_connections_requester ON connections(requester_id);
CREATE INDEX idx_connections_target ON connections(target_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_profile ON team_members(profile_id);

-- 10. ENABLE ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

-- 11. RLS POLICIES

-- Profiles: Anyone can read, users can update their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Workouts: Viewable by connections, users manage their own
CREATE POLICY "Workouts viewable by all" ON workouts FOR SELECT USING (true);
CREATE POLICY "Users can insert own workouts" ON workouts FOR INSERT WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own workouts" ON workouts FOR UPDATE USING (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own workouts" ON workouts FOR DELETE USING (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Connections: Users can manage their own connections
CREATE POLICY "Users can view their connections" ON connections FOR SELECT USING (
    requester_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR
    target_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create connections" ON connections FOR INSERT WITH CHECK (
    requester_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update their connections" ON connections FOR UPDATE USING (
    requester_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR
    target_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Teams: Public teams viewable by all
CREATE POLICY "Public teams viewable by all" ON teams FOR SELECT USING (is_public = true);
CREATE POLICY "Team owners can update" ON teams FOR UPDATE USING (
    owner_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Anyone can create teams" ON teams FOR INSERT WITH CHECK (true);

-- Team Members: Members can view their teams
CREATE POLICY "Team members can view membership" ON team_members FOR SELECT USING (true);
CREATE POLICY "Users can join teams" ON team_members FOR INSERT WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can leave teams" ON team_members FOR DELETE USING (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Personal Records: Users manage their own
CREATE POLICY "PRs viewable by all" ON personal_records FOR SELECT USING (true);
CREATE POLICY "Users can manage own PRs" ON personal_records FOR ALL USING (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- 12. FUNCTION: Generate unique athlete code
CREATE OR REPLACE FUNCTION generate_athlete_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code TEXT := 'AXIS-';
    i INTEGER;
BEGIN
    FOR i IN 1..4 LOOP
        code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- 13. FUNCTION: Update profile stats after workout
CREATE OR REPLACE FUNCTION update_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles
    SET 
        total_volume = total_volume + NEW.total_volume,
        total_workouts = total_workouts + 1,
        last_workout_date = NEW.workout_date,
        current_streak = CASE 
            WHEN last_workout_date = CURRENT_DATE - INTERVAL '1 day' THEN current_streak + 1
            WHEN last_workout_date = CURRENT_DATE THEN current_streak
            ELSE 1
        END,
        longest_streak = GREATEST(longest_streak, 
            CASE 
                WHEN last_workout_date = CURRENT_DATE - INTERVAL '1 day' THEN current_streak + 1
                ELSE current_streak
            END
        )
    WHERE id = NEW.profile_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_workout_insert
    AFTER INSERT ON workouts
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_stats();

-- 14. FUNCTION: Update team member count
CREATE OR REPLACE FUNCTION update_team_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE teams SET member_count = member_count + 1 WHERE id = NEW.team_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE teams SET member_count = member_count - 1 WHERE id = OLD.team_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_team_member_change
    AFTER INSERT OR DELETE ON team_members
    FOR EACH ROW
    EXECUTE FUNCTION update_team_member_count();

-- 15. CREATE INITIAL TEAM FOR PILOT
INSERT INTO teams (team_code, name, description, avatar_emoji, is_public)
VALUES ('MSG-ELITE-2026', 'MSG Elite', 'Main Street Group founding members pilot team', '🔥', true);

-- Done! Your database is ready.
SELECT 'AXIS Fit database schema created successfully!' as status;
