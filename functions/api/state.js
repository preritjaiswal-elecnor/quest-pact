const STATE_PATH = 'data/state.json';

async function getGitHubFile(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${STATE_PATH}?ref=${env.GITHUB_BRANCH || 'main'}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'QuestPact/1.0' }
  });
  if (res.status === 404) return { content: null, sha: null };
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const json = await res.json();
  return { content: JSON.parse(atob(json.content.replace(/\n/g, ''))), sha: json.sha };
}

async function putGitHubFile(env, content, sha) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${STATE_PATH}`;
  const body = { message: `chore: update state [${new Date().toISOString()}]`, content: btoa(JSON.stringify(content, null, 2)), branch: env.GITHUB_BRANCH || 'main' };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: { Authorization: `token ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'QuestPact/1.0', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT failed: ${res.status}`);
  return res.json();
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    if (request.method === 'GET') {
      const { content } = await getGitHubFile(env);
      return new Response(JSON.stringify(content || { players:[], quests:[], ledger:[], nextQuestId:1, nextLedgerId:1 }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (request.method === 'POST') {
      const newState = await request.json();
      const { sha } = await getGitHubFile(env);
      await putGitHubFile(env, newState, sha);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    return new Response('Method not allowed', { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}
