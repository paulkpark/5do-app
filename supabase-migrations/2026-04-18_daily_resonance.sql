-- =============================================================================
-- Daily Resonance Feature — Migration
-- Run in Supabase SQL Editor (new query tab)
-- =============================================================================

-- 1. soul_blueprints: cached Soul Code analysis result per user
CREATE TABLE IF NOT EXISTS public.soul_blueprints (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Raw inputs
  birth_year INT NOT NULL,
  birth_month INT NOT NULL,
  birth_day INT NOT NULL,
  birth_time TEXT,                      -- "HH:MM" or null
  birth_place TEXT,
  calendar_type TEXT DEFAULT 'solar',   -- 'solar' | 'lunar'
  name TEXT,
  gender TEXT,
  blood_type TEXT,
  mbti TEXT,
  intention TEXT,
  -- Computed blueprint (JSONB to avoid rigid schema)
  zodiac JSONB,                         -- {index, name:{ko,en}, symbol, element, ...}
  life_path INT,
  saju JSONB,                           -- {pillars, counts, dayMasterElement, deficient, excess, hasHour}
  starseed JSONB,                       -- [{id, name, confidence, colors, ...}] top 3
  personal_freq REAL,
  active_chakras TEXT[],
  -- Original AI analysis text
  ai_text_ko TEXT,
  ai_text_en TEXT,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.soul_blueprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own blueprint" ON public.soul_blueprints;
CREATE POLICY "Users read own blueprint" ON public.soul_blueprints
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own blueprint" ON public.soul_blueprints;
CREATE POLICY "Users insert own blueprint" ON public.soul_blueprints
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own blueprint" ON public.soul_blueprints;
CREATE POLICY "Users update own blueprint" ON public.soul_blueprints
  FOR UPDATE USING (auth.uid() = user_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS soul_blueprints_updated_at ON public.soul_blueprints;
CREATE TRIGGER soul_blueprints_updated_at
  BEFORE UPDATE ON public.soul_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- 2. daily_guides: per-user per-day resonance guidance
CREATE TABLE IF NOT EXISTS public.daily_guides (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  guide_date DATE NOT NULL,             -- KST date
  -- AI-generated guidance
  ai_guide JSONB,                       -- {morning:{ko/en}, afternoon, evening, mantra}
  ai_lang TEXT DEFAULT 'ko',            -- language of AI output
  ai_regen_count INT DEFAULT 0,         -- regeneration count (max 3/day)
  -- Deterministic calculations (cached)
  biorhythm JSONB,                      -- {physical, emotional, intellectual}
  frequency_match JSONB,                -- {primary:{folder,file,reason}, alternatives:[...]}
  visual_match JSONB,                   -- {pattern, palette, persona, reason}
  cosmic_snapshot JSONB,                -- snapshot of cosmic state used
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, guide_date)
);

ALTER TABLE public.daily_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own guides" ON public.daily_guides;
CREATE POLICY "Users read own guides" ON public.daily_guides
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own guides" ON public.daily_guides;
CREATE POLICY "Users insert own guides" ON public.daily_guides
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own guides" ON public.daily_guides;
CREATE POLICY "Users update own guides" ON public.daily_guides
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_guides_user_date
  ON public.daily_guides(user_id, guide_date DESC);

DROP TRIGGER IF EXISTS daily_guides_updated_at ON public.daily_guides;
CREATE TRIGGER daily_guides_updated_at
  BEFORE UPDATE ON public.daily_guides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
