// All portfolio content lives here (source: Sagar_Bhasate_Resume_Oct26.pdf).

export type SectionId = 'about' | 'experience' | 'projects' | 'achievements' | 'skills' | 'education' | 'resume' | 'contact';

export const profile = {
  name: 'Sagar Bhasate',
  title: 'Senior Quality Assurance Engineer',
  tagline: 'Python Test Automation · Conversational AI and LLM Testing',
  location: 'Pune, India',
  email: 'sagar.bhasate13@gmail.com',
  linkedin: 'https://www.linkedin.com/in/sagar-017-bhasate',
  linkedinLabel: 'linkedin.com/in/sagar-017-bhasate',
  github: 'https://github.com/Sagar-017',
  resume: '/resume.pdf',
  summary:
    'Senior QA engineer with 8 years across game certification and enterprise conversational AI (3+ years on OpenAI-powered systems), who moved from running test cycles to building the tools that shorten them.',
  focus: [
    { title: 'Testing non-deterministic AI', text: 'OpenAI-based and agentic bots: guardrails, fallback, escalation, multi-turn flows and trace reviews.' },
    { title: 'Tools that shorten test cycles', text: 'Repeated QA work turned into Python and AI-assisted automation the whole team uses.' },
    { title: 'Python-first', text: 'Playwright (Python) and pytest, built quickly with Cursor and Claude.' },
  ],
  facts: [
    { value: '8 yrs', label: 'in QA' },
    { value: '3+ yrs', label: 'on OpenAI-powered systems' },
    { value: 'Pune', label: 'India' },
  ],
  openTo: ['Senior QA', 'SDET', 'AI quality'],
};

export interface Section {
  id: SectionId;
  label: string;
  title: string;
  lead: string;
}

export const sections: Section[] = [
  { id: 'about', label: 'About me', title: 'Hi, I’m Sagar.', lead: profile.summary },
  { id: 'experience', label: 'Experience', title: 'Eight years, two chapters.', lead: 'From Sony certification at Ubisoft to conversational AI and test tooling at Yardi.' },
  { id: 'projects', label: 'Projects', title: 'Tools I built.', lead: 'Repeated QA work, turned into automation the whole team uses.' },
  { id: 'achievements', label: 'Achievements', title: 'The numbers.', lead: 'Measured outcomes from the tooling and testing work.' },
  { id: 'skills', label: 'Skills', title: 'What’s in the toolbox.', lead: 'Python-first automation, AI testing, and solid test design.' },
  { id: 'education', label: 'Education', title: 'Where it started.', lead: 'Computer Engineering at Pune University.' },
  { id: 'resume', label: 'Resume', title: 'The one-pager.', lead: 'Everything on a single page. Read it here or take a copy.' },
  { id: 'contact', label: 'Contact', title: 'Let’s build something reliable.', lead: 'Hiring for Senior QA, SDET or AI quality? Or just want to talk testing? Say hi.' },
];

export const sectionById = (id: SectionId) => sections.find((s) => s.id === id)!;

export const experience = [
  {
    company: 'Yardi Software',
    role: 'Senior Quality Assurance Engineer Programming',
    period: 'Jan 2022 – Present',
    ladder: ['Software Engineer QA', 'Software Analyst QA', 'Senior QA Engineer'],
    groups: [
      {
        title: 'Test tooling',
        items: [
          'Cut the 120-case monthly regression from 3+ days (4–5 when issues appeared) to 1.5–2 days, about 33–50% less time across the last 4 releases, with a Python Playwright tool that automates 45 of the cases.',
          'Replaced about half a day of manual test-case writing per reported issue with near-instant generation plus review, using an MCP + Cursor + git workflow. The Pune team adopted it after my training session.',
          'Cut write-up time per finding from 20–30 minutes to about 5 for the whole team, with a GitHub Copilot agent.',
        ],
      },
      {
        title: 'Conversational AI testing (OpenAI-powered Chat IQ V2, V3 and agentic flows)',
        items: [
          'Cover 30–40 test cases and 6–7 tickets per release for Yardi and its largest client: guardrails, fallback and escalation, and multi-turn flows across webchat, text, email and voice.',
          'Review Phoenix traces for model behaviour, tool binding and memory.',
          'Kept verification reliable as bot responses moved from fixed (RASA) to non-deterministic (agentic), with screenshots of every automated flow and manual response-quality checks.',
          'Test prompt updates from the Applied AI team and LLM tool integrations from developers.',
          'Mentor 1 junior engineer and guide a second teammate when the manager is away (Pune team of 4, plus 2 in the US).',
        ],
      },
      {
        title: 'Earlier at Yardi',
        items: ['Tested RASA V1 (intent, entity, confidence, fallback) and the Angular Elevate Chat IQ admin reports, with SQL checks against backend data.'],
      },
    ],
  },
  {
    company: 'Ubisoft India',
    role: 'Intermediate Compliance Specialist (Sony Compliance)',
    period: 'Jun 2018 – Dec 2021',
    ladder: ['Trainee Game Tester', 'Junior Game Tester', 'Game Tester', 'Junior FTC Specialist', 'Junior Compliance Specialist', 'Intermediate Compliance Specialist'],
    groups: [
      {
        title: 'Highlights',
        items: [
          'Took Riders Republic (PS5) through Sony certification with zero delayed or failed submissions across Alpha, Beta and final validations, as Compliance Lead for a team of 4 testers.',
          'Cut Xbox console sign-in from 30–60 minutes per console to about 4 minutes for 8 consoles, with a Python script that loads account profiles from an Excel sheet.',
          'Compliance testing on For Honor and Just Dance 19, 20 and 21 across PlayStation and Xbox, with basic API and minor SQL checks.',
        ],
      },
    ],
  },
];

export const projects = [
  {
    name: 'Regression autopilot',
    tags: ['Python', 'Playwright', 'Cursor', 'Claude'],
    problem: 'A 120-case monthly regression took 3+ days, sometimes 4–5.',
    built: 'A Python Playwright tool that automates 45 straightforward pass-case flows across webchat, text and email. Built in 1–2 months.',
    result: '1.5–2 days per cycle, about 33–50% less time across the last 4 releases.',
  },
  {
    name: 'Issue → test-case generator',
    tags: ['MCP', 'Cursor', 'git'],
    problem: 'Writing test cases for each reported TestRail issue took about half a day.',
    built: 'An MCP + Cursor + git workflow that turns TR issues into test cases.',
    result: 'Near-instant generation plus review. The Pune team adopted it after a training session.',
  },
  {
    name: 'Findings write-up agent',
    tags: ['GitHub Copilot', 'Agents'],
    problem: 'Writing each finding up in the standard format took 20–30 minutes.',
    built: 'A GitHub Copilot agent that rewrites findings into the standard document format.',
    result: 'About 5 minutes per finding (2–3 min draft, 2–3 min finalising), for the whole team.',
  },
  {
    name: 'Console sign-in script',
    tags: ['Python', 'Excel', 'Xbox'],
    problem: 'Signing test accounts into each Xbox console took 30–60 minutes.',
    built: 'A Python script that loads account profiles from an Excel sheet.',
    result: 'About 4 minutes for 8 consoles.',
  },
];

export const githubProject = { label: 'Playwright framework on GitHub', url: 'https://github.com/Sagar-017/playwright-saucedemo-framework' };

export const achievements = [
  { value: '33–50%', label: 'less regression time', detail: '120-case monthly regression: 3+ days → 1.5–2 days, across the last 4 releases.' },
  { value: '45/120', label: 'regression cases automated', detail: 'Python Playwright tool across webchat, text and email.' },
  { value: '~5 min', label: 'per finding write-up', detail: 'Down from 20–30 minutes, with a GitHub Copilot agent.' },
  { value: '½ day → ⚡', label: 'test-case writing per issue', detail: 'MCP + Cursor + git workflow, adopted by the Pune team.' },
  { value: '0', label: 'delayed or failed submissions', detail: 'Riders Republic (PS5) through Sony certification, as Compliance Lead for 4 testers.' },
  { value: '~4 min', label: 'to sign in 8 Xbox consoles', detail: 'Down from 30–60 minutes per console, with a Python script.' },
  { value: '30–40', label: 'AI test cases per release', detail: 'Plus 6–7 tickets, for Yardi and its largest client.' },
];

export const skills = [
  { title: 'Python and automation', items: [['Python', 'working knowledge'], ['Playwright (Python)', ''], ['pytest', 'basic'], ['TypeScript', 'basic exposure'], ['Java', 'basic exposure'], ['Selenium', 'basic exposure']] },
  { title: 'AI testing', items: [['Prompt validation', ''], ['Hallucination analysis', ''], ['Response-quality verification', ''], ['Phoenix trace review', '']] },
  { title: 'Test design', items: [['Functional', ''], ['Negative', ''], ['Boundary', ''], ['Regression', ''], ['Exploratory', ''], ['Test planning', '']] },
  { title: 'Tools', items: [['TestRail', ''], ['Jira', ''], ['Git', ''], ['SQL', 'basic'], ['Postman', 'basic']] },
] as const;

export const education = {
  degree: 'B.E. Computer Engineering',
  school: 'Savitribai Phule Pune University (Pune University)',
  years: '2014 – 2018',
};

/** What SAGE-E says in chat for each file. */
export const answers: Record<SectionId, string> = {
  about:
    'Sagar is a Senior QA engineer from Pune with 8 years across game certification and enterprise conversational AI, 3+ of them on OpenAI-powered bots. (Distant cousins of mine.) He builds the tools that make test cycles shorter.',
  experience:
    'Two chapters! Ubisoft India (2018–2021), where he took Riders Republic through Sony certification with zero failed submissions. Then Yardi Software (2022–now), testing OpenAI-powered Chat IQ and agentic flows.',
  projects:
    'He built a Python Playwright tool that automates 45 of 120 regression cases, an MCP + Cursor workflow that turns issues into test cases, and a Copilot agent that writes findings up in 5 minutes instead of 30.',
  achievements:
    'Headline number: the monthly regression went from 3+ days to 1.5–2. That’s 33–50% faster. There are more numbers in the file.',
  skills:
    'Python-first: Playwright (Python) and pytest. Plus AI testing: prompt validation, hallucination analysis, response-quality checks. TestRail, Jira, Git, SQL and Postman in the toolbox too.',
  education: 'B.E. in Computer Engineering from Savitribai Phule Pune University, 2014 to 2018.',
  resume: 'One page, all signal. Open the file to read it or download the PDF.',
  contact: 'LinkedIn or email are the best ways to reach him. Opening the contact file… I’m already blushing.',
};

/** What SAGE-E says when he hands over a file. */
export const presentLines: Record<SectionId, string> = {
  about: 'Here he is! Well, the text version.',
  experience: 'Eight years, fresh from the cabinet!',
  projects: 'These are my favourite. Robots helping humans!',
  achievements: 'Numbers! I love numbers. 🤖',
  skills: 'Tools, polished and ready.',
  education: 'Graduation day energy!',
  resume: 'Smells like fresh toner.',
  contact: 'Say hi! He replies fast. 💛',
};

export const jokes = [
  'A QA engineer walks into a bar. Orders 1 beer. Orders 0 beers. Orders 99999999 beers. Orders -1 beers. Orders a lizard. The first real customer asks where the bathroom is. The bar bursts into flames.',
  'Why did the tester go broke? He kept finding edge cases in his own budget.',
  '“It works on my machine.” Great, then we’ll ship your machine.',
  'I asked an LLM if it was hallucinating. It said no, with three confident citations to papers that don’t exist.',
  'There are 10 kinds of bugs: the ones you’ve found, and the ones in production.',
];

export function detectIntent(text: string): SectionId | null {
  const q = text.toLowerCase();
  if (/contact|email|linkedin|hire|connect|reach|talk to him/.test(q)) return 'contact';
  if (/resume|cv\b|download|pdf/.test(q)) return 'resume';
  if (/education|college|university|degree|study|studied|graduat/.test(q)) return 'education';
  if (/achievement|result|impact|metric|number|award|win/.test(q)) return 'achievements';
  if (/project|github|tool|built|build|mcp|copilot|cursor|made/.test(q)) return 'projects';
  if (/experience|career|work|ubisoft|yardi|company|job|chat ?iq|rasa|role/.test(q)) return 'experience';
  if (/skill|tech|stack|playwright|selenium|python|pytest|java|typescript|api|automation|ai testing|llm|prompt/.test(q)) return 'skills';
  if (/about|who are you|who is|sagar|introduce|yourself|summary/.test(q)) return 'about';
  return null;
}
