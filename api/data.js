// GET  /api/data -> { state }
// PUT  /api/data  { state } -> merges with what is stored, saves, returns { state }
// Every request must send "Authorization: Bearer <APP_PASSWORD>".
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const mergeState = require('../lib/merge.js');

const KEY = 'tracker:state';
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
let redis = null;
function db() {
  if (module.exports._redis) return module.exports._redis; // used by local tests
  if (!redis && url && token) redis = new Redis({ url, token });
  return redis;
}

function sameSecret(given, expected) {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function valid(s) {
  return s && typeof s === 'object' && Array.isArray(s.activities) &&
    s.days && typeof s.days === 'object' && !Array.isArray(s.days);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const password = process.env.APP_PASSWORD;
  if (!password) return res.status(500).json({ error: 'APP_PASSWORD is not set on the server.' });
  const store = db();
  if (!store) return res.status(500).json({ error: 'Database is not connected (Upstash Redis env vars missing).' });

  const auth = req.headers['authorization'] || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given || !sameSecret(given, password)) return res.status(401).json({ error: 'Wrong passcode.' });

  try {
    if (req.method === 'GET') {
      const state = await store.get(KEY);
      return res.status(200).json({ state: state || null });
    }
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const incoming = body && body.state;
      if (!valid(incoming)) return res.status(400).json({ error: 'Invalid data.' });
      if (JSON.stringify(incoming).length > 3_000_000) return res.status(413).json({ error: 'Data too large.' });
      const current = await store.get(KEY);
      const merged = mergeState(current, incoming);
      await store.set(KEY, merged);
      return res.status(200).json({ state: merged });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : 'unknown') });
  }
};
