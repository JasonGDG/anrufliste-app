# Anrufliste

**Cold-call lists, researched by your own Claude.** Describe what you sell and which companies you want to call. A few minutes later you get a ready-to-call Excel sheet: decision makers, direct lines, employee counts with sources, buying signals and a call script.

```bash
npx anrufliste
```

Opens in your browser at `localhost:3737`. No account, no server, no API costs on top of your Claude plan.

## How it works

1. Type what you sell, which companies you're after, the region and how many.
2. Your local Claude Code splits the region into 3 to 4 areas and researches them in parallel: company websites, imprints, team and career pages, job boards, registers.
3. Companies appear in the table as soon as they're found. After 5 to 25 minutes, depending on the count, download the Excel file.

The Excel sheet has a call list (priority, tier A/B/C, contact, role, direct line, switchboard, email, employees and how sure that number is, reachability, buying signal, whether they already use a competitor, fit, 4 to 6 industry-specific columns, a call hint, and status/notes columns to work through), plus sheets with employee sources, a call script tailored to your offer, and a legend.

Companies are never delivered twice: every list remembers what came before. Drop old Excel lists (with a "Website" column) into `~/Anruflisten/alt/` and they're skipped too.

## Requirements

- [Claude Code](https://code.claude.com/docs/en/setup), signed in with your own account (Pro/Max plan) or an Anthropic API key
- Node.js 18+ (for `npx`)
- Python 3 (builds the Excel file, installs `openpyxl` into its own cache on first run)

The app checks all three on start and tells you what's missing.

## Your account, your data

Anrufliste has no login of its own and no backend. It starts the `claude` command already installed on your computer, so it uses whatever account Claude Code is signed in with. It never reads or stores your credentials. Optionally you can store an Anthropic API key in the settings (kept in `~/.anrufliste-app/config.json`, readable only by you); then usage is billed via the API.

Anrufliste starts your own, unmodified Claude Code installation; it never touches Claude credentials or tokens and offers no Claude sign-in of its own (`claude auth login` opens Anthropic's own sign-in). It is not made by or affiliated with Anthropic. Your use of Claude through it is subject to Anthropic's terms. If you prefer to stay strictly on the API side, store an API key in the app.

Everything runs on `127.0.0.1`. The local server rejects requests from other websites.

Claude only gets what research needs: web search, reading web pages, sub-agents, and writing files inside the folder of the current list. It gets no shell; the app creates the folder and builds the Excel file itself. Your own Claude Code hooks and settings are not loaded for these runs. It never submits forms or contacts anyone.

## Good to know

- Research quality depends on what companies publish. Direct lines are only included when they are public. Double-check numbers before calling.
- One list uses a noticeable share of your Claude usage. Runs via `claude -p` may be billed against your plan's Agent SDK allowance rather than your regular chat limits; check your usage page. If you hit a limit, the app tells you; companies found so far are kept.
- The research and the spreadsheet are currently tuned for German-speaking markets (DACH). Switch the UI to English with the button at the top; notes and the call script are then written in English, column headers stay German for now.

## Options

```bash
npx anrufliste --port 4000     # different port
npx anrufliste --no-open       # don't open the browser
ANRUFLISTEN_DIR=~/Leads npx anrufliste   # different folder for lists
```

## Without the app

The research runs as a Claude Code skill (`skill/`). You can also copy it to `~/.claude/skills/anrufliste/` and type `/anrufliste logistics companies around Munich, 40 companies` in Claude Code.

## License

MIT. Includes the Hanken Grotesk font (SIL Open Font License 1.1).
