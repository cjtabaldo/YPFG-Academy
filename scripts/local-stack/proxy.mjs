// Mimics the Supabase API gateway: /auth/v1 -> Auth, /rest/v1 -> PostgREST.
import http from 'node:http';

const routes = [
  ['/auth/v1', 9999],
  ['/rest/v1', 3000],
];
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const match = routes.find(([p]) => req.url.startsWith(p));
  if (!match) { res.writeHead(404, cors); return res.end('not found'); }
  const path = req.url.slice(match[0].length) || '/';
  const up = http.request({ host: '127.0.0.1', port: match[1], path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${match[1]}` } }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, ...cors });
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(up);
}).listen(54321, '127.0.0.1');
