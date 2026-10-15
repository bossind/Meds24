-- Migration 005: Telegram Admins, Notification Logs, Audit Logs, Stock Movements & Custom Medicine Requests

-- Telegram Admins table
CREATE TABLE IF NOT EXISTS telegram_admins (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(100),
    full_name VARCHAR(150),
    role VARCHAR(30) DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'pharmacist')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification Logs table (prevents duplicate order notifications)
CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    chat_id BIGINT NOT NULL,
    status VARCHAR(30) DEFAULT 'Sent' CHECK (status IN ('Sent', 'Failed', 'Retrying')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, chat_id)
);

-- Audit Logs table for sensitive admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    admin_telegram_id BIGINT,
    admin_name VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL, -- 'order', 'product', 'payment', 'prescription'
    target_id INTEGER,
    details TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stock Movements table for audit and history
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    change_quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reason VARCHAR(150) NOT NULL,
    admin_name VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Custom Medicine Requests table
CREATE TABLE IF NOT EXISTS custom_medicine_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    medicine_name VARCHAR(200) NOT NULL,
    quantity VARCHAR(100) NOT NULL,
    notes TEXT,
    status VARCHAR(30) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Quoted', 'Accepted', 'Rejected', 'Fulfilled')),
    quoted_price DECIMAL(10, 2),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Prescription Reviews table
CREATE TABLE IF NOT EXISTS prescription_reviews (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    prescription_url TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    review_notes TEXT,
    reviewed_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
