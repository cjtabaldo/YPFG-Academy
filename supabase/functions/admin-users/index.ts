// Admin-only actions that need the server key: send invitations and delete
// accounts. The caller's own login is checked first, and the invite itself is
// written as the caller, so the database's launch-gate rule still applies.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const caller = createClient(url, anonKey, { ...opts, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await caller.auth.getUser();
  const { data: isAdmin } = await caller.rpc('is_admin');
  if (!who?.user || isAdmin !== true) return json({ error: 'YPFG_FORBIDDEN' }, 403);
  const admin = createClient(url, serviceKey, opts);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }

  if (body.action === 'invite') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const role = String(body.role ?? 'student');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (!['student', 'reviewer', 'admin'].includes(role)) return json({ error: 'Pick a role.' }, 400);
    const { error: invErr } = await caller.from('invites').upsert({ email, role, invited_by: who.user.id }, { onConflict: 'email' });
    if (invErr) return json({ error: invErr.message }, 400);
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: body.redirectTo || undefined,
      data: { full_name: String(body.name ?? '').trim() },
    });
    if (error) {
      if (/already been registered|already registered|exists/i.test(error.message)) return json({ error: 'That person already has an account. They can sign in or use "Forgot your password?".' }, 400);
      return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  if (body.action === 'delete') {
    const userId = String(body.userId ?? '');
    if (!userId) return json({ error: 'Missing user.' }, 400);
    if (userId === who.user.id) return json({ error: "You can't delete your own account here." }, 400);
    const { data: target } = await admin.from('profiles').select('email, role').eq('id', userId).maybeSingle();
    if (target?.role === 'admin') {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('disabled', false);
      if ((count ?? 0) <= 1) return json({ error: 'YPFG_LAST_ADMIN' }, 400);
    }
    // Deleting the login cascades to every table that holds this person's data.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    if (target?.email) await admin.from('invites').delete().eq('email', target.email);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, 400);
});
