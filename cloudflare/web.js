// Browser-only adapters. Research runs directly here with the user's own Anthropic API key, or in the user's own Claude chat via the connector.
let connectorUrl='',cloudConnected=false,cloudPrompt='',lastSnapshot='',cloudPolling=false,cloudConnections={},cloudConnectedAt=null;
// Standard: Recherche direkt hier mit dem eigenen Anthropic-API-Schlüssel des Nutzers. Alternative: eigener Claude-Chat über den Connector.
let cloudProvider='direct';
try{const v=localStorage.getItem('research-provider');if(v==='claude')cloudProvider=v}catch{}
// Direct research: the user's own Anthropic API key stays in this browser (localStorage) and only goes to api.anthropic.com.
const DIRECT_KEY='anthropic-api-key',DIRECT_MODEL='direct-model',DIRECT_JOB='direct-job';
try{const v=localStorage.getItem(DIRECT_KEY);if(v&&!/^sk-ant-api\d*-[A-Za-z0-9_-]{20,}$/.test(v))localStorage.removeItem(DIRECT_KEY)}catch{}
let directJobId=null,directRunning=false,directCtl=null,directLog=[],directPhase='prepare',directCostSum=null,directError='',directDone=false;
function lsGet(k){try{return localStorage.getItem(k)||''}catch{return ''}}
function lsSet(k,v){try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch{}}
function directKey(){return lsGet(DIRECT_KEY)}
function directModel(){const m=lsGet(DIRECT_MODEL);return m==='claude-sonnet-5-5'?m:'claude-opus-5-5'}
function directModelLabel(){return directModel()==='claude-sonnet-5-5'?'Claude Sonnet 5.5':'Claude Opus 5.5'}
const usd=v=>v.toLocaleString(typeof lang!=='undefined'&&lang==='en'?'en-US':'de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
function cloudText(de,en){return typeof lang!=='undefined'&&lang==='en'?en:de}
function cloudProviderName(){return cloudProvider==='openai'?'OpenAI':cloudProvider==='direct'?'Anthropic':'Claude'}
function cloudClientName(){return cloudProvider==='openai'?'ChatGPT Work':'Claude'}
function cloudIsConnected(){if(cloudProvider==='direct')return !!directKey();return !!cloudConnections[cloudProvider]||(cloudProvider==='claude'&&!!cloudConnectedAt&&!Object.keys(cloudConnections).length)}
function cloudApplyProvider(){
 const client=cloudClientName(),name=cloudProviderName();
 if($('#cloudProvider'))$('#cloudProvider').value=cloudProvider;
 const direct=cloudProvider==='direct';
 if($('#keyToggle'))$('#keyToggle').textContent=direct?cloudText('Anthropic-Schlüssel','Anthropic key'):cloudText('Verbinden','Connect');
 for(const [key,value]of Object.entries({lead:cloudText(`Dein eigenes ${client} sucht passende Firmen mit Entscheidern, Durchwahlen und Kaufsignalen. Jede Angabe mit Quelle, keine Firma doppelt.`,`Your own ${client} finds matching companies with decision makers, direct lines and buying signals. Every fact with a source.`),local:cloudText(`Im Browser. Dein eigenes ${name}-Konto.`,`In your browser. Your own ${name} account.`),runHint:direct?cloudText('Claude recherchiert direkt hier im Browser. Tab offen lassen.','Claude researches right here in your browser. Keep the tab open.'):cloudText(`Auftrag hier erstellen, im eigenen ${client}-Tab recherchieren.`,`Create your brief here, research in your own ${client} tab.`),h2d:cloudText(`Dein ${client} recherchiert. Firmen erscheinen hier live.`,`Your ${client} researches. Companies appear live here.`)}))document.querySelectorAll(`[data-i="${key}"]`).forEach(e=>e.textContent=value);
 $('#cloudHandoffTitle').textContent=cloudText(`Mit deinem eigenen ${client} recherchieren`,`Research with your own ${client}`);
 $('#cloudHandoffText').textContent=cloudProvider==='openai'?cloudText('Aktiviere in ChatGPT Work dein Anrufliste-Plugin und die Websuche. Füge den kopierten Auftrag ein. Die Firmen erscheinen automatisch hier.','In ChatGPT Work, enable your Anrufliste plugin and web search. Paste the copied brief. Companies appear here automatically.'):cloudText('Ein Klick öffnet Claude mit dem fertigen Auftrag, dort nur noch Senden drücken. Der Anrufliste-Connector muss eingeschaltet sein (Menü „+“ → Konnektoren). Die Firmen erscheinen automatisch hier.','One click opens Claude with your brief, just press send there. The Anrufliste connector must be on (menu “+” → Connectors). Companies appear here automatically.');
 $('#cloudResearch').textContent=cloudProvider==='openai'?cloudText(`Auftrag kopieren & ${client} öffnen ↗`,`Copy brief & open ${client} ↗`):cloudText(`In ${client} recherchieren ↗`,`Research in ${client} ↗`);
 $('#summaryBox').querySelector('summary').textContent=cloudText('Zusammenfassung der Recherche','Research summary');
 cloudStatus();
}
function directCount(){return Math.min(100,Math.max(5,parseInt($('#anzahl')?.value)||20))}
function directBudget(n=directCount()){return window.AnrufDirect?window.AnrufDirect.budgetFor(n):Math.max(2.5,0.5*n)}
function directEstimate(){
 const n=directCount();
 const [lo,hi]=window.AnrufDirect?window.AnrufDirect.estimate(directModel(),n):directModel()==='claude-sonnet-5-5'?[0.08*n,0.15*n]:[0.15*n,0.3*n];
 // Anthropic bills in US dollars; euro values are a rough conversion. The cap is a hard stop in US dollars.
 const cap=directBudget(n);
 return cloudText(`grob geschätzt ${Math.round(lo*0.9)} bis ${Math.round(hi*0.9)} € für ${n} Firmen mit ${directModelLabel()} (Schätzung; hängt von Branche und Gebiet ab). Obergrenze: höchstens ${usd(cap)} $ (0,50 $ je Firma); wird sie erreicht, stoppt die Recherche und die bis dahin gefundenen Firmen bleiben`,`roughly €${Math.round(lo*0.9)} to €${Math.round(hi*0.9)} for ${n} companies with ${directModelLabel()} (estimate). Cap: at most $${usd(cap)} ($0.50 per company); when reached, the research stops and companies found so far are kept`);
}
function directPanel(){
 const key=directKey();
 const keyRow=key?`<p style="margin:8px 0">${esc(cloudText('API-Schlüssel hinterlegt','API key saved'))} (…${esc(key.slice(-4))}). <button class="btn sec sm" type="button" data-act="directKeyDel">${esc(cloudText('Schlüssel löschen','Delete key'))}</button></p>`:`<div class="sperrrow"><input id="directKeyInput" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" aria-label="${esc(cloudText('Anthropic-API-Schlüssel','Anthropic API key'))}"><button class="btn pri sm" type="button" data-act="directKeySave">${esc(cloudText('Speichern','Save'))}</button></div>`;
 const model=directModel();
 return notice(key?'info':'warn',cloudText('Direkt hier recherchieren','Research right here'),`<p style="margin:8px 0">${esc(cloudText('Claude sucht in diesem Tab mit deinem eigenen Anthropic-API-Schlüssel. Kein Wechsel in den Claude-Chat nötig.','Claude searches in this tab with your own Anthropic API key. No need to switch to the Claude chat.'))}</p>${keyRow}<p style="margin:10px 0 0"><label for="directModel" style="color:var(--ink-2)">${esc(cloudText('Modell','Model'))}</label> <select id="directModel" style="font:13px var(--font);padding:6px 10px;border:1px solid var(--rule-2);border-radius:5px;background:var(--sheet);color:var(--ink)"><option value="claude-opus-5-5"${model==='claude-opus-5-5'?' selected':''}>Claude Opus 5.5</option><option value="claude-sonnet-5-5"${model==='claude-sonnet-5-5'?' selected':''}>${esc(cloudText('Claude Sonnet 5.5 (günstiger)','Claude Sonnet 5.5 (cheaper)'))}</option></select></p><p class="small" id="directHint" style="margin:10px 0 0">${esc(cloudText('Der Schlüssel bleibt nur in diesem Browser und geht direkt an Anthropic, nie an unseren Server. Kosten laufen über dein Anthropic-Konto: ','The key stays in this browser only and goes straight to Anthropic, never to our server. Costs are billed to your Anthropic account: ')+directEstimate()+'.')}</p>`);
}
function cloudStatus(){
 const connected=cloudIsConnected(),name=cloudProviderName();
 if(cloudProvider==='direct'){
  $('#acct').className='who '+(connected?'ok':'bad');
  $('#acctLbl').textContent=connected?cloudText('API-Schlüssel hinterlegt','API key saved'):cloudText('API-Schlüssel fehlt','API key missing');
  $('#acctMail').textContent='';$('#ver').textContent='Anrufliste Web';
  $('#setup').innerHTML=directPanel();
  updateRunBtn();return;
 }
 $('#acct').className='who '+(connected?'ok':'bad');
 $('#acctLbl').textContent=connected?cloudText(`${name} verbunden`,`${name} connected`):cloudText(`${name} verbinden`,`Connect ${name}`);
 $('#acctMail').textContent='';$('#ver').textContent='Anrufliste Web';
 $('#setup').innerHTML=connected?'':notice('info',cloudText(`Dein eigenes ${name} verbinden`,`Connect your own ${name}`),esc(cloudProvider==='openai'?cloudText('Füge die Anrufliste einmal als persönliches MCP-Plugin in ChatGPT hinzu. Im Browser recherchierst du anschließend in ChatGPT Work. Derselbe Server lässt sich auch in deinem vorhandenen Codex-Client verbinden.','Add Anrufliste as a personal MCP plugin in ChatGPT. Use ChatGPT Work for browser research. The same server also works with your existing Codex client.'):cloudText('Einmal den Anrufliste-Connector in deinem Claude-Konto hinzufügen und die Verbindung hier bestätigen. Danach hier den Auftrag erstellen und in deinem Claude-Tab recherchieren lassen.','Add the Anrufliste connector to your Claude account once and confirm the connection here. Then create a brief here and research in your own Claude tab.')),`<button class="btn pri sm" data-act="login">${esc(cloudText(`${name} verbinden`,`Connect ${name}`))}</button>`);
 updateRunBtn();
}
function cloudPublic(j){if(!j)return null;const mine=j.id===directJobId,active=['waiting','running'].includes(j.state);return {...j,state:j.state==='waiting'?'running':j.state,phase:mine&&active?directPhase:j.state==='waiting'?'prepare':j.state==='running'?'research':null,excel:j.firms.length?'Anrufliste.xlsx':null,cols:cloudCols(j),listId:j.id,log:mine?directLog:[],endedAt:['done','cancelled'].includes(j.state)?j.updatedAt:null}}
function cloudCols(j){return {verbund:'Verbund/Gruppe',signal:'Kaufsignal',konkurrenz:'Anbieter schon da?',extra:[...new Set((j.firms||[]).flatMap(f=>Object.keys(f.extra||{})))].slice(0,8).map(k=>[k,k])}}
function cloudConnectionStatus(){
 $('#connectorState').textContent=cloudIsConnected()?cloudText(`${cloudProviderName()} verbunden. Du kannst den Dialog schließen.`,`${cloudProviderName()} connected. You can close this dialog.`):cloudText(`Warte auf die erste Verbindung aus ${cloudProviderName()}.`,`Waiting for the first connection from ${cloudProviderName()}.`);
}
async function cloudTick(){
 if(cloudPolling)return;cloudPolling=true;
 try{
  const data=await api('/api/snapshot');if(data.error)throw Error(data.error);
  const snapshot=JSON.stringify(data),wasConnected=cloudIsConnected();
  cloudConnections=data.connections||{};cloudConnectedAt=data.connectedAt;cloudConnected=cloudIsConnected();
  if(st){st.connected=cloudConnected;st.loggedIn=cloudConnected;if(wasConnected!==cloudConnected)cloudStatus()}
  cloudConnectionStatus();
  if(snapshot!==lastSnapshot){
   lastSnapshot=snapshot;job=cloudPublic(data.job);savedLists=(data.lists||[]).map(x=>({...x,file:'Anrufliste.xlsx'}));
   renderJob();renderNav();renderDirectCost();
   const active=data.job&&['waiting','running'].includes(data.job.state);
   const directHere=active&&directRunning&&data.job.id===directJobId,interrupted=active&&!directHere&&lsGet(DIRECT_JOB)===data.job.id;
   $('#cloudHandoff').classList.toggle('hide',!active||directHere);
   if(directHere)$('#stateTxt').textContent=cloudText('Claude recherchiert direkt hier im Browser. Tab offen lassen, solange die Recherche läuft. Firmen erscheinen unten live.','Claude is researching right here in your browser. Keep this tab open while it runs. Companies appear below live.');
   else if(active){
    cloudPrompt=`Nutze meinen Anrufliste-Connector bzw. mein Anrufliste-Plugin. Rufe get_research_brief mit job_id "${data.job.id}" auf. Recherchiere die darin beschriebene Zielgruppe mit Websuche und lies die öffentlichen Firmenwebsites. Speichere belegte Firmen nach je 3–5 mit save_companies für diesen Auftrag. Verwende nur belegte Angaben; fehlende Werte: –. Schließe mit finish_research ab und speichere einen konkreten Gesprächsleitfaden. Niemanden kontaktieren und keine Formulare absenden. Antworte im Chat am Ende nur in einem Satz (z. B. „Fertig, 5 Firmen gespeichert, siehe Anrufliste.“), schreibe die Firmenliste nicht in den Chat.`;
    $('#cloudPrompt').value=cloudPrompt;
    $('#stateTxt').textContent=interrupted?cloudText('Die Recherche in diesem Browser wurde unterbrochen (Seite neu geladen oder Tab geschlossen). Bitte abbrechen und neu starten oder unten im Claude-Chat fortsetzen.','The research in this browser was interrupted (page reloaded or tab closed). Cancel and start again, or continue in the Claude chat below.'):data.job.state==='waiting'?cloudText(`Auftrag bereit. Öffne ihn in deinem eigenen ${cloudClientName()}-Tab.`,`Brief ready. Open it in your own ${cloudClientName()} tab.`):cloudText('Dein verbundenes Konto recherchiert. Gespeicherte Firmen erscheinen hier.','Your connected account is researching. Saved companies appear here.');
   }
  }
 }catch(e){$('#setup').innerHTML=notice('warn',cloudText('Verbindung unterbrochen','Connection interrupted'),esc(e.message))}
 finally{cloudPolling=false}
}
function connectCloud(){cloudTick();setInterval(cloudTick,2500)}
function cloudDialog(){
 const openai=cloudProvider==='openai';
 $('#connectorTitle').textContent=openai?'Eigenes OpenAI-Konto verbinden':'Dein eigenes Claude verbinden';
 $('#connectorInstructions').innerHTML=openai?'<p>Für die Browser-Version verbindest du die Anrufliste in deinem eigenen ChatGPT-Konto. Kein API-Key und keine Installation.</p><ol><li><strong>ChatGPT → Plugins → + → Add custom MCP server</strong> öffnen.</li><li>Name: <strong>Anrufliste</strong>. Unter <strong>Connection → Server URL</strong> diese Adresse eintragen:</li></ol>':'<p>Füge die Anrufliste einmal als Connector in deinem Claude-Konto hinzu. Kein API-Key, kein Geheimcode, keine Installation.</p><ol><li>In Claude <strong>Anpassen → Connectors</strong> öffnen und <strong>Benutzerdefinierten Connector hinzufügen</strong> wählen.</li><li>Name: <strong>Anrufliste</strong>. Als URL diese Adresse eintragen:</li></ol>';
 $('#providerSettingsLink').href=openai?'https://chatgpt.com/plugins':'https://claude.ai/settings/connectors';
 $('#providerSettingsLink').textContent=openai?'ChatGPT-Plugins öffnen ↗':'Claude-Connectors öffnen ↗';
 $('#connectorAfter').innerHTML=openai?'<ol start="3"><li>Unter <strong>Authentication</strong> die Option <strong>OAuth</strong> wählen und speichern.</li><li>Auf <strong>Connect</strong> klicken. Es öffnet sich diese Website: anmelden, falls gefragt, und mit <strong>Verbinden</strong> bestätigen. Bitte im selben Browser, in dem du die Anrufliste nutzt.</li><li>In ChatGPT auf <strong>Work</strong> wechseln und im Chat <strong>@Anrufliste</strong> auswählen. Die Websuche muss für die Recherche verfügbar sein. Den hier kopierten Auftrag einfügen.</li></ol><details><summary>Du nutzt bereits Codex?</summary><p>In deinem vorhandenen Codex-Client kannst du denselben Server als <strong>Streamable HTTP MCP-Server</strong> mit der obigen URL verbinden und die Anmeldung im Browser bestätigen. Die Browser-Schaltfläche öffnet ChatGPT Work.</p></details><p class="small">Die Verfügbarkeit hängt von deinem Konto und den Plugin-Berechtigungen deines Workspaces ab.</p>':'<ol start="3"><li>Auf <strong>Hinzufügen</strong> und danach auf <strong>Verbinden</strong> klicken.</li><li>Es öffnet sich diese Website: anmelden, falls gefragt, und mit <strong>Verbinden</strong> bestätigen. Bitte im selben Browser, in dem du die Anrufliste nutzt, denn deine Listen gehören zu diesem Browser.</li><li>Im Recherche-Chat den Anrufliste-Connector und die Websuche aktivieren.</li></ol><p class="small">Bei Claude Team oder Enterprise muss ein Admin eigene (benutzerdefinierte) Connectors erlauben.</p>';
 cloudConnectionStatus();
}
async function showConnector(){try{const result=await api('/api/connection');if(result.error)throw Error(result.error);connectorUrl=result.url;$('#connectorUrl').value=connectorUrl;cloudDialog();$('#connectorDialog').showModal();await cloudTick()}catch(e){$('#errorBox').innerHTML=notice('bad','Verbindung fehlgeschlagen',esc(e.message))}}
async function copyValue(value,feedback){try{await navigator.clipboard.writeText(value);feedback.textContent=cloudText('Kopiert.','Copied.');return true}catch{feedback.textContent=cloudText('Bitte den Text markieren und manuell kopieren.','Please select and copy the text manually.');return false}}
// ---------- Direct research in this browser ----------
function dlog(kind,text){
 const entry={kind,text:String(text).slice(0,400)};directLog.push(entry);
 while(directLog.length>200)directLog.shift();
 if(typeof job!=='undefined'&&job&&job.id===directJobId&&view==='job')addLog(entry);
}
function renderDirectCost(){
 const box=$('#directCost');if(!box)return;
 const show=job&&job.id===directJobId&&(directCostSum||directError);
 box.hidden=!show;if(!show)return;
 const c=directCostSum,searches=c?`${c.searches} ${cloudText(c.searches===1?'Websuche':'Websuchen','web searches')}`:'';
 const cap=c&&c.budget?cloudText(`, Obergrenze ${usd(c.budget)} $`,`, cap $${usd(c.budget)}`):'';
 const cost=c?(directDone||!directRunning?cloudText(`Kosten dieser Liste: ca. ${usd(c.usd)} $ (Tokens + ${searches}, laut Anthropic-Preisliste; maßgeblich ist deine Anthropic-Abrechnung).`,`Cost of this list: about $${usd(c.usd)} (tokens + ${searches}, at Anthropic list prices; your Anthropic bill is authoritative).`):cloudText(`Kosten bisher: ca. ${usd(c.usd)} $ (${searches}${cap}).`,`Cost so far: about $${usd(c.usd)} (${searches}${cap}).`)):'';
 box.innerHTML=(directError?`<b style="color:var(--red)">${esc(directError)}</b><br>`:'')+esc(cost);
}
// Server errors keep their HTTP status: the research stops all agents on 401/403/404/409 (job closed or gone).
function directFail(r,body){const e=Error(body.error||('HTTP '+r.status));e.status=r.status;e.closed=body.closed===true;return e}
async function directPost(path,data){
 const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const body=await r.json().catch(()=>({}));
 if(!r.ok||body.error)throw directFail(r,body);
 return body;
}
async function directGet(path){const r=await fetch(path);const body=await r.json().catch(()=>({}));if(!r.ok||body.error)throw directFail(r,body);return body}
// Called by run() before /api/run: in direct mode a key is required.
function cloudBeforeRun(){
 if(cloudProvider!=='direct')return true;
 if(directRunning){$('#errorBox').innerHTML=notice('warn',cloudText('Recherche läuft bereits','Research already running'),esc(cloudText('Bitte warten oder die laufende Recherche abbrechen.','Please wait or cancel the running research.')));return false}
 if(!directKey()){$('#errorBox').innerHTML=notice('warn',cloudText('API-Schlüssel fehlt','API key missing'),esc(cloudText('Bitte oben deinen Anthropic-API-Schlüssel eintragen oder unter „Recherche mit“ die Option „Im Claude-Chat (dein Claude-Abo)“ wählen.','Please enter your Anthropic API key above or choose “Im Claude-Chat (dein Claude-Abo)” under “Recherche mit”.')));$('#directKeyInput')?.focus();return false}
 if(!window.AnrufDirect){$('#errorBox').innerHTML=notice('bad',cloudText('Recherche-Modul nicht geladen','Research module not loaded'),esc(cloudText('Bitte die Seite neu laden.','Please reload the page.')));return false}
 return true;
}
// Called by run() after /api/run created the job.
function cloudAfterRun(created){if(cloudProvider==='direct'&&created&&created.id)startDirect(created.id,created.params?.anzahl)}
async function startDirect(id,anzahl){
 const D=window.AnrufDirect;
 directJobId=id;directRunning=true;directDone=false;directLog=[];directPhase='prepare';directCostSum=null;directError='';
 directCtl=new AbortController();lsSet(DIRECT_JOB,id);
 lastSnapshot='';
 dlog('info',cloudText(`Recherche startet direkt hier im Browser mit ${directModelLabel()}.`,`Research starts right here in your browser with ${directModelLabel()}.`));
 try{
  const result=await D.runResearch(id,{
   client:D.createClient(directKey()),model:directModel(),signal:directCtl.signal,budgetUsd:directBudget(anzahl||directCount()),
   log:dlog,onCost:c=>{directCostSum=c;renderDirectCost()},onPhase:p=>{directPhase=p;lastSnapshot='';cloudTick()},
   server:{brief:id=>directPost('/api/brief',{id}),save:(id,companies)=>directPost('/api/save',{id,companies}),finish:(id,summary,guide)=>directPost('/api/finish',{id,summary,guide}),list:id=>directGet('/api/list?id='+encodeURIComponent(id))}
  });
  directCostSum=result.cost;directDone=true;
  dlog('text',cloudText(`Fertig: ${result.total} Firmen, Kosten ca. ${usd(result.cost.usd)} $.`,`Done: ${result.total} companies, cost about $${usd(result.cost.usd)}.`));
 }catch(e){
  const d=D.describeError(e);
  if(d.code!=='aborted'){
   directError=d.message;dlog('warn',d.message);
   $('#errorBox').innerHTML=notice('bad',cloudText('Recherche gestoppt','Research stopped'),esc(d.message)+'<br>'+esc(cloudText('Bis dahin gefundene Firmen bleiben in der Liste.','Companies found so far stay in the list.')));
   await directPost('/api/cancel',{}).catch(()=>{});
  }else dlog('warn',cloudText('Recherche abgebrochen.','Research cancelled.'));
 }finally{
  directRunning=false;directCtl=null;lsSet(DIRECT_JOB,'');lastSnapshot='';
  await cloudTick();renderDirectCost();
 }
}
// Closing or reloading the tab stops the browser research: warn while it runs.
window.addEventListener('beforeunload',e=>{if(directRunning){e.preventDefault();e.returnValue=''}});
window.addEventListener('DOMContentLoaded',()=>{
 cloudApplyProvider();
 $('#cloudProvider').onchange=()=>{cloudProvider=$('#cloudProvider').value;try{localStorage.setItem('research-provider',cloudProvider)}catch{}lastSnapshot='';cloudApplyProvider();cloudTick()};
 $('#langBtn').addEventListener('click',cloudApplyProvider);
 // Cancelling also stops the browser research immediately (no further API calls).
 const keyToggle=$('#keyToggle').onclick;$('#keyToggle').onclick=()=>{if(cloudProvider!=='direct')return keyToggle&&keyToggle();setView('new');$('#directKeyInput')?.focus()};
 const cancel=$('#cancelBtn').onclick;$('#cancelBtn').onclick=()=>{directCtl?.abort();return cancel&&cancel()};
 document.addEventListener('click',e=>{
  const a=e.target.closest('[data-act]');if(!a)return;
  if(a.dataset.act==='directKeySave'){const v=($('#directKeyInput')?.value||'').trim();if(!v)return;
   // Nur echte Anthropic-API-Schlüssel annehmen (sk-ant-api…); Claude-Abo-Tokens, Passwörter o. Ä. ablehnen
   if(!/^sk-ant-api\d*-[A-Za-z0-9_-]{20,}$/.test(v)){$('#errorBox').innerHTML=notice('bad',cloudText('Das ist kein Anthropic-API-Schlüssel','This is not an Anthropic API key'),esc(cloudText('API-Schlüssel beginnen mit „sk-ant-api“ und sind rund 100 Zeichen lang. Du bekommst einen unter console.anthropic.com → API Keys.','API keys start with “sk-ant-api” and are about 100 characters long. Create one at console.anthropic.com → API Keys.')));return}
   lsSet(DIRECT_KEY,v);$('#errorBox').innerHTML='';cloudStatus()}
  if(a.dataset.act==='directKeyDel'){lsSet(DIRECT_KEY,'');cloudStatus()}
 });
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='directKeyInput'){e.preventDefault();document.querySelector('[data-act="directKeySave"]')?.click()}});
 document.addEventListener('change',e=>{if(e.target.id==='directModel'){lsSet(DIRECT_MODEL,e.target.value);const h=$('#directHint');if(h)cloudStatus()}});
 $('#anzahl')?.addEventListener('input',()=>{const h=$('#directHint');if(h&&cloudProvider==='direct')h.textContent=cloudText('Der Schlüssel bleibt nur in diesem Browser und geht direkt an Anthropic, nie an unseren Server. Kosten laufen über dein Anthropic-Konto: ','The key stays in this browser only and goes straight to Anthropic, never to our server. Costs are billed to your Anthropic account: ')+directEstimate()+'.'});
 $('#closeConnector').onclick=()=>$('#connectorDialog').close();
 $('#copyConnector').onclick=()=>copyValue(connectorUrl,$('#connectorState'));$('#checkConnector').onclick=()=>cloudTick();
 $('#cloudResearch').onclick=async()=>{
  // Erst kopieren (solange diese Seite den Fokus hat), dann öffnen. Claude bekommt den Auftrag direkt ins Eingabefeld.
  await copyValue(cloudPrompt,$('#cloudCopyState'));
  const url=cloudProvider==='openai'?'https://chatgpt.com/':'https://claude.ai/new?q='+encodeURIComponent(cloudPrompt);
  const tab=window.open(url,'_blank');if(tab)tab.opener=null;
  $('#cloudCopyState').textContent=cloudProvider==='openai'?cloudText('Auftrag kopiert. In ChatGPT Work @Anrufliste aktivieren, einfügen und absenden.','Brief copied. In ChatGPT Work enable @Anrufliste, paste and send.'):cloudText('Claude ist mit dem Auftrag geöffnet. Dort nur noch auf Senden drücken.','Claude is open with your brief. Just press send there.');
 };
});
