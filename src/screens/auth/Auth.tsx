import { useState, type FormEvent } from 'react';
import { BRAND } from '../../config/brand';
import { auth, friendly } from '../../lib/api';
import { ErrorText, Wordmark } from '../../ui/common';
import { navigate } from '../../ui/router';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="splash" id="main" style={{ justifyContent: 'flex-start', paddingTop: 'calc(3rem + env(safe-area-inset-top))' }}>
      <div style={{ width: '100%', maxWidth: 420 }} className="stack lg">
        <div className="stack" style={{ alignItems: 'center', gap: '0.5rem' }}>
          <Wordmark size={40} inverse as="h1" />
          <p className="small muted" style={{ margin: 0 }}>{BRAND.fullName}</p>
          <p className="head" style={{ fontSize: '1.25rem', margin: 0 }}>{BRAND.tagline}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot' | 'sent'>('signin');

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'signin') { await auth.signIn(email, password); navigate('/', { replace: true }); }
      else { await auth.sendReset(email); setMode('sent'); }
    } catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  }
  if (mode === 'sent') return (
    <Shell>
      <div className="card stack">
        <h2>Check your email</h2>
        <p style={{ margin: 0 }}>If {email} has an account, a reset link is on its way. It expires in one hour.</p>
        <button className="btn block" onClick={() => setMode('signin')}>Back to sign in</button>
      </div>
    </Shell>
  );
  return (
    <Shell>
      <form className="stack" onSubmit={submit} noValidate>
        <h2 style={{ margin: 0 }}>{mode === 'signin' ? 'Sign in' : 'Reset your password'}</h2>
        <label className="field">Email<input className="input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode === 'signin' && <label className="field">Password<input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
        <ErrorText>{err}</ErrorText>
        <button className="btn block lg" disabled={busy || !email || (mode === 'signin' && !password)}>{busy ? 'One sec…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}</button>
        <button type="button" className="btn quiet" onClick={() => { setErr(''); setMode(mode === 'signin' ? 'forgot' : 'signin'); }}>{mode === 'signin' ? 'Forgot your password?' : 'Back to sign in'}</button>
      </form>
      <p className="small muted center">YPFG Academy is invite-only. If you were invited, use the link in your invitation email to set your password.</p>
    </Shell>
  );
}

export function SetPassword({ mode }: { mode: 'invite' | 'reset' }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr("Those passwords don't match.");
    setBusy(true);
    try { await auth.setPassword(pw); navigate('/', { replace: true }); }
    catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  }
  return (
    <Shell>
      <form className="stack" onSubmit={submit}>
        <h2 style={{ margin: 0 }}>{mode === 'invite' ? "You're in. Set your password." : 'Choose a new password'}</h2>
        {mode === 'invite' && <p className="muted" style={{ margin: 0 }}>You'll use this with your email to sign in on any device.</p>}
        <label className="field">New password<input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required /></label>
        <label className="field">Type it again<input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required /></label>
        <ErrorText>{err}</ErrorText>
        <button className="btn block lg" disabled={busy}>{busy ? 'Saving…' : mode === 'invite' ? 'Set password and continue' : 'Save new password'}</button>
      </form>
    </Shell>
  );
}

export function LinkExpired() {
  return (
    <Shell>
      <div className="card stack">
        <h2>That link has expired</h2>
        <p style={{ margin: 0 }}>Links work once and expire after a while. If this was an invitation, ask the person who invited you to send a new one. If you were resetting your password, request a new link.</p>
        <button className="btn block" onClick={() => navigate('/', { replace: true })}>Go to sign in</button>
      </div>
    </Shell>
  );
}

export function NotConfigured() {
  return (
    <Shell>
      <div className="card stack">
        <h2>Almost there</h2>
        <p style={{ margin: 0 }}>This copy of YPFG Academy isn't connected to its database yet. Follow docs/SETUP.md to add your Supabase project URL and key, then publish again.</p>
      </div>
    </Shell>
  );
}

export function AccessRemoved({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Shell>
      <div className="card stack">
        <h2>Your access has been turned off</h2>
        <p style={{ margin: 0 }}>Your account is paused. If you think this is a mistake, contact the person who invited you.</p>
        <button className="btn block" onClick={onSignOut}>Sign out</button>
      </div>
    </Shell>
  );
}
