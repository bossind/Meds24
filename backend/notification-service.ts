import { pool } from './db.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
let bot: any = null;

if (token && token !== 'YOUR_TELEGRAM_BOT_TOKEN') {
  try {
    bot = new TelegramBot(token, { polling: false });
  } catch (err) {
    console.warn('Telegram Bot client initialization warning for customer notifications:', err);
  }
}

export async function sendCustomerNotification(
  userId: number,
  type: 'order' | 'payment' | 'delivery' | 'account',
  title: string,
  message: string,
  orderId?: number
): Promise<number | null> {
  try {
    // 1. Insert in-app notification
    const notifRes = await pool.query(
      `INSERT INTO customer_notifications (user_id, type, title, message, order_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP) RETURNING id`,
      [userId, type, title, message, orderId || null]
    );
    const notificationId = notifRes.rows[0].id;

    // 2. Check if user has linked Telegram
    const linkRes = await pool.query(
      `SELECT telegram_id FROM telegram_links WHERE user_id = $1 AND is_linked = true`,
      [userId]
    );

    if (linkRes.rows.length === 0 || !bot) {
      return notificationId;
    }

    const telegramId = linkRes.rows[0].telegram_id;

    // 3. Check notification preferences
    let prefRes = await pool.query(
      `SELECT telegram_order_updates, telegram_payment_updates, telegram_delivery_updates FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );

    let pref = prefRes.rows[0];
    if (!pref) {
      // Default preferences if not present
      const defaultPref = await pool.query(
        `INSERT INTO notification_preferences (user_id) VALUES ($1) RETURNING telegram_order_updates, telegram_payment_updates, telegram_delivery_updates`,
        [userId]
      );
      pref = defaultPref.rows[0];
    }

    let shouldSendTelegram = false;
    if (type === 'order' && pref.telegram_order_updates) shouldSendTelegram = true;
    if (type === 'payment' && pref.telegram_payment_updates) shouldSendTelegram = true;
    if (type === 'delivery' && pref.telegram_delivery_updates) shouldSendTelegram = true;
    if (type === 'account') shouldSendTelegram = true; // account security always permitted if linked

    if (shouldSendTelegram) {
      const tgMessage = `🔔 *MEDS24 NOTIFICATION*\n\n*${title}*\n${message}${orderId ? `\n\nOrder ID: \`#MDS-${orderId}\`` : ''}`;
      
      let deliveryStatus = 'Sent';
      let errorMsg: string | null = null;
      try {
        await bot.sendMessage(telegramId, tgMessage, { parse_mode: 'Markdown' });
      } catch (tgErr: any) {
        deliveryStatus = 'Failed';
        errorMsg = tgErr.message || 'Telegram API error';
      }

      await pool.query(
        `INSERT INTO notification_delivery_attempts (notification_id, channel, status, error_message, attempt_count, last_attempt_at)
         VALUES ($1, 'telegram', $2, $3, 1, CURRENT_TIMESTAMP)`,
        [notificationId, deliveryStatus, errorMsg]
      );
    }

    return notificationId;
  } catch (err: any) {
    console.error('Error in sendCustomerNotification:', err.message);
    return null;
  }
}
