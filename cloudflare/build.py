from pathlib import Path
import shutil,re
root=Path(__file__).resolve().parent.parent
dist=root/'dist'
if dist.exists():shutil.rmtree(dist)
dist.mkdir()
shutil.copytree(root/'public'/'fonts',dist/'fonts')
shutil.copy(root/'cloudflare'/'web.js',dist/'web.js')
s=(root/'public'/'index.html').read_text()
def must(text,old,new):
    # Every anchor must still exist in public/index.html; a silent miss would ship local-only UI.
    if old not in text:raise SystemExit('Anker fehlt in public/index.html: '+old[:90])
    return text.replace(old,new)
# Legal pages share the design tokens (fonts, colours, light/dark) of the app.
a=s.index('@font-face');b=s.index('*{box-sizing',a)
(dist/'legal.css').write_text(s[a:b]+(root/'cloudflare'/'legal'/'legal.css').read_text())
for name in ('impressum.html','datenschutz.html'):shutil.copy(root/'cloudflare'/'legal'/name,dist/name)
# Keep the exact local UI, including the table, mobile rules and theme control.
a=s.index('      <div class="keybox');b=s.index('      <p class="small"><span id="ver">',a)
s=s[:a]+s[b:]
s=must(s,'data-i="keyShort">API-Schlüssel','data-i="keyShort">Claude verbinden')
s=must(s,'data-i="local">Läuft nur auf deinem Rechner.','data-i="local">Im Browser. Dein eigenes Claude-Konto.')
s=must(s,'Alte Excel-Listen, deren Firmen übersprungen werden sollen, in diesen Ordner legen:</span> <code id="altDir" style="color:var(--ink-2)"></code>','Firmen aus deinen Listen der letzten 6 Monate und gesperrte Firmen werden bei neuen Recherchen übersprungen.</span><code id="altDir" hidden></code>')
s=must(s,'<span data-i="local">Im Browser. Dein eigenes Claude-Konto.</span></p>','<span data-i="local">Im Browser. Dein eigenes Claude-Konto.</span></p>\n      <p class="small"><a href="/impressum" target="_blank" style="color:var(--ink-3)">Impressum</a> · <a href="/datenschutz" target="_blank" style="color:var(--ink-3)">Datenschutz</a></p>')
s=must(s,'<div id="setup"></div>', '<div class="footrow" style="margin-bottom:20px;gap:12px;flex-wrap:wrap"><label for="cloudProvider" style="color:var(--ink-2)">Recherche mit</label><select id="cloudProvider" style="font:13px var(--font);padding:8px 12px;border:1px solid var(--rule-2);border-radius:5px;background:var(--sheet);color:var(--ink)"><option value="claude">Claude</option><option value="openai">OpenAI (ChatGPT / Codex)</option></select></div><div id="setup"></div>')
s=must(s,'<div class="steps" id="steps">','<div id="cloudHandoff" class="notice info hide" style="margin:16px 28px"><div class="t"><b id="cloudHandoffTitle">Mit deinem eigenen Claude recherchieren</b><p id="cloudHandoffText" style="margin:8px 0">Aktiviere im Claude-Chat den Anrufliste-Connector und die Websuche. Füge den kopierten Auftrag ein. Die Firmen erscheinen anschließend automatisch hier.</p><button class="btn pri sm" id="cloudResearch" type="button">Auftrag kopieren &amp; Claude öffnen ↗</button><details id="cloudPromptBox" style="margin-top:12px"><summary>Auftrag zum Kopieren anzeigen</summary><textarea id="cloudPrompt" readonly aria-label="Rechercheauftrag" style="width:100%;min-height:130px;margin-top:8px;background:var(--sheet);color:var(--ink);border:1px solid var(--rule);padding:12px"></textarea></details><p class="small" id="cloudCopyState" aria-live="polite"></p></div></div><div class="steps" id="steps">')
a=s.index('function renderStatus()');b=s.index('function updateRunBtn()',a)
s=s[:a]+'function renderStatus() { cloudStatus(); }\n'+s[b:]
s=must(s,"const ready = st && st.installed && st.loggedIn && st.python && !st.claudeTooOld;",'const ready = !!st;')
s=must(s,"if (a.dataset.act === 'login') { loggingIn = true; loginUrl = null; renderStatus(); api('/api/login', {}); }","if (a.dataset.act === 'login') showConnector();")
s=must(s,"else setView('job');","else { await cloudTick(); setView('job'); }")
s=must(s,"$('#dlBtn').href = '/api/excel?t=' + job.id;","$('#dlBtn').href = '/api/excel?id=' + job.id;")
s=must(s,"'/api/excel?list=' + encodeURIComponent(v)","'/api/excel?id=' + encodeURIComponent(v)")
a=s.index("$('#keySave').onclick");b=s.index("$('#langBtn').onclick",a);s=s[:a]+s[b:]
a=s.index('function connect()');b=s.index("window.addEventListener('focus'",a);s=s[:a]+'function connect() { connectCloud(); }\n'+s[b:]
s=must(s,"$('#keyToggle').onclick = () => $('#keyBox').classList.toggle('hide');","$('#keyToggle').onclick = showConnector;")
# Override environment-specific copy before translation is first applied.
s=must(s,'applyLang();\nrefreshStatus()',"Object.assign(DE, {keyShort:'Verbinden',local:'Im Browser. Dein eigenes Claude-Konto.',noDupes:'Firmen aus deinen Listen der letzten 6 Monate und gesperrte Firmen werden bei neuen Recherchen übersprungen.',runHint:'Auftrag hier erstellen, im eigenen Claude-Tab recherchieren.',h2d:'Dein Claude recherchiert. Firmen erscheinen hier live.'});\nObject.assign(EN, {keyShort:'Connect Claude',local:'In your browser. Your own Claude account.',noDupes:'Companies from your lists of the last 6 months and blocked companies are excluded from new research.',runHint:'Create your brief here, research in your own Claude tab.',h2d:'Your Claude researches. Companies appear live here.'});\napplyLang();\nrefreshStatus()")
dialog=(root/'cloudflare'/'connection-dialog.html').read_text()
s=must(s,'<script>\nconst $',dialog+'\n<script src="/web.js"></script>\n<script>\nconst $')
for left in ('in diesen Ordner legen:</span>','>API-Schlüssel</button>','>Läuft nur auf deinem Rechner.</span>'):
    if left in s:raise SystemExit('Lokaler Text im Web-Build: '+left)
(dist/'index.html').write_text(s)
print('Browser-Oberfläche gebaut: identisches Layout zur lokalen Referenz, ohne App-Downloads.')
