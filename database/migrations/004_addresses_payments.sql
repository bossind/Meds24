-- Migration 004: Delivery Addresses, Payment Settings, Payment Records & Proofs

-- Customer Addresses table
CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    house_no VARCHAR(50) NOT NULL,
    street TEXT NOT NULL,
    landmark VARCHAR(150),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    address_type VARCHAR(20) DEFAULT 'Home' CHECK (address_type IN ('Home', 'Work', 'Other')),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin Configurable Payment Methods table
CREATE TABLE IF NOT EXISTS payment_settings (
    id SERIAL PRIMARY KEY,
    method_code VARCHAR(50) UNIQUE NOT NULL, -- 'cod', 'full_upi', 'advance_upi'
    method_name VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    min_order_amount DECIMAL(10, 2) DEFAULT 0.00,
    max_order_amount DECIMAL(10, 2) DEFAULT 50000.00,
    fee DECIMAL(10, 2) DEFAULT 0.00,
    discount_percent DECIMAL(5, 2) DEFAULT 0.00,
    advance_percent DECIMAL(5, 2) DEFAULT 30.00, -- used for advance_upi
    merchant_upi_id VARCHAR(150) DEFAULT 'merchant@upi',
    merchant_name VARCHAR(150) DEFAULT 'Meds24 Healthcare',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed default payment settings
INSERT INTO payment_settings (method_code, method_name, is_enabled, min_order_amount, max_order_amount, fee, discount_percent, advance_percent, merchant_upi_id, merchant_name) VALUES
('cod', 'Cash on Delivery (COD)', true, 0.00, 10000.00, 0.00, 0.00, 0.00, 'merchant@upi', 'Meds24 Healthcare'),
('full_upi', 'Full UPI Payment', true, 0.00, 100000.00, 0.00, 5.00, 100.00, 'meds24.pay@upi', 'Meds24 Healthcare'),
('advance_upi', 'Advance UPI Payment (30% + COD)', true, 200.00, 50000.00, 0.00, 2.00, 30.00, 'meds24.pay@upi', 'Meds24 Healthcare')
ON CONFLICT (method_code) DO UPDATE SET is_enabled = true;

-- Update orders table to include detailed pricing breakdown and payment status
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_snapshot TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mrp_total DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_total DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) DEFAULT 'Awaiting Payment' CHECK (payment_status IN ('Awaiting Payment', 'Proof Submitted', 'Verification Pending', 'Approved', 'Rejected', 'Expired', 'Refund Pending', 'Refunded'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Payment Proofs table
CREATE TABLE IF NOT EXISTS payment_proofs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    utr VARCHAR(100) UNIQUE NOT NULL,
    screenshot_url TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'Verification Pending' CHECK (status IN ('Verification Pending', 'Approved', 'Rejected')),
    rejection_reason TEXT,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment Records table
CREATE TABLE IF NOT EXISTS payment_records (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    method VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(30) NOT NULL,
    utr VARCHAR(100),
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
