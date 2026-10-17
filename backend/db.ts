import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function getFormattedConnectionString(raw?: string): string {
  const urlStr = raw || 'postgresql://postgres:password@localhost:5432/meds24';
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.startsWith('dpg-') && !parsed.hostname.includes('.')) {
      parsed.hostname = `${parsed.hostname}.oregon-postgres.render.com`;
    }
    return parsed.toString();
  } catch {
    return urlStr;
  }
}

const connectionString = getFormattedConnectionString(process.env.DATABASE_URL);
const isRenderOrSsl = connectionString.includes('render.com') || connectionString.includes('dpg-') || process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString,
  ssl: isRenderOrSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (err) {
    return false;
  }
}

pool.on('error', (err) => {
  console.warn('PostgreSQL idle client warning (database offline or unreachable):', err.message);
});

export default pool;
