import { Pool } from 'pg';

export interface CartItemInput {
  productId: number;
  quantity: number;
}

export interface PricingCalculationResult {
  mrpTotal: number;
  subtotal: number;
  eligibleItems: any[];
  isFirstOrder: boolean;
  appliedAutomaticOffers: Array<{
    id: number;
    name: string;
    discountAmount: number;
  }>;
  autoOfferDiscount: number;
  appliedCoupon: {
    id: number;
    code: string;
    title: string;
    discountAmount: number;
  } | null;
  couponDiscount: number;
  firstOrderDiscount: number;
  paymentMethodDiscount: number;
  deliveryFee: number;
  totalDiscount: number;
  finalAmount: number;
  pricingBreakdown: any;
  validationErrors: string[];
}

// Helper for monetary rounding to 2 decimal places using integer cents/paise
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export async function isFirstOrderCustomer(pool: Pool, userId: number): Promise<boolean> {
  if (!userId) return false;
  const res = await pool.query(
    `SELECT COUNT(*) FROM orders WHERE user_id = $1 AND status NOT IN ('Cancelled', 'Rejected')`,
    [userId]
  );
  return parseInt(res.rows[0].count, 10) === 0;
}

export async function getGlobalSystemConfigs(pool: Pool): Promise<Record<string, string>> {
  const res = await pool.query('SELECT key, value FROM system_configs');
  const configs: Record<string, string> = {
    max_discount_per_order: '2000.00',
    allow_coupon_and_automatic_stacking: 'true',
    allow_multiple_coupons: 'false',
    max_coupons_per_order: '1',
    default_min_cart_value: '0.00',
    first_order_offer_enabled: 'true',
    first_order_discount_type: 'percentage',
    first_order_discount_value: '15.00',
    first_order_max_discount: '200.00',
    first_order_min_cart: '200.00'
  };
  res.rows.forEach(r => {
    configs[r.key] = r.value;
  });
  return configs;
}

export async function calculateOrderPricing(
  pool: Pool,
  items: CartItemInput[],
  userId: number | null,
  couponCode?: string | null,
  paymentMethodCode?: string | null
): Promise<PricingCalculationResult> {
  const validationErrors: string[] = [];

  if (!items || items.length === 0) {
    return {
      mrpTotal: 0,
      subtotal: 0,
      eligibleItems: [],
      isFirstOrder: false,
      appliedAutomaticOffers: [],
      autoOfferDiscount: 0,
      appliedCoupon: null,
      couponDiscount: 0,
      firstOrderDiscount: 0,
      paymentMethodDiscount: 0,
      deliveryFee: 0,
      totalDiscount: 0,
      finalAmount: 0,
      pricingBreakdown: {},
      validationErrors: ['Cart is empty.']
    };
  }

  // 1. Fetch products & compute cart subtotal
  let mrpTotal = 0;
  let subtotal = 0;
  const itemDetails: any[] = [];

  const productIds = items.map(i => i.productId);
  const productsRes = await pool.query(
    'SELECT id, name, category_id, mrp, price, stock, is_active FROM products WHERE id = ANY($1::int[])',
    [productIds]
  );

  const productMap = new Map<number, any>();
  productsRes.rows.forEach(p => productMap.set(p.id, p));

  for (const item of items) {
    const p = productMap.get(item.productId);
    if (!p || !p.is_active) {
      validationErrors.push(`Product #${item.productId} is not available.`);
      continue;
    }
    if (item.quantity <= 0) {
      validationErrors.push(`Invalid quantity for ${p.name}.`);
      continue;
    }
    const unitPrice = parseFloat(p.price);
    const unitMrp = parseFloat(p.mrp);
    const itemSubtotal = roundCurrency(unitPrice * item.quantity);
    const itemMrpTotal = roundCurrency(unitMrp * item.quantity);

    mrpTotal = roundCurrency(mrpTotal + itemMrpTotal);
    subtotal = roundCurrency(subtotal + itemSubtotal);

    itemDetails.push({
      productId: p.id,
      name: p.name,
      categoryId: p.category_id,
      quantity: item.quantity,
      unitPrice,
      unitMrp,
      itemSubtotal
    });
  }

  const isFirstOrder = userId ? await isFirstOrderCustomer(pool, userId) : false;
  const sysConfigs = await getGlobalSystemConfigs(pool);
  const maxDiscountCap = parseFloat(sysConfigs.max_discount_per_order || '2000.00');

  // 2. Calculate Automatic Offers
  let autoOfferDiscount = 0;
  const appliedAutomaticOffers: Array<{ id: number; name: string; discountAmount: number }> = [];

  const autoOffersRes = await pool.query(
    `SELECT * FROM automatic_offers 
     WHERE is_active = true AND COALESCE(is_archived, false) = false 
       AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
       AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)
     ORDER BY priority DESC, id ASC`
  );

  for (const offer of autoOffersRes.rows) {
    // Check usage limits
    if (offer.max_usage_limit && offer.current_usage_count >= offer.max_usage_limit) {
      continue;
    }
    // Check customer eligibility
    if (offer.customer_eligibility === 'first_order' && !isFirstOrder) {
      continue;
    }
    // Check minimum cart subtotal
    if (subtotal < parseFloat(offer.min_cart_subtotal || '0')) {
      continue;
    }

    // Filter eligible item subtotal if product or category restrictions apply
    let eligibleSub = subtotal;
    if ((offer.eligible_product_ids && offer.eligible_product_ids.length > 0) ||
        (offer.eligible_category_ids && offer.eligible_category_ids.length > 0)) {
      eligibleSub = 0;
      for (const item of itemDetails) {
        const prodMatch = offer.eligible_product_ids?.includes(item.productId);
        const catMatch = offer.eligible_category_ids?.includes(item.categoryId);
        if (prodMatch || catMatch) {
          eligibleSub = roundCurrency(eligibleSub + item.itemSubtotal);
        }
      }
    }

    if (eligibleSub <= 0) continue;

    let calcDiscount = 0;
    if (offer.discount_type === 'percentage') {
      calcDiscount = roundCurrency((eligibleSub * parseFloat(offer.discount_value)) / 100);
      if (offer.max_discount_amount) {
        calcDiscount = Math.min(calcDiscount, parseFloat(offer.max_discount_amount));
      }
    } else {
      calcDiscount = Math.min(parseFloat(offer.discount_value), eligibleSub);
    }

    if (calcDiscount > 0) {
      autoOfferDiscount = roundCurrency(autoOfferDiscount + calcDiscount);
      appliedAutomaticOffers.push({
        id: offer.id,
        name: offer.name,
        discountAmount: calcDiscount
      });

      // Apply primary automatic offer if stacking not explicitly configured for multiple auto offers
      break;
    }
  }

  // 3. Calculate Coupon Discount (if supplied)
  let appliedCoupon: { id: number; code: string; title: string; discountAmount: number } | null = null;
  let couponDiscount = 0;

  if (couponCode && couponCode.trim()) {
    const cleanCode = couponCode.trim().toUpperCase();
    const couponRes = await pool.query(
      `SELECT * FROM coupons WHERE UPPER(code) = $1 AND COALESCE(is_archived, false) = false`,
      [cleanCode]
    );

    if (couponRes.rows.length === 0) {
      validationErrors.push(`Coupon code "${cleanCode}" is invalid or does not exist.`);
    } else {
      const coupon = couponRes.rows[0];

      if (!coupon.is_active) {
        validationErrors.push(`Coupon code "${cleanCode}" is currently inactive.`);
      } else if (coupon.start_date && new Date(coupon.start_date) > new Date()) {
        validationErrors.push(`Coupon code "${cleanCode}" is not active yet.`);
      } else if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
        validationErrors.push(`Coupon code "${cleanCode}" has expired.`);
      } else if (subtotal < parseFloat(coupon.min_cart_subtotal || '0')) {
        validationErrors.push(`Minimum cart subtotal of ₹${coupon.min_cart_subtotal} required for coupon "${cleanCode}".`);
      } else if (coupon.customer_eligibility === 'first_order' && !isFirstOrder) {
        validationErrors.push(`Coupon "${cleanCode}" is only valid for your first order.`);
      } else {
        // Check total redemption limit
        if (coupon.total_redemption_limit) {
          const totalRedeemedRes = await pool.query(
            `SELECT COUNT(*) FROM offer_redemptions WHERE coupon_id = $1 AND status = 'Applied'`,
            [coupon.id]
          );
          if (parseInt(totalRedeemedRes.rows[0].count, 10) >= coupon.total_redemption_limit) {
            validationErrors.push(`Coupon code "${cleanCode}" has reached its total usage limit.`);
          }
        }

        // Check per-customer limit
        if (!validationErrors.length && userId && coupon.per_customer_limit) {
          const userRedeemedRes = await pool.query(
            `SELECT COUNT(*) FROM offer_redemptions WHERE coupon_id = $1 AND user_id = $2 AND status = 'Applied'`,
            [coupon.id, userId]
          );
          if (parseInt(userRedeemedRes.rows[0].count, 10) >= coupon.per_customer_limit) {
            validationErrors.push(`You have reached the maximum redemption limit for coupon "${cleanCode}".`);
          }
        }

        // Check product / category restrictions
        if (!validationErrors.length) {
          let eligibleSub = subtotal;
          if ((coupon.eligible_product_ids && coupon.eligible_product_ids.length > 0) ||
              (coupon.eligible_category_ids && coupon.eligible_category_ids.length > 0)) {
            eligibleSub = 0;
            for (const item of itemDetails) {
              const prodMatch = coupon.eligible_product_ids?.includes(item.productId);
              const catMatch = coupon.eligible_category_ids?.includes(item.categoryId);
              if (prodMatch || catMatch) {
                eligibleSub = roundCurrency(eligibleSub + item.itemSubtotal);
              }
            }
          }

          if (eligibleSub <= 0) {
            validationErrors.push(`Coupon "${cleanCode}" is not applicable to any items in your cart.`);
          } else {
            // Calculate coupon discount
            let calcDiscount = 0;
            if (coupon.discount_type === 'percentage') {
              calcDiscount = roundCurrency((eligibleSub * parseFloat(coupon.discount_value)) / 100);
              if (coupon.max_discount_amount) {
                calcDiscount = Math.min(calcDiscount, parseFloat(coupon.max_discount_amount));
              }
            } else {
              calcDiscount = Math.min(parseFloat(coupon.discount_value), eligibleSub);
            }

            // Check stacking with automatic offers
            const allowStackingGlobal = sysConfigs.allow_coupon_and_automatic_stacking === 'true';
            if (autoOfferDiscount > 0 && (!coupon.can_combine_with_offers || !allowStackingGlobal)) {
              // Compare coupon discount vs automatic offer discount
              if (calcDiscount > autoOfferDiscount) {
                // Coupon is better: replace automatic offer
                autoOfferDiscount = 0;
                appliedAutomaticOffers.length = 0;
                couponDiscount = calcDiscount;
                appliedCoupon = {
                  id: coupon.id,
                  code: coupon.code,
                  title: coupon.title,
                  discountAmount: calcDiscount
                };
              } else {
                // Automatic offer is better: skip coupon but add helpful note
                validationErrors.push(`Automatic offer provides a higher discount than coupon "${cleanCode}".`);
              }
            } else {
              couponDiscount = calcDiscount;
              appliedCoupon = {
                id: coupon.id,
                code: coupon.code,
                title: coupon.title,
                discountAmount: calcDiscount
              };
            }
          }
        }
      }
    }
  }

  // 4. Calculate Standalone First-Order Offer (if enabled and no explicit first-order coupon/auto offer applied)
  let firstOrderDiscount = 0;
  if (isFirstOrder && sysConfigs.first_order_offer_enabled === 'true') {
    const foMinCart = parseFloat(sysConfigs.first_order_min_cart || '200.00');
    if (subtotal >= foMinCart && appliedAutomaticOffers.length === 0 && !appliedCoupon) {
      const foVal = parseFloat(sysConfigs.first_order_discount_value || '15.00');
      const foMax = parseFloat(sysConfigs.first_order_max_discount || '200.00');
      if (sysConfigs.first_order_discount_type === 'percentage') {
        firstOrderDiscount = roundCurrency((subtotal * foVal) / 100);
        firstOrderDiscount = Math.min(firstOrderDiscount, foMax);
      } else {
        firstOrderDiscount = Math.min(foVal, subtotal);
      }
    }
  }

  // 5. Compute Payment Method Discount (e.g., Full UPI 5% extra)
  let paymentMethodDiscount = 0;
  if (paymentMethodCode) {
    const paySetRes = await pool.query(
      'SELECT discount_percent, fee FROM payment_settings WHERE method_code = $1 AND is_enabled = true',
      [paymentMethodCode]
    );
    if (paySetRes.rows.length > 0) {
      const discPct = parseFloat(paySetRes.rows[0].discount_percent || '0');
      if (discPct > 0) {
        paymentMethodDiscount = roundCurrency((subtotal * discPct) / 100);
      }
    }
  }

  // 6. Delivery Fee calculation
  const deliveryFee = subtotal > 500 ? 0 : 49;

  // 7. Cap total promotional discount
  let rawPromotionalDiscount = roundCurrency(autoOfferDiscount + couponDiscount + firstOrderDiscount);
  let totalPromotionalDiscount = Math.min(rawPromotionalDiscount, maxDiscountCap, subtotal);

  const totalDiscount = roundCurrency(totalPromotionalDiscount + paymentMethodDiscount);
  const finalAmount = Math.max(0, roundCurrency(subtotal - totalPromotionalDiscount - paymentMethodDiscount + deliveryFee));

  return {
    mrpTotal,
    subtotal,
    eligibleItems: itemDetails,
    isFirstOrder,
    appliedAutomaticOffers,
    autoOfferDiscount,
    appliedCoupon,
    couponDiscount,
    firstOrderDiscount,
    paymentMethodDiscount,
    deliveryFee,
    totalDiscount,
    finalAmount,
    pricingBreakdown: {
      mrpTotal,
      subtotal,
      autoOfferDiscount,
      couponDiscount,
      firstOrderDiscount,
      paymentMethodDiscount,
      deliveryFee,
      totalDiscount,
      finalAmount,
      appliedCoupon: appliedCoupon ? appliedCoupon.code : null,
      appliedOffers: appliedAutomaticOffers.map(o => o.name)
    },
    validationErrors
  };
}
