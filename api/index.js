const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Tạo bảng an toàn
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS keys (
        key TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiration TIMESTAMP
      );
    `);
    console.log('Database ready');
  } catch (err) {
    console.error('DB init error:', err);
  }
}
initDb();

// Admin secret – ĐỔI THÀNH MẬT KHẨU MẠNH CỦA BẠN
const ADMIN_SECRET = 'hungle2025_max_super_secret'; // ⚠️ ĐỔI NGAY!

// Thêm key
app.post('/add-key', async (req, res) => {
  const { key, type, admin_secret } = req.body;
  if (admin_secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  if (!['hour', 'day', 'month', 'lifetime'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  let expiration = null;
  if (type !== 'lifetime') {
    const now = new Date();
    if (type === 'hour') now.setHours(now.getHours() + 1);
    if (type === 'day') now.setDate(now.getDate() + 1);
    if (type === 'month') now.setMonth(now.getMonth() + 1);
    expiration = now;
  }

  try {
    await pool.query(
      'INSERT INTO keys (key, type, expiration) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET type = $2, expiration = $3',
      [key, type, expiration]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kiểm tra key
app.post('/verify-key', async (req, res) => {
  const { key } = req.body;
  try {
    const result = await pool.query('SELECT expiration FROM keys WHERE key = $1', [key]);
    if (result.rows.length === 0) return res.json({ valid: false });

    const exp = result.rows[0].expiration;
    if (exp && new Date(exp) < new Date()) return res.json({ valid: false });
    res.json({ valid: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List keys (cho admin panel)
app.post('/list-keys', async (req, res) => {
  const { admin_secret } = req.body;
  if (admin_secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await pool.query('SELECT key, type, expiration FROM keys ORDER BY created_at DESC');
    res.json({ keys: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;