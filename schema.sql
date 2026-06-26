-- ==========================================
-- GolfGives Database Schema (PostgreSQL)
-- ==========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'subscriber' CHECK (role IN ('subscriber', 'admin')),
    subscription_status VARCHAR(50) DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'cancelled', 'lapsed')),
    subscription_plan VARCHAR(50) CHECK (subscription_plan IN ('monthly', 'yearly', null)),
    subscription_renewal_date TIMESTAMPTZ,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    charity_id UUID, -- Foreign key added later
    charity_percentage INT DEFAULT 10 CHECK (charity_percentage >= 10 AND charity_percentage <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CHARITIES TABLE
CREATE TABLE charities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(255),
    is_featured BOOLEAN DEFAULT FALSE,
    events JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to users now that charities exists
ALTER TABLE users ADD CONSTRAINT fk_user_charity FOREIGN KEY (charity_id) REFERENCES charities(id) ON DELETE SET NULL;

-- 3. SCORES TABLE
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INT NOT NULL CHECK (score >= 1 AND score <= 45),
    entry_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRITICAL: Prevent duplicate score dates for the same user
CREATE UNIQUE INDEX scores_user_date_idx ON scores(user_id, entry_date);

-- 4. DRAWS TABLE
CREATE TABLE draws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draw_month VARCHAR(50) NOT NULL UNIQUE, -- e.g., '2024-08'
    draw_type VARCHAR(50) NOT NULL CHECK (draw_type IN ('random', 'algorithmic')),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'simulated', 'published')),
    drawn_numbers INT[] DEFAULT '{}',
    jackpot_rollover INT DEFAULT 0, -- Stored in pence
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PRIZE POOLS TABLE
CREATE TABLE prize_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    total_pool INT NOT NULL, -- Pence
    five_match_pool INT NOT NULL,
    four_match_pool INT NOT NULL,
    three_match_pool INT NOT NULL,
    jackpot_rollover INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. DRAW RESULTS TABLE
CREATE TABLE draw_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_type VARCHAR(50) NOT NULL CHECK (match_type IN ('five_match', 'four_match', 'three_match')),
    prize_amount INT NOT NULL, -- Pence
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
    proof_url VARCHAR(500),
    verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DONATIONS TABLE
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Nullable for guest donations
    charity_id UUID NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
    amount INT NOT NULL, -- Pence
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Functions
CREATE OR REPLACE FUNCTION get_monthly_subscriber_growth()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    WITH monthly_counts AS (
        SELECT 
            date_trunc('month', created_at) AS month,
            count(*) as new_subscribers
        FROM users 
        WHERE subscription_status = 'active'
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 6
    )
    SELECT jsonb_agg(jsonb_build_object('month', month, 'count', new_subscribers))
    INTO result
    FROM monthly_counts;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;
