const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Quest-Id,X-Player-Id' };

async function sha1(message) {
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const questId  = request.headers.get('X-Quest-Id')  || 'unknown';
  const playerId = request.headers.get('X-Player-Id') || 'unknown';
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

  let resourceType = 'raw';
  if (contentType.startsWith('image/')) resourceType = 'image';
  else if (contentType.startsWith('video/') || contentType.startsWith('audio/')) resourceType = 'video';
  else if (contentType === 'application/pdf') resourceType = 'image';

  const arrayBuffer = await request.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  const dataUri = `data:${contentType};base64,${btoa(binary)}`;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder    = `quest-pact/${questId}`;
  const publicId  = `${playerId}_${timestamp}`;
  const sigString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const sigHash   = await sha1(sigString);

  const formData = new FormData();
  formData.append('file',      dataUri);
  formData.append('api_key',   env.CLOUDINARY_API_KEY);
  formData.append('timestamp', timestamp);
  formData.append('signature', sigHash);
  formData.append('folder',    folder);
  formData.append('public_id', publicId);

  try {
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok || data.error) return new Response(JSON.stringify({ error: data.error?.message || 'Upload failed' }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({ ok: true, url: data.secure_url, key: data.public_id }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
