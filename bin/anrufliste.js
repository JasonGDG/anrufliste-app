#!/usr/bin/env node
// Anrufliste: lokale Oberfläche im Browser, die das installierte Claude Code des Nutzers startet.
// Kein eigener Login: claude nutzt den Login aus ~/.claude (oder optional einen eigenen API-Schlüssel).
// Claude recherchiert nur (Web + Dateien im Auftragsordner); Ordner und Excel baut dieser Server selbst.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pipeline } = require('stream');

const VERSION = require('../package.json').version;
const HOME = os.homedir();
const PKG = path.join(__dirname, '..');
const SKILL = path.join(PKG, 'skill');
const LISTEN_DIR = path.resolve(process.env.ANRUFLISTEN_DIR || path.join(HOME, 'Anruflisten'));
const WORK = path.resolve(process.env.ANRUFLISTE_STATE_DIR || path.join(HOME, '.anrufliste-app'));
const CONFIG = path.join(WORK, 'config.json');
const IS_WIN = process.platform === 'win32';
const ARGS = process.argv.slice(2);
const STRICH = '–';

if (ARGS.includes('--help') || ARGS.includes('-h')) {
  console.log(`anrufliste ${VERSION}
Startet die Anrufliste im Browser. Voraussetzung: Claude Code (claude) ist installiert und angemeldet.

  npx anrufliste            starten und Browser öffnen
  --port <n>                Port (Standard 3737)
  --no-open                 Browser nicht öffnen
Listen landen in ${LISTEN_DIR} (änderbar mit ANRUFLISTEN_DIR).`);
  process.exit(0);
}
if (ARGS.includes('--version') || ARGS.includes('-v')) { console.log(VERSION); process.exit(0); }
const portArg = ARGS.indexOf('--port');
const DESKTOP = ARGS.includes('--desktop');
const PORT_START = DESKTOP ? 0 : Number(portArg >= 0 ? ARGS[portArg + 1] : process.env.PORT) || 3737;

// ---------- Konfiguration ----------

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
}
function writeConfig(c) {
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 });
}

// ---------- claude finden und starten ----------

function findClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const names = IS_WIN ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const dirs = (process.env.PATH || '').split(path.delimiter).concat([
    path.join(HOME, '.local', 'bin'), path.join(HOME, '.claude', 'local'),
    '/opt/homebrew/bin', '/usr/local/bin', path.join(process.env.APPDATA || '', 'npm'),
  ]);
  for (const d of dirs) for (const n of names) {
    const p = path.join(d, n);
    try { if (fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

// Umgebung für jeden claude-Kindprozess: Schlüssel aus der Umgebung raus (sonst gewinnt er gegen den Login),
// HOME bleibt unverändert. Nur ein im Tool selbst hinterlegter Schlüssel wird gesetzt.
function claudeEnv() {
  const env = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k];
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  const key = readConfig().apiKey;
  if (key) env.ANTHROPIC_API_KEY = key;
  return env;
}

// Alle Argumente sind feste Wörter ohne Leerzeichen; Nutzertext geht nur über stdin.
// Unter Windows braucht claude.cmd die Shell, deshalb dort den Pfad quoten.
function spawnClaude(args, opts = {}) {
  const bin = findClaude();
  if (!bin) throw Object.assign(new Error('claude nicht gefunden'), { code: 'ENOENT' });
  const shell = IS_WIN && /\.cmd$/i.test(bin);
  return spawn(shell ? `"${bin}"` : bin, args, {
    env: claudeEnv(), cwd: opts.cwd || HOME, shell, windowsHide: true,
    detached: !IS_WIN, // eigene Prozessgruppe, damit Abbrechen auch Kindprozesse trifft
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
  });
}

function collect(p, timeout) {
  return new Promise(resolve => {
    let out = '', err = '';
    const t = setTimeout(() => killTree(p), timeout);
    p.stdout && p.stdout.setEncoding('utf8');
    p.stderr && p.stderr.setEncoding('utf8');
    p.stdout && p.stdout.on('data', d => out += d);
    p.stderr && p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(t); resolve({ code: -1, out, err: e.message, missing: e.code === 'ENOENT' }); });
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

function runClaude(args, timeout = 20000) {
  try { return collect(spawnClaude(args), timeout); }
  catch (e) { return Promise.resolve({ code: -1, out: '', err: e.message, missing: true }); }
}

function killTree(p, hard = false) {
  if (!p || !p.pid) return;
  // Unter macOS/Linux auch nach dem Ende von claude die Gruppe treffen: dort können Kindprozesse übrig sein
  if (IS_WIN && (p.exitCode !== null || p.signalCode)) return;
  try {
    if (IS_WIN) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
    else process.kill(-p.pid, hard ? 'SIGKILL' : 'SIGTERM');
  } catch { try { p.kill(hard ? 'SIGKILL' : 'SIGTERM'); } catch {} }
  if (!hard && !IS_WIN) setTimeout(() => killTree(p, true), 5000).unref();
}

// ---------- Python (baut Ordner, Ausschlussliste und Excel) ----------

let pythonCmd = null;
function runPlain(cmd, args, timeout = 15000, extraEnv = {}) {
  let p;
  try {
    p = spawn(cmd, args, {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ANRUFLISTEN_DIR: LISTEN_DIR, PYTHONIOENCODING: 'utf-8', ...extraEnv },
    });
  } catch (e) { return Promise.resolve({ code: -1, out: '', err: e.message }); }
  return collect(p, timeout);
}
async function findPython() {
  for (const c of process.env.ANRUFLISTE_PYTHON ? [process.env.ANRUFLISTE_PYTHON] : IS_WIN ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    const r = await runPlain(c, ['--version'], 8000);
    if (r.code === 0 && /Python 3/.test(r.out + r.err)) { pythonCmd = c; return true; }
  }
  pythonCmd = null;
  return false;
}
function build(cmd, arg, timeout = 180000) {
  return runPlain(pythonCmd || 'python3', [path.join(SKILL, 'build.py'), cmd, arg], timeout);
}

// ---------- Status (kurz zwischengespeichert, gleichzeitige Abfragen zusammengefasst) ----------

// Ab dieser Version sperrt Claude Code Lesezugriffe außerhalb des Arbeitsordners zuverlässig
const MIN_CLAUDE = [2, 1, 257];
function versionOk(text) {
  const m = String(text).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const v = m.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== MIN_CLAUDE[i]) return v[i] > MIN_CLAUDE[i];
  return true;
}

let statusCache = null, statusAt = 0, statusRun = null;
async function status(fresh = false) {
  if (!fresh && statusCache && Date.now() - statusAt < 5000) return statusCache;
  // eine laufende Abfrage kann von vor dem Login stammen: bei fresh danach neu fragen
  if (statusRun) { const r = await statusRun; if (!fresh) return r; }
  if (statusRun) return statusRun;
  statusRun = (async () => {
    const [v, python] = await Promise.all([runClaude(['--version']), findPython()]);
    const cfg = readConfig();
    let s = { version: VERSION, python, apiKey: !!cfg.apiKey, listsDir: LISTEN_DIR.startsWith(HOME) ? '~' + LISTEN_DIR.slice(HOME.length) : LISTEN_DIR, installed: v.code === 0 };
    if (s.installed) {
      const a = await runClaude(['auth', 'status']);
      let j = {};
      try { j = JSON.parse(a.out); } catch {}
      s = { ...s, claudeVersion: v.out.trim(), claudeTooOld: !versionOk(v.out), loggedIn: !!j.loggedIn || !!cfg.apiKey, email: j.email || '',
        authMethod: cfg.apiKey ? 'api-key' : (j.authMethod || '') };
    }
    statusCache = s; statusAt = Date.now();
    return s;
  })().finally(() => { statusRun = null; });
  return statusRun;
}

// ---------- Live-Updates an den Browser (Server-Sent Events) ----------

const clients = new Set();
function send(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

// ---------- Firmen lesen (gleiche Regeln wie build.py) ----------

const RANG = { hoch: 0, mittel: 1, niedrig: 2 };
function leer(v) {
  if (v == null) return STRICH;
  if (Array.isArray(v)) v = v.filter(Boolean).join('; ');
  else if (typeof v === 'object') v = Object.entries(v).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join('; ');
  v = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return v && !['-', '—', 'k.A.', 'k. A.', 'None', 'null', 'n/a'].includes(v) ? v : STRICH;
}
function domain(url) {
  let w = String(url || '').trim().toLowerCase().split(' ')[0];
  w = w.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].split('@').pop().split(':')[0];
  w = w.replace(/^www\d?\./, '').replace(/\.$/, '');
  return /^[a-z0-9äöü.-]+\.[a-z]{2,}$/.test(w) ? w : '';
}
const wort = s => ((leer(s).toLowerCase().match(/[a-zäöü]+/) || [''])[0]);
function maZahl(s) {
  const n = (String(s || '').match(/\d[\d.]*/g) || []).map(x => x.replace(/\./g, '')).filter(x => /^\d+$/.test(x)).map(Number).filter(x => x < 100000);
  return n.length ? n[0] : null;
}
const eingeschraenkt = e => leer(e).toLowerCase().startsWith('eingeschränkt');

function readAuftrag(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'auftrag.json'), 'utf8')); } catch { return null; }
}

function columns(a) {
  a = a || {};
  const extra = [];
  for (let e of a.extra_spalten || []) {
    if (typeof e === 'string') e = [e, e];
    if (Array.isArray(e) && e.length) extra.push([String(e[0]), String(e[1] ?? e[0])]);
  }
  return {
    verbund: a.verbund_name || 'Verbund/Gruppe', signal: a.signal_name || 'Kaufsignal',
    konkurrenz: a.konkurrenz_name || 'Anbieter schon da?', extra,
  };
}

const fileCache = new Map(); // letzter gültiger Stand je Datei, falls gerade halb geschrieben
function readFirms(dir, useCache = false) {
  let files = [];
  try { files = fs.readdirSync(path.join(dir, 'data')).filter(f => f.endsWith('.json')).sort(); } catch { return []; }
  let ausschluss = new Set();
  try { ausschluss = new Set(fs.readFileSync(path.join(dir, 'ausschluss_domains.txt'), 'utf8').split(/\s+/).filter(Boolean)); } catch {}
  const auftrag = readAuftrag(dir) || {};
  const rows = [], seen = new Set();
  for (const f of files) {
    const p = path.join(dir, 'data', f);
    let arr;
    try {
      arr = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(arr) && useCache) fileCache.set(p, arr);
    } catch { arr = useCache ? fileCache.get(p) : null; }
    if (!Array.isArray(arr)) continue;
    for (const r0 of arr) {
      if (!r0 || typeof r0 !== 'object') continue;
      const r = {};
      for (const k of ['firma', 'ort', 'bundesland', 'verbund', 'ansprechpartner', 'rolle', 'tel_ansprechpartner', 'tel_zentrale',
        'email', 'website', 'mitarbeiter', 'mitarbeiter_sicher', 'erreichbarkeit', 'kaufsignal', 'signal_staerke', 'konkurrenz',
        'eignung', 'notiz']) r[k] = leer(r0[k]);
      if (r.firma === STRICH) continue;
      if (r.konkurrenz === STRICH) r.konkurrenz = 'k. A.';
      const ex = r0.extra && typeof r0.extra === 'object' ? r0.extra : {};
      r.extra = Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, leer(v)]));
      const key = domain(r.website) || r.firma.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');
      const nameKey = r.firma.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');
      if (ausschluss.has(key) || ausschluss.has(nameKey) || seen.has(key)) continue;
      seen.add(key);
      const n = maZahl(r.mitarbeiter), min = auftrag.min_mitarbeiter;
      r.stufe = min && n !== null && n < min ? 'C' : r.ansprechpartner !== STRICH ? (r.tel_ansprechpartner !== STRICH ? 'A' : 'B') : 'C';
      r.eingeschraenkt = eingeschraenkt(r.erreichbarkeit);
      r.teil = f.replace(/\.json$/, '');
      r.key = key;
      rows.push(r);
    }
  }
  const k = r => [RANG[wort(r.eignung)] ?? 3, RANG[wort(r.signal_staerke)] ?? 3, r.stufe, r.eingeschraenkt ? 0 : 1, r.bundesland, r.ort];
  rows.sort((a, b) => { const x = k(a), y = k(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
  rows.forEach((r, i) => { r.prio = i + 1; });
  return rows;
}

function findExcel(dir) {
  try {
    const x = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
    return x.length ? path.join(dir, x.sort().pop()) : null;
  } catch { return null; }
}

// ---------- Sperrliste und Aufbewahrung ----------

// Gesperrte Firmen (Widerspruch, „nicht mehr anrufen“): eine Domain bzw. ein Firmenschlüssel pro Zeile.
// Liegt in alt/, damit build.py sie beim Ausschluss automatisch mitliest. Bleibt auch nach dem Löschen von Listen bestehen.
const SPERRLISTE = path.join(LISTEN_DIR, 'alt', 'sperrliste.txt');
const AUFBEWAHRUNG_TAGE = 183; // Listen werden nach 6 Monaten gelöscht

function sperrKey(v) {
  const t = String(v || '').trim();
  return domain(t) || t.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');
}
function readSperrliste() {
  try { return fs.readFileSync(SPERRLISTE, 'utf8').split(/\r?\n/).map(x => x.trim()).filter(Boolean); } catch { return []; }
}
function sperren(eintrag) {
  const key = sperrKey(eintrag);
  if (!key) return false;
  const liste = readSperrliste();
  if (!liste.includes(key)) {
    fs.mkdirSync(path.dirname(SPERRLISTE), { recursive: true });
    fs.writeFileSync(SPERRLISTE, [...liste, key].join('\n') + '\n');
  }
  return key;
}
function entsperren(key) {
  const liste = readSperrliste().filter(x => x !== key);
  fs.writeFileSync(SPERRLISTE, liste.join('\n') + (liste.length ? '\n' : ''));
}

function listDate(id) {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return new Date(m[1] + 'T00:00:00').getTime();
  try { return fs.statSync(path.join(LISTEN_DIR, id)).mtimeMs; } catch { return Date.now(); }
}
// Nur Ordner, die nachweislich von der Anrufliste stammen (Datumsname + auftrag.json oder data/) – nie fremde Ordner löschen
function isListDir(id) {
  if (!/^\d{4}-\d{2}-\d{2}-/.test(id)) return false;
  const dir = path.join(LISTEN_DIR, id);
  return fs.existsSync(path.join(dir, 'auftrag.json')) || fs.existsSync(path.join(dir, 'data'));
}
function deleteList(id) {
  if (!listDirs().includes(id) || !isListDir(id)) return false;
  if (job && job.state === 'running' && job.dir && path.basename(job.dir) === id) return false;
  fs.rmSync(path.join(LISTEN_DIR, id), { recursive: true, force: true });
  return true;
}
// Datenminimierung: Listen älter als 6 Monate endgültig löschen (die Sperrliste bleibt)
function aufraeumen() {
  const grenze = Date.now() - AUFBEWAHRUNG_TAGE * 86400000;
  for (const id of listDirs()) {
    if (listDate(id) < grenze && deleteList(id)) console.log(`  Liste nach 6 Monaten gelöscht: ${id}`);
  }
}

function listDirs() {
  try {
    return fs.readdirSync(LISTEN_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'alt').map(d => d.name);
  } catch { return []; }
}

// ---------- Auftrag ----------

let job = null;
let loginProc = null;

// Claude bekommt keine Kommandozeile. Lesen/Schreiben nur im Auftragsordner (Arbeitsverzeichnis, acceptEdits),
// dazu Websuche, Webseiten lesen und Unteragenten.
const ALLOWED = ['WebSearch', 'WebFetch', 'Agent', 'Task', 'TodoWrite', 'mcp__exa__web_search_exa', 'mcp__exa__web_fetch_exa'];
const DISALLOWED = ['Bash', 'BashOutput', 'KillShell', 'KillBash', 'NotebookEdit', 'Skill', 'SlashCommand'];

// Fester Riegel gegen Prompt-Injection aus Webseiten: nichts außerhalb des Auftragsordners lesen
const GUARD = { permissions: {
  blockReadsOutsideWorkingDirectories: true,
  deny: ['Read(~/.anrufliste-app/**)', 'Read(~/.ssh/**)', 'Read(~/.claude/**)', 'Read(~/.aws/**)', 'Read(~/.config/**)',
    'Read(~/.gnupg/**)', 'Read(~/.netrc)', 'Read(//etc/**)'],
} };

function slugTitel(p) {
  return `${p.ziel} ${p.region}`.replace(/\s+/g, ' ').trim().slice(0, 50);
}

function buildPrompt(p, dir) {
  const recherche = fs.readFileSync(path.join(SKILL, 'recherche-auftrag.md'), 'utf8')
    .replace(/; wenn eine Seite blockt, curl[^\n]*?<url>/, '');
  const values = {
    APP_ANGEBOT: p.angebot, ZIEL: p.ziel, REGION: p.region, GROESSE: p.groesse || 'keine Vorgabe',
    APP_ANZAHL: String(p.anzahl), EXTRA: p.extra || 'keine', APP_ORDNER: dir,
    SPRACHE: p.lang === 'en' ? 'English' : 'Deutsch', TITEL: slugTitel(p),
    DATUM: new Date().toISOString().slice(0, 10), RECHERCHE_AUFTRAG: recherche,
  };
  // ein Durchgang: Platzhalter im eingesetzten Recherche-Auftrag bleiben für die Unteragenten stehen
  return fs.readFileSync(path.join(SKILL, 'app-auftrag.md'), 'utf8')
    .replace(/\{([A-Z_]+)\}/g, (m, k) => (k in values ? values[k] : m));
}

function publicJob(j = job) {
  if (!j) return null;
  return {
    id: j.id, params: j.params, state: j.state, phase: j.phase, startedAt: j.startedAt, endedAt: j.endedAt,
    log: j.log.slice(-60), error: j.error, excel: j.excel ? path.basename(j.excel) : null, summary: j.summary,
    cols: j.cols, firms: j.firms, listId: j.dir ? path.basename(j.dir) : null,
  };
}

function addLog(me, text, kind = 'info') {
  if (!text) return;
  const entry = { t: Date.now(), kind, text: String(text).slice(0, 400) };
  me.log.push(entry);
  if (me.log.length > 300) me.log.shift();
  if (me === job) send('log', entry);
}

// Fehler nur aus der aktuellen Antwort erkennen (stderr, Ergebnis, vom CLI erzeugte Meldungen), nie aus Webinhalten
function classify(text) {
  const t = String(text || '');
  if (/not logged in|please run \/login|invalid api key|authentication_error|oauth token|\b401\b|unauthori[sz]ed/i.test(t))
    return { code: 'login', message: t.trim().slice(0, 300) };
  if (/spend limit|extra usage|out of (extra )?usage|credit balance/i.test(t))
    return { code: 'spend', message: t.trim().slice(0, 300) };
  if (/usage limit|rate[ _-]?limit|limit reached|hit your (\w+ )?limit|\b429\b|overloaded|resets? (at )?\d/i.test(t))
    return { code: 'limit', message: t.trim().slice(0, 300) };
  return null;
}

function describeTool(b) {
  const i = b.input || {};
  switch (b.name) {
    case 'WebSearch': case 'mcp__exa__web_search_exa': return `Sucht: ${i.query || ''}`;
    case 'WebFetch': case 'mcp__exa__web_fetch_exa': return `Liest: ${i.url || (i.urls || [])[0] || ''}`;
    case 'Agent': case 'Task': return `Startet Recherche: ${i.description || ''}`;
    case 'Write': return `Speichert: ${path.basename(i.file_path || '')}`;
    default: return null;
  }
}

async function startJob(params) {
  if (job && (job.state === 'running')) return { error: 'busy' };
  const me = job = {
    id: crypto.randomUUID(), params, state: 'running', phase: 'prepare', startedAt: Date.now(), endedAt: null,
    log: [], error: null, excel: null, dir: null, summary: '', proc: null, buf: '', stderr: '',
    cols: columns(null), firms: [],
  };
  send('job', publicJob());
  addLog(me, 'Bereitet den Auftrag vor');

  // Ordner und Ausschlussliste legt der Server selbst an: so ist eindeutig, wohin dieser Auftrag schreibt
  const st = await status();
  if (st.claudeTooOld) return finish(me, 'error', { code: 'old', message: st.claudeVersion });
  if (!pythonCmd) await findPython();
  // beim ersten Mal richtet build.py openpyxl in einer eigenen Umgebung ein (kann bei langsamem Netz dauern)
  const check = await build('check', '-', 300000);
  if (check.code !== 0) return finish(me, 'error', { code: 'python', message: (check.err || check.out || 'Excel-Baukasten ließ sich nicht einrichten').trim().slice(-600) });
  const neu = await build('neu', slugTitel(params), 60000);
  const dir = neu.code === 0 ? neu.out.trim().split(/\r?\n/).pop().trim() : '';
  if (!dir || !fs.existsSync(dir)) return finish(me, 'error', { code: 'crash', message: (neu.err || neu.out || 'Ordner ließ sich nicht anlegen').trim().slice(-600) });
  me.dir = path.resolve(dir);
  const aus = await build('ausschluss', me.dir, 300000);
  if (aus.code !== 0) return finish(me, 'error', { code: 'crash', message: 'Die Liste der schon gelieferten Firmen ließ sich nicht lesen, deshalb wurde nicht gestartet (sonst kämen Firmen doppelt).\n' + (aus.err || aus.out).trim().slice(-500) });
  if (me.cancelled) return finish(me, 'cancelled');

  let proc;
  try {
    proc = spawnClaude([
      // nur Projekt-Einstellungen: Hooks und Regeln aus ~/.claude/settings.json des Nutzers gehören nicht in diesen Lauf
      '-p', '--setting-sources', 'project', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--allowedTools', ALLOWED.join(','), '--disallowedTools', DISALLOWED.join(','),
      '--settings', JSON.stringify(GUARD),
    ], { cwd: me.dir, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return finish(me, 'error', { code: 'missing', message: e.message });
  }
  me.proc = proc;
  me.phase = 'research';
  send('job', publicJob());
  proc.stdin.on('error', () => {});
  proc.stdin.end(buildPrompt(params, me.dir));

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    me.buf += chunk;
    let i;
    while ((i = me.buf.indexOf('\n')) >= 0) {
      const line = me.buf.slice(0, i).trim();
      me.buf = me.buf.slice(i + 1);
      if (line) handleLine(me, line);
    }
  });
  proc.stderr.on('data', d => { me.stderr = (me.stderr + d).slice(-4000); });
  proc.on('error', e => { me.spawnError = e; });
  // 'exit' statt 'close': ein hängender Enkelprozess mit offener Pipe darf den Auftrag nicht festhalten
  let done = false;
  const end = code => { if (!done) { done = true; afterClaude(me, code); } };
  proc.on('close', code => end(code));
  proc.on('exit', code => setTimeout(() => end(code), 3000));
  me.timer = setInterval(() => pollFiles(me), 3000);
  return { ok: true };
}

function handleLine(me, line) {
  let ev;
  try { ev = JSON.parse(line); } catch { return; }
  if (ev.type === 'assistant' && ev.message) {
    const synthetic = ev.message.model === '<synthetic>' || ev.error;
    for (const b of ev.message.content || []) {
      if (b.type === 'text' && b.text) {
        if (synthetic) { const err = classify(b.text); if (err) me.error = err; }
        if (!ev.parent_tool_use_id) addLog(me, b.text.split('\n').find(s => s.trim()) || '', 'text');
      } else if (b.type === 'tool_use') {
        const d = describeTool(b);
        if (d) addLog(me, d, ev.parent_tool_use_id ? 'sub' : 'tool');
      }
    }
    if (ev.error && !me.error) me.error = classify(String(ev.error)) || { code: 'crash', message: String(ev.error) };
  } else if (ev.type === 'result') {
    me.summary = typeof ev.result === 'string' ? ev.result : '';
    if (ev.is_error) {
      const errs = Array.isArray(ev.errors) ? ev.errors.map(String).join('\n') : '';
      const text = [errs, me.summary].filter(Boolean).join('\n');
      me.error = classify(text) || classify(me.stderr) || me.error || { code: 'crash', message: text.slice(0, 600) || ev.subtype || 'Fehler' };
    }
  }
}

function pollFiles(me) {
  if (!me.dir) return;
  const auftrag = readAuftrag(me.dir);
  const cols = columns(auftrag);
  const firms = readFirms(me.dir, true);
  const changed = JSON.stringify(firms) !== JSON.stringify(me.firms) || JSON.stringify(cols) !== JSON.stringify(me.cols);
  me.firms = firms; me.cols = cols;
  if (changed && me === job) send('firms', { cols, firms });
}

async function afterClaude(me, code) {
  clearInterval(me.timer);
  if (me.state !== 'running') return;
  if (me.spawnError) return finish(me, 'error', { code: me.spawnError.code === 'ENOENT' ? 'missing' : 'crash', message: me.spawnError.message });
  pollFiles(me);
  if (me.cancelled) {
    // gefundene Firmen nicht verlieren: sie sind ab jetzt für künftige Listen gesperrt, also als Teilliste anbieten
    if (me.firms.length) await buildExcel(me);
    return finish(me, 'cancelled');
  }
  const err = me.error || (code !== 0 ? classify(me.stderr) : null);
  const ok = code === 0 && !err;

  // Excel baut der Server; bei einem Abbruch mittendrin wird sie als Teilergebnis angeboten
  if (me.firms.length) {
    const b = await buildExcel(me);
    if (me.state !== 'running') return;
    if (!me.excel && ok) return finish(me, 'error', { code: 'noexcel', message: (b.err || b.out).trim().slice(-600) });
  }
  if (ok && me.excel) return finish(me, 'done');
  if (ok) return finish(me, 'error', { code: 'noexcel', message: me.summary || 'Claude ist fertig, hat aber keine Firmen gespeichert.' });
  finish(me, 'error', err || { code: 'crash', message: (me.stderr || `Claude wurde mit Code ${code} beendet.`).trim().slice(-600) });
}

async function buildExcel(me) {
  me.phase = 'excel';
  addLog(me, 'Baut die Excel-Datei');
  if (me === job) send('job', publicJob());
  if (!readAuftrag(me.dir)) {
    fs.writeFileSync(path.join(me.dir, 'auftrag.json'), JSON.stringify({
      titel: slugTitel(me.params), datum: new Date().toISOString().slice(0, 10), angebot: me.params.angebot,
      region: me.params.region,
    }, null, 2));
  }
  const b = await build('excel', me.dir);
  me.excel = b.code === 0 ? findExcel(me.dir) : null;
  return b;
}

function finish(me, state, error = null) {
  if (me.state !== 'running') return;
  clearInterval(me.timer);
  me.state = state;
  me.error = error;
  me.endedAt = Date.now();
  me.phase = null;
  // Dauer der Recherche in der Liste festhalten, damit sie auch später angezeigt werden kann
  if (me.dir) {
    try {
      const f = path.join(me.dir, 'auftrag.json');
      const a = JSON.parse(fs.readFileSync(f, 'utf8'));
      a.dauer_s = Math.round((me.endedAt - me.startedAt) / 1000);
      fs.writeFileSync(f, JSON.stringify(a, null, 2));
    } catch {}
  }
  if (me.proc) killTree(me.proc); // Reste der Prozessgruppe aufräumen
  if (me === job) send('job', publicJob());
  if (me.onEnd && state === 'cancelled') me.onEnd();
}

function cancelJob() {
  if (!job || job.state !== 'running') return false;
  job.cancelled = true;
  if (job.proc) killTree(job.proc);
  return true;
}

// ---------- Anmeldung ----------

function startLogin() {
  if (loginProc) return { ok: true, running: true };
  const running = job && job.state === 'running' ? job : null;
  const vorher = statusCache ? `${statusCache.loggedIn}|${statusCache.email}|${statusCache.authMethod}` : null;
  const lp = { proc: null, out: '', code: null };
  try { lp.proc = spawnClaude(['auth', 'login'], { stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { return { error: e.message }; }
  loginProc = lp;
  const onData = d => {
    lp.out += d;
    const url = lp.out.match(/https:\/\/\S+/);
    if (url) send('loginUrl', url[0]);
  };
  lp.proc.stdout.on('data', onData);
  lp.proc.stderr.on('data', onData);
  lp.proc.stdin.on('error', () => {});
  const timer = setTimeout(() => killTree(lp.proc), 10 * 60 * 1000);
  let fertig = false;
  const end = async code => {
    if (fertig) return;
    fertig = true;
    clearTimeout(timer);
    if (loginProc === lp) loginProc = null;
    const s = await status(true);
    send('status', s);
    // Kontowechsel: der laufende Auftrag behält sonst den alten Login. Nur genau diesen neu starten,
    // und erst wenn er wirklich beendet ist.
    const wechsel = code === 0 && s.loggedIn && `${s.loggedIn}|${s.email}|${s.authMethod}` !== vorher;
    if (wechsel && running && job === running && running.state === 'running' && running.phase === 'research') {
      running.onEnd = () => { if (job === running) startJob(running.params); };
      running.cancelled = true;
      if (running.proc) killTree(running.proc);
    }
  };
  lp.proc.on('error', () => end(-1));
  lp.proc.on('close', code => end(code));
  return { ok: true };
}

// ---------- frühere Listen ----------

function lists() {
  return listDirs().map(d => {
    try {
      const x = findExcel(path.join(LISTEN_DIR, d));
      return x ? { id: d, file: path.basename(x), mtime: fs.statSync(x).mtimeMs } : null;
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, 50).map(l => {
    const dir = path.join(LISTEN_DIR, l.id);
    return { ...l, titel: (readAuftrag(dir) || {}).titel || l.id, count: readFirms(dir).length };
  });
}

// ---------- HTTP ----------

let PORT = PORT_START;

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 100000) { reject(new Error('zu groß')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  });
}

// Nur Anfragen von der eigenen Seite: schützt vor fremden Websites, die localhost ansprechen (CSRF, DNS-Rebinding)
function trusted(req, p) {
  const okHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  if (!okHosts.includes(req.headers.host || '')) return false;
  const site = req.headers['sec-fetch-site'];
  const isApi = p.startsWith('/api/');
  if (isApi && site && site !== 'same-origin' && site !== 'none') return false;
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.origin;
  if (!origin || !okHosts.map(h => `http://${h}`).includes(origin)) return false;
  return /^application\/json/.test(req.headers['content-type'] || '');
}

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/fonts/hanken-latin.woff2': ['fonts/hanken-latin.woff2', 'font/woff2'],
  '/fonts/hanken-latin-ext.woff2': ['fonts/hanken-latin-ext.woff2', 'font/woff2'],
};

function sendFile(res, file, type, headers = {}) {
  fs.stat(file, (err, st) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, ...headers });
    pipeline(fs.createReadStream(file), res, () => {});
  });
}

const clean = (v, n = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (!trusted(req, p)) return json(res, 403, { error: 'forbidden' });
  try {
    if ((req.method === 'GET' || req.method === 'HEAD') && STATIC[p]) {
      const [f, type] = STATIC[p];
      return sendFile(res, path.join(PKG, 'public', f), type, f.endsWith('.html') ? {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
        'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      } : { 'Cache-Control': 'public, max-age=86400' });
    }
    if (req.method === 'GET' && p === '/api/status') return json(res, 200, await status(url.searchParams.has('fresh')));
    if (req.method === 'GET' && p === '/api/lists') return json(res, 200, { lists: lists() });
    if (req.method === 'GET' && p === '/api/sperrliste') return json(res, 200, { sperrliste: readSperrliste() });
    if (req.method === 'GET' && p === '/api/list') {
      const id = url.searchParams.get('id');
      if (!id || !listDirs().includes(id)) return json(res, 404, { error: 'not found' });
      const dir = path.join(LISTEN_DIR, id), a = readAuftrag(dir) || {};
      return json(res, 200, { id, titel: a.titel || id, cols: columns(a), firms: readFirms(dir), dauer_s: a.dauer_s ?? null });
    }
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: job\ndata: ${JSON.stringify(publicJob())}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (req.method === 'GET' && p === '/api/excel') {
      const id = url.searchParams.get('list');
      let file;
      if (id) {
        if (!listDirs().includes(id)) return json(res, 404, { error: 'not found' });
        file = findExcel(path.join(LISTEN_DIR, id));
      } else file = job && job.excel;
      if (!file) return json(res, 404, { error: 'not found' });
      return sendFile(res, file, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}` });
    }
    if (req.method === 'POST' && p === '/api/run') {
      const b = await body(req);
      const params = {
        angebot: clean(b.angebot, 600), ziel: clean(b.ziel), region: clean(b.region), groesse: clean(b.groesse),
        extra: clean(b.extra, 600), anzahl: Math.max(5, Math.min(100, parseInt(b.anzahl, 10) || 40)),
        lang: b.lang === 'en' ? 'en' : 'de',
      };
      if (!params.angebot || !params.ziel || !params.region) return json(res, 400, { error: 'missing' });
      const r = await startJob(params);
      return json(res, r && r.error ? 409 : 200, r || { ok: true });
    }
    if (req.method === 'POST' && p === '/api/cancel') return json(res, 200, { ok: cancelJob() });
    if (req.method === 'POST' && p === '/api/sperren') {
      const b = await body(req);
      const key = sperren(clean(b.eintrag, 300));
      return json(res, key ? 200 : 400, key ? { ok: true, key, sperrliste: readSperrliste() } : { error: 'leer' });
    }
    if (req.method === 'POST' && p === '/api/entsperren') {
      const b = await body(req);
      entsperren(clean(b.key, 300));
      return json(res, 200, { ok: true, sperrliste: readSperrliste() });
    }
    if (req.method === 'POST' && p === '/api/loeschen') {
      const b = await body(req);
      const ok = deleteList(clean(b.id, 300));
      return json(res, ok ? 200 : 400, ok ? { ok: true } : { error: 'nicht möglich' });
    }
    if (req.method === 'POST' && p === '/api/login') return json(res, 200, startLogin());
    if (req.method === 'POST' && p === '/api/apikey') {
      const b = await body(req);
      const cfg = readConfig();
      const key = clean(b.key, 300);
      if (key && !/^sk-ant-/.test(key)) return json(res, 400, { error: 'format' });
      if (key) cfg.apiKey = key; else delete cfg.apiKey;
      writeConfig(cfg);
      return json(res, 200, await status(true));
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});

function openBrowser(u) {
  const cmd = process.platform === 'darwin' ? 'open' : IS_WIN ? 'cmd' : 'xdg-open';
  const args = IS_WIN ? ['/c', 'start', '', u] : [u];
  try {
    const c = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    c.on('error', () => console.log(`  Bitte im Browser öffnen: ${u}`));
    c.unref();
  } catch { console.log(`  Bitte im Browser öffnen: ${u}`); }
}

// Port belegt: den nächsten nehmen. Nur ein 'listening'-Handler, sonst melden sich alte Versuche mit falschem Port.
let tries = 0;
server.on('error', e => {
  if (!DESKTOP && e.code === 'EADDRINUSE' && tries++ < 20) return server.listen(++PORT, '127.0.0.1');
  console.error('Server startet nicht:', e.message);
  process.exit(1);
});
server.once('listening', () => {
  PORT = server.address().port;
  const u = `http://localhost:${PORT}`;
  console.log(`\n  Anrufliste läuft: ${u}\n  Listen: ${LISTEN_DIR}\n  Beenden: Ctrl+C\n`);
  if (DESKTOP) console.log('ANRUFLISTE_READY=' + u);
  if (!ARGS.includes('--no-open')) openBrowser(u);
});
function listen(port) {
  PORT = port;
  server.listen(port, '127.0.0.1');
}

function shutdown() {
  if (job && job.proc && job.state === 'running') killTree(job.proc, true);
  if (loginProc) killTree(loginProc.proc, true);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown); // Terminalfenster geschlossen
process.on('exit', () => {
  // claude läuft in eigener Prozessgruppe und bekommt SIGHUP nicht mit: beim Beenden immer mitnehmen
  for (const p of [job && job.proc, loginProc && loginProc.proc]) {
    if (p && p.pid) { try { IS_WIN ? p.kill() : process.kill(-p.pid, 'SIGKILL'); } catch {} }
  }
});

fs.mkdirSync(path.join(LISTEN_DIR, 'alt'), { recursive: true });
aufraeumen();
setInterval(aufraeumen, 12 * 3600 * 1000).unref();
listen(PORT_START);
