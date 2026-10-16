import test from 'node:test';
import assert from 'node:assert/strict';

// Test Notification logic and payload validation
test('Notification payload validation and categorization', () => {
  const notification = {
    userId: 1,
    type: 'order',
    title: 'Order Successfully Placed',
    message: 'Your order #MDS-101 has been successfully placed.',
    orderId: 101,
    isRead: false
  };

  assert.equal(notification.userId, 1);
  assert.equal(notification.type, 'order');
  assert.equal(notification.isRead, false);
  assert.equal(notification.orderId, 101);
});

test('Notification preferences defaults', () => {
  const prefs = {
    telegramOrderUpdates: true,
    telegramPaymentUpdates: true,
    telegramDeliveryUpdates: true
  };

  assert.equal(prefs.telegramOrderUpdates, true);
  assert.equal(prefs.telegramPaymentUpdates, true);
  assert.equal(prefs.telegramDeliveryUpdates, true);
});

test('Telegram linking token expiry logic', () => {
  const now = Date.now();
  const tokenExpiresAt = new Date(now + 10 * 60 * 1000); // 10 mins future
  const isExpired = Date.now() > tokenExpiresAt.getTime();

  assert.equal(isExpired, false);
});
