import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import './sagebot.css';
import { createSageModel, type SageModel } from './sageModel3d';
import { sfx, type VoiceKind } from './sound';

/**
 * SAGE-E: a procedurally built three.js robot (see sageModel3d.ts) with a tiny skeleton
 * (root, body, head, arms, legs, pupils, eyelids, brows). One requestAnimationFrame loop
 * poses the skeleton and renders every frame, so nothing re-renders in React while he moves.
 *
 *   pose = idle breathing + mood + gaze (cursor) + walking + one-shot action
 *        + scripted "adventure" (run away / climb the chat box / hang off the sound button)
 *        + drag/drop
 */

export type BotMood = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy' | 'puppy';
export type BotAction =
  | 'wave' | 'dance' | 'hop' | 'spin' | 'nod' | 'shake' | 'lookAround'
  | 'celebrate' | 'dizzy' | 'present' | 'giggle' | 'stretch'
  | 'startle' | 'yawn' | 'dodge';

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
  /** Wander along the ledge, fall asleep when ignored, can be picked up, goes on adventures. */
  roam?: boolean;
  reducedMotion?: boolean;
  /** Stop the animation loop (e.g. while covered by a page). */
  paused?: boolean;
  /** Where to look while `mood === 'listening'` (e.g. the text box). */
  lookAt?: () => DOMRect | null | undefined;
  /** The sound button he hangs off to beg for an unmute. */
  hangTarget?: () => DOMRect | null | undefined;
  /** The box under his ledge that he climbs down the side of. */
  climbSurface?: () => DOMRect | null | undefined;
  className?: string;
}

const DUR: Record<BotAction, number> = {
  wave: 1700, dance: 3400, hop: 700, spin: 1100, nod: 900, shake: 900, lookAround: 2600,
  celebrate: 2200, dizzy: 2400, present: 1400, giggle: 900, stretch: 1900,
  startle: 1000, yawn: 2400, dodge: 650,
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
const WAKE_STARTLED = ['WHA—?! I’m up! I’m up!', 'I wasn’t sleeping, YOU were! 😤', 'Huh?! Who touched the mouse?!'];
const WAKE_CALM = ['*yaaawn* …five more minutes.', 'I am not sleeping. You are. 😴', 'Just… defragmenting my thoughts… *yawn*'];
const DODGE_LINES = ['Nope! Can’t catch me! 😜', 'Too slow! 😆', 'Hey! Personal space!', 'Hehe, missed me!'];
const RUN_LINES = ['That’s it. I’m out. Bye! 😤', 'Nope. Nope nope nope. Bye! 😤', 'I’m telling Sagar! Bye! 😤'];
const BACK_LINES = ['…Fine. I forgive you. This time. 😒', 'I’m back. I forgive you… this time.', 'Okay, I missed you. Don’t do it again. 😒'];
const CLIMB_LINES = ['Time for some parkour! 🧗', 'Going on an adventure!', 'Watch this!'];
const SLIP_LINES = ['Uh oh…', 'Wait wait wait—', 'Hmm, slippery…'];
const CRASH_LINES = ['Oof! 💥 I meant to do that.', 'Ow. Nailed it… mostly.', 'Rust 1, SAGE-E 0.'];
const TOP_LINES = ['Made it! 💪', 'And he sticks the landing!', 'Ta-da! 🎉'];
const NAG_LINES = ['Psst! Click this! I wanna make noises! 🔊', 'Unmute me! I have SO much to say! 🔊', 'Click it! Pleeease? 🔊'];
const YAY_LINES = ['Yay! Can you hear me now? 🎶', 'Beep boop! Sound ON! 🎉'];
const FAST_LINES = ['Whoa, slow down! My heart rate! 💓', 'Easy there, speedy! 😵', 'Zoom zoom! My pulse can’t keep up!'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (q: number) => (q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2);
/** 0 → 1 → 0 envelope with soft edges, so actions blend in and out. */
const env = (p: number, edge = 0.15) => clamp(Math.min(p / edge, (1 - p) / edge), 0, 1);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

function inferVoice(text: string): VoiceKind {
  if (/😤|That’s it|Nope|Grr/i.test(text)) return 'angry';
  if (/WHA|😳|Whoa|Uh oh|Wait wait|Oof/i.test(text)) return 'startled';
  if (/yawn|😴/i.test(text)) return 'yawn';
  if (/😒|forgive|dizzy/i.test(text)) return 'sad';
  if (/\?\s*\S{0,3}$/.test(text)) return 'question';
  if (/!|🎉|😊|😆|👋|✅|💪/.test(text)) return 'happy';
  return 'chatter';
}

interface Pose {
  x: number; y: number; sx: number; sy: number; body: number;
  head: number; hx: number; hy: number;
  armL: number; armR: number; legL: number; legR: number;
  px: number; py: number; eye: number; smile: number; yaw: number;
  browL: number; browR: number; browY: number;
}

type Mode =
  | { kind: 'away'; step: 'run' | 'gone' | 'back'; t0: number; side: number }
  | { kind: 'climb'; step: 'approach' | 'over' | 'down' | 'wave' | 'slip' | 'fall' | 'crash' | 'up' | 'overback'; t0: number; side: number; depth: number; floor: number; fromX: number; v: number; crashed: boolean }
  | { kind: 'hang'; step: 'crouch' | 'leap' | 'hang' | 'drop'; t0: number; k: number; fromOx: number; fromOy: number; nagAt: number; happy: boolean };

/** Hands height above the bottom of the hit box with arms straight up, in model units. */
const HAND_UNITS = 159;

export const SageBot = forwardRef<SageBotHandle, Props>(function SageBot(
  { mood, compact = false, roam = false, reducedMotion = false, paused = false, lookAt, hangTarget, climbSurface, className },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<SageModel | null>(null);

  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const [hanging, setHanging] = useState(false);
  const bubbleTimer = useRef(0);

  // Everything the loop needs, kept out of React state.
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const lookAtRef = useRef(lookAt);
  lookAtRef.current = lookAt;
  const hangRef = useRef(hangTarget);
  hangRef.current = hangTarget;
  const climbRef = useRef(climbSurface);
  climbRef.current = climbSurface;

  const st = useRef({
    x: 0, targetX: 0, dir: 1, walkPhase: 0, yaw: -0.32, speed: 70, stepSign: 0,
    action: null as null | { name: BotAction; start: number; dur: number },
    nextTrick: performance.now() + 4500,
    blinkAt: performance.now() + 1800, blinkStart: -1,
    gx: 0, gy: 0,
    pointer: null as null | { x: number; y: number; t: number },
    excite: 0, nextFastLine: 0,
    lastActive: performance.now(), asleep: false,
    down: null as null | { x: number; y: number; t: number },
    held: false, lift: 0,
    drop: null as null | { start: number; from: number },
    pokes: [] as number[], annoy: [] as number[],
    dodges: [] as number[], dodgeDir: 1, nextDodge: 0, nextDodgeLine: 0,
    range: 0,
    mode: null as Mode | null,
    nextAdventure: performance.now() + 30000,
    nextNag: performance.now() + 22000, nags: 0,
    ox: 0, oy: 0, k: 1, alpha: 1,
  });

  const say = (text: string, ms = 3400, voice?: VoiceKind) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble({ id: Date.now(), text });
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
    sfx.voice(voice ?? inferVoice(text), true);
  };
  const play = (name: BotAction) => {
    const s = st.current;
    if (reducedMotion && name !== 'nod' && name !== 'present') return;
    s.action = { name, start: performance.now(), dur: DUR[name] };
    s.lastActive = performance.now();
    if (name === 'hop') sfx.boing();
    else if (name === 'giggle') sfx.voice('giggle');
    else if (name === 'dizzy') sfx.voice('sad');
    else if (name !== 'nod' && name !== 'lookAround' && name !== 'yawn') sfx.whir(Math.min(0.7, DUR[name] / 2000));
  };
  const wake = () => {
    const s = st.current;
    s.lastActive = performance.now();
    if (!s.asleep) return;
    s.asleep = false;
    setSleeping(false);
    if (Math.random() < 0.5) {
      play('startle');
      modelRef.current?.showFlash('alert', 1000);
      say(pick(WAKE_STARTLED), 2600, 'startled');
    } else {
      play('yawn');
      modelRef.current?.showFlash('yawn', 2300);
      say(pick(WAKE_CALM), 3000, 'yawn');
    }
  };

  useImperativeHandle(ref, () => ({
    play: (a) => { wake(); play(a); },
    say: (t, ms) => { wake(); say(t, ms); },
    walkTo: (pos) => { if (!st.current.mode) st.current.targetX = clamp(pos, -1, 1) * st.current.range; },
  }));

  useEffect(() => () => {
    window.clearTimeout(bubbleTimer.current);
    document.documentElement.classList.remove('sage-hanging');
    sfx.servo(false);
  }, []);

  // Track the cursor everywhere on the page (eyes follow it, fast moves raise his pulse).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = st.current, now = performance.now();
      if (s.pointer) {
        const ms = Math.max(4, now - s.pointer.t);
        const v = Math.hypot(e.clientX - s.pointer.x, e.clientY - s.pointer.y) / ms; // px per ms
        s.excite = Math.min(1.4, s.excite + Math.max(0, v - 1.3) * 0.035);
      }
      s.pointer = { x: e.clientX, y: e.clientY, t: now };
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
      if (!st.current.mode) st.current.targetX = clamp(st.current.targetX, -st.current.range, st.current.range);
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // ---- three.js model lifecycle ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let model: SageModel;
    try { model = createSageModel(canvas); } catch { return; } // no WebGL: stay invisible but clickable
    modelRef.current = model;
    const ro = new ResizeObserver(([e]) => {
      model.resize(e.contentRect.width, e.contentRect.height);
      model.render();
    });
    ro.observe(canvas);
    return () => { ro.disconnect(); modelRef.current = null; model.dispose(); };
  }, []);

  useEffect(() => { modelRef.current?.setMood(sleeping ? 'sleep' : mood); }, [mood, sleeping]);

  // ---- adventures ------------------------------------------------------------
  const geometry = () => {
    const stage = stageRef.current!, bot = botRef.current!;
    const sr = stage.getBoundingClientRect();
    return { sr, stageW: sr.width, botW: bot.offsetWidth, u: bot.offsetWidth / 200 };
  };

  const startAway = () => {
    const s = st.current;
    s.action = null;
    const side = s.x >= 0 ? 1 : -1;
    s.mode = { kind: 'away', step: 'run', t0: performance.now(), side };
    const { stageW, botW } = geometry();
    s.targetX = side * (stageW / 2 + botW * 1.3);
    s.speed = 260;
    modelRef.current?.showFlash('angry', 1600);
    say(pick(RUN_LINES), 2200, 'angry');
  };

  const canClimb = () => {
    const chat = climbRef.current?.(), home = stageRef.current?.closest('.home')?.getBoundingClientRect();
    if (!chat || !home || !botRef.current) return false;
    const u = botRef.current.offsetWidth / 200;
    return Math.min(chat.left - home.left, home.right - chat.right) > 100 * u && chat.height > 200;
  };

  const startClimb = () => {
    const s = st.current;
    const chat = climbRef.current?.();
    if (!chat) return;
    const { sr } = geometry();
    const floor = Math.max(120, chat.bottom - sr.bottom - 6);
    const side = Math.random() < 0.5 ? -1 : 1;
    s.mode = { kind: 'climb', step: 'approach', t0: performance.now(), side, depth: Math.min(floor * 0.5, 240), floor, fromX: 0, v: 0, crashed: false };
    s.targetX = side * s.range;
    s.speed = 90;
    say(pick(CLIMB_LINES), 2200, 'happy');
  };

  const startHang = () => {
    const s = st.current;
    s.action = null;
    s.nags += 1;
    s.mode = { kind: 'hang', step: 'crouch', t0: performance.now(), k: 0.5, fromOx: 0, fromOy: 0, nagAt: 0, happy: false };
  };

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
      const calm = m === 'idle' && !s.held && !s.drop && !s.mode;
      s.excite *= Math.exp(-dt * 0.7);

      // Fall asleep when nobody has touched anything for a while.
      if (roam && calm && !s.asleep && !reducedMotion && now - s.lastActive > 30000) {
        s.asleep = true;
        s.action = null;
        setSleeping(true);
      }

      // Moving the mouse like crazy gets his heart racing.
      if (calm && !s.asleep && s.excite > 1 && now > s.nextFastLine) {
        s.nextFastLine = now + 25000;
        play('startle');
        say(pick(FAST_LINES), 2400, 'startled');
      }

      // Idle tricks, strolls and adventures.
      if (calm && !s.asleep && !s.action && !reducedMotion && now > s.nextTrick) {
        s.nextTrick = now + 5000 + Math.random() * 5000;
        if (roam && sfx.muted && s.nags < 3 && now > s.nextNag && hangRef.current?.()) {
          s.nextNag = now + 70000 + Math.random() * 40000;
          startHang();
        } else if (roam && now > s.nextAdventure && canClimb()) {
          s.nextAdventure = now + 60000 + Math.random() * 50000;
          startClimb();
        } else if (roam && Math.random() < 0.4) s.targetX = (Math.random() * 2 - 1) * s.range;
        else play(pick(IDLE_TRICKS));
      }

      // Walking.
      const dist = s.targetX - s.x;
      const mayWalk = roam && !s.held && !s.asleep && (!s.mode || s.mode.kind === 'away' || (s.mode.kind === 'climb' && s.mode.step === 'approach'));
      const walking = mayWalk && Math.abs(dist) > 2 && (!s.action || s.action.name === 'lookAround' || s.action.name === 'dodge');
      if (walking) {
        s.dir = Math.sign(dist);
        s.x += s.dir * Math.min(Math.abs(dist), s.speed * dt);
        s.walkPhase += dt * 11 * (s.speed / 70) ** 0.6;
      } else if (!s.mode) s.speed = 70;

      // ---- gaze target ----
      let tx = 0, ty = 0.1;
      const botEl = botRef.current;
      const r = botEl?.getBoundingClientRect();
      const headX = r ? r.left + r.width / 2 : 0;
      const headY = r ? r.top + r.height * (80 / 240) : 0;
      const lookPoint = (px: number, py: number) => {
        const dx = px - headX, dy = py - headY;
        tx = dx / (Math.abs(dx) + 160);
        ty = dy / (Math.abs(dy) + 160);
      };
      const act = s.action;
      const p = act ? (now - act.start) / act.dur : 0;
      if (act && act.name === 'lookAround') { tx = Math.sin(p * Math.PI * 2) * 0.95; ty = -0.25; }
      else if (s.asleep) { tx = 0; ty = 0.5; }
      else if (s.mode?.kind === 'hang') { tx = 0; ty = -0.8; }
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
        px: s.gx * 7, py: s.gy * 5, eye: 1, smile: 0.35, yaw: 0, browL: 0, browR: 0, browY: 0,
      };

      // ---- mood ----
      switch (m) {
        case 'thinking':
          P.head += 9; P.armR = 120 + Math.sin(t * 3) * 6; P.browR = 8; P.browY = -2; P.eye = 0.8; P.smile = 0.15; break;
        case 'talking':
          P.hy += Math.sin(t * 15) * 0.9; P.armR = 30 + Math.sin(t * 3.2) * 22; P.armL = 14 + Math.sin(t * 2.3) * 10; P.browY = -2; break;
        case 'happy':
          P.smile = 1; P.y -= Math.abs(Math.sin(t * 4.5)) * 4; P.armL = 40 + Math.sin(t * 4.5) * 14; P.armR = 40 - Math.sin(t * 4.5) * 14; P.browY = -4; break;
        case 'puppy':
          P.smile = 0.1; P.head += 13 + Math.sin(t * 1.4) * 2; P.browL = -16; P.browR = 16; P.browY = -3; P.armL = 25; P.armR = 25; P.body += Math.sin(t * 1.4) * 2; break;
        case 'listening':
          P.body += 4; P.head += 7; P.browY = -2; break;
      }
      if (s.asleep) {
        P.smile = 0; P.eye = 0.04; P.head = 15; P.hy = 4; P.y = Math.sin(t * 1.2) * 1.8; P.armL = 4; P.armR = 4; P.body = 2;
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
              P.smile = lerp(P.smile, 0.8, e); P.armR = lerp(P.armR, 150 + Math.sin(p * Math.PI * 9) * 24, e); P.head += 6 * e; P.body -= 3 * e; P.browY -= 3 * e; break;
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
              P.yaw += p * Math.PI * 2; P.y -= Math.sin(p * Math.PI) * 18; P.armL += 50 * e; P.armR += 50 * e; break;
            case 'nod':
              P.hy += Math.sin(p * Math.PI * 4) * 4 * e; P.head += Math.sin(p * Math.PI * 4) * 3 * e; break;
            case 'shake':
              P.head += Math.sin(p * Math.PI * 6) * 16 * (1 - p); P.browL = -6; P.browR = 6; break;
            case 'lookAround':
              P.head += s.gx * 6; break;
            case 'celebrate':
              P.smile = lerp(P.smile, 1, e); P.armL = lerp(P.armL, 160, e); P.armR = lerp(P.armR, 160, e);
              P.y -= Math.abs(Math.sin(p * Math.PI * 3)) * 26; P.body += Math.sin(p * Math.PI * 6) * 4; P.browY -= 4 * e; break;
            case 'dizzy':
              P.smile = 0; P.head += Math.sin(p * Math.PI * 10) * 12 * (1 - p * 0.5); P.body += Math.sin(p * Math.PI * 5) * 5 * e;
              P.px = Math.cos(t * 13) * 6; P.py = Math.sin(t * 13) * 5; break;
            case 'present':
              P.armR = lerp(P.armR, 98, e); P.armL = lerp(P.armL, 30, e); P.body += 4 * e; P.head -= 6 * e; P.y -= Math.sin(p * Math.PI) * 6; P.browY -= 3 * e; break;
            case 'giggle':
              P.body += Math.sin(p * Math.PI * 16) * 4 * (1 - p); P.y -= Math.abs(Math.sin(p * Math.PI * 8)) * 3; P.eye *= 1 - 0.3 * e; P.smile = lerp(P.smile, 1.1, e); P.armL += 20 * e; P.armR += 20 * e; break;
            case 'stretch':
              P.armL = lerp(P.armL, 168, e); P.armR = lerp(P.armR, 168, e); P.sy *= 1 + 0.07 * e; P.eye *= 1 - 0.7 * e; P.head -= 4 * e; break;
            case 'startle': { // jolt upright: jump, flail, eyes wide
              const j = p < 0.45 ? Math.sin((p / 0.45) * Math.PI) : 0;
              P.y -= j * 55; P.sy *= 1 + 0.08 * j;
              P.armL = lerp(P.armL, 140 + Math.sin(t * 30) * 25, e); P.armR = lerp(P.armR, 140 - Math.sin(t * 30) * 25, e);
              P.legL += Math.sin(t * 28) * 18 * j; P.legR -= Math.sin(t * 28) * 18 * j;
              P.eye = lerp(P.eye, 1.3, e); P.smile = 0; P.browY -= 7 * e; P.px = 0; P.py = 0; break;
            }
            case 'yawn': { // slow stretch with sleepy eyes and head back
              const y2 = Math.sin(clamp(p * 1.2, 0, 1) * Math.PI);
              P.armL = lerp(P.armL, 165, y2); P.armR = lerp(P.armR, 165, y2);
              P.sy *= 1 + 0.08 * y2; P.hy -= 5 * y2; P.head -= 6 * y2;
              P.eye = lerp(0.5, 0.2, y2); P.smile = 0; P.browY += 2 * y2;
              P.body += Math.sin(p * Math.PI * 2) * 3; break;
            }
            case 'dodge':
              P.body += s.dodgeDir * 16 * e; P.hy += 6 * e; P.head += s.dodgeDir * 8 * e;
              P.armL = lerp(P.armL, 60, e); P.armR = lerp(P.armR, 60, e);
              P.eye = lerp(P.eye, 1.2, e); P.smile = lerp(P.smile, 0.2, e); P.browY -= 4 * e; break;
          }
        }
      }

      // ---- adventures ----
      let yawTarget = walking ? s.dir * 1.15 : s.held ? 0 : -0.32 + s.gx * 0.15;
      let climbing = false;
      const md = s.mode;
      if (md && botEl) {
        const g = geometry();
        const q = (now - md.t0) / 1000;
        const climbPose = (speed: number) => {
          climbing = true;
          s.walkPhase += dt * speed;
          const w = Math.sin(s.walkPhase);
          P.armL = 145 + w * 28; P.armR = 145 - w * 28;
          P.legL = w * 32; P.legR = -w * 32;
          P.y = -Math.abs(w) * 2; P.body = 0; P.head = 0; P.hx = 0; P.smile = 0.5;
        };
        if (md.kind === 'away') {
          const edge = g.stageW / 2 + g.botW * 1.3;
          s.alpha = clamp((edge - Math.abs(s.x)) / (g.botW * 0.8), 0, 1);
          if (md.step !== 'gone') {
            P.armL = 70 + Math.sin(t * 22) * 45; P.armR = 70 - Math.sin(t * 22) * 45;
            P.browL = md.step === 'run' ? -12 : 0; P.browR = -P.browL; P.smile = md.step === 'run' ? 0 : 0.2;
          }
          if (md.step === 'run' && Math.abs(s.targetX - s.x) < 3) { md.step = 'gone'; md.t0 = now; }
          else if (md.step === 'gone' && q > 4.5) {
            md.step = 'back'; md.t0 = now; s.speed = 55;
            s.targetX = md.side * s.range * 0.4;
          } else if (md.step === 'back' && Math.abs(s.targetX - s.x) < 3) {
            s.mode = null; s.alpha = 1;
            play('nod');
            say(pick(BACK_LINES), 3400, 'sad');
          }
        } else if (md.kind === 'climb') {
          const wallX = md.side * (g.stageW / 2 + 46 * g.u);
          const faceWall = -md.side * 1.45;
          const setStep = (st2: typeof md.step) => { md.step = st2; md.t0 = now; };
          switch (md.step) {
            case 'approach':
              if (Math.abs(s.targetX - s.x) < 3) { md.fromX = s.x; setStep('over'); sfx.boing(); }
              break;
            case 'over': { // hop off the ledge and grab the wall
              const e = clamp(q / 0.7, 0, 1);
              s.x = lerp(md.fromX, wallX, ease(e));
              s.oy = -Math.sin(e * Math.PI) * 30 + e * e * 50;
              yawTarget = faceWall;
              P.armL = P.armR = 150; P.legL = -20; P.legR = 20;
              if (e >= 1) setStep('down');
              break;
            }
            case 'down':
              yawTarget = faceWall; climbPose(7);
              s.oy += 42 * dt;
              if (s.oy >= md.depth) {
                if (Math.random() < 0.5) { setStep('slip'); say(pick(SLIP_LINES), 1600, 'startled'); }
                else { setStep('wave'); say('Hiii! 👋 Look at me!', 1800, 'happy'); }
              }
              break;
            case 'wave': // hang on with one claw, wave with the other
              yawTarget = -md.side * 0.5;
              P.armL = md.side < 0 ? 150 : 160 + Math.sin(t * 14) * 25;
              P.armR = md.side < 0 ? 160 + Math.sin(t * 14) * 25 : 150;
              P.legL = Math.sin(t * 5) * 20; P.legR = -P.legL; P.smile = 1;
              if (q > 1.8) setStep('up');
              break;
            case 'slip':
              yawTarget = faceWall;
              P.armL = P.armR = 150; P.body = Math.sin(t * 40) * 3; P.eye = 1.25; P.smile = 0;
              if (q > 0.9) { setStep('fall'); md.v = 0; }
              break;
            case 'fall':
              yawTarget = 0;
              md.v += 1500 * dt;
              s.oy = Math.min(md.floor, s.oy + md.v * dt);
              P.armL = 150 + Math.sin(t * 26) * 30; P.armR = 150 - Math.sin(t * 26) * 30;
              P.legL = Math.sin(t * 22) * 25; P.legR = -P.legL; P.eye = 1.3; P.smile = 0; P.browY = -6;
              if (s.oy >= md.floor) {
                setStep('crash'); md.crashed = true;
                sfx.thud();
                say(pick(CRASH_LINES), 2600, 'sad');
                s.action = { name: 'dizzy', start: now, dur: DUR.dizzy };
              }
              break;
            case 'crash': {
              yawTarget = 0;
              const sq = Math.sin(clamp(q / 0.35, 0, 1) * Math.PI) * (1 - clamp(q / 0.35, 0, 1));
              P.sy *= 1 - 0.25 * sq; P.sx *= 1 + 0.18 * sq;
              if (q > 2.4) setStep('up');
              break;
            }
            case 'up':
              yawTarget = faceWall; climbPose(md.crashed ? 10 : 8);
              s.oy -= (md.crashed ? 75 : 50) * dt;
              if (s.oy <= 50) { md.fromX = s.x; setStep('overback'); sfx.boing(); }
              break;
            case 'overback': { // pull up onto the ledge
              const e = clamp(q / 0.7, 0, 1);
              const to = md.side * s.range;
              s.x = lerp(md.fromX, to, ease(e));
              s.oy = lerp(50, 0, e) - Math.sin(e * Math.PI) * 45;
              yawTarget = -md.side * 1.1;
              P.armL = P.armR = 150 - e * 100;
              if (e >= 1) {
                s.oy = 0; s.targetX = s.x; s.mode = null; s.speed = 70;
                s.drop = { start: now, from: 0 };
                sfx.step();
                play('celebrate');
                say(pick(TOP_LINES), 2400, 'happy');
              }
              break;
            }
          }
        } else if (md.kind === 'hang') {
          const btn = hangRef.current?.();
          // Where (ox, oy, scale k) puts his claws right under the button.
          const tgt = btn
            ? { ox: btn.left + btn.width / 2 - (g.sr.left + g.stageW / 2) - s.x, oy: btn.bottom + 2 - g.sr.bottom + HAND_UNITS * g.u * md.k }
            : null;
          const end = (why: 'yay' | 'bored' | 'lost') => {
            md.step = 'drop'; md.t0 = now; md.fromOx = s.ox; md.fromOy = s.oy;
            if (why === 'yay') { modelRef.current?.showFlash('sound', 2000); say(pick(YAY_LINES), 2600, 'happy'); }
            else if (why === 'bored') say('Fine… I’ll stay quiet. 🤐', 2200, 'sad');
          };
          switch (md.step) {
            case 'crouch':
              P.sy *= 1 - 0.12 * Math.sin(clamp(q / 0.4, 0, 1) * Math.PI); P.armL = P.armR = 40;
              if (!tgt) { s.mode = null; break; }
              if (q > 0.4) {
                md.step = 'leap'; md.t0 = now;
                document.documentElement.classList.add('sage-hanging');
                setHanging(true);
                sfx.boing(); sfx.whir(0.8);
              }
              break;
            case 'leap': {
              if (!tgt) { end('lost'); break; }
              const e = clamp(q / 0.9, 0, 1);
              s.ox = lerp(0, tgt.ox, ease(e));
              s.oy = lerp(0, tgt.oy, ease(e)) - Math.sin(e * Math.PI) * 80;
              s.k = lerp(1, md.k, ease(e));
              P.yaw += e * Math.PI * 2;
              P.armL = P.armR = lerp(60, 172, e); P.legL = -20 * e; P.legR = 20 * e;
              if (e >= 1) {
                md.step = 'hang'; md.t0 = now; md.nagAt = now;
                modelRef.current?.showFlash('sound', 60000);
              }
              break;
            }
            case 'hang':
              if (!tgt) { end('lost'); break; }
              s.ox = tgt.ox; s.oy = tgt.oy; s.k = md.k;
              yawTarget = 0;
              P.armL = P.armR = 172; P.body = Math.sin(t * 2.6) * 9;
              P.legL = Math.sin(t * 5.2) * 22; P.legR = -P.legL; P.smile = 0.8; P.browY = -3;
              if (now >= md.nagAt) { md.nagAt = now + 4200; say(pick(NAG_LINES), 3800, 'question'); }
              if (!sfx.muted) end('yay');
              else if (q > 11) end('bored');
              break;
            case 'drop': {
              const e = clamp(q / 0.8, 0, 1);
              s.ox = lerp(md.fromOx, 0, e);
              s.oy = lerp(md.fromOy, 0, e * e) - Math.sin(e * Math.PI) * 40;
              s.k = lerp(md.k, 1, e);
              P.armL = P.armR = lerp(170, 60, e); P.legL = -15; P.legR = 15;
              if (e >= 1) {
                s.ox = s.oy = 0; s.k = 1; s.mode = null;
                modelRef.current?.showFlash('sound', 0);
                document.documentElement.classList.remove('sage-hanging');
                setHanging(false);
                s.drop = { start: now, from: 0 };
                sfx.thud();
                if (!sfx.muted) play('celebrate');
              }
              break;
            }
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

      // ---- turn to face where he's going, otherwise a friendly 3/4 view ----
      s.yaw = lerp(s.yaw, yawTarget, 1 - Math.exp(-dt * 6));
      P.yaw += s.yaw;

      // ---- sounds of moving parts ----
      const moving = walking || climbing;
      sfx.servo(moving, s.speed / 70);
      const sign = Math.sign(Math.sin(s.walkPhase));
      if (moving && sign !== s.stepSign) sfx.step();
      s.stepSign = sign;

      // ---- write the skeleton ----
      if (botEl) {
        botEl.style.transform = `translate(${(P.x + s.ox).toFixed(1)}px, ${s.oy.toFixed(1)}px) scale(${s.k.toFixed(3)})`;
        botEl.style.opacity = s.alpha < 1 ? s.alpha.toFixed(2) : '';
        botEl.style.setProperty('--inv', (1 / s.k).toFixed(3));
      }
      const model = modelRef.current;
      if (model) {
        model.setPulse(s.asleep ? 0 : s.excite);
        model.apply({ ...P, gx: s.gx, gy: s.gy }, t);
        model.render();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); sfx.servo(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, roam, reducedMotion]);

  // ---- poke / drag / dodge ----------------------------------------------------
  const poke = () => {
    const s = st.current;
    const now = performance.now();
    wake();
    sfx.boing();
    if (roam && !reducedMotion && !s.mode) {
      s.annoy = s.annoy.filter((p) => now - p < 9000).concat(now);
      if (s.annoy.length >= 7) { s.annoy = []; s.pokes = []; startAway(); return; }
    }
    s.pokes = s.pokes.filter((p) => now - p < 2500).concat(now);
    if (s.pokes.length >= 4) {
      s.pokes = [];
      play('dizzy');
      say('Okay okay, I’m dizzy 😵‍💫', 2600, 'sad');
      return;
    }
    play(pick(POKE_REACTIONS));
    say(pick(QUIPS), 2600);
  };

  /** Mouse wanders onto him → he ducks and scoots out of the way (most of the time). */
  const onPointerEnter = (e: RPointerEvent<HTMLDivElement>) => {
    const s = st.current, now = performance.now();
    if (e.pointerType !== 'mouse' || !roam || reducedMotion || s.mode || s.held || s.asleep || s.down) return;
    if (now < s.nextDodge || Math.random() > 0.75) return;
    s.nextDodge = now + 800;
    const rect = botRef.current!.getBoundingClientRect();
    s.dodgeDir = e.clientX < rect.left + rect.width / 2 ? 1 : -1;
    let to = clamp(s.x + s.dodgeDir * 95, -s.range, s.range);
    if (Math.abs(to - s.x) < 35) { // cornered: hop right past the cursor instead
      s.dodgeDir = -s.dodgeDir;
      to = clamp(s.x + s.dodgeDir * 150, -s.range, s.range);
      play('hop');
    } else play('dodge');
    s.targetX = to;
    s.speed = 210;
    s.dodges = s.dodges.filter((d) => now - d < 6000).concat(now);
    if (s.dodges.length >= 3 && now > s.nextDodgeLine) {
      s.nextDodgeLine = now + 12000;
      say(pick(DODGE_LINES), 2000, 'giggle');
    } else if (Math.random() < 0.5) sfx.voice('giggle');
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    st.current.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.down || !roam || s.mode) return;
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
      window.setTimeout(() => sfx.thud(), 250);
      say(pick(['Wheee!', 'Nailed the landing!', 'Again! Again!']), 1800);
    } else if (s.down) poke();
    s.down = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); }
  };

  const vis = sleeping ? 'sleep' : mood;

  return (
    <div ref={stageRef} className={['sb-stage', compact && 'is-compact', className].filter(Boolean).join(' ')}>
      <div ref={botRef} className={`sb-bot ${hanging ? 'is-hanging' : ''}`}>
        {bubble && <div key={bubble.id} className="sb-bubble" role="status">{bubble.text}</div>}
        {sleeping && <div className="sb-zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></div>}
        <div className="sb-gl" aria-hidden="true"><canvas ref={canvasRef} /></div>
        <div
          className={`sb-hit mood-${vis}`}
          role="button"
          tabIndex={0}
          aria-label={roam ? 'SAGE-E the robot. Click to poke him, drag to pick him up.' : 'SAGE-E the robot. Click to poke him.'}
          onPointerEnter={onPointerEnter}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
});

export default SageBot;
