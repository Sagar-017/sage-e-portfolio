import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import {
  ArrowRight, Briefcase, Download, FileText, FolderOpen, GraduationCap, Heart, Menu, MessageCircle, RotateCcw,
  Send, Sparkles, Trophy, UserRound, Wrench, X,
} from 'lucide-react';
import { SageBot, type BotAction, type BotMood, type SageBotHandle } from './bot/SageBot';
import SectionPage from './pages/SectionPage';
import { answers, detectIntent, jokes, profile, sectionById, sections, type SectionId } from './content';

type Msg = { id: number; role: 'sage' | 'visitor'; text: string; open?: SectionId; invite?: boolean; chips?: string[] };
type Reply = { text: string; action?: BotAction; open?: SectionId; chips?: string[] };

const NAV_ICONS: Record<SectionId, typeof UserRound> = {
  about: UserRound, experience: Briefcase, projects: FolderOpen, achievements: Trophy,
  skills: Wrench, education: GraduationCap, resume: FileText, contact: MessageCircle,
};
const STARTERS = ['Who is Sagar?', 'Show me the numbers', 'What did he build?', 'Make SAGE-E dance 🕺', 'Tell me a QA joke'];
const WELCOME = 'Hi! I’m SAGE-E, Sagar’s slightly rusty career assistant. 👋 Ask me anything about him, or pick a file. Psst… you can poke me, or even pick me up.';

let nextId = 1;
const msg = (m: Omit<Msg, 'id'>): Msg => ({ ...m, id: nextId++ });

function makeReply(text: string): Reply {
  const q = text.toLowerCase();
  if (/\b(dance|boogie|groove|party|moves)\b/.test(q)) return { text: 'You asked for it! 💃 Beep-boop-bop… I call this one “The Regression Shuffle”.', action: 'dance' };
  if (/^(hi|hey|hello|yo|hola|namaste|sup)\b/.test(q)) return { text: 'Hello hello! 👋 Want the short tour? Ask “Who is Sagar?” or open any file on the left.', action: 'wave' };
  if (/joke|funny|laugh/.test(q)) return { text: jokes[Math.floor(Math.random() * jokes.length)], action: 'giggle' };
  if (/\b(bug|defect|broken|crash)\b/.test(q)) return { text: 'A bug?! 🐞 Where?! …Relax. Catching those before you do is literally Sagar’s job.', action: 'shake' };
  if (/\b(spin|flip|twirl)\b/.test(q)) return { text: 'Wheeee! 🌀 Don’t tell anyone I get motion sick.', action: 'spin' };
  if (/\b(jump|hop)\b/.test(q)) return { text: 'Boing! My springs are older than some frameworks.', action: 'hop' };
  if (/thank|awesome|cool|nice|love|great|amazing/.test(q)) return { text: 'Aww, my circuits are blushing. 🥹', action: 'celebrate' };
  if (/who are you|what are you|your name/.test(q)) return { text: 'I’m SAGE-E: Sagar’s portfolio guide, file fetcher and part-time dancer. Mostly rust, entirely enthusiastic.', action: 'wave' };
  const id = detectIntent(text);
  if (id) return { text: answers[id], action: 'present', open: id };
  return {
    text: 'Hmm, that’s not in my files yet. 🤔 I know about Sagar’s experience, projects, results, skills, education, resume, and how to reach him.',
    action: 'lookAround',
    chips: ['What did he build?', 'Where has he worked?', 'How do I contact him?'],
  };
}

export default function App() {
  const bot = useRef<SageBotHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);

  const [messages, setMessages] = useState<Msg[]>(() => [{ id: 0, role: 'sage', text: WELCOME }]);
  const [typingId, setTypingId] = useState<number | null>(0);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [asked, setAsked] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const pendingInvite = useRef(false);
  const [page, setPage] = useState<{ id: SectionId; origin: { x: number; y: number }; closing: boolean } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setReducedMotion(mq.matches);
    f();
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, []);

  // Say hi on arrival.
  useEffect(() => {
    const t = window.setTimeout(() => { bot.current?.play('wave'); bot.current?.say('Hi there! 👋', 2400); }, 500);
    return () => window.clearTimeout(t);
  }, []);

  const scrollDown = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(scrollDown, [messages, thinking, scrollDown]);

  // Deep links: /#experience opens that file directly (handy for sharing).
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1) as SectionId;
      if (sections.some((s) => s.id === id)) openPage(id);
      else {
        setPage((p) => (p ? { ...p, closing: true } : p));
        window.setTimeout(() => setPage((p) => (p?.closing ? null : p)), 480);
      }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- pages -----------------------------------------------------------------
  const openPage = (id: SectionId, e?: MouseEvent) => {
    const box = bodyRef.current?.getBoundingClientRect();
    const origin = e && box ? { x: e.clientX - box.left, y: e.clientY - box.top } : { x: (box?.width ?? 800) / 2, y: 160 };
    setPage({ id, origin, closing: false });
    setMobileNav(false);
    if (window.location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  };
  const closePage = () => {
    if (!page) return;
    setPage({ ...page, closing: true });
    history.replaceState(null, '', window.location.pathname);
    later(() => { setPage(null); bot.current?.play('wave'); bot.current?.say('Welcome back! 😊', 2000); }, reducedMotion ? 0 : 480);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && page && !page.closing) closePage(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- chat ------------------------------------------------------------------
  const pushSage = (m: Omit<Msg, 'id' | 'role'>) => {
    const sage = msg({ role: 'sage', ...m });
    setMessages((prev) => [...prev, sage]);
    setTypingId(sage.id);
  };

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput('');
    setInviteOpen(false);
    setMessages((prev) => [...prev, msg({ role: 'visitor', text })]);
    setThinking(true);
    const reply = makeReply(text);
    const n = asked + 1;
    setAsked(n);
    if (n % 5 === 0 && reply.open !== 'contact') pendingInvite.current = true;
    later(() => {
      setThinking(false);
      pushSage({ text: reply.text, open: reply.open, chips: reply.chips });
      if (reply.action) bot.current?.play(reply.action);
    }, reducedMotion ? 150 : 650 + Math.random() * 450);
  };

  const onTyped = () => {
    setTypingId(null);
    if (pendingInvite.current) {
      pendingInvite.current = false;
      later(() => {
        setInviteOpen(true);
        pushSage({ text: asked >= 10 ? 'Okay, real talk… do you wanna hire him or what? 🥺' : 'You seem curious about Sagar! Want to connect with him directly? 🥺', invite: true });
      }, 600);
    }
  };

  const answerInvite = (yes: boolean) => {
    setInviteOpen(false);
    setMessages((prev) => [...prev, msg({ role: 'visitor', text: yes ? 'Yes, let’s connect!' : 'Not yet' })]);
    if (yes) {
      bot.current?.play('celebrate');
      pushSage({ text: 'I KNEW IT! 🎉 Opening the contact file…' });
      later(() => openPage('contact'), 1300);
    } else {
      bot.current?.play('nod');
      pushSage({ text: 'No pressure! I’ll be right here, polishing my rusty little elbows.' });
    }
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setMessages([msg({ role: 'sage', text: 'Fresh page, fresh start! What would you like to know about Sagar?' })]);
    setTypingId(null);
    setThinking(false);
    setAsked(0);
    setInviteOpen(false);
    pendingInvite.current = false;
    setPage(null);
    history.replaceState(null, '', window.location.pathname);
    bot.current?.play('spin');
    bot.current?.walkTo(0);
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit(input); };

  const mood: BotMood = thinking ? 'thinking' : typingId !== null ? 'talking' : inviteOpen ? 'puppy' : focused && input.trim() ? 'listening' : 'idle';
  const pageCovers = !!page && !page.closing;
  const showStarters = messages.length <= 1;

  return (
    <div className="app">
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <div><div className="brand-name">{profile.name.toUpperCase()}</div><div className="brand-sub">SENIOR QA · AI TESTING</div></div>
          <button className="icon-btn only-mobile" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <button className="new-chat" onClick={reset}><RotateCcw size={14} /> New conversation</button>
        <div className="nav-label">THE FILE CABINET</div>
        <nav className="nav">
          {sections.map((s, n) => {
            const Icon = NAV_ICONS[s.id];
            return (
              <button key={s.id} className={`nav-item ${page?.id === s.id && !page.closing ? 'is-active' : ''}`} onClick={(e) => openPage(s.id, e)}>
                <span className="nav-num">{String(n + 1).padStart(2, '0')}</span><Icon size={15} /><span>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="status"><i /> SAGE-E ONLINE <span>· a little rusty</span></div>
          <div className="made">Built with curiosity <Heart size={10} fill="currentColor" /></div>
        </div>
      </aside>
      {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={18} /></button>
          <div className="crumbs"><span>PORTFOLIO</span><span className="slash">/</span><strong>{page && !page.closing ? sectionById(page.id).label.toUpperCase() : 'ASK SAGE-E'}</strong></div>
          <a className="top-resume" href={profile.resume} download="Sagar_Bhasate_Resume.pdf"><Download size={13} /> Resume</a>
        </header>

        <div className="main-body" ref={bodyRef}>
          <div className={`home ${pageCovers ? 'is-covered' : ''}`} aria-hidden={pageCovers}>
            <div className="hero">
              <div className="kicker">AN INTERACTIVE CAREER ARCHIVE</div>
              <h1>Curious about Sagar? <em>Ask the little guy.</em></h1>
            </div>

            <div className="chat-wrap">
              <div className="perch" aria-hidden="true">
                <svg className="junk" viewBox="0 0 800 120" preserveAspectRatio="none">
                  <path d="M0 120 L0 92 L40 80 L70 88 L95 64 L130 70 L150 52 L190 66 L215 84 L260 78 L280 96 L330 92 L360 100 L800 100 L800 120 Z" />
                  <path d="M800 120 L800 86 L760 72 L730 82 L700 58 L668 66 L640 50 L610 70 L585 80 L540 76 L520 94 L470 92 L440 100 L0 100 L0 120 Z" />
                </svg>
                <div className="sparks"><i /><i /><i /><i /><i /><i /></div>
              </div>
              <SageBot
                ref={bot}
                mood={mood}
                roam
                paused={pageCovers}
                reducedMotion={reducedMotion}
                lookAt={() => inputRef.current?.getBoundingClientRect()}
                className="home-bot"
              />

              <section className="chat" aria-label="Conversation with SAGE-E">
                <div className="chat-scroll" ref={scrollRef} aria-live="polite">
                  {messages.map((m) => (
                    <div key={m.id} className={`msg msg-${m.role}`}>
                      {m.role === 'sage' && <div className="msg-avatar">S</div>}
                      <div className="msg-bubble">
                        <p>
                          {m.role === 'sage'
                            ? <TypeText text={m.text} active={m.id === typingId} instant={reducedMotion} onTick={scrollDown} onDone={onTyped} />
                            : m.text}
                        </p>
                        {m.id !== typingId && m.open && (
                          <button className="file-btn" onClick={(e) => openPage(m.open!, e)}>
                            <FolderOpen size={14} /> Open the {sectionById(m.open).label} file <ArrowRight size={13} />
                          </button>
                        )}
                        {m.id !== typingId && m.chips && (
                          <div className="msg-chips">{m.chips.map((c) => <button key={c} onClick={() => submit(c)}>{c}</button>)}</div>
                        )}
                        {m.id !== typingId && m.invite && inviteOpen && (
                          <div className="invite">
                            <button className="btn-primary" onClick={() => answerInvite(true)}>Yes, let’s connect <Heart size={13} /></button>
                            <button className="btn-ghost" onClick={() => answerInvite(false)}>Not yet</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {thinking && (
                    <div className="msg msg-sage"><div className="msg-avatar">S</div><div className="msg-bubble typing-dots"><i /><i /><i /></div></div>
                  )}
                  {showStarters && typingId === null && (
                    <div className="starters">
                      {STARTERS.map((s) => <button key={s} onClick={() => submit(s)}><Sparkles size={12} /> {s}</button>)}
                    </div>
                  )}
                </div>

                <form className="composer" onSubmit={onSubmit}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    rows={1}
                    placeholder="Ask about experience, projects, skills… or ask me to dance"
                    aria-label="Ask SAGE-E a question"
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input); } }}
                  />
                  <button className="send" type="submit" disabled={!input.trim() || thinking} aria-label="Send"><Send size={16} /></button>
                </form>
              </section>
              <div className="disclaimer">SAGE-E is a scripted guide, not an LLM. Every fact comes from Sagar’s resume.</div>
            </div>
          </div>

          {page && (
            <SectionPage
              key={page.id}
              id={page.id}
              origin={page.origin}
              closing={page.closing}
              reducedMotion={reducedMotion}
              onBack={closePage}
              onNavigate={(id, e) => openPage(id, e)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/** Types a message out character by character while SAGE-E "talks". */
function TypeText({ text, active, instant, onTick, onDone }: { text: string; active: boolean; instant: boolean; onTick: () => void; onDone: () => void }) {
  const [n, setN] = useState(active && !instant ? 0 : text.length);
  const cb = useRef({ onTick, onDone });
  cb.current = { onTick, onDone };
  useEffect(() => {
    if (!active) return;
    if (instant) { setN(text.length); cb.current.onDone(); return; }
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(text.length, i + 2);
      setN(i);
      cb.current.onTick();
      if (i >= text.length) { window.clearInterval(id); cb.current.onDone(); }
    }, 24);
    return () => window.clearInterval(id);
  }, [active, instant, text]);
  return <>{text.slice(0, n)}{n < text.length && <span className="caret" />}</>;
}
