import test from 'node:test';
import assert from 'node:assert/strict';

// Helper: Escape CSV value and prevent formula injection
function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  // Prevent CSV formula injection (=, +, -, @)
  if (/^[=+\-@]/.test(str)) {
    str = `'` + str;
  }
  // Escape double quotes
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

// Financial metrics calculation rules verification
function calculateMetrics(orders: any[], payments: any[]) {
  let grossOrderValue = 0;
  let netOrderValue = 0;
  let deliveredOrderValue = 0;
  let deliveryCharges = 0;
  let discountsTotal = 0;

  for (const o of orders) {
    const isCancelled = o.status === 'Cancelled' || o.status === 'Rejected';
    const isDelivered = o.status === 'Delivered';
    const subtotal = parseFloat(o.subtotal || 0);
    const mrpTotal = parseFloat(o.mrp_total || o.subtotal || 0);
    const discount = parseFloat(o.discount_total || 0);
    const deliveryFee = parseFloat(o.delivery_fee || 0);

    if (!isCancelled) {
      grossOrderValue += mrpTotal;
      netOrderValue += subtotal;
      deliveryCharges += deliveryFee;
      discountsTotal += discount;

      if (isDelivered) {
        deliveredOrderValue += subtotal + deliveryFee;
      }
    }
  }

  let verifiedPaymentTotal = 0;
  let pendingPaymentTotal = 0;
  let rejectedPayments = 0;

  for (const p of payments) {
    const amt = parseFloat(p.amount || 0);
    if (p.status === 'Approved' || p.status === 'Verified') {
      verifiedPaymentTotal += amt;
    } else if (p.status === 'Verification Pending' || p.status === 'Proof Submitted') {
      pendingPaymentTotal += amt;
    } else if (p.status === 'Rejected') {
      rejectedPayments += amt;
    }
  }

  return {
    grossOrderValue,
    netOrderValue,
    deliveredOrderValue,
    deliveryCharges,
    discountsTotal,
    verifiedPaymentTotal,
    pendingPaymentTotal,
    rejectedPayments
  };
}

test('CSV formula injection prevention and escaping', () => {
  assert.equal(escapeCsv('Normal text'), '"Normal text"');
  assert.equal(escapeCsv('=SUM(A1:A10)'), `"'=SUM(A1:A10)"`);
  assert.equal(escapeCsv('+1234567890'), `"'+1234567890"`);
  assert.equal(escapeCsv('-500'), `"'-500"`);
  assert.equal(escapeCsv('@admin'), `"'\@admin"`);
  assert.equal(escapeCsv('Text with "quotes"'), '"Text with ""quotes"""');
});

test('Financial calculations exclude cancelled orders and distinguish verified vs pending', () => {
  const orders = [
    { subtotal: 1000, mrp_total: 1200, discount_total: 200, delivery_fee: 50, status: 'Delivered' },
    { subtotal: 500, mrp_total: 600, discount_total: 100, delivery_fee: 0, status: 'Processing' },
    { subtotal: 800, mrp_total: 900, discount_total: 100, delivery_fee: 50, status: 'Cancelled' } // Should be excluded
  ];

  const payments = [
    { amount: 1050, status: 'Approved' },
    { amount: 500, status: 'Verification Pending' },
    { amount: 200, status: 'Rejected' }
  ];

  const metrics = calculateMetrics(orders, payments);

  assert.equal(metrics.grossOrderValue, 1800); // 1200 + 600 (cancelled 900 ignored)
  assert.equal(metrics.netOrderValue, 1500); // 1000 + 500
  assert.equal(metrics.deliveredOrderValue, 1050); // 1000 + 50 (only delivered order)
  assert.equal(metrics.verifiedPaymentTotal, 1050);
  assert.equal(metrics.pendingPaymentTotal, 500);
  assert.equal(metrics.rejectedPayments, 200);
});
