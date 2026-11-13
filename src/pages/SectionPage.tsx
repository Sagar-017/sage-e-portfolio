import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import { ArrowLeft, ArrowRight, Download, ExternalLink, Github, Linkedin, Mail, MapPin } from 'lucide-react';
import { SageBot, type SageBotHandle } from '../bot/SageBot';
import {
  achievements, education, experience, githubProject, presentLines, profile, projects, sections, skills,
  type SectionId,
} from '../content';

interface Props {
  id: SectionId;
  /** Where the page unfolds from (px, relative to the page container). */
  origin: { x: number; y: number };
  closing: boolean;
  reducedMotion: boolean;
  onBack: () => void;
  onNavigate: (id: SectionId, e: MouseEvent) => void;
}

/** A full "file" page that unfolds out of wherever it was opened from. */
export default function SectionPage({ id, origin, closing, reducedMotion, onBack, onNavigate }: Props) {
  const bot = useRef<SageBotHandle>(null);
  const index = sections.findIndex((s) => s.id === id);
  const section = sections[index];
  const prev = sections[(index - 1 + sections.length) % sections.length];
  const next = sections[(index + 1) % sections.length];

  // SAGE-E hands the file over as the page lands.
  useEffect(() => {
    const t = window.setTimeout(() => {
      bot.current?.play(id === 'contact' ? 'celebrate' : 'present');
      bot.current?.say(presentLines[id], 3000);
    }, reducedMotion ? 0 : 450);
    return () => window.clearTimeout(t);
  }, [id, reducedMotion]);

  return (
    <div
      className={`page ${closing ? 'is-closing' : ''}`}
      style={{ '--ox': `${origin.x}px`, '--oy': `${origin.y}px` } as CSSProperties}
      role="region"
      aria-label={`${section.label} file`}
    >
      <div className="page-scroll">
        <header className="page-head">
          <div className="page-head-text">
            <button className="back-btn" onClick={onBack}><ArrowLeft size={15} /> Back to SAGE-E</button>
            <div className="page-kicker">FILE {String(index + 1).padStart(2, '0')} · {section.label.toUpperCase()}</div>
            <h1>{section.title}</h1>
            <p className="page-lead">{section.lead}</p>
          </div>
          <div className="page-bot">
            <SageBot ref={bot} compact mood={id === 'contact' ? 'happy' : 'idle'} reducedMotion={reducedMotion} />
          </div>
        </header>

        <div className="page-body reveal">
          <Body id={id} />
        </div>

        <nav className="pager" aria-label="Other files">
          <button onClick={(e) => onNavigate(prev.id, e)}><ArrowLeft size={15} /><span><small>PREVIOUS FILE</small>{prev.label}</span></button>
          <button onClick={(e) => onNavigate(next.id, e)}><span><small>NEXT FILE</small>{next.label}</span><ArrowRight size={15} /></button>
        </nav>
      </div>
    </div>
  );
}

const i = (n: number) => ({ '--i': n }) as CSSProperties;

function Body({ id }: { id: SectionId }) {
  switch (id) {
    case 'about':
      return (
        <>
          <div className="facts" style={i(0)}>
            {profile.facts.map((f) => <div key={f.label} className="fact"><strong>{f.value}</strong><span>{f.label}</span></div>)}
          </div>
          <div className="tiles">
            {profile.focus.map((f, n) => (
              <article key={f.title} className="tile" style={i(n + 1)}>
                <span className="tile-num">0{n + 1}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
          <div className="open-to" style={i(4)}>
            <span>OPEN TO</span>
            {profile.openTo.map((r) => <b key={r}>{r}</b>)}
          </div>
        </>
      );

    case 'experience':
      return (
        <ol className="timeline">
          {experience.map((job, n) => (
            <li key={job.company} className="job" style={i(n)}>
              <div className="job-dot" />
              <div className="job-head">
                <h2>{job.company}</h2>
                <span className="job-period">{job.period}</span>
              </div>
              <div className="job-role">{job.role}</div>
              <div className="ladder" aria-label="Role progression">
                {job.ladder.map((step, k) => (
                  <span key={step} className="ladder-step">{step}{k < job.ladder.length - 1 && <ArrowRight size={11} />}</span>
                ))}
              </div>
              {job.groups.map((g) => (
                <div key={g.title} className="job-group">
                  <h3>{g.title}</h3>
                  <ul>{g.items.map((it) => <li key={it}>{it}</li>)}</ul>
                </div>
              ))}
            </li>
          ))}
        </ol>
      );

    case 'projects':
      return (
        <>
          <div className="cards">
            {projects.map((p, n) => (
              <article key={p.name} className="project" style={i(n)}>
                <div className="project-tags">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>
                <h3>{p.name}</h3>
                <dl>
                  <dt>Problem</dt><dd>{p.problem}</dd>
                  <dt>Built</dt><dd>{p.built}</dd>
                  <dt>Result</dt><dd className="project-result">{p.result}</dd>
                </dl>
              </article>
            ))}
          </div>
          <a className="link-card" style={i(5)} href={githubProject.url} target="_blank" rel="noreferrer">
            <Github size={17} /> {githubProject.label} <ExternalLink size={14} />
          </a>
        </>
      );

    case 'achievements':
      return (
        <div className="stats">
          {achievements.map((a, n) => (
            <article key={a.label} className="stat" style={i(n)}>
              <strong>{a.value}</strong>
              <span className="stat-label">{a.label}</span>
              <p>{a.detail}</p>
            </article>
          ))}
        </div>
      );

    case 'skills':
      return (
        <div className="skill-groups">
          {skills.map((g, n) => (
            <section key={g.title} className="skill-group" style={i(n)}>
              <h3>{g.title}</h3>
              <div className="chips">
                {g.items.map(([name, level]) => (
                  <span key={name} className="chip">{name}{level && <em>{level}</em>}</span>
                ))}
              </div>
            </section>
          ))}
        </div>
      );

    case 'education':
      return (
        <article className="diploma" style={i(0)}>
          <div className="diploma-seal">B.E.</div>
          <div className="diploma-kicker">BACHELOR OF ENGINEERING</div>
          <h2>{education.degree}</h2>
          <p>{education.school}</p>
          <span className="diploma-years">{education.years}</span>
        </article>
      );

    case 'resume':
      return (
        <>
          <div className="resume-actions" style={i(0)}>
            <a className="btn-primary" href={profile.resume} download="Sagar_Bhasate_Resume.pdf"><Download size={16} /> Download PDF</a>
            <a className="btn-ghost" href={profile.resume} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open in new tab</a>
          </div>
          <div className="resume-frame" style={i(1)}>
            <iframe src={`${profile.resume}#view=FitH&toolbar=0`} title="Sagar Bhasate resume" />
          </div>
        </>
      );

    case 'contact':
      return (
        <div className="contact-grid">
          <a className="contact-card" style={i(0)} href={profile.linkedin} target="_blank" rel="noreferrer">
            <Linkedin size={22} /><span><small>LINKEDIN</small>{profile.linkedinLabel}</span><ExternalLink size={15} />
          </a>
          <a className="contact-card" style={i(1)} href={`mailto:${profile.email}`}>
            <Mail size={22} /><span><small>EMAIL</small>{profile.email}</span><ArrowRight size={15} />
          </a>
          <div className="contact-card is-static" style={i(2)}>
            <MapPin size={22} /><span><small>BASED IN</small>{profile.location}</span>
          </div>
        </div>
      );
  }
}
