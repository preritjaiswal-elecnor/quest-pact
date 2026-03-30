// functions/api/upload.js
// Cloudflare R2 file upload for quest proof media
// ENV VARS needed in Cloudflare Pages:
//   R2_BUCKET_NAME  — your R2 bucket name (bound as R2 binding named "PROOF_BUCKET")
//   Binding: Add R2 bucket binding named "PROOF_BUCKET" in Pages settings
// Note: R2 binding must be named PROOF_BUCKET in your Cloudflare Pages settings

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Quest-Id,X-Player-Id'
};

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);

  // GET /api/upload?key=xxx — generate signed URL or serve file
  if (request.method === 'GET') {
    const key = url.searchParams.get('key');
    if (!key) return new Response('Missing key', { status: 400, headers: CORS });

    try {
      const obj = await env.PROOF_BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: CORS });

      const headers = new Headers(CORS);
      headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=31536000');
      headers.set('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
      return new Response(obj.body, { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  }

  // POST /api/upload — upload a file
  if (request.method === 'POST') {
    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large (max 100MB)' }), { status: 413, headers: CORS });
    }

    const questId = request.headers.get('X-Quest-Id') || 'unknown';
    const playerId = request.headers.get('X-Player-Id') || 'unknown';
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

    // Derive file extension from content type
    const extMap = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
      'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
      'application/pdf': 'pdf'
    };
    const ext = extMap[contentType] || 'bin';
    const timestamp = Date.now();
    const key = `proofs/${questId}/${playerId}_${timestamp}.${ext}`;

    try {
      await env.PROOF_BUCKET.put(key, request.body, {
        httpMetadata: { contentType },
        customMetadata: { questId, playerId, uploadedAt: new Date().toISOString() }
      });

      return new Response(JSON.stringify({
        ok: true,
        key,
        url: `/api/upload?key=${encodeURIComponent(key)}`
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
