// Runs every hour (scheduled in Supabase). Emails people who opted in, have a
// streak of 3+ days, and haven't studied yet today, at the evening hour set
// by the Admin in their own time zone. One email per day at most.
import { createClient } from 'npm:@supabase/supabase-js@2';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('Forbidden', { status: 403 });
  const url = Deno.env.get('SUPABASE_URL')!;
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const from = Deno.env.get('EMAIL_FROM') ?? 'YPFG Academy <onboarding@resend.dev>';
  const apiUrl = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com/emails';
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return new Response('RESEND_API_KEY is not set', { status: 500 });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: due, error } = await admin.rpc('streak_saver_due');
  if (error) return new Response(error.message, { status: 500 });
  let sent = 0;
  for (const u of (due ?? []) as Array<{ id: string; email: string; name: string; streak: number; token: string }>) {
    const first = (u.name || '').split(' ')[0] || 'there';
    const unsubPage = `${appUrl}/unsubscribe?token=${u.token}`;
    const oneClick = `${url}/functions/v1/unsubscribe?token=${u.token}`;
    const subject = `Your ${u.streak}-day streak ends at midnight`;
    const text = `Hi ${first},\n\nYou haven't studied today. Five minutes keeps your ${u.streak}-day streak alive.\n\nStudy now: ${appUrl}\n\nYou're getting this because you turned on streak-saver emails in YPFG Academy.\nUnsubscribe: ${unsubPage}\n`;
    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#000">
<p style="font-family:Outfit,Arial,sans-serif;font-weight:700;font-size:20px;background:#000;color:#fff;display:inline-block;padding:4px 8px;margin:0 0 24px">ypfg academy</p>
<h1 style="font-family:Outfit,Arial,sans-serif;font-size:28px;margin:0 0 12px">${u.streak} days. Don't stop now.</h1>
<p style="font-size:16px;line-height:1.5">Hi ${esc(first)}, you haven't studied today. Five minutes keeps your ${u.streak}-day streak alive.</p>
<p><a href="${appUrl}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Study now</a></p>
<p style="font-size:12px;color:#5f5f5f;margin-top:32px">You're getting this because you turned on streak-saver emails in YPFG Academy. <a href="${unsubPage}" style="color:#5f5f5f">Unsubscribe</a></p></div>`;
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [u.email], subject, text, html, headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
    });
    if (r.ok) { await admin.rpc('mark_streak_email_sent', { p_user: u.id }); sent++; }
  }
  return new Response(JSON.stringify({ due: (due ?? []).length, sent }), { headers: { 'Content-Type': 'application/json' } });
});
