import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import './sagebot.css';

/**
 * SAGE-E: a hand-built SVG robot with a tiny skeleton (root, body, head, arms, legs,
 * pupils, eyelids, brows). One requestAnimationFrame loop poses the skeleton every
 * frame, so nothing re-renders in React while he moves.
 *
 *   pose = idle breathing + mood + gaze (cursor) + walking + one-shot action + drag/drop
 */

export type BotMood = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy' | 'puppy';
export type BotAction =
  | 'wave' | 'dance' | 'hop' | 'spin' | 'nod' | 'shake' | 'lookAround'
  | 'celebrate' | 'dizzy' | 'present' | 'giggle' | 'stretch';

export interface SageBotHandle {
  play(action: BotAction): void;
  say(text: string, ms?: number): void;
  /** Walk to a spot on the ledge: -1 = far left, 0 = middle, 1 = far right. */
  walkTo(position: number): void;
}

interface Props {
  mood: BotMood;
  /** Small, stationary version (used on file pages). */
  compact?: boolean;
  /** Wander along the ledge, fall asleep when ignored, can be picked up. */
  roam?: boolean;
  reducedMotion?: boolean;
  /** Stop the animation loop (e.g. while covered by a page). */
  paused?: boolean;
  /** Where to look while `mood === 'listening'` (e.g. the text box). */
  lookAt?: () => DOMRect | null | undefined;
  className?: string;
}

const DUR: Record<BotAction, number> = {
  wave: 1700, dance: 3400, hop: 700, spin: 1100, nod: 900, shake: 900, lookAround: 2600,
  celebrate: 2200, dizzy: 2400, present: 1400, giggle: 900, stretch: 1900,
};
const IDLE_TRICKS: BotAction[] = ['wave', 'dance', 'hop', 'lookAround', 'spin', 'giggle', 'stretch', 'nod'];
const POKE_REACTIONS: BotAction[] = ['giggle', 'hop', 'spin', 'wave', 'dance', 'celebrate'];
const QUIPS = [
  'Hey, that tickles! 😆',
  'Beep boop. Test passed ✅',
  '87% rust, 13% charm.',
  'Found a bug! …oh wait, it’s a speck of dust.',
  'Careful, I’m a legacy system.',
  'Poke detected. Logging it in Jira.',
  'Wheee! Do it again!',
  'Running exploratory tests on your cursor.',
];
const WAKE_LINES = ['Huh? I’m up! I’m up!', 'Was just defragmenting…', 'Zzz… oh! Hi there!'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 → 1 → 0 envelope with soft edges, so actions blend in and out. */
const env = (p: number, edge = 0.15) => clamp(Math.min(p / edge, (1 - p) / edge), 0, 1);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

interface Pose {
  x: number; y: number; sx: number; sy: number; body: number;
  head: number; hx: number; hy: number;
  armL: number; armR: number; legL: number; legR: number;
  px: number; py: number; eye: number;
  browL: number; browR: number; browY: number;
}

export const SageBot = forwardRef<SageBotHandle, Props>(function SageBot(
  { mood, compact = false, roam = false, reducedMotion = false, paused = false, lookAt, className },
  ref,
) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stageRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const shadowRef = useRef<SVGEllipseElement>(null);
  const rootRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const armLRef = useRef<SVGGElement>(null);
  const armRRef = useRef<SVGGElement>(null);
  const legLRef = useRef<SVGGElement>(null);
  const legRRef = useRef<SVGGElement>(null);
  const pupilLRef = useRef<SVGGElement>(null);
  const pupilRRef = useRef<SVGGElement>(null);
  const lidLRef = useRef<SVGRectElement>(null);
  const lidRRef = useRef<SVGRectElement>(null);
  const browLRef = useRef<SVGRectElement>(null);
  const browRRef = useRef<SVGRectElement>(null);

  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const bubbleTimer = useRef(0);

  // Everything the loop needs, kept out of React state.
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const lookAtRef = useRef(lookAt);
  lookAtRef.current = lookAt;

  const st = useRef({
    x: 0, targetX: 0, dir: 1, walkPhase: 0,
    action: null as null | { name: BotAction; start: number; dur: number },
    nextTrick: performance.now() + 4500,
    blinkAt: performance.now() + 1800, blinkStart: -1,
    gx: 0, gy: 0,
    pointer: null as null | { x: number; y: number },
    lastActive: performance.now(), asleep: false,
    down: null as null | { x: number; y: number; t: number },
    held: false, lift: 0,
    drop: null as null | { start: number; from: number },
    pokes: [] as number[],
    range: 0,
  });

  const say = (text: string, ms = 3400) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble({ id: Date.now(), text });
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };
  const play = (name: BotAction) => {
    const s = st.current;
    if (reducedMotion && name !== 'nod' && name !== 'present') return;
    s.action = { name, start: performance.now(), dur: DUR[name] };
    s.lastActive = performance.now();
  };
  const wake = () => {
    const s = st.current;
    s.lastActive = performance.now();
    if (s.asleep) {
      s.asleep = false;
      setSleeping(false);
      play('hop');
      say(pick(WAKE_LINES), 2600);
    }
  };

  useImperativeHandle(ref, () => ({
    play: (a) => { wake(); play(a); },
    say: (t, ms) => { wake(); say(t, ms); },
    walkTo: (pos) => { st.current.targetX = clamp(pos, -1, 1) * st.current.range; },
  }));

  useEffect(() => () => window.clearTimeout(bubbleTimer.current), []);

  // Track the cursor everywhere on the page (eyes follow it), and wake up on activity.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      st.current.pointer = { x: e.clientX, y: e.clientY };
      wake();
    };
    const onKey = () => wake();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the walkable range in sync with the stage width.
  useEffect(() => {
    const stage = stageRef.current, bot = botRef.current;
    if (!stage || !bot) return;
    const ro = new ResizeObserver(() => {
      st.current.range = Math.max(0, (stage.clientWidth - bot.clientWidth) / 2 - 12);
      st.current.targetX = clamp(st.current.targetX, -st.current.range, st.current.range);
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // ---- the animation loop ----------------------------------------------------
  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = st.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const m = moodRef.current;
      const calm = m === 'idle' && !s.held && !s.drop;

      // Fall asleep when nobody has touched anything for a while.
      if (roam && calm && !s.asleep && !reducedMotion && now - s.lastActive > 30000) {
        s.asleep = true;
        s.action = null;
        setSleeping(true);
      }

      // Idle tricks and strolls.
      if (calm && !s.asleep && !s.action && !reducedMotion && now > s.nextTrick) {
        if (roam && Math.random() < 0.4) s.targetX = (Math.random() * 2 - 1) * s.range;
        else s.action = { name: pick(IDLE_TRICKS), start: now, dur: 0 };
        if (s.action) s.action.dur = DUR[s.action.name];
        s.nextTrick = now + 5000 + Math.random() * 5000;
      }

      // Walking.
      const dist = s.targetX - s.x;
      const walking = roam && !s.held && !s.asleep && Math.abs(dist) > 2 && (!s.action || s.action.name === 'lookAround');
      if (walking) {
        s.dir = Math.sign(dist);
        s.x += s.dir * Math.min(Math.abs(dist), 70 * dt);
        s.walkPhase += dt * 11;
      }

      // ---- gaze target ----
      let tx = 0, ty = 0.1;
      const botEl = botRef.current;
      const r = botEl?.getBoundingClientRect();
      const headX = r ? r.left + r.width / 2 : 0;
      const headY = r ? r.top + r.height * ((230 - 150) / 240) : 0; // head centre in SVG coords
      const lookPoint = (px: number, py: number) => {
        const dx = px - headX, dy = py - headY;
        tx = dx / (Math.abs(dx) + 160);
        ty = dy / (Math.abs(dy) + 160);
      };
      const act = s.action;
      const p = act ? (now - act.start) / act.dur : 0;
      if (act && act.name === 'lookAround') { tx = Math.sin(p * Math.PI * 2) * 0.95; ty = -0.25; }
      else if (s.asleep) { tx = 0; ty = 0.5; }
      else if (m === 'thinking') { tx = -0.55 + Math.sin(t * 1.3) * 0.2; ty = -0.75; }
      else if (m === 'listening') {
        const box = lookAtRef.current?.();
        if (box) lookPoint(box.left + Math.min(box.width - 20, 40 + (box.width * 0.5)), box.top + box.height / 2);
      } else if (s.pointer) lookPoint(s.pointer.x, s.pointer.y);
      const k = 1 - Math.exp(-dt * 9);
      s.gx = lerp(s.gx, tx, k);
      s.gy = lerp(s.gy, ty, k);

      // ---- base pose ----
      const P: Pose = {
        x: s.x, y: Math.sin(t * 2.4) * 1.3, sx: 1, sy: 1 + Math.sin(t * 2.4) * 0.006, body: s.gx * 3,
        head: s.gx * 10, hx: s.gx * 5, hy: s.gy * 3,
        armL: 8 + Math.sin(t * 1.7) * 2, armR: 8 + Math.sin(t * 1.7 + 1) * 2, legL: 0, legR: 0,
        px: s.gx * 7, py: s.gy * 5, eye: 1, browL: 0, browR: 0, browY: 0,
      };

      // ---- mood ----
      switch (m) {
        case 'thinking':
          P.head += 9; P.armR = 120 + Math.sin(t * 3) * 6; P.browR = 8; P.browY = -2; P.eye = 0.8; break;
        case 'talking':
          P.hy += Math.sin(t * 15) * 0.9; P.armR = 30 + Math.sin(t * 3.2) * 22; P.armL = 14 + Math.sin(t * 2.3) * 10; P.browY = -2; break;
        case 'happy':
          P.y -= Math.abs(Math.sin(t * 4.5)) * 4; P.armL = 40 + Math.sin(t * 4.5) * 14; P.armR = 40 - Math.sin(t * 4.5) * 14; P.browY = -4; break;
        case 'puppy':
          P.head += 13 + Math.sin(t * 1.4) * 2; P.browL = -16; P.browR = 16; P.browY = -3; P.armL = 25; P.armR = 25; P.body += Math.sin(t * 1.4) * 2; break;
        case 'listening':
          P.body += 4; P.head += 7; P.browY = -2; break;
      }
      if (s.asleep) {
        P.eye = 0.04; P.head = 15; P.hy = 4; P.y = Math.sin(t * 1.2) * 1.8; P.armL = 4; P.armR = 4; P.body = 2;
      }

      // ---- walking ----
      if (walking) {
        const w = Math.sin(s.walkPhase);
        P.legL = w * 20; P.legR = -w * 20;
        P.y -= Math.abs(w) * 3;
        P.body += s.dir * 4;
        P.armL = 14 - w * 18; P.armR = 14 + w * 18;
      }

      // ---- one-shot action ----
      if (act) {
        if (p >= 1) s.action = null;
        else {
          const e = env(p);
          switch (act.name) {
            case 'wave':
              P.armR = lerp(P.armR, 150 + Math.sin(p * Math.PI * 9) * 24, e); P.head += 6 * e; P.body -= 3 * e; P.browY -= 3 * e; break;
            case 'dance': {
              const b = p * Math.PI * 8;
              P.y -= Math.abs(Math.sin(b)) * 12 * e; P.body += Math.sin(b) * 9 * e; P.head -= Math.sin(b) * 12 * e;
              P.armL = lerp(P.armL, 75 + Math.sin(b) * 60, e); P.armR = lerp(P.armR, 75 - Math.sin(b) * 60, e);
              P.legL += Math.sin(b) * 16 * e; P.legR += Math.sin(b) * 16 * e; P.browY -= 3 * e; break;
            }
            case 'hop': {
              P.y -= Math.sin(p * Math.PI) * 42;
              const sq = p < 0.18 ? Math.sin((p / 0.18) * Math.PI) : p > 0.85 ? Math.sin(((p - 0.85) / 0.15) * Math.PI) : 0;
              P.sy *= 1 - 0.14 * sq; P.sx *= 1 + 0.1 * sq;
              P.armL += Math.sin(p * Math.PI) * 70; P.armR += Math.sin(p * Math.PI) * 70; P.legL -= Math.sin(p * Math.PI) * 10; P.legR += Math.sin(p * Math.PI) * 10; break;
            }
            case 'spin':
              P.sx *= Math.cos(p * Math.PI * 2); P.y -= Math.sin(p * Math.PI) * 18; P.armL += 50 * e; P.armR += 50 * e; break;
            case 'nod':
              P.hy += Math.sin(p * Math.PI * 4) * 4 * e; P.head += Math.sin(p * Math.PI * 4) * 3 * e; break;
            case 'shake':
              P.head += Math.sin(p * Math.PI * 6) * 16 * (1 - p); P.browL = -6; P.browR = 6; break;
            case 'lookAround':
              P.head += s.gx * 6; break;
            case 'celebrate':
              P.armL = lerp(P.armL, 160, e); P.armR = lerp(P.armR, 160, e);
              P.y -= Math.abs(Math.sin(p * Math.PI * 3)) * 26; P.body += Math.sin(p * Math.PI * 6) * 4; P.browY -= 4 * e; break;
            case 'dizzy':
              P.head += Math.sin(p * Math.PI * 10) * 12 * (1 - p * 0.5); P.body += Math.sin(p * Math.PI * 5) * 5 * e;
              P.px = Math.cos(t * 13) * 6; P.py = Math.sin(t * 13) * 5; break;
            case 'present':
              P.armR = lerp(P.armR, 98, e); P.armL = lerp(P.armL, 30, e); P.body += 4 * e; P.head -= 6 * e; P.y -= Math.sin(p * Math.PI) * 6; P.browY -= 3 * e; break;
            case 'giggle':
              P.body += Math.sin(p * Math.PI * 16) * 4 * (1 - p); P.y -= Math.abs(Math.sin(p * Math.PI * 8)) * 3; P.eye *= 1 - 0.55 * e; P.armL += 20 * e; P.armR += 20 * e; break;
            case 'stretch':
              P.armL = lerp(P.armL, 168, e); P.armR = lerp(P.armR, 168, e); P.sy *= 1 + 0.07 * e; P.eye *= 1 - 0.7 * e; P.head -= 4 * e; break;
          }
        }
      }

      // ---- picked up / dropped ----
      if (s.held) {
        P.y = -s.lift; P.legL = Math.sin(t * 9) * 16; P.legR = -Math.sin(t * 9) * 16;
        P.armL = 60 + Math.sin(t * 9) * 12; P.armR = 60 - Math.sin(t * 9) * 12; P.browY = -4; P.py = 3;
      } else if (s.drop) {
        const q = (now - s.drop.start) / 650;
        if (q >= 1) s.drop = null;
        else if (q < 0.4) P.y = s.drop.from * (1 - (q / 0.4) ** 2);
        else {
          const b = (q - 0.4) / 0.6;
          const sq = Math.sin(b * Math.PI) * (1 - b);
          P.sy *= 1 - 0.18 * sq; P.sx *= 1 + 0.12 * sq;
          P.y = -Math.sin(b * Math.PI) * 12 * (1 - b);
        }
      }

      // ---- blink ----
      if (now > s.blinkAt) { s.blinkStart = now; s.blinkAt = now + 2200 + Math.random() * 3800; }
      if (s.blinkStart > 0) {
        const bp = (now - s.blinkStart) / 150;
        if (bp >= 1) s.blinkStart = -1;
        else P.eye *= 1 - Math.sin(bp * Math.PI);
      }

      // ---- write the skeleton ----
      if (botEl) botEl.style.transform = `translateX(${P.x.toFixed(1)}px)`;
      rootRef.current?.setAttribute('transform', `translate(0 ${P.y.toFixed(2)}) scale(${P.sx.toFixed(3)} ${P.sy.toFixed(3)})`);
      const h = clamp(-P.y / 140, 0, 0.7);
      shadowRef.current?.setAttribute('transform', `scale(${(1 - h).toFixed(3)} 1)`);
      shadowRef.current?.setAttribute('opacity', (1 - h).toFixed(2));
      bodyRef.current?.setAttribute('transform', `rotate(${P.body.toFixed(2)} 0 -30)`);
      headRef.current?.setAttribute('transform', `translate(${P.hx.toFixed(2)} ${P.hy.toFixed(2)}) rotate(${P.head.toFixed(2)} 0 -128)`);
      armLRef.current?.setAttribute('transform', `translate(-50 -98) rotate(${P.armL.toFixed(1)})`);
      armRRef.current?.setAttribute('transform', `translate(50 -98) rotate(${(-P.armR).toFixed(1)})`);
      legLRef.current?.setAttribute('transform', `translate(-20 -31) rotate(${P.legL.toFixed(1)})`);
      legRRef.current?.setAttribute('transform', `translate(20 -31) rotate(${P.legR.toFixed(1)})`);
      const pt = `translate(${clamp(P.px, -7, 7).toFixed(2)} ${clamp(P.py, -6, 6).toFixed(2)})`;
      pupilLRef.current?.setAttribute('transform', pt);
      pupilRRef.current?.setAttribute('transform', pt);
      const lid = (30 * (1 - clamp(P.eye, 0, 1))).toFixed(2);
      lidLRef.current?.setAttribute('height', lid);
      lidRRef.current?.setAttribute('height', lid);
      browLRef.current?.setAttribute('transform', `translate(0 ${P.browY}) rotate(${P.browL} -27 -176)`);
      browRRef.current?.setAttribute('transform', `translate(0 ${P.browY}) rotate(${P.browR} 27 -176)`);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [paused, roam, reducedMotion]);

  // ---- poke / drag ----------------------------------------------------------
  const poke = () => {
    const s = st.current;
    const now = performance.now();
    wake();
    s.pokes = s.pokes.filter((p) => now - p < 2500).concat(now);
    if (s.pokes.length >= 4) {
      s.pokes = [];
      play('dizzy');
      say('Okay okay, I’m dizzy 😵‍💫', 2600);
      return;
    }
    play(pick(POKE_REACTIONS));
    say(pick(QUIPS), 2600);
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    st.current.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const s = st.current;
    if (!s.down || !roam) return;
    const moved = Math.hypot(e.clientX - s.down.x, e.clientY - s.down.y);
    if (!s.held && moved > 6) {
      s.held = true;
      s.action = null;
      say('Whoa! Put me down! 😳', 2000);
    }
    if (s.held) {
      const sr = stageRef.current!.getBoundingClientRect();
      s.x = s.targetX = clamp(e.clientX - (sr.left + sr.width / 2), -s.range, s.range);
      s.lift = clamp(s.down.y - e.clientY + 10, 10, 120);
    }
  };
  const onPointerUp = () => {
    const s = st.current;
    if (s.held) {
      s.held = false;
      s.drop = { start: performance.now(), from: -s.lift };
      say(pick(['Wheee!', 'Nailed the landing!', 'Again! Again!']), 1800);
    } else if (s.down) poke();
    s.down = null;
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); }
  };

  const vis = sleeping ? 'sleep' : mood;
  const happyEyes = mood === 'happy';
  const bigEyes = mood === 'puppy';

  return (
    <div ref={stageRef} className={['sb-stage', compact && 'is-compact', className].filter(Boolean).join(' ')}>
      <div ref={botRef} className="sb-bot">
        {bubble && <div key={bubble.id} className="sb-bubble" role="status">{bubble.text}</div>}
        {sleeping && <div className="sb-zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></div>}
        <svg
          ref={svgRef}
          viewBox="-100 -230 200 240"
          className={`sb-svg mood-${vis}`}
          role="button"
          tabIndex={0}
          aria-label={roam ? 'SAGE-E the robot. Click to poke him, drag to pick him up.' : 'SAGE-E the robot. Click to poke him.'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <defs>
            <clipPath id={`lensL${uid}`}><circle cx="-27" cy="-151" r="14" /></clipPath>
            <clipPath id={`lensR${uid}`}><circle cx="27" cy="-151" r="14" /></clipPath>
            <pattern id={`haz${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
              <rect width="8" height="8" className="sb-haz-a" /><rect width="4" height="8" className="sb-haz-b" />
            </pattern>
            <radialGradient id={`glow${uid}`}>
              <stop offset="0" stopColor="#ffc66d" stopOpacity=".55" />
              <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
            </radialGradient>
          </defs>

          <ellipse ref={shadowRef} className="sb-shadow" cx="0" cy="1" rx="52" ry="7" />
          <circle className="sb-aura" cx="0" cy="-110" r="105" fill={`url(#glow${uid})`} />

          <g ref={rootRef}>
            {/* legs */}
            {[legLRef, legRRef].map((r, i) => (
              <g key={i} ref={r} transform={`translate(${i ? 20 : -20} -31)`}>
                <rect className="sb-metal" x="-6" y="-2" width="12" height="22" rx="4" />
                <circle className="sb-joint" cx="0" cy="8" r="4" />
                <rect className="sb-foot" x="-15" y="19" width="30" height="12" rx="5" />
              </g>
            ))}

            <g ref={bodyRef}>
              {/* neck */}
              <rect className="sb-metal" x="-5" y="-134" width="10" height="26" rx="4" />
              <circle className="sb-joint" cx="0" cy="-118" r="5" />

              {/* torso */}
              <rect className="sb-shell" x="-50" y="-114" width="100" height="86" rx="12" />
              <rect className="sb-shade" x="-50" y="-114" width="16" height="86" rx="10" />
              <circle className="sb-rust" cx="34" cy="-50" r="6" />
              <circle className="sb-rust" cx="-30" cy="-104" r="4" />
              <circle className="sb-rust" cx="40" cy="-104" r="3" />
              <rect className="sb-screen" x="-31" y="-102" width="62" height="42" rx="7" />
              <ScreenFace mood={vis} />
              <text className="sb-label" x="0" y="-41" textAnchor="middle">SAGE-<tspan className="sb-label-e">E</tspan></text>
              <rect className="sb-slot" x="-24" y="-36" width="48" height="3" rx="1.5" />

              {/* arms (in front of torso) */}
              {[armLRef, armRRef].map((r, i) => (
                <g key={i} ref={r} transform={`translate(${i ? 50 : -50} -98)`}>
                  <circle className="sb-joint" cx="0" cy="0" r="6" />
                  <rect x="-6" y="0" width="12" height="32" rx="5" fill={`url(#haz${uid})`} className="sb-arm" />
                  <rect className="sb-metal" x="-8" y="30" width="7" height="12" rx="2.5" />
                  <rect className="sb-metal" x="1" y="30" width="7" height="12" rx="2.5" />
                </g>
              ))}

              {/* head */}
              <g ref={headRef}>
                <line className="sb-wire" x1="6" y1="-170" x2="14" y2="-194" />
                <circle className="sb-bulb" cx="14" cy="-197" r="4.5" />
                <rect className="sb-shell" x="-52" y="-171" width="50" height="40" rx="15" />
                <rect className="sb-shell" x="2" y="-171" width="50" height="40" rx="15" />
                <rect className="sb-metal" x="-4" y="-160" width="8" height="16" rx="3" />
                {(['L', 'R'] as const).map((side) => {
                  const cx = side === 'L' ? -27 : 27;
                  return (
                    <g key={side}>
                      <circle className="sb-lens" cx={cx} cy="-151" r="15" />
                      <g clipPath={`url(#lens${side}${uid})`}>
                        <circle className="sb-iris" cx={cx} cy="-151" r="10.5" />
                        {happyEyes ? (
                          <path className="sb-happy" d={`M ${cx - 9} -147 Q ${cx} -160 ${cx + 9} -147`} />
                        ) : (
                          <g ref={side === 'L' ? pupilLRef : pupilRRef}>
                            <circle className="sb-pupil" cx={cx} cy="-151" r={bigEyes ? 8.5 : 6.5} />
                            <circle className="sb-shine" cx={cx + 3} cy="-155" r={bigEyes ? 3 : 2.2} />
                            {bigEyes && <circle className="sb-shine" cx={cx - 3} cy="-147" r="1.4" />}
                          </g>
                        )}
                        <rect ref={side === 'L' ? lidLRef : lidRRef} className="sb-lid" x={cx - 15} y="-166" width="30" height="0" />
                      </g>
                      <circle className="sb-lens-rim" cx={cx} cy="-151" r="15" />
                    </g>
                  );
                })}
                <rect ref={browLRef} className="sb-brow" x="-50" y="-180" width="46" height="7" rx="3" />
                <rect ref={browRRef} className="sb-brow" x="4" y="-180" width="46" height="7" rx="3" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
});

/** What the chest screen shows for each mood. */
function ScreenFace({ mood }: { mood: string }) {
  switch (mood) {
    case 'thinking':
      return (
        <g className="sb-dots">
          <circle cx="-14" cy="-81" r="4" /><circle cx="0" cy="-81" r="4" /><circle cx="14" cy="-81" r="4" />
        </g>
      );
    case 'talking':
      return (
        <g className="sb-bars">
          {[-20, -10, 0, 10, 20].map((x) => <rect key={x} x={x - 3} y="-94" width="6" height="26" rx="3" />)}
        </g>
      );
    case 'happy':
    case 'puppy':
      return <path className="sb-heart" d="M0 -68 C -18 -80 -16 -96 -6 -95 C -2 -95 0 -91 0 -89 C 0 -91 2 -95 6 -95 C 16 -96 18 -80 0 -68 Z" />;
    case 'listening':
      return (
        <g className="sb-ears">
          {[-12, 0, 12].map((x) => <circle key={x} cx={x} cy="-81" r="3" />)}
        </g>
      );
    case 'sleep':
      return <text className="sb-screen-text" x="0" y="-75" textAnchor="middle">z z z</text>;
    default:
      return <polyline className="sb-pulse" points="-26,-81 -12,-81 -7,-91 -1,-71 5,-86 9,-81 26,-81" />;
  }
}

export default SageBot;
