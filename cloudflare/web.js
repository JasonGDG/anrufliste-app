// Browser-only adapters. Research runs inside the user's own Claude or OpenAI account.
let connectorUrl='',connectorLegacyUrl='',cloudConnected=false,cloudPrompt='',lastSnapshot='',cloudPolling=false,cloudConnections={},cloudConnectedAt=null;
let cloudProvider='claude';
try{if(localStorage.getItem('research-provider')==='openai')cloudProvider='openai'}catch{}
function cloudText(de,en){return typeof lang!=='undefined'&&lang==='en'?en:de}
function cloudProviderName(){return cloudProvider==='openai'?'OpenAI':'Claude'}
function cloudClientName(){return cloudProvider==='openai'?'ChatGPT Work':'Claude'}
function cloudIsConnected(){return !!cloudConnections[cloudProvider]||(cloudProvider==='claude'&&!!cloudConnectedAt&&!Object.keys(cloudConnections).length)}
function cloudApplyProvider(){
 const client=cloudClientName(),name=cloudProviderName();
 if($('#cloudProvider'))$('#cloudProvider').value=cloudProvider;
 for(const [key,value]of Object.entries({lead:cloudText(`Dein eigenes ${client} sucht passende Firmen mit Entscheidern, Durchwahlen und Kaufsignalen. Jede Angabe mit Quelle, keine Firma doppelt.`,`Your own ${client} finds matching companies with decision makers, direct lines and buying signals. Every fact with a source.`),local:cloudText(`Im Browser. Dein eigenes ${name}-Konto.`,`In your browser. Your own ${name} account.`),runHint:cloudText(`Auftrag hier erstellen, im eigenen ${client}-Tab recherchieren.`,`Create your brief here, research in your own ${client} tab.`),h2d:cloudText(`Dein ${client} recherchiert. Firmen erscheinen hier live.`,`Your ${client} researches. Companies appear live here.`)}))document.querySelectorAll(`[data-i="${key}"]`).forEach(e=>e.textContent=value);
 $('#cloudHandoffTitle').textContent=cloudText(`Mit deinem eigenen ${client} recherchieren`,`Research with your own ${client}`);
 $('#cloudHandoffText').textContent=cloudProvider==='openai'?cloudText('Aktiviere in ChatGPT Work dein Anrufliste-Plugin und die Websuche. Füge den kopierten Auftrag ein. Die Firmen erscheinen automatisch hier.','In ChatGPT Work, enable your Anrufliste plugin and web search. Paste the copied brief. Companies appear here automatically.'):cloudText('Ein Klick öffnet Claude mit dem fertigen Auftrag, dort nur noch Senden drücken. Der Anrufliste-Connector muss eingeschaltet sein (Menü „+“ → Konnektoren). Die Firmen erscheinen automatisch hier.','One click opens Claude with your brief, just press send there. The Anrufliste connector must be on (menu “+” → Connectors). Companies appear here automatically.');
 $('#cloudResearch').textContent=cloudProvider==='openai'?cloudText(`Auftrag kopieren & ${client} öffnen ↗`,`Copy brief & open ${client} ↗`):cloudText(`In ${client} recherchieren ↗`,`Research in ${client} ↗`);
 $('#summaryBox').querySelector('summary').textContent=cloudText('Zusammenfassung der Recherche','Research summary');
 cloudStatus();
}
function cloudStatus(){
 const connected=cloudIsConnected(),name=cloudProviderName();
 $('#acct').className='who '+(connected?'ok':'bad');
 $('#acctLbl').textContent=connected?cloudText(`${name} verbunden`,`${name} connected`):cloudText(`${name} verbinden`,`Connect ${name}`);
 $('#acctMail').textContent='';$('#ver').textContent='Anrufliste Web';
 $('#setup').innerHTML=connected?'':notice('info',cloudText(`Dein eigenes ${name} verbinden`,`Connect your own ${name}`),esc(cloudProvider==='openai'?cloudText('Füge die Anrufliste einmal als persönliches MCP-Plugin in ChatGPT hinzu. Im Browser recherchierst du anschließend in ChatGPT Work. Derselbe Server lässt sich auch in deinem vorhandenen Codex-Client verbinden.','Add Anrufliste as a personal MCP plugin in ChatGPT. Use ChatGPT Work for browser research. The same server also works with your existing Codex client.'):cloudText('Einmal den Anrufliste-Connector in deinem Claude-Konto hinzufügen und die Verbindung hier bestätigen. Danach hier den Auftrag erstellen und in deinem Claude-Tab recherchieren lassen.','Add the Anrufliste connector to your Claude account once and confirm the connection here. Then create a brief here and research in your own Claude tab.')),`<button class="btn pri sm" data-act="login">${esc(cloudText(`${name} verbinden`,`Connect ${name}`))}</button>`);
 updateRunBtn();
}
function cloudPublic(j){if(!j)return null;return {...j,state:j.state==='waiting'?'running':j.state,phase:j.state==='waiting'?'prepare':j.state==='running'?'research':null,excel:j.firms.length?'Anrufliste.xlsx':null,cols:cloudCols(j),listId:j.id,log:[],endedAt:['done','cancelled'].includes(j.state)?j.updatedAt:null}}
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
   renderJob();renderNav();
   const active=data.job&&['waiting','running'].includes(data.job.state);$('#cloudHandoff').classList.toggle('hide',!active);
   if(active){
    cloudPrompt=`Nutze meinen Anrufliste-Connector bzw. mein Anrufliste-Plugin. Rufe get_research_brief mit job_id "${data.job.id}" auf. Recherchiere die darin beschriebene Zielgruppe mit Websuche und lies die öffentlichen Firmenwebsites. Speichere belegte Firmen nach je 3–5 mit save_companies für diesen Auftrag. Verwende nur belegte Angaben; fehlende Werte: –. Schließe mit finish_research ab und speichere einen konkreten Gesprächsleitfaden. Niemanden kontaktieren und keine Formulare absenden.`;
    $('#cloudPrompt').value=cloudPrompt;
    $('#stateTxt').textContent=data.job.state==='waiting'?cloudText(`Auftrag bereit. Öffne ihn in deinem eigenen ${cloudClientName()}-Tab.`,`Brief ready. Open it in your own ${cloudClientName()} tab.`):cloudText('Dein verbundenes Konto recherchiert. Gespeicherte Firmen erscheinen hier.','Your connected account is researching. Saved companies appear here.');
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
 const legacy=esc(connectorLegacyUrl);
 $('#connectorAfter').innerHTML=openai?'<ol start="3"><li>Unter <strong>Authentication</strong> die Option <strong>OAuth</strong> wählen und speichern.</li><li>Auf <strong>Connect</strong> klicken. Es öffnet sich diese Website: anmelden, falls gefragt, und mit <strong>Verbinden</strong> bestätigen. Bitte im selben Browser, in dem du die Anrufliste nutzt.</li><li>In ChatGPT auf <strong>Work</strong> wechseln und im Chat <strong>@Anrufliste</strong> auswählen. Die Websuche muss für die Recherche verfügbar sein. Den hier kopierten Auftrag einfügen.</li></ol><details><summary>OAuth klappt nicht?</summary><p>Übergangsweise geht auch ein persönlicher Link mit der Option <strong>No authentication</strong>. Er enthält deinen Zugang, also nicht weitergeben:</p><input readonly aria-label="Persönlicher Übergangslink" value="'+legacy+'" style="width:100%;padding:8px;background:var(--navy);color:var(--ink);border:1px solid var(--rule-2);border-radius:5px;font:11px ui-monospace,monospace"></details><details><summary>Du nutzt bereits Codex?</summary><p>In deinem vorhandenen Codex-Client kannst du denselben Server als <strong>Streamable HTTP MCP-Server</strong> mit der obigen URL verbinden und die Anmeldung im Browser bestätigen. Die Browser-Schaltfläche öffnet ChatGPT Work.</p></details><p class="small">Die Verfügbarkeit hängt von deinem Konto und den Plugin-Berechtigungen deines Workspaces ab.</p>':'<ol start="3"><li>Auf <strong>Hinzufügen</strong> und danach auf <strong>Verbinden</strong> klicken.</li><li>Es öffnet sich diese Website: anmelden, falls gefragt, und mit <strong>Verbinden</strong> bestätigen. Bitte im selben Browser, in dem du die Anrufliste nutzt, denn deine Listen gehören zu diesem Browser.</li><li>Im Recherche-Chat den Anrufliste-Connector und die Websuche aktivieren.</li></ol><p class="small">Bei Claude Team oder Enterprise muss ein Admin eigene (benutzerdefinierte) Connectors erlauben.</p>';
 cloudConnectionStatus();
}
async function showConnector(){try{const result=await api('/api/connection');if(result.error)throw Error(result.error);connectorUrl=result.url;connectorLegacyUrl=result.legacyUrl||'';$('#connectorUrl').value=connectorUrl;cloudDialog();$('#connectorDialog').showModal();await cloudTick()}catch(e){$('#errorBox').innerHTML=notice('bad','Verbindung fehlgeschlagen',esc(e.message))}}
async function copyValue(value,feedback){try{await navigator.clipboard.writeText(value);feedback.textContent=cloudText('Kopiert.','Copied.');return true}catch{feedback.textContent=cloudText('Bitte den Text markieren und manuell kopieren.','Please select and copy the text manually.');return false}}
window.addEventListener('DOMContentLoaded',()=>{
 cloudApplyProvider();
 $('#cloudProvider').onchange=()=>{cloudProvider=$('#cloudProvider').value;try{localStorage.setItem('research-provider',cloudProvider)}catch{}lastSnapshot='';cloudApplyProvider();cloudTick()};
 $('#langBtn').addEventListener('click',cloudApplyProvider);
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
