import { useState } from 'react';
import { BRAND, DISCLAIMER } from '../../config/brand';
import { localDate } from '../../lib/time';
import { useStore } from '../../state/store';
import { Bar, Mascot, Wordmark } from '../../ui/common';
import * as I from '../../ui/icons';
import { navigate } from '../../ui/router';

const GOALS = [
  { v: 10, label: 'Casual', sub: 'About one lesson a day' },
  { v: 20, label: 'Steady', sub: 'About two lessons a day' },
  { v: 30, label: 'Serious', sub: 'About three lessons a day' },
  { v: 50, label: 'All in', sub: 'Four or more lessons a day' },
] as const;

export function Onboarding() {
  const { profile, content, updateProfile, saveStep } = useStore();
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [goal, setGoal] = useState<10 | 20 | 30 | 50>(20);
  const [time, setTime] = useState('19:00');
  const [target, setTarget] = useState('');
  const [school, setSchool] = useState('');
  const [broker, setBroker] = useState('');
  const [placement, setPlacement] = useState<string>('');
  const TOTAL = 9;

  async function finish() {
    const today = localDate();
    await updateProfile({
      full_name: name.trim(), daily_goal: goal, reminder_time: time, target_exam_date: target || null,
      school_name: school.trim() || null, broker_name: broker.trim() || null,
      disclaimer_ack_at: new Date().toISOString(), onboarded_at: new Date().toISOString(), plan_start_date: today,
    });
    if (school.trim()) await saveStep('school', { status: 'done', done_on: today, started_on: today });
    if (broker.trim()) await saveStep('broker', { status: 'done', done_on: today, started_on: today });
    navigate(placement ? `/placement/${placement}` : '/', { replace: true });
  }

  const nextBtn = (label = 'Continue', disabled = false, onClick = () => setStep(step + 1)) => (
    <button className="btn block lg" disabled={disabled} onClick={onClick}>{label}</button>
  );

  return (
    <main className="page flush" id="main" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {step > 0 && (
        <div className="row mb">
          <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label="Back"><I.Back /></button>
          <div className="grow"><Bar value={step} max={TOTAL - 1} label={`Setup step ${step} of ${TOTAL - 1}`} /></div>
        </div>
      )}
      <div className="stack lg grow" style={{ justifyContent: step === 0 ? 'center' : 'flex-start' }}>
        {step === 0 && (
          <div className="stack lg" style={{ alignItems: 'center', textAlign: 'center' }}>
            <Wordmark size={44} inverse />
            <p className="small muted" style={{ margin: 0 }}>{BRAND.fullName}</p>
            <Mascot size="lg" />
            <h1 style={{ fontSize: '2.4rem' }}>Welcome to YPFG Academy.</h1>
            <p style={{ fontSize: '1.2rem' }}>Five minutes a day. One clear path. Your Nevada real estate license.</p>
            {nextBtn("Let's go")}
          </div>
        )}

        {step === 1 && (
          <>
            <h1>First, the fine print.</h1>
            <div className="card outline"><p style={{ margin: 0 }}>{DISCLAIMER}</p></div>
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I understand that YPFG Academy is a study tool and does not replace my NRED-approved pre-licensing course.</span></label>
            {nextBtn('Continue', !ack)}
          </>
        )}

        {step === 2 && (
          <>
            <h1>What should we call you?</h1>
            <label className="field">Your name<input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus /></label>
            {nextBtn('Continue', !name.trim())}
          </>
        )}

        {step === 3 && (
          <>
            <h1>Pick a daily goal.</h1>
            <p className="muted" style={{ margin: 0 }}>You can change it anytime. Consistency beats intensity.</p>
            <div className="options" role="radiogroup" aria-label="Daily XP goal">
              {GOALS.map((g) => (
                <button key={g.v} role="radio" aria-checked={goal === g.v} className="option" onClick={() => setGoal(g.v)}>
                  <span className="grow"><strong className="head">{g.label}</strong><span className="small" style={{ display: 'block' }}>{g.sub}</span></span>
                  <span className="num head">{g.v} XP</span>
                </button>
              ))}
            </div>
            {nextBtn()}
          </>
        )}

        {step === 4 && (
          <>
            <h1>When do you want to study?</h1>
            <p className="muted" style={{ margin: 0 }}>Pick a time you can protect. You can add it to your calendar from Settings.</p>
            <label className="field">Daily reminder time<input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            {nextBtn()}
          </>
        )}

        {step === 5 && (
          <>
            <h1>When do you want to take the exam?</h1>
            <p className="muted" style={{ margin: 0 }}>A target date lets us tell you how many lessons a day keep you on track.</p>
            <label className="field">Target exam date<input type="date" className="input" min={localDate()} value={target} onChange={(e) => setTarget(e.target.value)} /></label>
            {nextBtn(target ? 'Continue' : "Skip. I don't know yet")}
          </>
        )}

        {step === 6 && (
          <>
            <h1>Where are you taking your pre-licensing course?</h1>
            <p className="muted" style={{ margin: 0 }}>It must be a school approved by the Nevada Real Estate Division.</p>
            <label className="field">School name<input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="School name" /></label>
            {nextBtn(school.trim() ? 'Continue' : "Skip. I haven't enrolled yet")}
          </>
        )}

        {step === 7 && (
          <>
            <h1>Do you have a sponsoring broker?</h1>
            <p className="muted" style={{ margin: 0 }}>Every Nevada salesperson works under a licensed broker.</p>
            <label className="field">Broker or brokerage<input className="input" value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="Broker name" /></label>
            {nextBtn(broker.trim() ? 'Continue' : 'Skip. Not yet')}
          </>
        )}

        {step === 8 && (
          <>
            <h1>Already know some of this?</h1>
            <p className="muted" style={{ margin: 0 }}>Take a short placement check on any unit. Score 80% or better and it's marked complete. Totally optional.</p>
            <div className="options" role="radiogroup" aria-label="Where to start">
              <button role="radio" aria-checked={placement === ''} className="option" onClick={() => setPlacement('')}><span className="grow"><strong className="head">Start from the beginning</strong></span></button>
              {(content?.units ?? []).map((u) => (
                <button key={u.id} role="radio" aria-checked={placement === u.id} className="option" onClick={() => setPlacement(u.id)}>
                  <span className="grow">Placement check: {u.title}<span className="small" style={{ display: 'block' }}>{u.portion === 'state' ? 'Nevada State' : 'National'}</span></span>
                </button>
              ))}
            </div>
            {nextBtn(placement ? 'Finish and take the check' : 'Finish setup', false, finish)}
          </>
        )}
      </div>
    </main>
  );
}
