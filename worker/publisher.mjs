/* =====================================================================
   Publicador serverless — Consulta Fiscal Âmbar (Cloudflare Worker)
   Objetivo: permitir que um funcionário atualize a base usando apenas
   USUÁRIO + SENHA, sem nunca ver o token do GitHub.

   - O token do GitHub fica como SEGREDO do Worker (GH_TOKEN), no servidor.
   - Usuários ficam em USERS_JSON (segredo): { "usuario": "<sha256(senha) hex>" }.
     Para criar/revogar acesso: adicione/remova uma entrada e reimplante.
   - Login devolve um token de sessão assinado (HMAC) com validade curta.
   - /publish grava produtos.json + servicos.json em UM único commit
     (Git Data API), autenticado pelo GH_TOKEN do servidor.

   Segredos esperados (wrangler secret put ...):
     GH_TOKEN       -> PAT fine-grained (Contents: Read and write no repo)
     USERS_JSON     -> JSON { "func1": "<hash>", ... }
     SESSION_SECRET -> string aleatória longa (assina a sessão)
   Variáveis (wrangler.toml [vars]):
     REPO           -> "departamento-fiscal/departamento-fiscal.github.io"
     ALLOW_ORIGIN   -> "https://departamento-fiscal.github.io"
   ===================================================================== */

const SESSION_TTL = 60 * 60; // 1 hora

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === '/login' && request.method === 'POST') return await login(request, env, cors);
      if (url.pathname === '/publish' && request.method === 'POST') return await publish(request, env, cors);
      return json({ error: 'rota não encontrada' }, 404, cors);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500, cors);
    }
  }
};

/* ---------------- utilidades ---------------- */
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors || {})
  });
}
function b64url(bytes) {
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToStr(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(s);
}
async function sha256Hex(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}
function timingEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------------- login ---------------- */
async function login(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');
  if (!user || !pass) return json({ error: 'informe usuário e senha' }, 400, cors);

  let users;
  try { users = JSON.parse(env.USERS_JSON || '{}'); } catch (_) { users = {}; }
  const hashEsperado = users[user];
  const hashInformado = await sha256Hex(pass);
  if (!hashEsperado || !timingEqual(hashEsperado, hashInformado)) {
    return json({ error: 'usuário ou senha inválidos' }, 401, cors);
  }

  const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL })));
  const assinatura = await hmac(env.SESSION_SECRET, payload);
  return json({ token: payload + '.' + assinatura, user: user, expira_em: SESSION_TTL }, 200, cors);
}

async function verificaSessao(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const partes = m[1].split('.');
  if (partes.length !== 2) return null;
  const [payload, assinatura] = partes;
  const esperado = await hmac(env.SESSION_SECRET, payload);
  if (!timingEqual(assinatura, esperado)) return null;
  let dados;
  try { dados = JSON.parse(b64urlToStr(payload)); } catch (_) { return null; }
  if (!dados.exp || dados.exp < Math.floor(Date.now() / 1000)) return null;
  return dados;
}

/* ---------------- publish (commit atômico) ---------------- */
async function publish(request, env, cors) {
  const sessao = await verificaSessao(request, env);
  if (!sessao) return json({ error: 'sessão inválida ou expirada — faça login novamente' }, 401, cors);

  const body = await request.json().catch(() => ({}));
  if (!body.produtos || !body.servicos) return json({ error: 'payload incompleto (produtos/servicos)' }, 400, cors);

  const REPO = env.REPO;
  const files = [
    { path: 'data/produtos.json', content: JSON.stringify(body.produtos) },
    { path: 'data/servicos.json', content: JSON.stringify(body.servicos) }
  ];
  const mensagem = 'Atualização da base (produtos + serviços) por ' + sessao.u + ' — ' + new Date().toISOString();

  const gh = (path, opts) => fetch('https://api.github.com/repos/' + REPO + path, Object.assign({}, opts, {
    headers: {
      'Authorization': 'Bearer ' + env.GH_TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ambar-publisher'
    }
  }));
  const ok = async (r) => { if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 200)); return r.json(); };

  const repo = await gh('', {}).then(ok);
  const branch = repo.default_branch || 'main';
  const ref = await gh('/git/ref/heads/' + branch, {}).then(ok);
  const headSha = ref.object.sha;
  const commit = await gh('/git/commits/' + headSha, {}).then(ok);
  const baseTree = commit.tree.sha;

  const blobs = [];
  for (const f of files) {
    const b = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.content, encoding: 'utf-8' }) }).then(ok);
    blobs.push(b.sha);
  }
  const tree = await gh('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[i] })) })
  }).then(ok);
  const novoCommit = await gh('/git/commits', {
    method: 'POST', body: JSON.stringify({ message: mensagem, tree: tree.sha, parents: [headSha] })
  }).then(ok);
  await gh('/git/refs/heads/' + branch, { method: 'PATCH', body: JSON.stringify({ sha: novoCommit.sha }) }).then(ok);

  return json({ ok: true, commit: novoCommit.sha, por: sessao.u }, 200, cors);
}
