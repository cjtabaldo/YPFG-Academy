// One-click unsubscribe from streak-saver emails. Public: the random token in
// the link is the only thing that identifies the person.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = new URL(req.url);
  let token = u.searchParams.get('token') ?? '';
  if (!token && req.method === 'POST') { try { token = (await req.json()).token ?? ''; } catch { /* form post from mail client */ } }
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response(JSON.stringify({ ok: false, error: 'That unsubscribe link is not valid.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('unsubscribe_streak_email', { p_token: token });
  const ok = !error && data === true;
  return new Response(JSON.stringify({ ok, error: ok ? undefined : 'That unsubscribe link is not valid.' }), { status: ok ? 200 : 400, headers: { ...cors, 'Content-Type': 'application/json' } });
});
