import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BRAND } from '../config/brand';
import * as I from './icons';
import { onTts, pause, resume, speak, stop, ttsSupported } from '../lib/tts';
import type { VerifyItem } from '../lib/types';

export function Wordmark({ size = 22, inverse = false, as: Tag = 'span' }: { size?: number; inverse?: boolean; as?: 'span' | 'h1' }) {
  return <Tag className={`wordmark${inverse ? ' inverse' : ''}`} style={{ fontSize: size, margin: 0 }} aria-label={BRAND.appName}>{BRAND.wordmark}</Tag>;
}

// ---------------------------------------------------------------- mascot
// Placeholder mascot drawn in code. Dropping transparent 512x512 PNGs named
// mascot-idle.png, mascot-correct.png, mascot-wrong.png, mascot-celebrate.png
// into /public/assets replaces it automatically.
export type MascotState = 'idle' | 'correct' | 'wrong' | 'celebrate';
const pngCache: Partial<Record<MascotState, boolean>> = {};
export function Mascot({ state = 'idle', size = 'md', label }: { state?: MascotState; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const [png, setPng] = useState<boolean>(pngCache[state] ?? false);
  useEffect(() => {
    if (pngCache[state] !== undefined) { setPng(pngCache[state]!); return; }
    const img = new Image();
    img.onload = () => { pngCache[state] = true; setPng(true); };
    img.onerror = () => { pngCache[state] = false; setPng(false); };
    img.src = `/assets/mascot-${state}.png`;
  }, [state]);
  const cls = `mascot ${size === 'md' ? '' : size} ${state === 'correct' || state === 'celebrate' ? 'bounce' : state === 'wrong' ? 'shake' : ''}`;
  const alt = label ?? { idle: 'Mascot', correct: 'Mascot cheering', wrong: 'Mascot wincing', celebrate: 'Mascot celebrating' }[state];
  if (png) return <img className={cls} src={`/assets/mascot-${state}.png`} alt={alt} key={state} />;
  return (
    <svg className={cls} viewBox="0 0 100 100" role="img" aria-label={alt} key={state}>
      {state === 'celebrate' && <><path d="M18 40 L6 18" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /><path d="M82 40 L94 18" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></>}
      <rect x="18" y="22" width="64" height="64" rx="16" fill="currentColor" />
      <rect x="40" y="10" width="20" height="12" rx="4" fill="currentColor" />
      {state === 'wrong' ? (
        <g stroke="var(--bg)" strokeWidth="5" strokeLinecap="round">
          <path d="M34 44l8 8M42 44l-8 8" /><path d="M58 44l8 8M66 44l-8 8" /><path d="M38 72h24" />
        </g>
      ) : state === 'correct' || state === 'celebrate' ? (
        <g stroke="var(--bg)" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M33 52q5-8 10 0" /><path d="M57 52q5-8 10 0" /><path d="M36 66q14 12 28 0" />
        </g>
      ) : (
        <g fill="var(--bg)"><circle cx="38" cy="50" r="5.5" /><circle cx="62" cy="50" r="5.5" /><rect x="40" y="66" width="20" height="5" rx="2.5" /></g>
      )}
    </svg>
  );
}

export function Bar({ value, max = 100, label, thin }: { value: number; max?: number; label: string; thin?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar${thin ? ' thin' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="row between mb">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><I.Close /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toast
let pushToast: ((t: { text: string; action?: { label: string; run: () => void }; ms?: number }) => void) | null = null;
export function toast(text: string, action?: { label: string; run: () => void }, ms = 3500) { pushToast?.({ text, action, ms }); }
export function ToastHost() {
  const [t, setT] = useState<{ text: string; action?: { label: string; run: () => void }; ms?: number } | null>(null);
  useEffect(() => { pushToast = setT; return () => { pushToast = null; }; }, []);
  useEffect(() => { if (!t || t.ms === 0) return; const h = setTimeout(() => setT(null), t.ms ?? 3500); return () => clearTimeout(h); }, [t]);
  if (!t) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{t.text}</span>
      {t.action && <button onClick={() => { t.action!.run(); setT(null); }}>{t.action.label}</button>}
    </div>
  );
}

// ---------------------------------------------------------------- celebration
export function Confetti({ count = 60 }: { count?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.6 + Math.random() * 1.4,
    color: ['#000000', '#8A8A8A', '#1A1A1A', '#BDBDBD'][i % 4], rot: Math.random() * 360, w: 6 + Math.random() * 8,
  })), [count]);
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, transform: `rotate(${b.rot}deg)`, width: b.w, outline: '1px solid #fff' }} />)}
    </div>
  );
}

export function Celebration({ title, sub, onDone, cta = 'Continue', children }: { title: string; sub?: string; onDone: () => void; cta?: string; children?: ReactNode }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); }, []);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <Confetti />
      <Mascot state="celebrate" size="lg" />
      <div className="big mt">{title}</div>
      {sub && <p className="mt" style={{ fontSize: '1.15rem', maxWidth: 420 }}>{sub}</p>}
      {children}
      <button ref={btn} className="btn lg mt-lg" style={{ minWidth: 220 }} onClick={onDone}>{cta}</button>
    </div>
  );
}

// ---------------------------------------------------------------- [verify] values
export function VerifyValue({ item, fallback }: { item?: VerifyItem; fallback?: string }) {
  if (!item) return <span className="badge verify">[verify]</span>;
  const verified = !!(item.source_url && item.verified_at);
  return (
    <span>
      {item.value ?? fallback ?? ''}{' '}
      {verified
        ? <a className="badge ok" href={item.source_url!} target="_blank" rel="noreferrer"><I.Check size={14} /> NRED source</a>
        : <span className="badge verify" title="Not yet confirmed against an official source">[verify]</span>}
    </span>
  );
}

export function Unverified({ status }: { status: string }) {
  if (status === 'verified') return null;
  return <span className="badge verify" aria-label={status === 'rejected' ? 'Rejected item' : 'Unverified item'}>{status === 'rejected' ? 'Rejected' : 'Unverified'}</span>;
}

// ---------------------------------------------------------------- listen mode
export function ListenBar({ text, rate, onRate }: { text: string; rate: number; onRate: (r: number) => void }) {
  const [state, setState] = useState({ speaking: false, paused: false });
  useEffect(() => onTts((speaking, paused) => setState({ speaking, paused })), []);
  useEffect(() => () => stop(), [text]);
  if (!ttsSupported()) return <p className="small muted">This device doesn't support reading aloud.</p>;
  const rates = [0.75, 1, 1.25, 1.5];
  return (
    <div className="row wrap" style={{ gap: '0.4rem' }}>
      {!state.speaking ? (
        <button className="btn sm ghost" onClick={() => speak(text, rate)} aria-label="Listen"><I.Speaker size={20} /> Listen</button>
      ) : state.paused ? (
        <button className="btn sm ghost" onClick={resume} aria-label="Resume reading"><I.Play size={20} /> Resume</button>
      ) : (
        <button className="btn sm ghost" onClick={pause} aria-label="Pause reading"><I.Pause size={20} /> Pause</button>
      )}
      <label className="sr-only" htmlFor="tts-rate">Reading speed</label>
      <select id="tts-rate" className="input" style={{ width: 'auto', minHeight: 44 }} value={rate} onChange={(e) => { onRate(Number(e.target.value)); stop(); }}>
        {rates.map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------- calculator
export function Calculator({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const press = (k: string) => {
    if (k === 'C') { setExpr(''); setResult(null); return; }
    if (k === '⌫') { setExpr((e) => e.slice(0, -1)); return; }
    if (k === '=') {
      try {
        if (!/^[\d+\-*/().\s]+$/.test(expr)) throw new Error();
        // eslint-disable-next-line no-new-func
        const v = Function(`"use strict"; return (${expr})`)() as number;
        if (!Number.isFinite(v)) throw new Error();
        const r = String(Math.round(v * 1e8) / 1e8);
        setResult(r); setExpr(r);
      } catch { setResult('Error'); }
      return;
    }
    setResult(null);
    setExpr((e) => e + k);
  };
  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+', 'C', '(', ')', '⌫'];
  const label = (k: string) => ({ '/': 'divide', '*': 'multiply', '-': 'minus', '+': 'plus', '=': 'equals', C: 'clear', '⌫': 'delete', '.': 'decimal point', '(': 'open parenthesis', ')': 'close parenthesis' }[k] ?? k);
  return (
    <div className="calc" role="dialog" aria-label="Calculator">
      <div className="row between"><strong className="head">Calculator</strong><button className="icon-btn" onClick={onClose} aria-label="Close calculator"><I.Close /></button></div>
      <div className="screen" aria-live="polite">{result === 'Error' ? 'Error' : expr.replace(/\*/g, '×').replace(/\//g, '÷') || '0'}</div>
      <div className="keys">
        {keys.map((k) => <button key={k} className={'/*-+='.includes(k) ? 'op' : ''} onClick={() => press(k)} aria-label={label(k)}>{k === '*' ? '×' : k === '/' ? '÷' : k}</button>)}
      </div>
    </div>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <div className="splash" role="status"><Wordmark size={30} /><p className="muted">{text}</p></div>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card center stack" style={{ alignItems: 'center', padding: '2rem 1rem' }}>
      <Mascot size="sm" />
      <h3 style={{ margin: 0 }}>{title}</h3>
      <p className="muted" style={{ margin: 0 }}>{body}</p>
      {action}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="error-text" role="alert"><I.X size={20} /> <span>{children}</span></p>;
}

export function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <span><span style={{ fontWeight: 600 }}>{label}</span>{hint && <span className="small muted" style={{ display: 'block' }}>{hint}</span>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </label>
  );
}

export function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="seg">
      {options.map((o) => <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
