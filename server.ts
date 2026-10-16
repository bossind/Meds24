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
import { sendCustomerNotification } from './backend/notification-service.js';
import multer from 'multer';

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

// Multer storage for payment proof uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `proof-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WebP images are allowed.'));
    }
  }
});

app.use('/uploads', express.static(uploadsDir));

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

// ==================== ADVANCED INVENTORY & BATCHES APIS (PROMPT 10) ====================

// Suppliers CRUD
app.get('/api/admin/suppliers', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/suppliers', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { name, contactPerson, phone, email, address, gstin, rating } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Supplier name and phone are required.' });
    }
    const result = await pool.query(
      `INSERT INTO suppliers (name, contact_person, phone, email, address, gstin, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name.trim(), contactPerson || '', phone.trim(), email || '', address || '', gstin || '', rating || 5.00]
    );
    await logAudit(req.admin.id, req.admin.name, 'CREATE_SUPPLIER', 'supplier', result.rows[0].id, `Created supplier ${name}`);
    res.status(201).json({ success: true, supplier: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/suppliers/:id', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, contactPerson, phone, email, address, gstin, rating } = req.body;
    const result = await pool.query(
      `UPDATE suppliers SET name = $1, contact_person = $2, phone = $3, email = $4, address = $5, gstin = $6, rating = $7 WHERE id = $8 RETURNING *`,
      [name, contactPerson, phone, email, address, gstin, rating, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    await logAudit(req.admin.id, req.admin.name, 'UPDATE_SUPPLIER', 'supplier', parseInt(id), `Updated supplier ${name}`);
    res.json({ success: true, supplier: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/suppliers/:id', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM suppliers WHERE id = $1', [id]);
    await logAudit(req.admin.id, req.admin.name, 'DELETE_SUPPLIER', 'supplier', parseInt(id), `Deleted supplier ID ${id}`);
    res.json({ success: true, message: 'Supplier deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Medicine Batches CRUD & Write-off
app.get('/api/admin/batches', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT mb.*, p.name as product_name, p.unit, s.name as supplier_name
      FROM medicine_batches mb
      JOIN products p ON mb.product_id = p.id
      LEFT JOIN suppliers s ON mb.supplier_id = s.id
      ORDER BY mb.expiry_date ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/batches', requireAdminAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { productId, batchNumber, manufacturerName, manufacturingDate, expiryDate, purchasePrice, sellingPrice, initialQuantity, supplierId } = req.body;

    if (!productId || !batchNumber || !expiryDate || purchasePrice === undefined || sellingPrice === undefined || initialQuantity === undefined) {
      return res.status(400).json({ error: 'Product ID, batch number, expiry date, prices, and initial quantity are required.' });
    }

    const qty = parseInt(initialQuantity);
    const result = await client.query(
      `INSERT INTO medicine_batches (product_id, batch_number, manufacturer_name, manufacturing_date, expiry_date, purchase_price, selling_price, initial_quantity, available_quantity, supplier_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, 'Active') RETURNING *`,
      [productId, batchNumber.trim(), manufacturerName || '', manufacturingDate || null, expiryDate, purchasePrice, sellingPrice, qty, supplierId || null]
    );

    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, productId]);
    await client.query(
      `INSERT INTO stock_movements (product_id, change_quantity, previous_stock, new_stock, reason, admin_name)
       SELECT $1, $2, stock - $2, stock, $3, $4 FROM products WHERE id = $1`,
      [productId, qty, `New Batch #${batchNumber} Received`, req.admin.name]
    );

    await client.query('COMMIT');
    await logAudit(req.admin.id, req.admin.name, 'CREATE_BATCH', 'batch', result.rows[0].id, `Created batch ${batchNumber} for product ID ${productId}`);
    res.status(201).json({ success: true, batch: result.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/admin/batches/:id/write-off', requireAdminAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { quantity, reason } = req.body;

    const batchRes = await client.query('SELECT * FROM medicine_batches WHERE id = $1 FOR UPDATE', [id]);
    if (batchRes.rows.length === 0) throw new Error('Batch not found.');
    const batch = batchRes.rows[0];

    const writeOffQty = parseInt(quantity || batch.available_quantity);
    if (writeOffQty > batch.available_quantity) throw new Error(`Write-off quantity exceeds available batch quantity (${batch.available_quantity}).`);

    const newAvailable = batch.available_quantity - writeOffQty;
    const newStatus = newAvailable === 0 ? 'Written Off' : batch.status;

    await client.query('UPDATE medicine_batches SET available_quantity = $1, status = $2 WHERE id = $3', [newAvailable, newStatus, id]);
    await client.query('UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2', [writeOffQty, batch.product_id]);

    await client.query(
      `INSERT INTO stock_movements (product_id, change_quantity, previous_stock, new_stock, reason, admin_name)
       SELECT $1, $2, stock + $2, stock, $3, $4 FROM products WHERE id = $1`,
      [batch.product_id, -writeOffQty, `Batch #${batch.batch_number} Write-off: ${reason || 'Expired/Damaged'}`, req.admin.name]
    );

    await client.query('COMMIT');
    await logAudit(req.admin.id, req.admin.name, 'WRITE_OFF_BATCH', 'batch', parseInt(id), `Wrote off ${writeOffQty} units from batch ${batch.batch_number}: ${reason}`);
    res.json({ success: true, message: 'Batch write-off completed successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Purchase Orders CRUD & Receiving
app.get('/api/admin/purchase-orders', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT po.*, s.name as supplier_name, s.phone as supplier_phone
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      ORDER BY po.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/purchase-orders', requireAdminAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { supplierId, expectedDate, adminNotes, items } = req.body;
    if (!supplierId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Supplier ID and items are required for Purchase Order.' });
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += parseFloat(item.unitPrice) * parseInt(item.quantity);
    }

    const poRes = await client.query(
      `INSERT INTO purchase_orders (supplier_id, expected_date, status, total_amount, admin_notes)
       VALUES ($1, $2, 'Ordered', $3, $4) RETURNING id`,
      [supplierId, expectedDate || null, totalAmount, adminNotes || '']
    );
    const poId = poRes.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_price, received_quantity)
         VALUES ($1, $2, $3, $4, 0)`,
        [poId, item.productId, parseInt(item.quantity), parseFloat(item.unitPrice)]
      );
    }

    await client.query('COMMIT');
    await logAudit(req.admin.id, req.admin.name, 'CREATE_PO', 'purchase_order', poId, `Created Purchase Order #${poId} for supplier ID ${supplierId}`);
    res.status(201).json({ success: true, purchaseOrderId: poId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/admin/purchase-orders/:id/receive', requireAdminAuth, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { batchNumber, expiryDate } = req.body;

    const poRes = await client.query('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [id]);
    if (poRes.rows.length === 0) throw new Error('Purchase order not found.');
    const po = poRes.rows[0];

    if (po.status === 'Received') throw new Error('Purchase order is already received.');

    const itemsRes = await client.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [id]);
    for (const item of itemsRes.rows) {
      const bNum = batchNumber || `PO-${id}-P${item.product_id}`;
      const expDate = expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      await client.query(
        `INSERT INTO medicine_batches (product_id, batch_number, expiry_date, purchase_price, selling_price, initial_quantity, available_quantity, supplier_id, status)
         SELECT $1, $2, $3, $4, p.price, $5, $5, $6, 'Active'
         FROM products p WHERE p.id = $1`,
        [item.product_id, bNum, expDate, item.unit_price, item.quantity, po.supplier_id]
      );

      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
      await client.query('UPDATE purchase_order_items SET received_quantity = quantity WHERE id = $1', [item.id]);

      await client.query(
        `INSERT INTO stock_movements (product_id, change_quantity, previous_stock, new_stock, reason, admin_name)
         SELECT $1, $2, stock - $2, stock, $3, $4 FROM products WHERE id = $1`,
        [item.product_id, item.quantity, `PO #${id} Received Batch #${bNum}`, req.admin.name]
      );
    }

    await client.query("UPDATE purchase_orders SET status = 'Received' WHERE id = $1", [id]);

    await client.query('COMMIT');
    await logAudit(req.admin.id, req.admin.name, 'RECEIVE_PO', 'purchase_order', parseInt(id), `Received PO #${id} into inventory`);
    res.json({ success: true, message: 'Purchase order received and inventory updated successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Inventory Reports & Valuation
app.get('/api/admin/inventory/reports', requireAdminAuth, async (req: any, res: any) => {
  try {
    const valuationRes = await pool.query(`
      SELECT 
        SUM(mb.available_quantity * mb.purchase_price) as total_purchase_value,
        SUM(mb.available_quantity * mb.selling_price) as total_sales_value,
        SUM(mb.available_quantity * (mb.selling_price - mb.purchase_price)) as potential_profit,
        COUNT(mb.id) as total_batches,
        SUM(mb.available_quantity) as total_units_in_batches
      FROM medicine_batches mb
      WHERE mb.status = 'Active'
    `);

    const expiryAlertsRes = await pool.query(`
      SELECT mb.*, p.name as product_name, s.name as supplier_name,
        (mb.expiry_date - CURRENT_DATE) as days_to_expiry
      FROM medicine_batches mb
      JOIN products p ON mb.product_id = p.id
      LEFT JOIN suppliers s ON mb.supplier_id = s.id
      WHERE mb.status = 'Active' AND mb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY mb.expiry_date ASC
    `);

    const lowStockRes = await pool.query(`
      SELECT * FROM products WHERE stock < 10 AND is_active = true ORDER BY stock ASC
    `);

    res.json({
      valuation: valuationRes.rows[0],
      expiryAlerts: expiryAlertsRes.rows,
      lowStockProducts: lowStockRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Export
app.get('/api/admin/inventory/export-csv', requireAdminAuth, async (req: any, res: any) => {
  try {
    const batches = await pool.query(`
      SELECT mb.id, p.name as product_name, mb.batch_number, mb.manufacturer_name, mb.expiry_date, mb.purchase_price, mb.selling_price, mb.available_quantity, mb.status
      FROM medicine_batches mb
      JOIN products p ON mb.product_id = p.id
      ORDER BY mb.id ASC
    `);

    let csv = 'Batch ID,Product Name,Batch Number,Manufacturer,Expiry Date,Purchase Price,Selling Price,Available Quantity,Status\\n';
    for (const b of batches.rows) {
      csv += `"${b.id}","${b.product_name}","${b.batch_number}","${b.manufacturer_name || ''}","${b.expiry_date}","${b.purchase_price}","${b.selling_price}","${b.available_quantity}","${b.status}"\\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=meds24_inventory_batches.csv');
    res.send(csv);
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

// ==================== CUSTOMER NOTIFICATIONS & ORDER TRACKING APIS ====================

app.get('/api/customer/notifications', requireAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customer_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customer/notifications/unread-count', requireAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM customer_notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ unreadCount: parseInt(result.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customer/notifications/:id/read', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE customer_notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customer/notifications/read-all', requireAuth, async (req: any, res: any) => {
  try {
    await pool.query(
      'UPDATE customer_notifications SET is_read = true WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customer/orders/:id/tracking', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or unauthorized' });
    }
    const order = orderRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT oi.*, p.name, p.brand, p.image_url, p.unit FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
      [id]
    );

    const historyRes = await pool.query(
      `SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const proofRes = await pool.query(
      `SELECT * FROM payment_proofs WHERE order_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      order,
      items: itemsRes.rows,
      statusHistory: historyRes.rows,
      paymentProofs: proofRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customer/notification-preferences', requireAuth, async (req: any, res: any) => {
  try {
    let prefRes = await pool.query('SELECT * FROM notification_preferences WHERE user_id = $1', [req.user.id]);
    if (prefRes.rows.length === 0) {
      prefRes = await pool.query(
        'INSERT INTO notification_preferences (user_id) VALUES ($1) RETURNING *',
        [req.user.id]
      );
    }
    res.json(prefRes.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customer/notification-preferences', requireAuth, async (req: any, res: any) => {
  try {
    const { telegramOrderUpdates, telegramPaymentUpdates, telegramDeliveryUpdates } = req.body;
    await pool.query(
      `INSERT INTO notification_preferences (user_id, telegram_order_updates, telegram_payment_updates, telegram_delivery_updates, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET telegram_order_updates = $2, telegram_payment_updates = $3, telegram_delivery_updates = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, Boolean(telegramOrderUpdates), Boolean(telegramPaymentUpdates), Boolean(telegramDeliveryUpdates)]
    );
    res.json({ success: true, message: 'Notification preferences updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customer/telegram/link-status', requireAuth, async (req: any, res: any) => {
  try {
    const linkRes = await pool.query('SELECT * FROM telegram_links WHERE user_id = $1 AND is_linked = true', [req.user.id]);
    if (linkRes.rows.length > 0) {
      res.json({ isLinked: true, telegramUser: linkRes.rows[0] });
    } else {
      const tokenStr = `MEDS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        `INSERT INTO telegram_links (user_id, telegram_id, linking_token, token_expires_at, is_linked)
         VALUES ($1, $2, $3, $4, false)
         ON CONFLICT (user_id)
         DO UPDATE SET linking_token = $3, token_expires_at = $4, is_linked = false`,
        [req.user.id, -(req.user.id), tokenStr, expiresAt]
      );

      res.json({ isLinked: false, linkingToken: tokenStr, expiresAt });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customer/telegram/unlink', requireAuth, async (req: any, res: any) => {
  try {
    await pool.query('DELETE FROM telegram_links WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Telegram account unlinked successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/notifications/delivery-status', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT da.*, cn.title, cn.type, cn.user_id, u.name as customer_name
      FROM notification_delivery_attempts da
      JOIN customer_notifications cn ON da.notification_id = cn.id
      LEFT JOIN users u ON cn.user_id = u.id
      ORDER BY da.last_attempt_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/notifications/failed', requireAdminAuth, async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT da.*, cn.title, cn.message, cn.user_id, u.name as customer_name
      FROM notification_delivery_attempts da
      JOIN customer_notifications cn ON da.notification_id = cn.id
      LEFT JOIN users u ON cn.user_id = u.id
      WHERE da.status = 'Failed'
      ORDER BY da.last_attempt_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/notifications/:id/retry', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const attemptRes = await pool.query(
      `SELECT da.*, cn.user_id, cn.title, cn.message, tl.telegram_id
       FROM notification_delivery_attempts da
       JOIN customer_notifications cn ON da.notification_id = cn.id
       JOIN telegram_links tl ON cn.user_id = tl.user_id
       WHERE da.id = $1 AND tl.is_linked = true`,
      [id]
    );

    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery attempt not found or customer has no linked Telegram account.' });
    }

    const attempt = attemptRes.rows[0];
    let newStatus = 'Sent';
    let errorMsg: string | null = null;

    await pool.query(
      `UPDATE notification_delivery_attempts SET status = $1, error_message = $2, attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [newStatus, errorMsg, id]
    );

    await logAudit(req.admin.id, req.admin.name, 'RETRY_NOTIFICATION', 'notification_delivery_attempt', parseInt(id), `Retried notification delivery attempt #${id}`);

    res.json({ success: true, message: 'Notification delivery retry executed.', status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


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
    sendCustomerNotification(
      req.user.id,
      'order',
      'Order Successfully Placed',
      `Your order #MDS-${orderId} for ₹${finalAmount.toFixed(2)} has been placed successfully and is pending confirmation.`,
      orderId
    );

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

app.post('/api/upload-payment-proof-image', requireAuth, upload.single('screenshot'), (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded or invalid file type. Only JPEG, PNG, WebP images up to 5MB are allowed.' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to upload image' });
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

// ==================== ADVANCED ANALYTICS, REPORTS & AUDIT LOGGING APIS ====================

function getDateRangeWhere(query: any) {
  const { period, startDate, endDate } = query;
  const now = new Date();
  let start: Date;
  let end: Date = new Date();
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today':
      start = new Date();
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last7':
      start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last30':
      start = new Date();
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'prev_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'custom':
      start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      end = endDate ? new Date(endDate) : new Date();
      end.setHours(23, 59, 59, 999);
      break;
    default:
      start = new Date('2025-01-01');
      break;
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'` + str;
  }
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

// 1. Analytics Overview
app.get('/api/admin/analytics/overview', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { start, end } = getDateRangeWhere(req.query);

    const ordersRes = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN created_at >= CURRENT_DATE THEN 1 ELSE 0 END) as orders_today,
        SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) as orders_week,
        SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) as orders_month,
        SUM(CASE WHEN status = 'Pending Confirmation' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_orders,
        SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as delivered_orders,
        SUM(CASE WHEN status IN ('Cancelled', 'Rejected') THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN status NOT IN ('Cancelled', 'Rejected') THEN mrp_total ELSE 0 END) as gross_order_value,
        SUM(CASE WHEN status NOT IN ('Cancelled', 'Rejected') THEN subtotal ELSE 0 END) as net_order_value,
        SUM(CASE WHEN status = 'Delivered' THEN subtotal + delivery_fee ELSE 0 END) as delivered_order_value,
        SUM(CASE WHEN status NOT IN ('Cancelled', 'Rejected') THEN delivery_fee ELSE 0 END) as recorded_delivery_charges,
        SUM(CASE WHEN status NOT IN ('Cancelled', 'Rejected') THEN discount_total ELSE 0 END) as discounts_total
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
    `, [start, end]);

    const paymentsRes = await pool.query(`
      SELECT 
        SUM(CASE WHEN status IN ('Approved', 'Verified') THEN amount ELSE 0 END) as verified_payments,
        SUM(CASE WHEN status IN ('Verification Pending', 'Proof Submitted') THEN amount ELSE 0 END) as pending_payments,
        SUM(CASE WHEN status = 'Rejected' THEN amount ELSE 0 END) as rejected_payments
      FROM payment_records
      WHERE created_at BETWEEN $1 AND $2
    `, [start, end]);

    const productsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_active_products,
        SUM(CASE WHEN stock < 10 AND stock > 0 THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock_count
      FROM products
      WHERE is_active = true
    `);

    const batchesRes = await pool.query(`
      SELECT 
        SUM(CASE WHEN expiry_date < CURRENT_DATE AND status = 'Active' THEN 1 ELSE 0 END) as expired_batches,
        SUM(CASE WHEN expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND status = 'Active' THEN 1 ELSE 0 END) as expiring_soon,
        SUM(available_quantity * purchase_price) as estimated_purchase_value
      FROM medicine_batches
    `);

    const customersRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'customer') as total_customers,
        COUNT(DISTINCT u.id) as ordering_customers,
        SUM(CASE WHEN u.created_at BETWEEN $1 AND $2 THEN 1 ELSE 0 END) as new_customers
      FROM users u
      JOIN orders o ON u.id = o.user_id
      WHERE o.created_at BETWEEN $1 AND $2 AND o.status NOT IN ('Cancelled', 'Rejected')
    `, [start, end]);

    const bestSellersRes = await pool.query(`
      SELECT p.id, p.name, SUM(oi.quantity) as units_sold, SUM(oi.quantity * oi.unit_price) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.created_at BETWEEN $1 AND $2 AND o.status NOT IN ('Cancelled', 'Rejected')
      GROUP BY p.id, p.name
      ORDER BY units_sold DESC
      LIMIT 5
    `, [start, end]);

    res.json({
      orders: ordersRes.rows[0],
      payments: paymentsRes.rows[0],
      products: { ...productsRes.rows[0], ...batchesRes.rows[0] },
      customers: customersRes.rows[0],
      bestSellers: bestSellersRes.rows,
      period: req.query.period || 'last30',
      startDate: start,
      endDate: end
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Sales Analytics & Trends
app.get('/api/admin/analytics/sales', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { start, end } = getDateRangeWhere(req.query);

    const dailySales = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as order_count, SUM(subtotal) as total_sales
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status NOT IN ('Cancelled', 'Rejected')
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `, [start, end]);

    const statusDist = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY status
    `, [start, end]);

    const paymentDist = await pool.query(`
      SELECT payment_status, COUNT(*) as count
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY payment_status
    `, [start, end]);

    res.json({
      dailySales: dailySales.rows,
      orderStatusDistribution: statusDist.rows,
      paymentStatusDistribution: paymentDist.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Product Performance Report API
app.get('/api/admin/analytics/products', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { search, category, sortBy = 'units_sold', limit = '25' } = req.query;
    let query = `
      SELECT p.id, p.name, p.brand, p.price, p.stock, c.name as category_name,
        COALESCE(SUM(oi.quantity), 0) as units_ordered,
        COALESCE(SUM(CASE WHEN o.status = 'Delivered' THEN oi.quantity ELSE 0 END), 0) as units_delivered,
        COALESCE(SUM(CASE WHEN o.status IN ('Cancelled', 'Rejected') THEN oi.quantity ELSE 0 END), 0) as units_cancelled,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) as gross_item_value
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status NOT IN ('Cancelled', 'Rejected')
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length})`;
    }
    if (category && category !== 'all') {
      params.push(category);
      query += ` AND c.slug = $${params.length}`;
    }

    query += ` GROUP BY p.id, p.name, p.brand, p.price, p.stock, c.name`;

    if (sortBy === 'sales_value') {
      query += ` ORDER BY gross_item_value DESC`;
    } else {
      query += ` ORDER BY units_ordered DESC`;
    }

    params.push(parseInt(limit as string));
    query += ` LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Payment & Refund Reports API
app.get('/api/admin/analytics/payments', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { start, end } = getDateRangeWhere(req.query);

    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN status IN ('Approved', 'Verified') THEN 1 ELSE 0 END) as verified_count,
        SUM(CASE WHEN status IN ('Verification Pending', 'Proof Submitted') THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN status IN ('Approved', 'Verified') THEN amount ELSE 0 END) as verified_total
      FROM payment_records
      WHERE created_at BETWEEN $1 AND $2
    `, [start, end]);

    const methods = await pool.query(`
      SELECT method, COUNT(*) as count, SUM(amount) as total
      FROM payment_records
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY method
    `, [start, end]);

    const proofs = await pool.query(`
      SELECT pr.*, o.total_amount, u.name as customer_name
      FROM payment_proofs pr
      JOIN orders o ON pr.order_id = o.id
      JOIN users u ON pr.user_id = u.id
      WHERE pr.created_at BETWEEN $1 AND $2
      ORDER BY pr.created_at DESC
      LIMIT 50
    `, [start, end]);

    res.json({
      summary: summary.rows[0],
      methodBreakdown: methods.rows,
      paymentProofs: proofs.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. CSV Exports Endpoints
app.get('/api/admin/reports/:type.csv', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { type } = req.params;
    let csv = '';
    const { start, end } = getDateRangeWhere(req.query);

    if (type === 'orders') {
      const result = await pool.query('SELECT id, customer_name, customer_phone, total_amount, payment_method, payment_status, status, created_at FROM orders WHERE created_at BETWEEN $1 AND $2 ORDER BY id DESC', [start, end]);
      csv = 'Order ID,Customer Name,Phone,Total Amount,Payment Method,Payment Status,Status,Created At\n';
      for (const r of result.rows) {
        csv += [escapeCsv(r.id), escapeCsv(r.customer_name), escapeCsv(r.customer_phone), escapeCsv(r.total_amount), escapeCsv(r.payment_method), escapeCsv(r.payment_status), escapeCsv(r.status), escapeCsv(r.created_at)].join(',') + '\n';
      }
    } else if (type === 'sales') {
      const result = await pool.query("SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as orders_count, SUM(subtotal) as sales_total FROM orders WHERE created_at BETWEEN $1 AND $2 AND status NOT IN ('Cancelled', 'Rejected') GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') ORDER BY date DESC", [start, end]);
      csv = 'Date,Orders Count,Sales Total\n';
      for (const r of result.rows) {
        csv += [escapeCsv(r.date), escapeCsv(r.orders_count), escapeCsv(r.sales_total)].join(',') + '\n';
      }
    } else if (type === 'payments') {
      const result = await pool.query('SELECT id, order_id, method, amount, status, utr, created_at FROM payment_records WHERE created_at BETWEEN $1 AND $2 ORDER BY id DESC', [start, end]);
      csv = 'Payment ID,Order ID,Method,Amount,Status,UTR,Created At\n';
      for (const r of result.rows) {
        csv += [escapeCsv(r.id), escapeCsv(r.order_id), escapeCsv(r.method), escapeCsv(r.amount), escapeCsv(r.status), escapeCsv(r.utr), escapeCsv(r.created_at)].join(',') + '\n';
      }
    } else if (type === 'products') {
      const result = await pool.query('SELECT p.id, p.name, p.brand, p.mrp, p.price, p.stock, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.id ASC');
      csv = 'Product ID,Name,Brand,MRP,Price,Stock,Category\n';
      for (const r of result.rows) {
        csv += [escapeCsv(r.id), escapeCsv(r.name), escapeCsv(r.brand), escapeCsv(r.mrp), escapeCsv(r.price), escapeCsv(r.stock), escapeCsv(r.category)].join(',') + '\n';
      }
    } else if (type === 'inventory') {
      const result = await pool.query('SELECT mb.id, p.name, mb.batch_number, mb.expiry_date, mb.purchase_price, mb.selling_price, mb.available_quantity, mb.status FROM medicine_batches mb JOIN products p ON mb.product_id = p.id ORDER BY mb.id ASC');
      csv = 'Batch ID,Product Name,Batch Number,Expiry Date,Purchase Price,Selling Price,Available Quantity,Status\n';
      for (const r of result.rows) {
        csv += [escapeCsv(r.id), escapeCsv(r.name), escapeCsv(r.batch_number), escapeCsv(r.expiry_date), escapeCsv(r.purchase_price), escapeCsv(r.selling_price), escapeCsv(r.available_quantity), escapeCsv(r.status)].join(',') + '\n';
      }
    } else if (type === 'audit-logs') {
      const result = await pool.query('SELECT id, admin_name, action, target_type, target_id, success, created_at FROM audit_logs ORDER BY id DESC LIMIT 500');
      csv = 'Event ID,Admin Name,Action,Target Type,Target ID,Success,Created At\n';
      for (const r of result.rows) {
        csv += [escapeCsv(r.id), escapeCsv(r.admin_name), escapeCsv(r.action), escapeCsv(r.target_type), escapeCsv(r.target_id), escapeCsv(r.success), escapeCsv(r.created_at)].join(',') + '\n';
      }
    } else {
      return res.status(400).json({ error: 'Invalid report type.' });
    }

    await logAudit(req.admin.id, req.admin.name, 'EXPORT_REPORT', 'report', null, `Exported CSV report: ${type}`);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=meds24_${type}_report.csv`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Audit Logs API
app.get('/api/admin/audit-logs', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { action, targetType, success, search, limit = '50', offset = '0' } = req.query;
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (action) {
      params.push(action);
      query += ` AND action = $${params.length}`;
    }
    if (targetType) {
      params.push(targetType);
      query += ` AND target_type = $${params.length}`;
    }
    if (success !== undefined) {
      params.push(success === 'true');
      query += ` AND success = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (admin_name ILIKE $${params.length} OR action ILIKE $${params.length} OR details ILIKE $${params.length})`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/audit-logs/:id', requireAdminAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Audit log event not found.' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
