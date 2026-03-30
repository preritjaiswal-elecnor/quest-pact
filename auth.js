// functions/api/auth.js
// Password hashing with PBKDF2 via Web Crypto API (no plaintext ever stored)
// ENV VARS needed:
//   GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH (same as state.js)
//   AUTH_SECRET  — random 32-char string, used as PBKDF2 pepper

const AUTH_PATH = 'data/auth.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

async function hashPassword(password, salt, pepper) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password + pepper), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 200000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function randomSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getAuthStore(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${AUTH_PATH}?ref=${env.GITHUB_BRANCH || 'main'}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'QuestPact/1.0' }
  });
  if (res.status === 404) return { store: {}, sha: null };
  const json = await res.json();
  return { store: JSON.parse(atob(json.content.replace(/\n/g, ''))), sha: json.sha };
}

async function putAuthStore(env, store, sha) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${AUTH_PATH}`;
  const body = {
    message: 'chore: update auth store',
    content: btoa(JSON.stringify(store, null, 2)),
    branch: env.GITHUB_BRANCH || 'main'
  };
  if (sha) body.sha = sha;
  await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `token ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'QuestPact/1.0', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const { action, playerId, password } = await request.json().catch(() => ({}));

  if (!action || !playerId) {
    return new Response(JSON.stringify({ error: 'Missing action or playerId' }), { status: 400, headers: CORS });
  }

  try {
    const pepper = env.AUTH_SECRET || 'default-pepper-change-me';
    const { store, sha } = await getAuthStore(env);

    // ── REGISTER ──────────────────────────────────────────────
    if (action === 'register') {
      if (!password || password.length < 6) {
        return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), { status: 400, headers: CORS });
      }
      if (store[playerId]) {
        return new Response(JSON.stringify({ error: 'Password already set for this player' }), { status: 409, headers: CORS });
      }
      const salt = await randomSalt();
      const hash = await hashPassword(password, salt, pepper);
      store[playerId] = { hash, salt, createdAt: new Date().toISOString() };
      await putAuthStore(env, store, sha);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── LOGIN ──────────────────────────────────────────────────
    if (action === 'login') {
      if (!password) return new Response(JSON.stringify({ error: 'Password required' }), { status: 400, headers: CORS });
      const record = store[playerId];
      if (!record) return new Response(JSON.stringify({ error: 'No password set — contact your opponent to set up your account' }), { status: 404, headers: CORS });
      const hash = await hashPassword(password, record.salt, pepper);
      if (hash !== record.hash) return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: CORS });
      // Issue a simple session token (signed with AUTH_SECRET)
      const token = await generateToken(playerId, pepper);
      return new Response(JSON.stringify({ ok: true, token, playerId }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── VERIFY TOKEN ───────────────────────────────────────────
    if (action === 'verify') {
      const { token } = await request.json().catch(() => ({}));
      const result = await verifyToken(token, pepper);
      if (!result) return new Response(JSON.stringify({ valid: false }), { headers: CORS });
      return new Response(JSON.stringify({ valid: true, playerId: result }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── HAS PASSWORD ───────────────────────────────────────────
    if (action === 'hasPassword') {
      return new Response(JSON.stringify({ has: !!store[playerId] }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}

async function generateToken(playerId, secret) {
  const payload = `${playerId}:${Date.now() + 7 * 24 * 3600 * 1000}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return btoa(`${payload}:${sigHex}`);
}

async function verifyToken(token, secret) {
  try {
    const decoded = atob(token);
    const lastColon = decoded.lastIndexOf(':');
    const payload = decoded.slice(0, lastColon);
    const sigHex = decoded.slice(lastColon + 1);
    const [playerId, expiry] = payload.split(':');
    if (Date.now() > parseInt(expiry)) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const expectedHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (sigHex !== expectedHex) return null;
    return playerId;
  } catch { return null; }
}
