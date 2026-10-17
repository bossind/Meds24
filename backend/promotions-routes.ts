import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { calculateOrderPricing, getGlobalSystemConfigs } from './pricing-service.js';

export function createPromotionsRouter(pool: Pool, requireAuth: any, requireAdminAuth: any, logAudit: any): Router {
  const router = Router();

  // ==================== CUSTOMER PROMOTION ENDPOINTS ====================

  // Get currently available coupons for customers
  router.get('/coupons/available', async (req: Request, res: Response) => {
    try {
      const resDb = await pool.query(
        `SELECT id, code, title, description, discount_type, discount_value, max_discount_amount, min_cart_subtotal, expiry_date, customer_eligibility
         FROM coupons
         WHERE is_active = true AND COALESCE(is_archived, false) = false
           AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
           AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)
         ORDER BY id DESC`
      );
      res.json(resDb.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get active automatic offers
  router.get('/offers/active', async (req: Request, res: Response) => {
    try {
      const resDb = await pool.query(
        `SELECT id, name, description, discount_type, discount_value, max_discount_amount, min_cart_subtotal, expiry_date, priority
         FROM automatic_offers
         WHERE is_active = true AND COALESCE(is_archived, false) = false
           AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
           AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)
         ORDER BY priority DESC, id ASC`
      );
      res.json(resDb.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Validate a coupon against customer's cart
  router.post('/coupons/validate', async (req: any, res: Response) => {
    try {
      const { couponCode, items, paymentMethodCode } = req.body;
      if (!couponCode || !couponCode.trim()) {
        return res.status(400).json({ valid: false, error: 'Coupon code is required.' });
      }

      const userId = req.user ? req.user.id : null;
      const pricing = await calculateOrderPricing(pool, items || [], userId, couponCode, paymentMethodCode);

      if (pricing.validationErrors.length > 0 && !pricing.appliedCoupon) {
        return res.status(400).json({
          valid: false,
          error: pricing.validationErrors[0],
          pricing
        });
      }

      res.json({
        valid: true,
        couponCode: pricing.appliedCoupon?.code,
        appliedCoupon: pricing.appliedCoupon,
        discountAmount: pricing.couponDiscount,
        pricing
      });
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message });
    }
  });

  // Recalculate complete cart pricing breakdown
  router.post('/cart/pricing', async (req: any, res: Response) => {
    try {
      const { items, couponCode, paymentMethodCode } = req.body;
      const userId = req.user ? req.user.id : null;
      const pricing = await calculateOrderPricing(pool, items || [], userId, couponCode, paymentMethodCode);
      res.json(pricing);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== ADMIN PROMOTION ENDPOINTS ====================

  // 1. List coupons
  router.get('/admin/coupons', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const resDb = await pool.query(
        `SELECT c.*,
            (SELECT COUNT(*) FROM offer_redemptions r WHERE r.coupon_id = c.id AND r.status = 'Applied') as total_redemptions,
            (SELECT COALESCE(SUM(discount_amount), 0) FROM offer_redemptions r WHERE r.coupon_id = c.id AND r.status = 'Applied') as total_discount_given
         FROM coupons c
         WHERE c.is_archived = false
         ORDER BY c.id DESC`
      );
      res.json(resDb.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Create coupon
  router.post('/admin/coupons', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const {
        code, title, description, discountType, discountValue,
        maxDiscountAmount, minCartSubtotal, startDate, expiryDate,
        totalRedemptionLimit, perCustomerLimit, eligibleProductIds,
        eligibleCategoryIds, customerEligibility, canCombineWithOffers,
        canCombineWithCoupons
      } = req.body;

      if (!code || !code.trim() || !title || !title.trim()) {
        return res.status(400).json({ error: 'Coupon code and title are required.' });
      }

      if (!discountType || !['percentage', 'fixed_amount'].includes(discountType)) {
        return res.status(400).json({ error: 'Discount type must be percentage or fixed_amount.' });
      }

      const val = parseFloat(discountValue);
      if (isNaN(val) || val <= 0) {
        return res.status(400).json({ error: 'Discount value must be greater than zero.' });
      }

      const cleanCode = code.trim().toUpperCase();

      const existing = await pool.query('SELECT id FROM coupons WHERE code = $1 AND is_archived = false', [cleanCode]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: `Coupon code "${cleanCode}" already exists.` });
      }

      const adminId = req.admin?.dbUserId || null;

      const insertRes = await pool.query(
        `INSERT INTO coupons (
          code, title, description, discount_type, discount_value,
          max_discount_amount, min_cart_subtotal, start_date, expiry_date,
          total_redemption_limit, per_customer_limit, eligible_product_ids,
          eligible_category_ids, customer_eligibility, can_combine_with_offers,
          can_combine_with_coupons, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          cleanCode, title.trim(), description || null, discountType, val,
          maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          minCartSubtotal ? parseFloat(minCartSubtotal) : 0.00,
          startDate || null, expiryDate || null,
          totalRedemptionLimit ? parseInt(totalRedemptionLimit) : null,
          perCustomerLimit ? parseInt(perCustomerLimit) : 1,
          Array.isArray(eligibleProductIds) ? eligibleProductIds : [],
          Array.isArray(eligibleCategoryIds) ? eligibleCategoryIds : [],
          customerEligibility || 'all',
          Boolean(canCombineWithOffers),
          Boolean(canCombineWithCoupons),
          adminId
        ]
      );

      const newCoupon = insertRes.rows[0];
      await logAudit(req.admin.id, req.admin.name, 'CREATE_COUPON', 'coupon', newCoupon.id, `Created coupon "${cleanCode}"`);

      res.status(201).json({ success: true, coupon: newCoupon });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get coupon details
  router.get('/admin/coupons/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const resDb = await pool.query('SELECT * FROM coupons WHERE id = $1', [id]);
      if (resDb.rows.length === 0) return res.status(404).json({ error: 'Coupon not found.' });

      const statsRes = await pool.query(
        `SELECT COUNT(*) as total_redemptions, COALESCE(SUM(discount_amount), 0) as total_discount
         FROM offer_redemptions WHERE coupon_id = $1 AND status = 'Applied'`,
        [id]
      );

      res.json({ coupon: resDb.rows[0], stats: statsRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Edit coupon
  router.put('/admin/coupons/:id', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const {
        title, description, discountType, discountValue,
        maxDiscountAmount, minCartSubtotal, startDate, expiryDate,
        totalRedemptionLimit, perCustomerLimit, eligibleProductIds,
        eligibleCategoryIds, customerEligibility, is_active,
        canCombineWithOffers, canCombineWithCoupons
      } = req.body;

      const val = parseFloat(discountValue);
      if (isNaN(val) || val <= 0) {
        return res.status(400).json({ error: 'Discount value must be greater than zero.' });
      }

      const updateRes = await pool.query(
        `UPDATE coupons SET
          title = $1, description = $2, discount_type = $3, discount_value = $4,
          max_discount_amount = $5, min_cart_subtotal = $6, start_date = $7,
          expiry_date = $8, total_redemption_limit = $9, per_customer_limit = $10,
          eligible_product_ids = $11, eligible_category_ids = $12, customer_eligibility = $13,
          is_active = $14, can_combine_with_offers = $15, can_combine_with_coupons = $16,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $17 RETURNING *`,
        [
          title, description || null, discountType, val,
          maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          minCartSubtotal ? parseFloat(minCartSubtotal) : 0.00,
          startDate || null, expiryDate || null,
          totalRedemptionLimit ? parseInt(totalRedemptionLimit) : null,
          perCustomerLimit ? parseInt(perCustomerLimit) : 1,
          Array.isArray(eligibleProductIds) ? eligibleProductIds : [],
          Array.isArray(eligibleCategoryIds) ? eligibleCategoryIds : [],
          customerEligibility || 'all',
          Boolean(is_active !== undefined ? is_active : true),
          Boolean(canCombineWithOffers),
          Boolean(canCombineWithCoupons),
          id
        ]
      );

      if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Coupon not found.' });

      await logAudit(req.admin.id, req.admin.name, 'UPDATE_COUPON', 'coupon', parseInt(id), `Updated coupon #${id}`);
      res.json({ success: true, coupon: updateRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Activate/deactivate coupon
  router.patch('/admin/coupons/:id/status', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const updateRes = await pool.query(
        `UPDATE coupons SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, code, is_active`,
        [Boolean(isActive), id]
      );
      if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Coupon not found.' });

      await logAudit(req.admin.id, req.admin.name, 'TOGGLE_COUPON_STATUS', 'coupon', parseInt(id), `Set coupon #${id} active status to ${isActive}`);
      res.json({ success: true, coupon: updateRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Archive coupon safely
  router.delete('/admin/coupons/:id', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query(`UPDATE coupons SET is_archived = true, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
      await logAudit(req.admin.id, req.admin.name, 'ARCHIVE_COUPON', 'coupon', parseInt(id), `Archived coupon #${id}`);
      res.json({ success: true, message: 'Coupon archived safely.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. List automatic offers
  router.get('/admin/automatic-offers', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const resDb = await pool.query(
        `SELECT * FROM automatic_offers WHERE is_archived = false ORDER BY priority DESC, id ASC`
      );
      res.json(resDb.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Create automatic offer
  router.post('/admin/automatic-offers', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const {
        name, description, discountType, discountValue, maxDiscountAmount,
        minCartSubtotal, startDate, expiryDate, eligibleProductIds, eligibleCategoryIds,
        customerEligibility, priority, allowStackingWithCoupons, maxUsageLimit
      } = req.body;

      if (!name || !name.trim()) return res.status(400).json({ error: 'Offer name is required.' });

      const val = parseFloat(discountValue);
      if (isNaN(val) || val <= 0) {
        return res.status(400).json({ error: 'Discount value must be greater than zero.' });
      }

      const adminId = req.admin?.dbUserId || null;

      const insertRes = await pool.query(
        `INSERT INTO automatic_offers (
          name, description, discount_type, discount_value, max_discount_amount,
          min_cart_subtotal, start_date, expiry_date, eligible_product_ids,
          eligible_category_ids, customer_eligibility, priority, allow_stacking_with_coupons,
          max_usage_limit, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          name.trim(), description || null, discountType || 'percentage', val,
          maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          minCartSubtotal ? parseFloat(minCartSubtotal) : 0.00,
          startDate || null, expiryDate || null,
          Array.isArray(eligibleProductIds) ? eligibleProductIds : [],
          Array.isArray(eligibleCategoryIds) ? eligibleCategoryIds : [],
          customerEligibility || 'all',
          priority ? parseInt(priority) : 0,
          Boolean(allowStackingWithCoupons !== undefined ? allowStackingWithCoupons : true),
          maxUsageLimit ? parseInt(maxUsageLimit) : null,
          adminId
        ]
      );

      const newOffer = insertRes.rows[0];
      await logAudit(req.admin.id, req.admin.name, 'CREATE_AUTOMATIC_OFFER', 'automatic_offer', newOffer.id, `Created automatic offer "${name}"`);

      res.status(201).json({ success: true, offer: newOffer });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Get automatic offer details
  router.get('/admin/automatic-offers/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const resDb = await pool.query('SELECT * FROM automatic_offers WHERE id = $1', [id]);
      if (resDb.rows.length === 0) return res.status(404).json({ error: 'Automatic offer not found.' });
      res.json(resDb.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Edit automatic offer
  router.put('/admin/automatic-offers/:id', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const {
        name, description, discountType, discountValue, maxDiscountAmount,
        minCartSubtotal, startDate, expiryDate, eligibleProductIds, eligibleCategoryIds,
        customerEligibility, priority, is_active, allowStackingWithCoupons, maxUsageLimit
      } = req.body;

      const val = parseFloat(discountValue);
      if (isNaN(val) || val <= 0) {
        return res.status(400).json({ error: 'Discount value must be greater than zero.' });
      }

      const updateRes = await pool.query(
        `UPDATE automatic_offers SET
          name = $1, description = $2, discount_type = $3, discount_value = $4,
          max_discount_amount = $5, min_cart_subtotal = $6, start_date = $7,
          expiry_date = $8, eligible_product_ids = $9, eligible_category_ids = $10,
          customer_eligibility = $11, priority = $12, is_active = $13,
          allow_stacking_with_coupons = $14, max_usage_limit = $15,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $16 RETURNING *`,
        [
          name, description || null, discountType, val,
          maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          minCartSubtotal ? parseFloat(minCartSubtotal) : 0.00,
          startDate || null, expiryDate || null,
          Array.isArray(eligibleProductIds) ? eligibleProductIds : [],
          Array.isArray(eligibleCategoryIds) ? eligibleCategoryIds : [],
          customerEligibility || 'all',
          priority ? parseInt(priority) : 0,
          Boolean(is_active !== undefined ? is_active : true),
          Boolean(allowStackingWithCoupons),
          maxUsageLimit ? parseInt(maxUsageLimit) : null,
          id
        ]
      );

      if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Automatic offer not found.' });

      await logAudit(req.admin.id, req.admin.name, 'UPDATE_AUTOMATIC_OFFER', 'automatic_offer', parseInt(id), `Updated offer #${id}`);
      res.json({ success: true, offer: updateRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. Activate/deactivate automatic offer
  router.patch('/admin/automatic-offers/:id/status', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const updateRes = await pool.query(
        `UPDATE automatic_offers SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, is_active`,
        [Boolean(isActive), id]
      );
      if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Automatic offer not found.' });

      await logAudit(req.admin.id, req.admin.name, 'TOGGLE_OFFER_STATUS', 'automatic_offer', parseInt(id), `Set offer #${id} status to ${isActive}`);
      res.json({ success: true, offer: updateRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. Archive automatic offer
  router.delete('/admin/automatic-offers/:id', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query(`UPDATE automatic_offers SET is_archived = true, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
      await logAudit(req.admin.id, req.admin.name, 'ARCHIVE_AUTOMATIC_OFFER', 'automatic_offer', parseInt(id), `Archived offer #${id}`);
      res.json({ success: true, message: 'Automatic offer archived safely.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 13. Get global promotion config
  router.get('/admin/promotions/config', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const configs = await getGlobalSystemConfigs(pool);
      res.json(configs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 14. Update global promotion config
  router.put('/admin/promotions/config', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const allowedKeys = [
        'max_discount_per_order',
        'allow_coupon_and_automatic_stacking',
        'allow_multiple_coupons',
        'max_coupons_per_order',
        'default_min_cart_value',
        'first_order_offer_enabled',
        'first_order_discount_type',
        'first_order_discount_value',
        'first_order_max_discount',
        'first_order_min_cart'
      ];

      const updates = req.body;
      for (const [key, value] of Object.entries(updates)) {
        if (allowedKeys.includes(key)) {
          await pool.query(
            `INSERT INTO system_configs (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
            [key, String(value)]
          );
        }
      }

      await logAudit(req.admin.id, req.admin.name, 'UPDATE_PROMOTION_CONFIG', 'system_config', 0, 'Updated global promotion settings');
      const updatedConfigs = await getGlobalSystemConfigs(pool);
      res.json({ success: true, configs: updatedConfigs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 15. View coupon and offer performance report
  router.get('/admin/promotions/stats', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const overviewRes = await pool.query(
        `SELECT 
            COUNT(*) FILTER (WHERE status = 'Applied') as total_redemptions,
            COALESCE(SUM(discount_amount) FILTER (WHERE status = 'Applied'), 0) as total_discount_given,
            COUNT(*) FILTER (WHERE redemption_type = 'coupon' AND status = 'Applied') as coupon_redemptions,
            COUNT(*) FILTER (WHERE redemption_type = 'automatic_offer' AND status = 'Applied') as offer_redemptions,
            COUNT(*) FILTER (WHERE redemption_type = 'first_order_offer' AND status = 'Applied') as first_order_redemptions
         FROM offer_redemptions`
      );

      const topCouponsRes = await pool.query(
        `SELECT c.code, c.title, COUNT(r.id) as redemption_count, SUM(r.discount_amount) as total_discount
         FROM offer_redemptions r
         JOIN coupons c ON r.coupon_id = c.id
         WHERE r.status = 'Applied'
         GROUP BY c.id, c.code, c.title
         ORDER BY redemption_count DESC LIMIT 10`
      );

      const topOffersRes = await pool.query(
        `SELECT o.name, COUNT(r.id) as redemption_count, SUM(r.discount_amount) as total_discount
         FROM offer_redemptions r
         JOIN automatic_offers o ON r.offer_id = o.id
         WHERE r.status = 'Applied'
         GROUP BY o.id, o.name
         ORDER BY redemption_count DESC LIMIT 10`
      );

      res.json({
        overview: overviewRes.rows[0],
        topCoupons: topCouponsRes.rows,
        topOffers: topOffersRes.rows
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 16. Get promotions dashboard summary stats
  router.get('/admin/promotions/dashboard-stats', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const statsRes = await pool.query(
        `SELECT 
            (SELECT COUNT(*) FROM coupons WHERE COALESCE(is_archived, false) = false) as total_coupons,
            (SELECT COUNT(*) FROM coupons WHERE is_active = true AND COALESCE(is_archived, false) = false AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP) AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)) as active_coupons,
            (SELECT COUNT(*) FROM coupons WHERE is_active = true AND COALESCE(is_archived, false) = false AND start_date > CURRENT_TIMESTAMP) as scheduled_coupons,
            (SELECT COUNT(*) FROM coupons WHERE COALESCE(is_archived, false) = false AND expiry_date < CURRENT_TIMESTAMP) as expired_coupons,
            (SELECT COUNT(*) FROM offer_redemptions WHERE status = 'Applied') as total_redemptions,
            (SELECT COALESCE(SUM(discount_amount), 0) FROM offer_redemptions WHERE status = 'Applied') as total_discount_granted,
            (SELECT COUNT(*) FROM automatic_offers WHERE is_active = true AND COALESCE(is_archived, false) = false AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP) AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)) as active_automatic_offers`
      );

      const sysConfigs = await getGlobalSystemConfigs(pool);
      const firstOrderStatus = sysConfigs.first_order_offer_enabled === 'true' ? 'Active' : 'Disabled';

      res.json({
        ...statsRes.rows[0],
        first_order_offer_status: firstOrderStatus,
        sysConfigs
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 17. Get detailed redemption history table
  router.get('/admin/promotions/redemptions', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { search, couponCode, status, limit = 50, offset = 0 } = req.query;

      let whereClause = 'WHERE 1=1';
      const queryParams: any[] = [];

      if (search && String(search).trim()) {
        queryParams.push(`%${String(search).trim()}%`);
        whereClause += ` AND (c.code ILIKE $${queryParams.length} OR CAST(r.order_id AS TEXT) ILIKE $${queryParams.length} OR u.name ILIKE $${queryParams.length} OR u.phone ILIKE $${queryParams.length})`;
      }

      if (couponCode && String(couponCode).trim()) {
        queryParams.push(String(couponCode).trim().toUpperCase());
        whereClause += ` AND UPPER(c.code) = $${queryParams.length}`;
      }

      if (status && String(status).trim()) {
        queryParams.push(String(status).trim());
        whereClause += ` AND r.status = $${queryParams.length}`;
      }

      queryParams.push(parseInt(String(limit), 10));
      const limitIdx = queryParams.length;
      queryParams.push(parseInt(String(offset), 10));
      const offsetIdx = queryParams.length;

      const resDb = await pool.query(
        `SELECT r.id, r.redemption_type, r.discount_amount, r.status, r.created_at,
                r.order_id, r.user_id,
                c.code as coupon_code, c.title as coupon_title,
                o_offer.name as offer_name,
                u.name as customer_name, u.phone as customer_phone
         FROM offer_redemptions r
         LEFT JOIN coupons c ON r.coupon_id = c.id
         LEFT JOIN automatic_offers o_offer ON r.offer_id = o_offer.id
         LEFT JOIN users u ON r.user_id = u.id
         ${whereClause}
         ORDER BY r.id DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        queryParams
      );

      res.json(resDb.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 18. Duplicate coupon configuration
  router.post('/admin/coupons/:id/duplicate', requireAdminAuth, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const sourceRes = await pool.query('SELECT * FROM coupons WHERE id = $1', [id]);
      if (sourceRes.rows.length === 0) return res.status(404).json({ error: 'Source coupon not found.' });

      const src = sourceRes.rows[0];
      const newCode = `${src.code}_COPY_${Math.floor(1000 + Math.random() * 9000)}`;

      const adminId = req.admin?.dbUserId || null;

      const dupRes = await pool.query(
        `INSERT INTO coupons (
          code, title, description, discount_type, discount_value,
          max_discount_amount, min_cart_subtotal, start_date, expiry_date,
          total_redemption_limit, per_customer_limit, eligible_product_ids,
          eligible_category_ids, customer_eligibility, can_combine_with_offers,
          can_combine_with_coupons, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17)
        RETURNING *`,
        [
          newCode, `${src.title} (Copy)`, src.description, src.discount_type, src.discount_value,
          src.max_discount_amount, src.min_cart_subtotal, src.start_date, src.expiry_date,
          src.total_redemption_limit, src.per_customer_limit, src.eligible_product_ids,
          src.eligible_category_ids, src.customer_eligibility, src.can_combine_with_offers,
          src.can_combine_with_coupons, adminId
        ]
      );

      await logAudit(req.admin.id, req.admin.name, 'DUPLICATE_COUPON', 'coupon', dupRes.rows[0].id, `Duplicated coupon #${id} into "${newCode}"`);

      res.status(201).json({ success: true, coupon: dupRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
