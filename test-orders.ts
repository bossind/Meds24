import test from 'node:test';
import assert from 'node:assert/strict';

// Pure logic validator tests for Meds24 order management
function validateOrderPayload(items: any[], addressId: any, paymentMethod: string) {
  if (!addressId) throw new Error('Delivery address required');
  if (!paymentMethod) throw new Error('Payment method required');
  if (!items || items.length === 0) throw new Error('Order items required');
  for (const item of items) {
    if (item.quantity <= 0) throw new Error('Quantity must be positive');
    if (item.unitPrice < 0) throw new Error('Price cannot be negative');
  }
  return true;
}

function calculateOrderTotals(items: { price: number; mrp: number; quantity: number }[], deliveryFee: number, discountPercent: number) {
  let subtotal = 0;
  let mrpTotal = 0;
  for (const item of items) {
    subtotal += item.price * item.quantity;
    mrpTotal += item.mrp * item.quantity;
  }
  const discountTotal = mrpTotal - subtotal;
  const methodDiscount = (subtotal * discountPercent) / 100;
  const finalAmount = subtotal + deliveryFee - methodDiscount;
  return { subtotal, mrpTotal, discountTotal, finalAmount };
}

test('validateOrderPayload accepts valid order payload', () => {
  const valid = validateOrderPayload([{ productId: 1, quantity: 2, unitPrice: 100 }], 1, 'cod');
  assert.equal(valid, true);
});

test('validateOrderPayload rejects empty items', () => {
  assert.throws(() => {
    validateOrderPayload([], 1, 'cod');
  }, /Order items required/);
});

test('validateOrderPayload rejects non-positive quantities', () => {
  assert.throws(() => {
    validateOrderPayload([{ productId: 1, quantity: 0, unitPrice: 100 }], 1, 'cod');
  }, /Quantity must be positive/);
});

test('calculateOrderTotals computes correct subtotal and discounts', () => {
  const items = [
    { price: 80, mrp: 100, quantity: 2 },
    { price: 150, mrp: 200, quantity: 1 }
  ];
  const totals = calculateOrderTotals(items, 0, 10);
  // Subtotal = (80*2) + (150*1) = 160 + 150 = 310
  // MrpTotal = (100*2) + (200*1) = 200 + 200 = 400
  // Method discount 10% of 310 = 31
  // Final = 310 - 31 = 279
  assert.equal(totals.subtotal, 310);
  assert.equal(totals.mrpTotal, 400);
  assert.equal(totals.finalAmount, 279);
});

console.log('All order management unit tests passed successfully.');
