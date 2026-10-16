import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, checkDatabaseConnection } from './backend/db.js';
import { notifyAdminsNewOrder, notifyAdminOrderEvent } from './backend/bot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many authentication attempts from this IP, please try again after 15 minutes.' }
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many accounts created from this IP, please try again later.' }
});

// Initialize database tables on startup if they don't exist
async function initDatabase() {
  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    console.warn('Note: PostgreSQL database not connected (ECONNREFUSED). Running without database persistence. Configure DATABASE_URL if persistence is required.');
    return;
  }
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf8');
    await pool.query(schemaSql);
    console.log('Database schema initialized.');

    const catCheck = await pool.query('SELECT COUNT(*) FROM categories');
    if (parseInt(catCheck.rows[0].count) === 0) {
      const migrationSql = fs.readFileSync(path.join(__dirname, 'database/migrations/001_initial.sql'), 'utf8');
      await pool.query(migrationSql);
      console.log('Database seeded with initial categories and products.');
    }

    const payCheck = await pool.query('SELECT COUNT(*) FROM payment_settings');
    if (parseInt(payCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO payment_settings (method_code, method_name, is_enabled, min_order_amount, max_order_amount, fee, discount_percent, advance_percent, merchant_upi_id, merchant_name) VALUES
        ('cod', 'Cash on Delivery (COD)', true, 0.00, 10000.00, 0.00, 0.00, 0.00, 'merchant@upi', 'Meds24 Healthcare'),
        ('full_upi', 'Full UPI Payment', true, 0.00, 100000.00, 0.00, 5.00, 100.00, 'meds24.pay@upi', 'Meds24 Healthcare'),
        ('advance_upi', 'Advance UPI Payment (30% + COD)', true, 200.00, 50000.00, 0.00, 2.00, 30.00, 'meds24.pay@upi', 'Meds24 Healthcare')
        ON CONFLICT (method_code) DO NOTHING;
      `);
    }
  } catch (err: any) {
    console.warn('Note: PostgreSQL database initialization warning:', err.message);
  }
}

initDatabase();

// Helper: Generate unique referral code
function generateReferralCode(name: string): string {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MEDS-${cleanName || 'USER'}-${randomSuffix}`;
}

// Helper: Validate Indian mobile number
function isValidIndianMobile(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(cleanPhone);
}

// Helper: Validate Indian PIN code
function isValidPincode(pincode: string): boolean {
  return /^\d{6}$/.test(pincode.trim());
}

// Helper: Validate password strength
function validatePasswordStrength(pass: string): string | null {
  if (!pass || pass.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(pass)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(pass)) return 'Password must contain at least one lowercase letter.';
  if (!/\d/.test(pass)) return 'Password must contain at least one number.';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return 'Password must contain at least one special character.';
  return null;
}

// Helper: Create session for user
async function createUserSession(userId: number, res: express.Response): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [sessionId, userId, expiresAt]);

  res.cookie('meds24_session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt
  });

  return sessionId;
}

// Auth Middleware
async function requireAuth(req: any, res: any, next: any) {
  try {
    const sessionId = req.cookies?.meds24_session;
    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized: No session provided' });
    }

    const sessionRes = await pool.query('SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()', [sessionId]);
    if (sessionRes.rows.length === 0) {
      res.clearCookie('meds24_session');
      return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
    }

    const session = sessionRes.rows[0];
    const userRes = await pool.query('SELECT id, name, email, phone, role, is_verified, referral_code, created_at FROM users WHERE id = $1', [session.user_id]);
    
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = userRes.rows[0];
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Admin Authorization Middleware (Telegram WebApp initData or admin session)
async function requireAdmin(req: any, res: any, next: any) {
  try {
    const initData = req.headers['x-telegram-init-data'];
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminIdsEnv = process.env.TELEGRAM_ADMIN_IDS ? process.env.TELEGRAM_ADMIN_IDS.split(',').map(id => id.trim()) : [];

    if (initData && botToken) {
      // Validate Telegram initData HMAC signature
      const urlParams = new URLSearchParams(initData as string);
      const hash = urlParams.get('hash');
      urlParams.delete('hash');
      const paramsList: string[] = [];
      urlParams.sort();
      urlParams.forEach((val, key) => paramsList.push(`${key}=${val}`));
      const dataCheckString = paramsList.join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash === hash) {
        const userStr = urlParams.get('user');
        if (userStr) {
          const userObj = JSON.parse(userStr);
          const telegramId = String(userObj.id);

          // Check if authorized admin
          if (adminIdsEnv.includes(telegramId)) {
            req.admin = { id: telegramId, name: userObj.first_name || 'Admin' };
            return next();
          }

          const dbAdmin = await pool.query('SELECT * FROM telegram_admins WHERE telegram_id = $1 AND is_active = true', [telegramId]);
          if (dbAdmin.rows.length > 0) {
            req.admin = { id: telegramId, name: dbAdmin.rows[0].full_name || userObj.first_name };
            return next();
          }
        }
      }
    }

    // Fallback for development testing or session-based admin
    if (process.env.NODE_ENV !== 'production' || adminIdsEnv.length === 0) {
      req.admin = { id: 'dev_admin', name: 'Development Admin' };
      return next();
    }

    return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Audit logging helper
async function logAudit(adminId: string, adminName: string, action: string, targetType: string, targetId: number | null, details: string) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (admin_telegram_id, admin_name, action, target_type, target_id, details, success)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [adminId === 'dev_admin' ? 0 : parseInt(adminId), adminName, action, targetType, targetId, details]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ==================== AUTH API ENDPOINTS ====================

app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword, referralCode } = req.body;

    if (!name || !phone || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (!isValidIndianMobile(phone)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const passError = validatePasswordStrength(password);
    if (passError) {
      return res.status(400).json({ error: passError });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

    const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR phone = $2', [normalizedEmail, normalizedPhone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email or mobile number already exists.' });
    }

    let referredById: number | null = null;
    if (referralCode) {
      const refRes = await pool.query('SELECT id FROM users WHERE referral_code = $1', [referralCode.trim().toUpperCase()]);
      if (refRes.rows.length > 0) {
        referredById = refRes.rows[0].id;
      }
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    const newReferralCode = generateReferralCode(name);
    const verificationToken = crypto.randomBytes(20).toString('hex');

    const insertRes = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, is_verified, verification_token, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, 'customer', false, $5, $6, $7)
       RETURNING id, name, email, phone, role, is_verified, referral_code, created_at`,
      [name.trim(), normalizedEmail, normalizedPhone, passwordHash, verificationToken, newReferralCode, referredById]
    );

    const newUser = insertRes.rows[0];
    await createUserSession(newUser.id, res);

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: newUser
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please enter your login identifier and password.' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const isPhoneQuery = /^\d+$/.test(cleanIdentifier);

    let query = 'SELECT * FROM users WHERE ';
    let param = cleanIdentifier;

    if (isPhoneQuery) {
      const cleanPhone = cleanIdentifier.replace(/\D/g, '').slice(-10);
      query += 'phone = $1';
      param = cleanPhone;
    } else {
      query += 'email = $1';
    }

    const userRes = await pool.query(query, [param]);
    const invalidCredsError = { error: 'Invalid mobile number/email or password.' };

    if (userRes.rows.length === 0) {
      return res.status(401).json(invalidCredsError);
    }

    const user = userRes.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json(invalidCredsError);
    }

    await createUserSession(user.id, res);

    res.json({
      success: true,
      message: 'Logged in successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        is_verified: user.is_verified,
        referral_code: user.referral_code,
        created_at: user.created_at
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req: any, res: any) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', requireAuth, async (req: any, res: any) => {
  try {
    const sessionId = req.cookies?.meds24_session;
    if (sessionId) {
      await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    }
    res.clearCookie('meds24_session');
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/referral/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) return res.status(400).json({ valid: false });

    const refRes = await pool.query('SELECT name FROM users WHERE referral_code = $1', [code.trim().toUpperCase()]);
    if (refRes.rows.length > 0) {
      res.json({ valid: true, referrerName: refRes.rows[0].name });
    } else {
      res.json({ valid: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PHASE 5: TELEGRAM ADMIN API ENDPOINTS ====================

// Admin Dashboard Stats
app.get('/api/admin/dashboard', requireAdminAuth, async (req: any, res: any) => {
  try {
    const totalOrdersRes = await pool.query('SELECT COUNT(*) FROM orders');
    const newOrdersRes = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'Pending'");
    const pendingOrdersRes = await pool.query("SELECT COUNT(*) FROM orders WHERE status IN ('Pending Confirmation', 'Preparing', 'Ready for Dispatch')");
    const processingOrdersRes = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'Confirmed'");
    const deliveredOrdersRes = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'Delivered'");
    const pendingPaymentsRes = await pool.query("SELECT COUNT(*) FROM orders WHERE payment_status IN ('Proof Submitted', 'Verification Pending')");
    const verifiedPaymentsRes = await pool.query("SELECT COUNT(*) FROM orders WHERE payment_status = 'Approved'");
    const todaySalesRes = await pool.query("SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE created_at >= CURRENT_DATE");
    const lowStockRes = await pool.query("SELECT COUNT(*) FROM products WHERE stock < 10 AND is_active = true");

    res.json({
      totalOrders: parseInt(totalOrdersRes.rows[0].count),
      newOrders: parseInt(newOrdersRes.rows[0].count),
      pendingOrders: parseInt(pendingOrdersRes.rows[0].count),
      processingOrders: parseInt(processingOrdersRes.rows[0].count),
      deliveredOrders: parseInt(deliveredOrdersRes.rows[0].count),
      pendingPayments: parseInt(pendingPaymentsRes.rows[0].count),
      verifiedPayments: parseInt(verifiedPaymentsRes.rows[0].count),
      todaysSales: parseFloat(todaySalesRes.rows[0].coalesce),
      lowStockProducts: parseInt(lowStockRes.rows[0].count)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Orders Management
app.get('/api/admin/orders', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params: any[] = [];

    if (status && status !== 'all') {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (customer_name ILIKE $${params.length} OR customer_phone ILIKE $${params.length} OR id::TEXT ILIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders/:id', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    
    const itemsRes = await pool.query('SELECT oi.*, p.name, p.image_url FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1', [id]);
    const proofsRes = await pool.query('SELECT * FROM payment_proofs WHERE order_id = $1', [id]);

    res.json({
      order: orderRes.rows[0],
      items: itemsRes.rows,
      proofs: proofsRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/orders/:id/status', requireAdminAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { status, paymentStatus, adminNotes, reason } = req.body;

    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (orderRes.rows.length === 0) throw new Error('Order not found.');
    const order = orderRes.rows[0];

    const prevStatus = order.status;
    const newStatus = status || prevStatus;
    const newPaymentStatus = paymentStatus || order.payment_status;

    if (['Cancelled', 'Rejected'].includes(newStatus) && !['Cancelled', 'Rejected'].includes(prevStatus)) {
      const itemsRes = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [id]);
      for (const item of itemsRes.rows) {
        if (item.product_id) {
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
          await client.query(
            `INSERT INTO stock_movements (product_id, change_quantity, previous_stock, new_stock, reason, admin_name)
             SELECT $1, $2, stock - $2, stock, $3, $4 FROM products WHERE id = $1`,
            [item.product_id, item.quantity, `Order #${id} ${newStatus}`, req.admin.name]
          );
        }
      }
    }

    let query = 'UPDATE orders SET updated_at = CURRENT_TIMESTAMP';
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += `, status = $${params.length}`;
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      query += `, payment_status = $${params.length}`;
    }
    if (adminNotes !== undefined) {
      params.push(adminNotes);
      query += `, admin_notes = $${params.length}`;
    }

    params.push(id);
    query += ` WHERE id = $${params.length} RETURNING *`;

    const result = await client.query(query, params);
    const updatedOrder = result.rows[0];

    if (newStatus !== prevStatus) {
      await client.query(
        `INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, reason) VALUES ($1, $2, $3, $4, $5)`,
        [id, prevStatus, newStatus, req.admin.name, reason || adminNotes || 'Admin status update']
      );
    }

    await client.query('COMMIT');
    await logAudit(req.admin.id, req.admin.name, 'UPDATE_ORDER_STATUS', 'order', parseInt(id), `Status: ${newStatus}, PaymentStatus: ${newPaymentStatus}`);

    notifyAdminOrderEvent(parseInt(id), `Status Updated to ${newStatus}`, `Changed by Admin ${req.admin.name}. Notes: ${adminNotes || reason || 'N/A'}`);

    res.json({ success: true, order: updatedOrder });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Admin Pending Payments Verification
app.get('/api/admin/payments/pending', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT pp.*, o.total_amount, o.amount_paid, o.payment_method, o.customer_name, o.customer_phone
      FROM payment_proofs pp
      JOIN orders o ON pp.order_id = o.id
      WHERE pp.status = 'Verification Pending'
      ORDER BY pp.created_at ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Approve Payment Proof (Transaction-based)
app.post('/api/admin/payments/:id/approve', requireAdminAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const proofRes = await client.query('SELECT * FROM payment_proofs WHERE id = $1 FOR UPDATE', [id]);
    if (proofRes.rows.length === 0) throw new Error('Payment proof not found.');
    const proof = proofRes.rows[0];

    if (proof.status !== 'Verification Pending') throw new Error('Proof already processed.');

    // Check UTR duplicate verification
    const utrCheck = await client.query('SELECT id FROM payment_records WHERE utr = $1 AND status = ' + client.escapeLiteral('Approved'), [proof.utr]);
    // (or check records)

    await client.query("UPDATE payment_proofs SET status = 'Approved', approved_by = $1 WHERE id = $2", [0, id]);
    await client.query("UPDATE orders SET payment_status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [proof.order_id]);

    await client.query(
      `INSERT INTO payment_records (order_id, method, amount, status, utr)
       SELECT o.id, o.payment_method, o.total_amount, 'Approved', $1
       FROM orders o WHERE o.id = $2`,
      [proof.utr, proof.order_id]
    );

    await client.query('COMMIT');
    await logAudit(req.admin.id, req.admin.name, 'APPROVE_PAYMENT', 'payment', parseInt(id), `Approved UTR ${proof.utr} for order #${proof.order_id}`);

    res.json({ success: true, message: 'Payment approved successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Reject Payment Proof
app.post('/api/admin/payments/:id/reject', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const proofRes = await pool.query('SELECT * FROM payment_proofs WHERE id = $1', [id]);
    if (proofRes.rows.length === 0) return res.status(404).json({ error: 'Proof not found' });
    const proof = proofRes.rows[0];

    await pool.query("UPDATE payment_proofs SET status = 'Rejected', rejection_reason = $1 WHERE id = $2", [reason || 'Invalid UTR or screenshot', id]);
    await pool.query("UPDATE orders SET payment_status = 'Rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [proof.order_id]);

    await logAudit(req.admin.id, req.admin.name, 'REJECT_PAYMENT', 'payment', parseInt(id), `Rejected UTR ${proof.utr}: ${reason}`);

    res.json({ success: true, message: 'Payment rejected.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Product & Stock Management
app.get('/api/admin/products', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.id ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/products', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { categoryId, name, brand, description, manufacturer, composition, storageInstructions, mrp, price, imageUrl, requiresPrescription, stock, unit, isActive } = req.body;
    
    if (!name || !brand || !mrp || !price) {
      return res.status(400).json({ error: 'Name, brand, MRP, and selling price are required.' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + crypto.randomBytes(2).toString('hex');
    const discountPercent = Math.max(0, Math.round(((parseFloat(mrp) - parseFloat(price)) / parseFloat(mrp)) * 100));

    const result = await pool.query(
      `INSERT INTO products (category_id, name, slug, brand, description, manufacturer, composition, storage_instructions, mrp, price, discount_percent, image_url, requires_prescription, stock, unit, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [categoryId || null, name.trim(), slug, brand.trim(), description || '', manufacturer || '', composition || '', storageInstructions || '', mrp, price, discountPercent, imageUrl || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600', requiresPrescription || false, stock || 100, unit || '1 Strip', isActive !== false]
    );

    await logAudit(req.admin.id, req.admin.name, 'CREATE_PRODUCT', 'product', result.rows[0].id, `Created product ${name}`);
    res.status(201).json({ success: true, product: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { categoryId, name, brand, description, manufacturer, composition, storageInstructions, mrp, price, imageUrl, requiresPrescription, unit, isActive } = req.body;

    const discountPercent = Math.max(0, Math.round(((parseFloat(mrp) - parseFloat(price)) / parseFloat(mrp)) * 100));

    const result = await pool.query(
      `UPDATE products SET category_id = $1, name = $2, brand = $3, description = $4, manufacturer = $5, composition = $6, storage_instructions = $7, mrp = $8, price = $9, discount_percent = $10, image_url = $11, requires_prescription = $12, unit = $13, is_active = $14
       WHERE id = $15 RETURNING *`,
      [categoryId || null, name, brand, description, manufacturer, composition, storageInstructions, mrp, price, discountPercent, imageUrl, requiresPrescription, unit, isActive, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    await logAudit(req.admin.id, req.admin.name, 'UPDATE_PRODUCT', 'product', parseInt(id), `Updated product ${name}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stock Adjustment
app.post('/api/admin/products/:id/stock', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { stockAdjustment, reason } = req.body; // e.g. +50 or -10

    const prodRes = await pool.query('SELECT stock, name FROM products WHERE id = $1', [id]);
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    const prevStock = prodRes.rows[0].stock;
    const newStock = Math.max(0, prevStock + parseInt(stockAdjustment));

    await pool.query('UPDATE products SET stock = $1 WHERE id = $2', [newStock, id]);
    await pool.query(
      `INSERT INTO stock_movements (product_id, change_quantity, previous_stock, new_stock, reason, admin_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, parseInt(stockAdjustment), prevStock, newStock, reason || 'Admin Manual Adjustment', req.admin.name]
    );

    await logAudit(req.admin.id, req.admin.name, 'ADJUST_STOCK', 'product', parseInt(id), `Changed stock by ${stockAdjustment} (${prevStock} -> ${newStock}): ${reason}`);

    res.json({ success: true, previousStock: prevStock, newStock });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stock-movements', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT sm.*, p.name as product_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      ORDER BY sm.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Prescriptions & Custom Requests
app.get('/api/admin/prescriptions', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT o.id as order_id, o.customer_name, o.prescription_url, o.created_at, o.status
      FROM orders o
      WHERE o.prescription_url IS NOT NULL
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PHASE 4: DELIVERY ADDRESS & PAYMENT APIS ====================

app.get('/api/addresses', requireAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, id DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/addresses', requireAuth, async (req: any, res: any) => {
  try {
    const { name, phone, houseNo, street, landmark, city, state, pincode, addressType, isDefault } = req.body;
    if (!name || !phone || !houseNo || !street || !city || !state || !pincode) {
      return res.status(400).json({ error: 'All required address fields must be filled.' });
    }
    if (!isValidIndianMobile(phone)) return res.status(400).json({ error: 'Invalid Indian mobile number.' });
    if (!isValidPincode(pincode)) return res.status(400).json({ error: 'Invalid Indian PIN code.' });

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (isDefault) {
      await pool.query('UPDATE customer_addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
    }

    const countRes = await pool.query('SELECT COUNT(*) FROM customer_addresses WHERE user_id = $1', [req.user.id]);
    const makeDefault = isDefault || parseInt(countRes.rows[0].count) === 0;

    const insertRes = await pool.query(
      `INSERT INTO customer_addresses (user_id, name, phone, house_no, street, landmark, city, state, pincode, address_type, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user.id, name.trim(), cleanPhone, houseNo.trim(), street.trim(), landmark ? landmark.trim() : null, city.trim(), state.trim(), pincode.trim(), addressType || 'Home', makeDefault]
    );

    res.status(201).json({ success: true, address: insertRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/addresses/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true, message: 'Address deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/addresses/default/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE customer_addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
    await pool.query('UPDATE customer_addresses SET is_default = true WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true, message: 'Default address updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payment-settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payment_settings WHERE is_enabled = true');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/payment-settings', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query('SELECT * FROM payment_settings ORDER BY id ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/payment-settings', requireAdminAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { methods } = req.body;
    if (!Array.isArray(methods)) {
      throw new Error('Invalid payment settings payload.');
    }

    for (const m of methods) {
      if (!m.method_code || !m.method_name) continue;
      if (m.method_code.includes('upi') && m.merchant_upi_id && !m.merchant_upi_id.includes('@')) {
        throw new Error(`Invalid UPI VPA ID format for ${m.method_name}: ${m.merchant_upi_id}`);
      }

      await client.query(
        `UPDATE payment_settings 
         SET method_name = $1, is_enabled = $2, min_order_amount = $3, max_order_amount = $4, fee = $5, discount_percent = $6, advance_percent = $7, merchant_upi_id = $8, merchant_name = $9, updated_at = CURRENT_TIMESTAMP
         WHERE method_code = $10`,
        [
          m.method_name,
          Boolean(m.is_enabled),
          parseFloat(m.min_order_amount || 0),
          parseFloat(m.max_order_amount || 50000),
          parseFloat(m.fee || 0),
          parseFloat(m.discount_percent || 0),
          parseFloat(m.advance_percent || 30),
          m.merchant_upi_id || 'meds24.pay@upi',
          m.merchant_name || 'Meds24 Healthcare',
          m.method_code
        ]
      );
    }

    await client.query('COMMIT');
    await logAudit(req.admin.id, req.admin.name, 'UPDATE_PAYMENT_SETTINGS', 'payment_settings', null, 'Updated configurable payment methods and UPI credentials');

    res.json({ success: true, message: 'Payment settings updated successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});


// ==================== PHASE 3: CATALOGUE & CHECKOUT APIS ====================

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE is_active = true ORDER BY id ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, inStock, discountMin, sortBy } = req.query;
    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = true';
    const params: any[] = [];

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND c.slug = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.manufacturer ILIKE $${params.length})`;
    }

    if (minPrice) {
      params.push(parseFloat(minPrice as string));
      query += ` AND p.price >= $${params.length}`;
    }

    if (maxPrice) {
      params.push(parseFloat(maxPrice as string));
      query += ` AND p.price <= $${params.length}`;
    }

    if (inStock === 'true') {
      query += ' AND p.stock > 0';
    }

    if (discountMin) {
      params.push(parseInt(discountMin as string));
      query += ` AND p.discount_percent >= $${params.length}`;
    }

    if (sortBy === 'price_asc') {
      query += ' ORDER BY p.price ASC';
    } else if (sortBy === 'price_desc') {
      query += ' ORDER BY p.price DESC';
    } else if (sortBy === 'newest') {
      query += ' ORDER BY p.created_at DESC';
    } else {
      query += ' ORDER BY p.id ASC';
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prodRes = await pool.query(
      'SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1 AND p.is_active = true',
      [id]
    );

    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or inactive' });
    }

    const product = prodRes.rows[0];
    const relatedRes = await pool.query(
      'SELECT * FROM products WHERE category_id = $1 AND id != $2 AND is_active = true LIMIT 4',
      [product.category_id, product.id]
    );

    res.json({ product, relatedProducts: relatedRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cart', requireAuth, async (req: any, res: any) => {
  try {
    let cartRes = await pool.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    let cartId: number;

    if (cartRes.rows.length === 0) {
      const newCart = await pool.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [req.user.id]);
      cartId = newCart.rows[0].id;
    } else {
      cartId = cartRes.rows[0].id;
    }

    const itemsRes = await pool.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.brand, p.price, p.mrp, p.discount_percent, p.image_url, p.stock, p.unit, p.requires_prescription
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1 AND p.is_active = true`,
      [cartId]
    );

    res.json({ cartId, items: itemsRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cart', requireAuth, async (req: any, res: any) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || quantity === undefined) {
      return res.status(400).json({ error: 'Product ID and quantity required' });
    }

    const prodRes = await pool.query('SELECT id, stock, is_active FROM products WHERE id = $1', [productId]);
    if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) {
      return res.status(404).json({ error: 'Product not found or inactive' });
    }

    const product = prodRes.rows[0];
    if (quantity > product.stock) {
      return res.status(400).json({ error: `Requested quantity exceeds available stock (${product.stock} available).` });
    }

    let cartRes = await pool.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    let cartId: number;

    if (cartRes.rows.length === 0) {
      const newCart = await pool.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [req.user.id]);
      cartId = newCart.rows[0].id;
    } else {
      cartId = cartRes.rows[0].id;
    }

    if (quantity <= 0) {
      await pool.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, productId]);
    } else {
      await pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (cart_id, product_id)
         DO UPDATE SET quantity = $3, updated_at = CURRENT_TIMESTAMP`,
        [cartId, productId, quantity]
      );
    }

    res.json({ success: true, message: 'Cart updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart/:productId', requireAuth, async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const cartRes = await pool.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    if (cartRes.rows.length > 0) {
      await pool.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartRes.rows[0].id, productId]);
    }
    res.json({ success: true, message: 'Item removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart', requireAuth, async (req: any, res: any) => {
  try {
    const cartRes = await pool.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    if (cartRes.rows.length > 0) {
      await pool.query('DELETE FROM cart_items WHERE cart_id = $1', [cartRes.rows[0].id]);
    }
    res.json({ success: true, message: 'Cart cleared' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', requireAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { addressId, paymentMethodCode, prescriptionUrl, items } = req.body;

    if (!addressId || !paymentMethodCode || !items || items.length === 0) {
      return res.status(400).json({ error: 'Delivery address, payment method, and items are required.' });
    }

    const addrRes = await client.query('SELECT * FROM customer_addresses WHERE id = $1 AND user_id = $2', [addressId, req.user.id]);
    if (addrRes.rows.length === 0) return res.status(400).json({ error: 'Invalid delivery address selected.' });
    const address = addrRes.rows[0];
    const addressSnapshot = `${address.name}, ${address.phone}, House No: ${address.house_no}, ${address.street}, ${address.landmark ? 'Landmark: ' + address.landmark + ', ' : ''}${address.city}, ${address.state} - ${address.pincode} [${address.address_type}]`;

    const paySetRes = await client.query('SELECT * FROM payment_settings WHERE method_code = $1 AND is_enabled = true', [paymentMethodCode]);
    if (paySetRes.rows.length === 0) return res.status(400).json({ error: 'Selected payment method is currently disabled or invalid.' });
    const paySetting = paySetRes.rows[0];

    let mrpTotal = 0;
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const prodRes = await client.query('SELECT id, name, mrp, price, stock, is_active FROM products WHERE id = $1 FOR UPDATE', [item.productId]);
      if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) throw new Error(`Product ID ${item.productId} is not available.`);
      const product = prodRes.rows[0];
      if (item.quantity > product.stock) throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);

      const itemMrp = parseFloat(product.mrp);
      const itemPrice = parseFloat(product.price);

      mrpTotal += itemMrp * item.quantity;
      subtotal += itemPrice * item.quantity;

      validatedItems.push({ productId: product.id, quantity: item.quantity, unitPrice: itemPrice });

      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, product.id]);
    }

    const discountTotal = mrpTotal - subtotal;
    const deliveryFee = subtotal > 500 ? 0 : 49;
    let methodDiscount = (subtotal * parseFloat(paySetting.discount_percent)) / 100;
    let finalAmount = subtotal + deliveryFee - methodDiscount + parseFloat(paySetting.fee);

    if (finalAmount < parseFloat(paySetting.min_order_amount) || finalAmount > parseFloat(paySetting.max_order_amount)) {
      throw new Error(`Order amount ₹${finalAmount.toFixed(2)} is not eligible for ${paySetting.method_name}.`);
    }

    let amountPaid = 0;
    let remainingBalance = finalAmount;
    if (paymentMethodCode === 'advance_upi') {
      const advancePct = parseFloat(paySetting.advance_percent);
      amountPaid = (finalAmount * advancePct) / 100;
      remainingBalance = finalAmount - amountPaid;
    } else if (paymentMethodCode === 'full_upi') {
      amountPaid = finalAmount;
      remainingBalance = 0;
    } else {
      amountPaid = 0;
      remainingBalance = finalAmount;
    }

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, customer_name, customer_email, customer_phone, shipping_address, address_snapshot, mrp_total, subtotal, discount_total, delivery_fee, total_amount, payment_method, payment_status, amount_paid, remaining_balance, status, prescription_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Awaiting Payment', $13, $14, 'Pending Confirmation', $15) RETURNING id`,
      [req.user.id, address.name, req.user.email, address.phone, addressSnapshot, addressSnapshot, mrpTotal, subtotal, discountTotal, deliveryFee, finalAmount, paySetting.method_name, amountPaid, remainingBalance, prescriptionUrl || null]
    );

    const orderId = orderRes.rows[0].id;

    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
        [orderId, item.productId, item.quantity, item.unitPrice]
      );
    }

    const cartRes = await client.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    if (cartRes.rows.length > 0) {
      await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartRes.rows[0].id]);
    }

    await client.query('COMMIT');

    let upiUri = '';
    if (paymentMethodCode === 'full_upi' || paymentMethodCode === 'advance_upi') {
      const payAmount = paymentMethodCode === 'advance_upi' ? amountPaid : finalAmount;
      upiUri = `upi://pay?pa=${encodeURIComponent(paySetting.merchant_upi_id)}&pn=${encodeURIComponent(paySetting.merchant_name)}&am=${payAmount.toFixed(2)}&tr=MEDSORD${orderId}&cu=INR&tn=${encodeURIComponent('Meds24 Order #' + orderId)}`;
    }

    notifyAdminsNewOrder(orderId, address.name, finalAmount);

    res.status(201).json({
      success: true,
      orderId,
      finalAmount,
      amountPaid,
      remainingBalance,
      paymentMethod: paySetting.method_name,
      merchantUpiId: paySetting.merchant_upi_id,
      merchantName: paySetting.merchant_name,
      upiUri,
      message: 'Order created successfully.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/orders/:id/payment-proof', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { utr, screenshotUrl } = req.body;

    if (!utr || !screenshotUrl) {
      return res.status(400).json({ error: 'UTR transaction reference and payment screenshot URL are required.' });
    }

    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

    const utrCheck = await pool.query('SELECT id FROM payment_proofs WHERE utr = $1', [utr.trim()]);
    if (utrCheck.rows.length > 0) return res.status(400).json({ error: 'This UTR reference has already been submitted for payment verification.' });

    await pool.query(
      `INSERT INTO payment_proofs (order_id, user_id, utr, screenshot_url, status)
       VALUES ($1, $2, $3, $4, 'Verification Pending')`,
      [id, req.user.id, utr.trim(), screenshotUrl.trim()]
    );

    await pool.query("UPDATE orders SET payment_status = 'Proof Submitted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

    res.json({ success: true, message: 'Payment proof submitted successfully for verification.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders', requireAuth, async (req: any, res: any) => {
  try {
    const ordersRes = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(ordersRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const itemsRes = await pool.query('SELECT oi.*, p.name, p.image_url FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1', [id]);
    const proofsRes = await pool.query('SELECT * FROM payment_proofs WHERE order_id = $1', [id]);
    const historyRes = await pool.query('SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC', [id]);
    
    res.json({ order: orderRes.rows[0], items: itemsRes.rows, proofs: proofsRes.rows, history: historyRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/cancel', requireAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { reason } = req.body;

    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, req.user.id]);
    if (orderRes.rows.length === 0) throw new Error('Order not found.');
    const order = orderRes.rows[0];

    if (!['Pending Confirmation', 'Confirmed'].includes(order.status)) {
      throw new Error(`Order cannot be cancelled at stage: ${order.status}`);
    }

    const itemsRes = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [id]);
    for (const item of itemsRes.rows) {
      if (item.product_id) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        await client.query(
          `INSERT INTO stock_movements (product_id, change_quantity, previous_stock, new_stock, reason, admin_name)
           SELECT $1, $2, stock - $2, stock, $3, 'System / Customer' FROM products WHERE id = $1`,
          [item.product_id, item.quantity, `Order #${id} Cancelled by Customer`]
        );
      }
    }

    await client.query("UPDATE orders SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    await client.query(
      `INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, reason) VALUES ($1, $2, 'Cancelled', $3, $4)`,
      [id, order.status, req.user.name, reason || 'Cancelled by customer']
    );

    await client.query('COMMIT');
    notifyAdminOrderEvent(parseInt(id), 'Order Cancelled', `Customer ${req.user.name} cancelled order #${id}. Reason: ${reason || 'None'}`);

    res.json({ success: true, message: 'Order cancelled and stock restored successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      return res.status(503).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: 'PostgreSQL database ECONNREFUSED or unreachable. Configure DATABASE_URL for full functionality.'
      });
    }
    const dbResult = await pool.query('SELECT NOW()');
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), database: 'connected', dbTime: dbResult.rows[0].now });
  } catch (err: any) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// ==================== ADMIN & TELEGRAM CONFIG API ====================

app.post('/api/admin/auth', authLimiter, async (req: any, res: any) => {
  try {
    const { passcode } = req.body;
    if (!passcode || typeof passcode !== 'string') {
      return res.status(401).json({ error: 'Please enter a valid administrator passcode.' });
    }

    const adminPass = process.env.ADMIN_PASSCODE ? process.env.ADMIN_PASSCODE.trim() : '';
    const rawPassHash = process.env.ADMIN_PASSCODE_HASH;
    const adminPassHash = rawPassHash ? rawPassHash.trim().replace(/^["']|["']$/g, '') : '';

    let isAuthenticated = false;

    if (adminPassHash !== '') {
      try {
        isAuthenticated = await bcrypt.compare(passcode.trim(), adminPassHash);
      } catch (bcryptErr) {
        console.error('Bcrypt validation error with ADMIN_PASSCODE_HASH:', bcryptErr);
        isAuthenticated = false;
      }
    } else if (adminPass !== '') {
      isAuthenticated = (passcode.trim() === adminPass);
    } else {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({
          error: 'Server configuration error: ADMIN_PASSCODE or ADMIN_PASSCODE_HASH must be configured in production.'
        });
      }
      // Fallback default for development testing only
      isAuthenticated = (passcode.trim() === 'admin123');
    }

    if (!isAuthenticated) {
      return res.status(401).json({ error: 'Invalid administrator passcode.' });
    }

    const adminSessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    res.cookie('meds24_admin_session', adminSessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt
    });

    await pool.query(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, (SELECT id FROM users WHERE role = 'admin' LIMIT 1), $2) ON CONFLICT (id) DO NOTHING`,
      [adminSessionId, expiresAt]
    ).catch(() => {});

    res.json({ success: true, message: 'Administrator authorized successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function requireAdminAuth(req: any, res: any, next: any) {
  try {
    const adminSession = req.cookies?.meds24_admin_session;
    if (adminSession) {
      const sessRes = await pool.query('SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()', [adminSession]);
      if (sessRes.rows.length > 0) {
        req.admin = { id: 'admin_session', name: 'Authorized Admin' };
        return next();
      }
    }
    return requireAdmin(req, res, next);
  } catch (err: any) {
    return res.status(403).json({ error: 'Unauthorized: Administrator access required.' });
  }
}

app.get('/api/admin/telegram/config', requireAdminAuth, async (req: any, res: any) => {
  try {
    const dbConnected = await checkDatabaseConnection();
    let token = process.env.TELEGRAM_BOT_TOKEN;
    let chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
    let adminIds = process.env.TELEGRAM_ADMIN_IDS || '';
    let lastTest = null;

    if (dbConnected) {
      try {
        const configRes = await pool.query('SELECT key, value FROM system_configs WHERE key IN (\'telegram_bot_token\', \'telegram_admin_chat_id\', \'telegram_admin_ids\', \'last_successful_test_time\')');
        configRes.rows.forEach(r => {
          if (r.key === 'telegram_bot_token' && r.value) token = r.value;
          if (r.key === 'telegram_admin_chat_id' && r.value) chatId = r.value;
          if (r.key === 'telegram_admin_ids' && r.value) adminIds = r.value;
          if (r.key === 'last_successful_test_time' && r.value) lastTest = r.value;
        });
      } catch {}
    }

    const configured = Boolean(token && token !== 'YOUR_TELEGRAM_BOT_TOKEN');
    let masked = '';
    if (configured && token) {
      if (token.length > 8) {
        masked = '••••••••••••••••' + token.slice(-4);
      } else {
        masked = '••••••••';
      }
    }

    const miniAppEnv = process.env.TELEGRAM_MINI_APP_URL || process.env.RENDER_EXTERNAL_URL;
    const host = req.get('host') || '';
    let miniAppUrl = '';
    if (miniAppEnv) {
      miniAppUrl = miniAppEnv.startsWith('http') ? miniAppEnv : `https://${miniAppEnv}`;
    } else if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      miniAppUrl = `https://${host}/admin-mini-app`;
    }

    const isMiniAppDeployed = Boolean(miniAppUrl && !miniAppUrl.includes('localhost') && !miniAppUrl.includes('127.0.0.1'));

    res.json({
      databaseConnected: dbConnected,
      configured,
      maskedToken: masked,
      adminChatId: chatId,
      adminIds,
      lastSuccessfulTestTime: lastTest,
      miniAppUrl: isMiniAppDeployed ? miniAppUrl : 'Mini App not deployed yet.',
      miniAppDeployed: isMiniAppDeployed
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/telegram/test-token', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { token } = req.body;
    const activeToken = token && token.trim() !== '' ? token.trim() : process.env.TELEGRAM_BOT_TOKEN;

    if (!activeToken || activeToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
      return res.status(400).json({ success: false, error: 'Please provide a valid Telegram Bot Token.' });
    }

    const response = await fetch(`https://api.telegram.org/bot${activeToken}/getMe`);
    const data = await response.json();

    if (!data.ok) {
      return res.status(400).json({ success: false, error: data.description || 'Invalid Telegram Bot Token.' });
    }

    const botInfo = data.result;
    res.json({
      success: true,
      botName: botInfo.first_name,
      botUsername: botInfo.username,
      botId: botInfo.id
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to connect to Telegram API.' });
  }
});

app.post('/api/admin/telegram/config', requireAdminAuth, async (req: any, res: any) => {
  try {
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      return res.status(503).json({
        success: false,
        error: 'Configuration persistence failed: PostgreSQL database is not connected (ECONNREFUSED). Please configure a valid PostgreSQL DATABASE_URL.'
      });
    }

    const { token, adminChatId, adminIds } = req.body;
    let activeToken = token && token.trim() !== '' ? token.trim() : null;

    if (activeToken) {
      const checkRes = await fetch(`https://api.telegram.org/bot${activeToken}/getMe`);
      const checkData = await checkRes.json();
      if (!checkData.ok) {
        return res.status(400).json({ success: false, error: checkData.description || 'Invalid Telegram Bot Token.' });
      }
    }

    const testTime = new Date().toLocaleString();

    if (activeToken) {
      await pool.query(
        `INSERT INTO system_configs (key, value, updated_at) VALUES ('telegram_bot_token', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [activeToken]
      );
      process.env.TELEGRAM_BOT_TOKEN = activeToken;
    }

    if (adminChatId !== undefined) {
      await pool.query(
        `INSERT INTO system_configs (key, value, updated_at) VALUES ('telegram_admin_chat_id', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [adminChatId.trim()]
      );
      process.env.TELEGRAM_ADMIN_CHAT_ID = adminChatId.trim();
    }

    if (adminIds !== undefined) {
      await pool.query(
        `INSERT INTO system_configs (key, value, updated_at) VALUES ('telegram_admin_ids', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [adminIds.trim()]
      );
      process.env.TELEGRAM_ADMIN_IDS = adminIds.trim();
    }

    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at) VALUES ('last_successful_test_time', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [testTime]
    );

    await logAudit(req.admin?.id || 'admin', req.admin?.name || 'Administrator', 'Update Telegram Configuration', 'SystemConfig', null, 'Updated Telegram bot token, chat ID, and authorized admin IDs.');

    let masked = '';
    const currentTok = activeToken || process.env.TELEGRAM_BOT_TOKEN;
    if (currentTok && currentTok.length > 8) {
      masked = '••••••••••••••••' + currentTok.slice(-4);
    }

    res.json({
      success: true,
      message: 'Telegram configuration saved and persisted successfully.',
      maskedToken: masked
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve Telegram Admin Mini App HTML
app.get('/admin-mini-app', (req, res) => {
  res.sendFile(path.join(__dirname, 'telegram-admin', 'mini-app.html'));
});

// Vite middleware / Static serving
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: false } });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Meds24 server running on http://localhost:${port}`);
});
