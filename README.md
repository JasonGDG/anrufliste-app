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

Technik: `@cloudflare/workers-oauth-provider` (OAuth 2.1 nach MCP-Authorization-Spec) mit KV-Bindung `OAUTH_KV`. Discovery unter `/.well-known/oauth-protected-resource/mcp` (auch ohne `/mcp`) und `/.well-known/oauth-authorization-server`, Dynamic Client Registration unter `/register` (Weiterleitungen nur exakt zu `https://claude.ai/api/mcp/auth_callback` und `https://claude.com/api/mcp/auth_callback`, zu den Hosts chatgpt.com, chat.openai.com, platform.openai.com oder zu localhost), PKCE nur S256, Token-Endpunkt `/token`, Refresh-Token-Rotation, Zugriffstoken 1 Stunde, Verbindung verfällt nach 90 Tagen ohne Nutzung (jeder Token-Refresh verlängert sie). Ohne Token antwortet `/mcp` mit `401` und `WWW-Authenticate: Bearer … resource_metadata=…`. Die Autorisierungsseite `/authorize` verlangt den Website-Zugang; der Grant speichert (verschlüsselt) die Browser-Session, MCP-Anfragen mit gültigem Token gehen an genau diesen Room.

Der frühere persönliche Link `/mcp/<session>.<signatur>` ist abgeschaltet (er enthielt die Session-ID); `/mcp/…` antwortet mit `410`. Verbunden wird nur noch über OAuth.

### Ablauf, Sperrliste, Löschfrist

Der Nutzer erstellt den Auftrag in der Weboberfläche, kopiert ihn über „Auftrag kopieren & Claude öffnen“ in seinen Claude-Chat und aktiviert dort Connector und Websuche. Claude liest den Auftrag (`get_research_brief`), recherchiert und speichert über `save_companies` und `finish_research`. Die Tabelle aktualisiert sich automatisch. Excel mit Anrufliste, Quellen, Leitfaden und Legende wird serverseitig erstellt.

- **Sperrliste** pro Browser-Zugang: `GET /api/sperrliste`, `POST /api/sperren {eintrag}`, `POST /api/entsperren {key}`. Schlüssel wie lokal: Domain ohne `www`, sonst Firmenname klein ohne Sonderzeichen. Gesperrte Schlüssel stehen im Auftrag (`gesperrt`) und werden von `save_companies` abgewiesen.
- **Löschen:** `POST /api/loeschen {id}` entfernt einen Auftrag komplett (laufende Aufträge erst abbrechen).
- **Löschfrist:** Aufträge werden 183 Tage nach Erstellung endgültig gelöscht, beim ersten Zugriff pro Stunde und täglich per Durable-Object-Alarm. Die Sperrliste bleibt.
- **Verwaiste Speicherbereiche:** Jeder Room merkt sich den letzten Zugriff (`lastSeen`, höchstens stündlich geschrieben). Der tägliche Alarm läuft auch ohne Aufträge; nach 12 Monaten ohne Zugriff löscht er den ganzen Room (`deleteAll`, auch Sperrliste und Verbindungsangaben).
- **Grenzen:** höchstens 200 Listen je Browser-Zugang; ein Firmendatensatz wird auf 15 KB gekürzt (zuerst überzählige Quellen, dann die längsten Texte), damit eine Liste mit 100 Firmen unter dem 2-MB-Wertlimit bleibt. `finish_research` überschreibt eine abgeschlossene Liste nicht.
- **Index:** Listenansicht und Aufräumen lesen nur den Schlüssel `index` (Titel, Status, Anzahl, Daten je Auftrag), nicht alle Aufträge.
- **Excel:** Firmen, die inzwischen auf der Sperrliste stehen, sind in der ersten Spalte „Gesperrt“ markiert („GESPERRT – nicht anrufen“).

### Direkt im Browser mit eigenem API-Schlüssel

Unter „Recherche mit“ gibt es zwei Wege: **Direkt hier (eigener API-Schlüssel)** und **Im Claude-Chat (dein Claude-Abo)** über den Connector. Beim direkten Weg trägt der Nutzer seinen eigenen Anthropic-API-Schlüssel ein. Der Schlüssel liegt nur im `localStorage` des Browsers (`anthropic-api-key`, löschbar über „Schlüssel löschen“) und geht ausschließlich an `api.anthropic.com`, nie an diesen Server. Die CSP erlaubt dafür zusätzlich `connect-src https://api.anthropic.com`, sonst nichts. Skripte nur aus eigenen Dateien (`script-src 'self'`, `build.py` lagert die Inline-Skripte nach `dist/app.js` und `dist/theme.js` aus und bricht bei verbliebenen Inline-Skripten ab); `form-action` nur `'self'`, die OAuth-Weiterleitungsziele (claude.ai, claude.com, ChatGPT-Hosts) und localhost.

Ablauf: „Liste erstellen“ legt den Auftrag wie bisher an (`POST /api/run`). Danach läuft alles im Tab (Tab offen lassen):

1. `POST /api/brief {id}`: Auftrag, Regeln, Ausschluss- und Sperrliste (gleicher Inhalt wie `get_research_brief`).
2. Planung: ein Aufruf mit structured output (`output_config.format`, JSON-Schema) legt Kaufsignal, Verbund, Konkurrenz, Zusatzfelder und 2 bis 4 Teilgebiete fest.
3. Je Teilgebiet ein eigener Agenten-Loop, alle parallel. Werkzeuge: `web_search_20260209`, `web_fetch_20260209` und das eigene Werkzeug `save_companies` (strict, `eager_input_streaming`). Jeder Loop speichert nach je 3 bis 5 Firmen über `POST /api/save {id, companies}` (gleiche Prüfung wie das MCP-Werkzeug: Dubletten, Sperrliste, Limit; die Antwort nennt abgewiesene Firmen in `abgewiesen_gesperrt`, `abgewiesen_doppelt` und `nicht_gespeichert_limit`). Ist das Gesamtziel erreicht, werden die übrigen Agenten sofort gestoppt, auch mitten in einer Anfrage. Antwortet der Server mit 401/403/404/409 (Auftrag beendet, abgebrochen oder weg), stoppen alle Agenten. Fehlen danach deutlich Firmen, läuft ein weiterer Durchgang über das ganze Gebiet mit frisch geholtem Auftrag (aktuelle Ausschlussliste).
4. Abschluss: `finish_research` (strict) schreibt Zusammenfassung und Gesprächsleitfaden über `POST /api/finish {id, summary, guide}`.

Technik: offizielles SDK `@anthropic-ai/sdk` (exakt gepinnt in `cloudflare/package.json`), von `build.py` per esbuild zu `dist/direct.js` gebündelt (`cloudflare/direct-entry.mjs` → `cloudflare/direct.mjs`). Modell `claude-opus-5-5` (Standard) oder `claude-sonnet-5-5` (günstiger), adaptives Denken, `effort: "medium"`, keine Sampling-Parameter, `tool_choice` automatisch, Streaming mit `finalMessage()`, `max_tokens` 32000, automatisches Prompt-Caching, serverseitiger Fallback bei Ablehnungen (`fallbacks: "default"`, Beta `server-side-fallback-2026-07-01`). Die Antworten werden unverändert an den Verlauf angehängt, nur nach einem Fallback mitten in der Antwort entfallen laut Doku die Blöcke vor dem letzten `fallback`-Block außer Text und vollständigen Server-Werkzeug-Paaren; `pause_turn` wird fortgesetzt; mehrere Werkzeugaufrufe einer Antwort gehen gesammelt in einer Nachricht zurück; ungültiges Werkzeug-JSON wird als `is_error` gemeldet. Fehler werden über die SDK-Fehlerklassen unterschieden (ungültiger Schlüssel, Ratenlimit mit Wartezeit, sonstige API-Fehler). „Abbrechen“ stoppt die Anfragen sofort (AbortController) und bricht den Auftrag ab; bereits gespeicherte Firmen bleiben.

Grenzen je Lauf: höchstens 30 Anfragen je Agent, `web_fetch` mit `max_content_tokens: 20000`, serverseitiges Leeren alter Werkzeugergebnisse (`context_management` mit `clear_tool_uses_20250919`, Beta `context-management-2025-06-27`, ab 60.000 Eingabe-Tokens, die letzten 4 bleiben; der gesendete Verlauf bleibt unverändert, also verträglich mit Preserved Thinking). Lehnt das API diese Option ab, läuft der Lauf einmalig ohne sie weiter. Ein abgelehnter Request (400, z. B. Kontextlimit) beendet nur das betroffene Teilgebiet.

Kostenobergrenze: 0,50 $ je angeforderter Firma, mindestens 2,50 $ (`budgetFor` in `direct.mjs`), vor dem Start in der Oberfläche angezeigt. Wird sie erreicht, stoppen alle Agenten (höchstens eine laufende Anfrage je Agent schießt darüber), die Liste wird ohne weitere bezahlte Anfrage mit Hinweis abgeschlossen, gefundene Firmen bleiben. Abgebrochene und wiederholte Anfragen werden mit dem bis dahin gemeldeten `usage` mitgezählt. Solange die Recherche läuft, warnt der Browser vor dem Schließen des Tabs.

Kosten: Die Oberfläche zählt die Kosten aus `usage` mit (Opus 5.5: 4 $/20 $ je Mio. Ein-/Ausgabe-Tokens, Sonnet 5.5: 2 $/10 $, Cache-Lesen 0,20 $, Cache-Schreiben 1,25-facher Eingabepreis, Websuche 10 $ je 1.000 Suchen; Web-Abruf ohne Aufpreis, nur Tokens). Die Schätzung vor dem Start nimmt pro Firma etwa 0,15 bis 0,30 $ (Opus) bzw. 0,08 bis 0,15 $ (Sonnet) an: rund 2 Suchen, einige gelesene Seiten und der wachsende Verlauf je Agent, der überwiegend aus dem Cache gelesen wird. Das ist eine grobe Annahme, bis echte Läufe vorliegen; maßgeblich ist die Abrechnung bei Anthropic.

### Impressum und Datenschutz

`/impressum` und `/datenschutz` sind ohne Passwort erreichbar und in der Seitenleiste sowie im Verbindungsdialog verlinkt. Quellen: `cloudflare/legal/`; `build.py` übernimmt Schrift- und Farb-Tokens (hell/dunkel) aus `public/index.html` in `dist/legal.css`.

### Bauen und Veröffentlichen

`npm ci --prefix cloudflare` (liefert auch esbuild und das Anthropic-SDK für `dist/direct.js`), `python3 cloudflare/build.py` (bricht ab, wenn ein Anker in `public/index.html` fehlt), prüfen mit `node --test cloudflare/test.mjs`, veröffentlichen mit `npx wrangler deploy`. Benötigt: Secret `SHARE_PASSWORD`, KV-Namespace `anrufliste-oauth` (Bindung `OAUTH_KV`, in `wrangler.toml`), SQLite-Durable-Objects-Migration (in `wrangler.toml`). Lokal: `npx wrangler dev --var SHARE_PASSWORD:…`.

Auf Cloudflare wird kein Claude-Konto und kein Anthropic-API-Key gespeichert (beim direkten Weg bleibt der Schlüssel im Browser); es laufen keine lokalen Helfer oder Claude-Code-Container. Der Recherche-Chat läuft im Claude-Tab des jeweiligen Nutzers. Ein Browserwechsel oder gelöschte Cookies erzeugen einen neuen getrennten Zugang.

Der lokale CLI-Betrieb bleibt unabhängig davon nutzbar. Das frühere Mac-Testpaket ist kein Bestandteil der öffentlichen Webversion.

### OpenAI und Codex

Die Browser-Oberfläche bietet keinen OpenAI-Weg an. Technisch akzeptiert der MCP-Server (`…/mcp`, OAuth) aber auch ChatGPT- und Codex-Clients: Ihre Weiterleitungen (chatgpt.com, chat.openai.com, platform.openai.com) sind bei der Client-Registrierung erlaubt, weil nicht alle Callback-Pfade dokumentiert sind. Einen Zugang ohne OAuth gibt es nicht mehr. Es wird kein OpenAI-API-Key und kein ChatGPT-Token auf dem Server hinterlegt.

Verbindungen werden pro Nutzerzugang und Anbieter anhand der MCP-Client-Identifikation angezeigt. Diese technische Erkennung bestätigt keine konkrete Modellverfügbarkeit und keine erfolgreiche KI-Recherche.
