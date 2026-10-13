// Listen mode: reads text aloud with the phone's built-in text-to-speech.
type Listener = (speaking: boolean, paused: boolean) => void;
const listeners = new Set<Listener>();
let speaking = false, paused = false;
const emit = () => listeners.forEach((l) => l(speaking, paused));

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export function onTts(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function speak(text: string, rate = 1) {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate; u.lang = 'en-US';
  u.onend = u.onerror = () => { speaking = false; paused = false; emit(); };
  speaking = true; paused = false; emit();
  speechSynthesis.speak(u);
}
export function pause() { if (ttsSupported() && speaking) { speechSynthesis.pause(); paused = true; emit(); } }
export function resume() { if (ttsSupported() && paused) { speechSynthesis.resume(); paused = false; emit(); } }
export function stop() { if (ttsSupported()) { speechSynthesis.cancel(); speaking = false; paused = false; emit(); } }
