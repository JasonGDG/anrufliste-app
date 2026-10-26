# Product Hunt launch kit

**Name:** Anrufliste

**Tagline (max 60):** Cold-call lists researched by your own Claude Code

**Topics:** Sales, Artificial Intelligence, Developer Tools, Productivity

**Link:** https://github.com/JasonGDG/anrufliste-app

**Description (max 260):**
Describe what you sell and which companies you want to call. Your local Claude Code researches them in parallel and you get a ready-to-call Excel sheet: decision makers, direct lines, buying signals, call script. One command: npx anrufliste

**First comment (maker):**
Hi Product Hunt! I built this for a friend's two-person staffing agency. Their sales guy spent hours every week googling companies, digging through imprints and job boards to find someone worth calling.

Anrufliste turns that into one form. You say what you sell ("temp staffing for warehouses"), who you're after ("logistics companies around Munich, 50 to 300 employees") and how many. Claude Code splits the region, runs a few research agents in parallel, and the table fills up live. At the end you get the Excel sheet the way a sales team actually works with it: priority, A/B/C tier, the decision maker with direct line, employee count with sources, a buying signal (e.g. open positions), whether they already work with a competitor, and status columns to work through.

A few things I cared about:
• No new account and no backend. It runs on your computer and uses the Claude Code you're already signed in to.
• Nothing is invented. Every number comes with a source, and companies from earlier lists never show up twice.
• It's open source (MIT), so you can tune the research to your industry.

It's tuned for German-speaking markets for now. I'd love to hear which markets and columns you'd want next.

**Gallery (1270x760):** ready in `docs/gallery/` (fictitious demo data, no real contacts): `1-call-list.png`, `2-new-list.png`. Still to do: GIF of a live run, Excel screenshot.

1. The form + table filling up live (hero)
2. Finished Excel, call list sheet
3. Call script sheet
4. Setup screen ("Signed in as …")
5. Short video/GIF: form → companies appear → download

**Launch:** Tuesday to Thursday, 00:01 PT (09:01 CET). Reply to every comment on launch day.
