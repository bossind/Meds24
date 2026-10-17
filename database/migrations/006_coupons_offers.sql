-- Migration 006: Coupons, Automatic Offers, Redemptions & Promotion Rules

-- Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
    max_discount_amount DECIMAL(10, 2),
    min_cart_subtotal DECIMAL(10, 2) DEFAULT 0.00,
    start_date TIMESTAMP WITH TIME ZONE,
    expiry_date TIMESTAMP WITH TIME ZONE,
    total_redemption_limit INTEGER,
    per_customer_limit INTEGER DEFAULT 1,
    eligible_product_ids INTEGER[] DEFAULT '{}',
    eligible_category_ids INTEGER[] DEFAULT '{}',
    customer_eligibility VARCHAR(30) DEFAULT 'all' CHECK (customer_eligibility IN ('all', 'first_order')),
    is_active BOOLEAN DEFAULT true,
    is_archived BOOLEAN DEFAULT false,
    can_combine_with_offers BOOLEAN DEFAULT false,
    can_combine_with_coupons BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for coupon code lookup
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, is_archived);

-- Automatic Offers Table
CREATE TABLE IF NOT EXISTS automatic_offers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
    max_discount_amount DECIMAL(10, 2),
    min_cart_subtotal DECIMAL(10, 2) DEFAULT 0.00,
    start_date TIMESTAMP WITH TIME ZONE,
    expiry_date TIMESTAMP WITH TIME ZONE,
    eligible_product_ids INTEGER[] DEFAULT '{}',
    eligible_category_ids INTEGER[] DEFAULT '{}',
    customer_eligibility VARCHAR(30) DEFAULT 'all' CHECK (customer_eligibility IN ('all', 'first_order')),
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_archived BOOLEAN DEFAULT false,
    allow_stacking_with_coupons BOOLEAN DEFAULT true,
    max_usage_limit INTEGER,
    current_usage_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auto_offers_active ON automatic_offers(is_active, is_archived, priority DESC);

-- Offer Redemptions Table
CREATE TABLE IF NOT EXISTS offer_redemptions (
    id SERIAL PRIMARY KEY,
    coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
    offer_id INTEGER REFERENCES automatic_offers(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    discount_amount DECIMAL(10, 2) NOT NULL CHECK (discount_amount >= 0),
    redemption_type VARCHAR(30) NOT NULL CHECK (redemption_type IN ('coupon', 'automatic_offer', 'first_order_offer')),
    status VARCHAR(30) DEFAULT 'Applied' CHECK (status IN ('Applied', 'Cancelled', 'Refunded')),
    idempotency_key VARCHAR(150) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON offer_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON offer_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_order ON offer_redemptions(order_id);

-- Alter Orders Table to Store Coupon & Discount Breakdown
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_discount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_breakdown JSONB;

-- Global Promotion Settings Defaults
INSERT INTO system_configs (key, value, updated_at) VALUES
('max_discount_per_order', '2000.00', CURRENT_TIMESTAMP),
('allow_coupon_and_automatic_stacking', 'true', CURRENT_TIMESTAMP),
('allow_multiple_coupons', 'false', CURRENT_TIMESTAMP),
('max_coupons_per_order', '1', CURRENT_TIMESTAMP),
('default_min_cart_value', '0.00', CURRENT_TIMESTAMP),
('first_order_offer_enabled', 'true', CURRENT_TIMESTAMP),
('first_order_discount_type', 'percentage', CURRENT_TIMESTAMP),
('first_order_discount_value', '15.00', CURRENT_TIMESTAMP),
('first_order_max_discount', '200.00', CURRENT_TIMESTAMP),
('first_order_min_cart', '200.00', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
