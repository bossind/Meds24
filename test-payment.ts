import test from 'node:test';
import assert from 'node:assert/strict';

// Pure logic tests for UPI Payment generation and validation
function generateUpiUri(upiId: string, merchantName: string, amount: number, orderId: number, note: string) {
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&tr=MEDSORD${orderId}&cu=INR&tn=${encodeURIComponent(note)}`;
}

function validateUpiId(upiId: string): boolean {
  return typeof upiId === 'string' && upiId.includes('@') && upiId.trim().length > 3;
}

function calculatePaymentBreakdown(subtotal: number, deliveryFee: number, discountPercent: number, advancePercent: number, methodCode: string) {
  const discount = (subtotal * discountPercent) / 100;
  const total = subtotal + deliveryFee - discount;
  let amountPaid = 0;
  let remainingBalance = total;

  if (methodCode === 'advance_upi') {
    amountPaid = (total * advancePercent) / 100;
    remainingBalance = total - amountPaid;
  } else if (methodCode === 'full_upi') {
    amountPaid = total;
    remainingBalance = 0;
  } else {
    amountPaid = 0;
    remainingBalance = total;
  }

  return { total, amountPaid, remainingBalance };
}

test('UPI ID validation works correctly', () => {
  assert.equal(validateUpiId('meds24.pay@upi'), true);
  assert.equal(validateUpiId('invalidupi'), false);
  assert.equal(validateUpiId(''), false);
});

test('UPI URI generation produces correct query parameters', () => {
  const uri = generateUpiUri('merchant@upi', 'Meds24 Store', 450.50, 101, 'Meds24 Order #101');
  assert.equal(uri.includes('pa=merchant%40upi'), true);
  assert.equal(uri.includes('am=450.50'), true);
  assert.equal(uri.includes('tr=MEDSORD101'), true);
  assert.equal(uri.includes('cu=INR'), true);
});

test('Payment breakdown calculates full UPI vs Advance UPI vs COD correctly', () => {
  const fullUpi = calculatePaymentBreakdown(1000, 49, 5, 100, 'full_upi');
  assert.equal(fullUpi.total, 999);
  assert.equal(fullUpi.amountPaid, 999);
  assert.equal(fullUpi.remainingBalance, 0);

  const advanceUpi = calculatePaymentBreakdown(1000, 49, 2, 30, 'advance_upi');
  assert.equal(advanceUpi.total, 1029);
  assert.equal(advanceUpi.amountPaid, 308.7);
  assert.equal(Math.round(advanceUpi.remainingBalance * 100) / 100, 720.3);

  const cod = calculatePaymentBreakdown(1000, 49, 0, 0, 'cod');
  assert.equal(cod.total, 1049);
  assert.equal(cod.amountPaid, 0);
  assert.equal(cod.remainingBalance, 1049);
});
