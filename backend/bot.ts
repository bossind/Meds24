import { createRequire } from 'module';
import dotenv from 'dotenv';
import { pool } from './db.js';

dotenv.config();

const require = createRequire(import.meta.url);
const TelegramBotRaw = require('node-telegram-bot-api');
const TelegramBot = TelegramBotRaw.default || TelegramBotRaw;

const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.TELEGRAM_MINI_APP_URL || process.env.TELEGRAM_WEBAPP_URL || 'https://your-render-app-url.onrender.com/admin-mini-app';

let bot: any = null;

if (token && token !== 'YOUR_TELEGRAM_BOT_TOKEN') {
  try {
    bot = new TelegramBot(token, { polling: process.env.NODE_ENV !== 'production' });
    console.log('Telegram Bot initialized successfully.');

    // /start command with interactive menu
    bot.onText(/\/start|\/help/, (msg: any) => {
      const chatId = msg.chat.id;
      const userName = msg.from?.first_name || 'Admin';

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Admin Dashboard',
                web_app: { url: webAppUrl }
              }
            ],
            [
              { text: '📦 New Orders', callback_data: 'cmd_new_orders' },
              { text: '💳 Pending Payments', callback_data: 'cmd_pending_payments' }
            ],
            [
              { text: '💊 Manage Products', callback_data: 'cmd_products' },
              { text: '📊 Stock Management', callback_data: 'cmd_stock' }
            ],
            [
              { text: '📈 Today\'s Report', callback_data: 'cmd_report' }
            ]
          ]
        }
      };

      bot?.sendMessage(
        chatId,
        `🏥 *Meds24 Admin System*\n\nWelcome back, ${userName}!\nUse the interactive menu below to manage your pharmacy orders, payments, inventory, and analytics.`,
        { parse_mode: 'Markdown', ...keyboard }
      );
    });

    bot.onText(/\/dashboard|\/orders|\/pending|\/payments|\/products|\/stock|\/customers|\/report/, (msg: any) => {
      const chatId = msg.chat.id;
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Open Admin Mini App Dashboard', web_app: { url: webAppUrl } }]
          ]
        }
      };
      bot?.sendMessage(chatId, `Tap below to open the full Meds24 Admin Mini App dashboard:`, { parse_mode: 'Markdown', ...keyboard });
    });

    bot.on('callback_query', async (query: any) => {
      const chatId = query.message?.chat.id;
      if (!chatId) return;

      if (query.data === 'cmd_new_orders') {
        const res = await pool.query("SELECT id, customer_name, total_amount, status FROM orders WHERE status = 'Pending Confirmation' OR status = 'Pending' ORDER BY created_at DESC LIMIT 5");
        let text = '📦 *Pending Orders:*\n\n';
        if (res.rows.length === 0) text += 'No pending orders.';
        res.rows.forEach((o: any) => {
          text += `• Order #${o.id} - ${o.customer_name} - ₹${o.total_amount} [${o.status}]\n`;
        });
        bot?.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } else if (query.data === 'cmd_pending_payments') {
        const res = await pool.query("SELECT id, total_amount, payment_status FROM orders WHERE payment_status IN ('Proof Submitted', 'Verification Pending') LIMIT 5");
        let text = '💳 *Pending Payments for Verification:*\n\n';
        if (res.rows.length === 0) text += 'No pending payments.';
        res.rows.forEach((o: any) => {
          text += `• Order #${o.id} - ₹${o.total_amount} [${o.payment_status}]\n`;
        });
        bot?.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } else if (query.data === 'cmd_report') {
        const res = await pool.query("SELECT COUNT(*) as count, SUM(total_amount) as revenue FROM orders WHERE created_at >= CURRENT_DATE");
        const stats = res.rows[0];
        bot?.sendMessage(chatId, `📈 *Today's Sales Report:*\n\n• Orders Today: ${stats.count || 0}\n• Revenue Today: ₹${stats.revenue || 0}`, { parse_mode: 'Markdown' });
      }
      bot?.answerCallbackQuery(query.id);
    });

  } catch (err) {
    console.warn('Telegram Bot failed to initialize:', err);
  }
} else {
  console.log('Telegram Bot Token not configured. Running without active Telegram polling.');
}

// Notification service with duplicate notification prevention via notification_logs
export async function notifyAdminsNewOrder(orderId: number, customerName: string, totalAmount: number) {
  if (!bot) return;
  try {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) return;

    const logCheck = await pool.query('SELECT id FROM notification_logs WHERE order_id = $1 AND chat_id = $2', [orderId, adminChatId]);
    if (logCheck.rows.length > 0) return;

    const message = `🚨 *MEDS24 — NEW ORDER*\n\nOrder ID: \`#MDS-${orderId}\`\nCustomer: ${customerName}\nTotal Amount: ₹${totalAmount}\nStatus: Pending Confirmation\n\nOpen Admin Mini App to review.`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Open Admin Dashboard', web_app: { url: webAppUrl } }]
        ]
      }
    };

    await bot.sendMessage(adminChatId, message, { parse_mode: 'Markdown', ...keyboard });
    await pool.query('INSERT INTO notification_logs (order_id, chat_id, status) VALUES ($1, $2, $3)', [orderId, adminChatId, 'Sent']).catch(() => {});
  } catch (err: any) {
    console.error('Failed to send Telegram order notification:', err);
  }
}

export async function notifyAdminOrderEvent(orderId: number, eventTitle: string, details: string) {
  if (!bot) return;
  try {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) return;

    const message = `📢 *MEDS24 — ORDER UPDATE*\n\nOrder ID: \`#MDS-${orderId}\`\nEvent: *${eventTitle}*\n${details}\n\nOpen Admin Mini App for details.`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Open Admin Dashboard', web_app: { url: webAppUrl } }]
        ]
      }
    };

    await bot.sendMessage(adminChatId, message, { parse_mode: 'Markdown', ...keyboard });
  } catch (err: any) {
    console.error('Failed to send Telegram event notification:', err);
  }
}

export { bot };
