/*
 * Car Call push server  (Cloudflare Worker, free plan is enough)
 *
 * Setup (Cloudflare dashboard, no command line needed):
 *  1. Workers & Pages -> Create -> Create Worker -> Deploy -> Edit code -> paste this whole file -> Deploy.
 *  2. Storage & Databases -> KV -> Create namespace (any name, e.g. carcall).
 *  3. Your worker -> Settings -> Bindings -> Add -> KV namespace -> Variable name: KV -> pick that namespace -> Deploy.
 *  4. Copy the worker address (https://something.workers.dev) into config.js as pushServer.
 *
 * VAPID keys are generated automatically on first use and kept in KV. Nothing else to configure.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com', 'notify.windows.com'];
const SUBJECT = 'mailto:admin@example.com';   // optional: put your own email here
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = s => new TextEncoder().encode(s);
const sha256 = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s))), b => b.toString(16).padStart(2, '0')).join('');

async function getKeys(env) {
  let rec = await env.KV.get('vapid', 'json');
  if (!rec) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    rec = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
    await env.KV.put('vapid', JSON.stringify(rec));
  }
  return rec;
}

async function sendPush(env, endpoint) {
  const { priv, pub } = await getKeys(env);
  const key = await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(head + '.' + claims));
  // No payload: the service worker shows a fixed "someone is calling" notification.
  return fetch(endpoint, { method: 'POST', headers: { Authorization: 'vapid t=' + head + '.' + claims + '.' + b64u(sig) + ', k=' + pub, TTL: '120', Urgency: 'high' } });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/vapid') return json({ key: (await getKeys(env)).pub });
      if (req.method !== 'POST') return json({ ok: true, service: 'carcall-push' });
      const body = JSON.parse((await req.text()).slice(0, 4000) || '{}');
      const id = String(body.id || '');
      if (!/^car-[a-z0-9]{6,24}$/.test(id)) return json({ ok: false, error: 'bad id' }, 400);

      if (url.pathname === '/subscribe') {            // owner registers this phone for alerts
        const secret = String(body.secret || '');
        const endpoint = body.sub && String(body.sub.endpoint || '');
        if (secret.length < 16 || !endpoint) return json({ ok: false, error: 'bad request' }, 400);
        const host = new URL(endpoint).hostname;
        if (!endpoint.startsWith('https://') || !PUSH_HOSTS.some(h => host === h || host.endsWith('.' + h))) return json({ ok: false, error: 'bad endpoint' }, 400);
        const h = await sha256(secret), own = await env.KV.get('own:' + id);
        if (own && own !== h) return json({ ok: false, error: 'not the owner' }, 403);   // only the creator of this QR can change it
        if (!own) await env.KV.put('own:' + id, h);
        await env.KV.put('sub:' + id, JSON.stringify({ endpoint }));
        return json({ ok: true });
      }

      if (url.pathname === '/ring') {                 // a person scanned the QR and the owner is offline
        if (await env.KV.get('rl:' + id)) return json({ ok: true, throttled: true });
        const rec = await env.KV.get('sub:' + id);
        if (!rec) return json({ ok: false, reason: 'no-subscription' });
        const r = await sendPush(env, JSON.parse(rec).endpoint);
        if (r.status === 404 || r.status === 410) { await env.KV.delete('sub:' + id); return json({ ok: false, reason: 'expired' }); }
        if (r.ok) await env.KV.put('rl:' + id, '1', { expirationTtl: 60 });   // at most one alert per minute
        return json({ ok: r.ok, status: r.status });
      }
    } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    return json({ ok: false }, 404);
  }
};
