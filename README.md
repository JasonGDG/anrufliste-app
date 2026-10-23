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

- [Claude Code](https://code.claude.com/docs/en/setup) 2.1.257 or newer, signed in with your own account (Pro/Max plan) or an Anthropic API key
- Node.js 18+ (for `npx`)
- Python 3 (builds the Excel file, installs `openpyxl` into its own cache on first run)

The app checks Claude Code (and its version) and Python on start and tells you what's missing. On the first list it sets up the spreadsheet library once (needs internet; on Debian/Ubuntu `python3-venv` must be installed).

## Your account, your data

Anrufliste has no login of its own and no backend. It starts the `claude` command already installed on your computer, so it uses whatever account Claude Code is signed in with. It never reads or stores your credentials. Optionally you can store an Anthropic API key in the settings (kept in `~/.anrufliste-app/config.json`, readable only by you); then usage is billed via the API.

Anrufliste starts your own, unmodified Claude Code installation; it never touches Claude credentials or tokens and offers no Claude sign-in of its own (`claude auth login` opens Anthropic's own sign-in). It is not made by or affiliated with Anthropic. Your use of Claude through it is subject to Anthropic's terms. If you prefer to stay strictly on the API side, store an API key in the app.

Everything runs on `127.0.0.1`. The local server rejects requests from other websites.

Claude only gets what research needs: web search, reading web pages, sub-agents, and writing files inside the folder of the current list. It gets no shell; the app creates the folder and builds the Excel file itself. Your own Claude Code hooks, plugins, permission rules and auto-memory are not loaded for these runs, and reading files outside the list folder is blocked. It never submits forms or contacts anyone.

## Legal notes (not legal advice)

You are responsible for the calls you make and the data in your lists.

- **Germany: B2B cold calls (§ 7 UWG)** are only allowed with presumed consent. A public phone number, the industry, or an open job posting alone are usually not enough according to German courts. Call with a concrete reason that is useful to the company (e.g. a matching candidate for exactly the advertised position).
- **No marketing emails** without explicit consent.
- **GDPR:** the app collects only business contact data from company sources, with a source URL for every fact. Tell people where you got their data at first contact and point out their right to object (Art. 14, 21 GDPR). The generated call script contains a sentence for that.
- **Do-not-call list:** block a company in the app ("Block"); it never shows up in a new list again.
- **Retention:** lists are deleted automatically after 6 months. Blocked companies stay blocked. You can delete a list any time.

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

## License

MIT. Includes the Hanken Grotesk font (SIL Open Font License 1.1).

## Browser-Version auf Cloudflare

Der öffentliche Link liefert die gleiche Oberfläche wie die lokale App, keine Software-Downloads. Die Website ist mit Benutzername `kollege` und dem Secret `SHARE_PASSWORD` geschützt. Jeder Browser erhält einen eigenen, zufälligen Zugang (Secure/HttpOnly-Cookie `__Host-anrufliste_session`) und einen getrennten SQLite-Speicher (Durable Object `ResearchRoom`). Die Browserkennung ist kein Claude-Zugang.

### Connector mit OAuth

Jeder Nutzer verbindet die Anrufliste als Remote-MCP-Connector in seinem eigenen Claude-Konto: **Anpassen → Connectors → Benutzerdefinierten Connector hinzufügen**, URL `https://anrufliste-teilen.permviz-cloud.workers.dev/mcp`, dann **Verbinden**. Claude öffnet die Website; nach der normalen Anmeldung bestätigt der Nutzer „Anrufliste mit deinem Claude verbinden“. Die Verbindung gehört zu dem Browser, in dem er bestätigt, und sieht nur dessen Listen. Bei Claude Team/Enterprise muss ein Admin eigene Connectors erlauben.

Technik: `@cloudflare/workers-oauth-provider` (OAuth 2.1 nach MCP-Authorization-Spec) mit KV-Bindung `OAUTH_KV`. Discovery unter `/.well-known/oauth-protected-resource/mcp` (auch ohne `/mcp`) und `/.well-known/oauth-authorization-server`, Dynamic Client Registration unter `/register` (nur Weiterleitungen zu claude.ai, claude.com, chatgpt.com, chat.openai.com, platform.openai.com oder localhost), PKCE nur S256, Token-Endpunkt `/token`, Refresh-Token-Rotation, Zugriffstoken 1 Stunde, Verbindung verfällt nach 90 Tagen ohne Nutzung. Ohne Token antwortet `/mcp` mit `401` und `WWW-Authenticate: Bearer … resource_metadata=…`. Die Autorisierungsseite `/authorize` verlangt den Website-Zugang; der Grant speichert (verschlüsselt) die Browser-Session, MCP-Anfragen mit gültigem Token gehen an genau diesen Room.

Übergang: Der frühere persönliche Link `/mcp/<session>.<signatur>` funktioniert weiter und steht im Verbindungsdialog unter „OAuth klappt nicht?“ (OpenAI).

### Ablauf, Sperrliste, Löschfrist

Der Nutzer erstellt den Auftrag in der Weboberfläche, kopiert ihn über „Auftrag kopieren & Claude öffnen“ in seinen Claude-Chat und aktiviert dort Connector und Websuche. Claude liest den Auftrag (`get_research_brief`), recherchiert und speichert über `save_companies` und `finish_research`. Die Tabelle aktualisiert sich automatisch. Excel mit Anrufliste, Quellen, Leitfaden und Legende wird serverseitig erstellt.

- **Sperrliste** pro Browser-Zugang: `GET /api/sperrliste`, `POST /api/sperren {eintrag}`, `POST /api/entsperren {key}`. Schlüssel wie lokal: Domain ohne `www`, sonst Firmenname klein ohne Sonderzeichen. Gesperrte Schlüssel stehen im Auftrag (`gesperrt`) und werden von `save_companies` abgewiesen.
- **Löschen:** `POST /api/loeschen {id}` entfernt einen Auftrag komplett (laufende Aufträge erst abbrechen).
- **Löschfrist:** Aufträge werden 183 Tage nach Erstellung endgültig gelöscht, bei jedem Zugriff und täglich per Durable-Object-Alarm. Die Sperrliste bleibt.

### Impressum und Datenschutz

`/impressum` und `/datenschutz` sind ohne Passwort erreichbar und in der Seitenleiste sowie im Verbindungsdialog verlinkt. Quellen: `cloudflare/legal/`; `build.py` übernimmt Schrift- und Farb-Tokens (hell/dunkel) aus `public/index.html` in `dist/legal.css`.

### Bauen und Veröffentlichen

`npm ci --prefix cloudflare`, `python3 cloudflare/build.py` (bricht ab, wenn ein Anker in `public/index.html` fehlt), prüfen mit `node --test cloudflare/test.mjs`, veröffentlichen mit `npx wrangler deploy`. Benötigt: Secret `SHARE_PASSWORD`, KV-Namespace `anrufliste-oauth` (Bindung `OAUTH_KV`, in `wrangler.toml`), SQLite-Durable-Objects-Migration (in `wrangler.toml`). Lokal: `npx wrangler dev --var SHARE_PASSWORD:…`.

Auf Cloudflare wird kein Claude-Konto und kein Anthropic-API-Key gespeichert; es laufen keine lokalen Helfer oder Claude-Code-Container. Der Recherche-Chat läuft im Claude-Tab des jeweiligen Nutzers. Ein Browserwechsel oder gelöschte Cookies erzeugen einen neuen getrennten Zugang.

Der lokale CLI-Betrieb bleibt unabhängig davon nutzbar. Das frühere Mac-Testpaket ist kein Bestandteil der öffentlichen Webversion.

### OpenAI und Codex

Die Browser-Oberfläche bietet zusätzlich „OpenAI (ChatGPT / Codex)“. Im Browser wird derselbe MCP-Server (`…/mcp`, Authentication: OAuth) als Plugin in ChatGPT verbunden und im eigenen ChatGPT-Work-Chat genutzt; übergangsweise geht auch der persönliche Link ohne Authentifizierung. Der gleiche Streamable-HTTP-Endpunkt kann auch in einem bereits vorhandenen Codex-Client konfiguriert werden. Die Browser-Schaltfläche öffnet ChatGPT, keine gehostete Codex-Instanz. Die Einrichtung hängt von den Plugin-Berechtigungen des jeweiligen Kontos ab. Es wird kein gemeinsamer OpenAI-API-Key und kein ChatGPT-Token auf dem Server hinterlegt.

Verbindungen werden pro Nutzerzugang und Anbieter anhand der MCP-Client-Identifikation angezeigt. Diese technische Erkennung bestätigt keine konkrete Modellverfügbarkeit und keine erfolgreiche KI-Recherche.
