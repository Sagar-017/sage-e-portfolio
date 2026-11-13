# SAGE-E — Interactive Career Portfolio

Sagar Bhasate's portfolio, guided by SAGE-E: a hand-built, fully animated SVG robot that
perches on the chat window, follows your cursor, dances, and fetches "files" about Sagar.

## Run locally

```bash
npm install
npm run dev        # open the URL Vite prints
```

Production build: `npm run build && npm run preview`

## Where things live

| File | What it is |
|---|---|
| `src/content.ts` | All text: profile, experience, projects, numbers, skills, chat answers, jokes |
| `src/bot/SageBot.tsx` | The robot: SVG skeleton + one animation loop (moods, tricks, drag, sleep) |
| `src/pages/SectionPage.tsx` | The full-page "files" that unfold from where you click |
| `src/App.tsx` | Layout, chat logic, page transitions, deep links (`/#experience`) |
| `public/resume.pdf` | The downloadable resume |

## Things to try
- Move the mouse: his eyes and head follow it. Type: he watches the text box.
- Click him (poke), click him 4× fast (dizzy), drag him (pick up / drop).
- Ask "make SAGE-E dance", "tell me a QA joke", "spin", "who is Sagar?".
- Leave him alone for 30 seconds: he falls asleep.
