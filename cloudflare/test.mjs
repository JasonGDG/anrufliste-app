import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {register} from 'node:module';
import {ResearchRoom,RETENTION_DAYS} from './room.mjs';
// The OAuth library imports the Workers runtime module; Node gets a stand-in.
register('data:text/javascript,'+encodeURIComponent("export async function resolve(s,c,n){return s==='cloudflare:workers'?{url:'data:text/javascript,export class WorkerEntrypoint{}',shortCircuit:true}:n(s,c)}"));
const {default:worker,redirectAllowed}=await import('./worker.mjs');
const DAY=86400000;
function memoryStorage(){
 const map=new Map();let alarm=null;
 return {map,get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='string')map.set(k,structuredClone(v));else for(const [a,b]of Object.entries(k))map.set(a,structuredClone(b))},
  delete:async k=>{for(const x of [].concat(k))map.delete(x)},list:async({prefix,limit=Infinity})=>new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit).map(([k,v])=>[k,structuredClone(v)])),
  getAlarm:async()=>alarm,setAlarm:async t=>{alarm=t},deleteAlarm:async()=>{alarm=null}};
}
function memoryKV(){
 const map=new Map();
 return {map,
  async get(k,o){const e=map.get(k);if(!e||(e.exp&&e.exp<Date.now()))return null;return (o==='json'||o?.type==='json')?JSON.parse(e.v):e.v},
  async put(k,v,o={}){map.set(k,{v:String(v),exp:o.expirationTtl?Date.now()+o.expirationTtl*1000:o.expiration?o.expiration*1000:0})},
  async delete(k){map.delete(k)},
  async list({prefix='',limit=1000}={}){return {keys:[...map.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(name=>({name})),list_complete:true,cursor:''}}};
}
function setup(){
 const rooms=new Map();
 const env={SHARE_PASSWORD:'test-password',OAUTH_KV:memoryKV(),ASSETS:{fetch:async r=>new Response('static '+new URL(r.url).pathname)},ROOMS:{idFromName:x=>x,get(id){if(!rooms.has(id))rooms.set(id,new ResearchRoom({storage:memoryStorage(),blockConcurrencyWhile:fn=>fn()},env));return rooms.get(id)}}};
 const origin='https://test.example';
 const auth='Basic '+btoa('kollege:test-password');
 const ctx={waitUntil(){},passThroughOnException(){}};
 async function call(path,{cookie,body,form,raw,authHeader=auth,bearer,method=body||form?'POST':'GET',originHeader=origin,headers:extra={}}={}){
  const headers={...extra};if(authHeader&&!bearer)headers.Authorization=authHeader;if(bearer)headers.Authorization='Bearer '+bearer;if(cookie)headers.Cookie=cookie;
  if(body){headers['Content-Type']='application/json';headers.Origin=originHeader}
  if(form){headers['Content-Type']='application/x-www-form-urlencoded';if(originHeader)headers.Origin=originHeader}
  if(raw!==undefined)method='POST';
  return worker.fetch(new Request(origin+path,{method,headers,body:raw??(body?JSON.stringify(body):form?new URLSearchParams(form).toString():undefined),redirect:'manual'}),env,ctx);
 }
 const login=async()=>(await call('/')).headers.get('set-cookie').split(';')[0];
 return {call,env,origin,rooms,login};
}
test('Password protection, separate users, MCP round trip, cancellation and safe Excel',async()=>{
 const {call}=setup();
 assert.equal((await call('/',{authHeader:null})).status,401);
 assert.equal((await call('/api/snapshot',{authHeader:'Basic '+btoa('kollege:wrong')})).status,401);
 const loginA=await call('/'),loginB=await call('/');
 const cookieA=loginA.headers.get('set-cookie').split(';')[0],cookieB=loginB.headers.get('set-cookie').split(';')[0];
 assert.notEqual(cookieA,cookieB);
 const connectionA=await(await call('/api/connection',{cookie:cookieA})).json();
 assert.equal(connectionA.url,'https://test.example/mcp');
 const mcpA=new URL(connectionA.legacyUrl).pathname;
 assert.equal((await call(mcpA+'x',{authHeader:null,body:{jsonrpc:'2.0',id:0,method:'initialize'}})).status,403);
 const rpc=async(method,params,id=1)=>await(await call(mcpA,{authHeader:null,body:{jsonrpc:'2.0',id,method,params}})).json();
 const init=await rpc('initialize',{protocolVersion:'2025-06-18',clientInfo:{name:'claude-ai',version:'1'}});
 assert.equal(init.result.protocolVersion,'2025-06-18');
 assert.ok((await(await call('/api/snapshot',{cookie:cookieA})).json()).connectedAt);
 assert.equal((await(await call('/api/snapshot',{cookie:cookieB})).json()).connectedAt,null);
 assert.equal((await rpc('tools/list')).result.tools.length,3);
 const initialConnections=(await(await call('/api/snapshot',{cookie:cookieA})).json()).connections;
 assert.ok(initialConnections.claude);assert.equal(initialConnections.openai,undefined);
 const fromOpenAI=await call(mcpA,{authHeader:null,originHeader:'https://chatgpt.com',body:{jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-06-18',clientInfo:{name:'codex-mcp-client',version:'1'}}}});
 assert.equal(fromOpenAI.status,200);
 const connections=(await(await call('/api/snapshot',{cookie:cookieA})).json()).connections;
 assert.ok(connections.claude);assert.equal(connections.openai.client,'codex-mcp-client');
 assert.equal((await call(mcpA,{authHeader:null,originHeader:'https://evil.example',body:{jsonrpc:'2.0',id:3,method:'tools/list'}})).status,403);
 assert.deepEqual((await(await call('/api/snapshot',{cookie:cookieB})).json()).connections,{});
 const params={angebot:'Testangebot',ziel:'Testfirmen',region:'Testregion',anzahl:5};
 assert.equal((await call('/api/run',{cookie:cookieA,body:params,originHeader:'https://evil.example'})).status,403);
 const created=await(await call('/api/run',{cookie:cookieA,body:params})).json();
 assert.equal(created.state,'waiting');
 assert.equal((await call('/api/run',{cookie:cookieA,body:params})).status,409);
 assert.equal((await(await call('/api/snapshot',{cookie:cookieB})).json()).job,null);
 const invoke=async(name,args)=>await rpc('tools/call',{name,arguments:args});
 const brief=await invoke('get_research_brief',{job_id:created.id});
 assert.equal(JSON.parse(brief.result.content[0].text).job_id,created.id);
 let saved=await invoke('save_companies',{job_id:created.id,companies:[{firma:'Without source',website:'https://example.com'}]});
 assert.equal(saved.result.isError,true);
 const f={firma:'=HYPERLINK("https://example.com")',website:'https://example.com',ansprechpartner:'Test Person',tel_ansprechpartner:'01234',quellen:['Testquelle https://example.com/impressum'],extra:{Standorte:'1'}};
 saved=await invoke('save_companies',{job_id:created.id,companies:[f,f]});
 assert.equal(JSON.parse(saved.result.content[0].text).saved,1);
 assert.equal((await(await call('/api/list?id='+created.id,{cookie:cookieB})).json()).error,'Liste nicht gefunden');
 const done=await invoke('finish_research',{job_id:created.id,summary:'Test abgeschlossen',guide:{Einstieg:'Testgespräch'}});
 assert.equal(JSON.parse(done.result.content[0].text).done,true);
 const snapshot=await(await call('/api/snapshot',{cookie:cookieA})).json();assert.equal(snapshot.job.state,'done');
 assert.equal(snapshot.job.firms[0].stufe,'A');
 const excel=await call('/api/excel?id='+created.id,{cookie:cookieA});assert.equal(excel.status,200);
 writeFileSync('/private/tmp/anrufliste-cloud-test.xlsx',new Uint8Array(await excel.arrayBuffer()));
 const second=await(await call('/api/run',{cookie:cookieA,body:params})).json();
 await call('/api/cancel',{cookie:cookieA,body:{}});
 assert.equal((await invoke('save_companies',{job_id:second.id,companies:[f]})).result.isError,true);
 assert.equal((await call('/api/excel?id='+created.id,{cookie:cookieB})).status,404);
});

test('Do-not-call list: keys, brief exclusion, rejection on save, unblock',async()=>{
 const {call,login}=setup();
 const cookie=await login(),other=await login();
 const sperren=async eintrag=>await(await call('/api/sperren',{cookie,body:{eintrag}})).json();
 let r=await sperren('https://www.Gesperrt-GmbH.de/impressum');
 assert.deepEqual(r,{ok:true,key:'gesperrt-gmbh.de',sperrliste:['gesperrt-gmbh.de']});
 r=await sperren('Müller & Söhne KG');
 assert.equal(r.key,'müllersöhnekg');
 assert.equal((await sperren('gesperrt-gmbh.de')).sperrliste.length,2,'no duplicates');
 assert.equal((await call('/api/sperren',{cookie,body:{eintrag:'  '}})).status,400);
 assert.deepEqual((await(await call('/api/sperrliste',{cookie})).json()).sperrliste,['gesperrt-gmbh.de','müllersöhnekg']);
 assert.deepEqual((await(await call('/api/sperrliste',{cookie:other})).json()).sperrliste,[],'separate per session');
 assert.equal((await call('/api/sperren',{cookie,body:{eintrag:'x.de'},originHeader:'https://evil.example'})).status,403);
 const legacy=new URL((await(await call('/api/connection',{cookie})).json()).legacyUrl).pathname;
 const rpc=async(method,params)=>await(await call(legacy,{authHeader:null,body:{jsonrpc:'2.0',id:1,method,params}})).json();
 const job=await(await call('/api/run',{cookie,body:{angebot:'A',ziel:'B',region:'C',anzahl:5}})).json();
 const brief=JSON.parse((await rpc('tools/call',{name:'get_research_brief',arguments:{job_id:job.id}})).result.content[0].text);
 assert.deepEqual(brief.gesperrt,['gesperrt-gmbh.de','müllersöhnekg']);
 assert.match(brief.regeln,/gesperrt/);
 const firm=(firma,website)=>({firma,website,quellen:['https://'+new URL(website).hostname+'/impressum']});
 const saved=JSON.parse((await rpc('tools/call',{name:'save_companies',arguments:{job_id:job.id,companies:[firm('Gesperrt GmbH','https://gesperrt-gmbh.de'),firm('Müller & Söhne KG','https://mueller-soehne.de'),firm('Offen AG','https://www.offen-ag.de/')]}})).result.content[0].text);
 assert.equal(saved.saved,1);assert.deepEqual(saved.abgewiesen_gesperrt,['Gesperrt GmbH','Müller & Söhne KG']);
 const list=await(await call('/api/list?id='+job.id,{cookie})).json();
 assert.equal(list.firms.length,1);assert.equal(list.firms[0].key,'offen-ag.de');
 assert.equal((await(await call('/api/snapshot',{cookie})).json()).job.firms[0].key,'offen-ag.de');
 r=await(await call('/api/entsperren',{cookie,body:{key:'gesperrt-gmbh.de'}})).json();
 assert.deepEqual(r,{ok:true,sperrliste:['müllersöhnekg']});
 const again=JSON.parse((await rpc('tools/call',{name:'save_companies',arguments:{job_id:job.id,companies:[firm('Gesperrt GmbH','https://gesperrt-gmbh.de')]}})).result.content[0].text);
 assert.equal(again.saved,1);
});

test('Delete a list completely; running jobs must be cancelled first',async()=>{
 const {call,login}=setup();
 const cookie=await login(),other=await login();
 const job=await(await call('/api/run',{cookie,body:{angebot:'A',ziel:'B',region:'C',anzahl:5}})).json();
 assert.equal((await call('/api/loeschen',{cookie,body:{id:job.id}})).status,400);
 await call('/api/cancel',{cookie,body:{}});
 assert.equal((await call('/api/loeschen',{cookie:other,body:{id:job.id}})).status,400,'other session cannot delete');
 assert.deepEqual(await(await call('/api/loeschen',{cookie,body:{id:job.id}})).json(),{ok:true});
 assert.equal((await call('/api/list?id='+job.id,{cookie})).status,404);
 const snap=await(await call('/api/snapshot',{cookie})).json();
 assert.equal(snap.job,null);assert.deepEqual(snap.lists,[]);
 assert.equal((await call('/api/excel?id='+job.id,{cookie})).status,404);
});

test('Lists older than 183 days are deleted on access and by the daily alarm; the do-not-call list stays',async()=>{
 const {call,login,rooms}=setup();
 assert.equal(RETENTION_DAYS,183);
 const cookie=await login(),session=cookie.split('=')[1];
 await call('/api/sperren',{cookie,body:{eintrag:'bleibt.de'}});
 const make=async()=>{const j=await(await call('/api/run',{cookie,body:{angebot:'A',ziel:'B',region:'C',anzahl:5}})).json();await call('/api/cancel',{cookie,body:{}});return j};
 const old=await make(),fresh=await make(),edge=await make();
 const room=rooms.get(session),age=async(id,days)=>{const j=await room.storage.get('job:'+id);j.startedAt=Date.now()-days*DAY;await room.storage.put('job:'+id,j)};
 assert.ok(await room.storage.getAlarm()>Date.now(),'daily alarm scheduled once jobs exist');
 await age(old.id,184);await age(edge.id,182);
 const lists=(await(await call('/api/lists',{cookie})).json()).lists.map(l=>l.id).sort();
 assert.deepEqual(lists,[fresh.id,edge.id].sort());
 assert.equal(await room.storage.get('job:'+old.id),undefined);
 await age(edge.id,190);
 await room.alarm();
 assert.equal(await room.storage.get('job:'+edge.id),undefined,'alarm deletes too');
 assert.ok(await room.storage.get('job:'+fresh.id));
 assert.deepEqual(await room.storage.get('sperrliste'),['bleibt.de']);
 await age(fresh.id,200);await room.storage.deleteAlarm();
 await room.alarm();
 assert.equal((await room.storage.list({prefix:'job:'})).size,0);
 assert.equal(await room.storage.getAlarm(),null,'no alarm without jobs');
});

test('Legal pages are public, the app needs the password',async()=>{
 const {call}=setup();
 for(const p of ['/impressum','/datenschutz']){
  const r=await call(p,{authHeader:null});
  assert.equal(r.status,200);assert.equal(await r.text(),'static '+p+'.html');
  assert.match(r.headers.get('content-type'),/text\/html/);assert.equal(r.headers.get('set-cookie'),null);
 }
 assert.equal((await call('/legal.css',{authHeader:null})).status,200);
 assert.equal((await call('/',{authHeader:null})).status,401);
 assert.equal((await call('/authorize',{authHeader:null})).status,401);
 assert.equal((await call('/api/snapshot',{authHeader:null})).status,401);
});

const pkce=async()=>{const verifier=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return {verifier,challenge}};

test('OAuth: discovery, DCR, consent bound to the browser session, PKCE, token, MCP with Bearer, refresh rotation',async()=>{
 const {call,login,origin}=setup();
 const unauth=await call('/mcp',{authHeader:null,body:{jsonrpc:'2.0',id:1,method:'initialize'}});
 assert.equal(unauth.status,401);
 assert.match(unauth.headers.get('www-authenticate'),/^Bearer .*resource_metadata="https:\/\/test\.example\/\.well-known\/oauth-protected-resource\/mcp"/);
 for(const p of ['/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-protected-resource']){
  const prm=await(await call(p,{authHeader:null})).json();
  assert.equal(prm.resource,origin+'/mcp');assert.deepEqual(prm.authorization_servers,[origin]);
 }
 const meta=await(await call('/.well-known/oauth-authorization-server',{authHeader:null})).json();
 assert.equal(meta.issuer,origin);
 assert.equal(meta.authorization_endpoint,origin+'/authorize');assert.equal(meta.token_endpoint,origin+'/token');assert.equal(meta.registration_endpoint,origin+'/register');
 assert.deepEqual(meta.code_challenge_methods_supported,['S256']);
 assert.ok(meta.grant_types_supported.includes('refresh_token'));
 // Dynamic Client Registration: only Claude/ChatGPT callbacks or loopback.
 const dcr=redirect_uris=>call('/register',{authHeader:null,raw:JSON.stringify({client_name:'Claude <script>',redirect_uris,grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'}),headers:{'Content-Type':'application/json'}});
 assert.equal((await dcr(['https://evil.example/cb'])).status,400);
 assert.equal((await dcr(['https://claude.ai/api/mcp/auth_callback','https://claude.ai.evil.example/cb'])).status,400);
 const regRes=await dcr(['https://claude.ai/api/mcp/auth_callback','https://claude.com/api/mcp/auth_callback']);
 assert.equal(regRes.status,201);
 const client=await regRes.json();assert.ok(client.client_id);
 const redirect='https://claude.ai/api/mcp/auth_callback';
 const cookieA=await login(),cookieB=await login();
 const job=await(await call('/api/run',{cookie:cookieA,body:{angebot:'A',ziel:'B',region:'C',anzahl:5}})).json();
 // Authorization: website login + consent in the browser whose lists should be connected.
 const {verifier,challenge}=await pkce();
 const q=new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:redirect,code_challenge:challenge,code_challenge_method:'S256',state:'xyz',scope:'anrufliste',resource:origin+'/mcp'});
 assert.equal((await call('/authorize?'+q,{authHeader:null,cookie:cookieA})).status,401);
 const consent=await call('/authorize?'+q,{cookie:cookieA});
 assert.equal(consent.status,200);
 const html=await consent.text();
 assert.match(html,/Anrufliste mit deinem Claude verbinden/);assert.match(html,/Verbinden/);
 assert.ok(!html.includes('Claude <script>'),'client name escaped');assert.match(html,/Claude &#60;script&#62;/);
 assert.match(html,/claude\.ai/);
 const handle=html.match(/name="handle" value="([^"]+)"/)[1];
 const consentCookie=consent.headers.getSetCookie().find(c=>c.startsWith('__Host-oauth-consent')).split(';')[0];
 assert.equal((await call('/authorize?'+q,{cookie:cookieA+'; '+consentCookie,form:{handle,decision:'approve'},originHeader:'https://evil.example'})).status,403);
 assert.equal((await call('/authorize?'+q,{cookie:cookieB,form:{handle,decision:'approve'}})).status,400,'handle bound to the browser that opened the page');
 const approved=await call('/authorize?'+q,{cookie:cookieA+'; '+consentCookie,form:{handle,decision:'approve'}});
 assert.equal(approved.status,302);
 const back=new URL(approved.headers.get('location'));
 assert.equal(back.origin+back.pathname,redirect);assert.equal(back.searchParams.get('state'),'xyz');assert.equal(back.searchParams.get('iss'),origin);
 const code=back.searchParams.get('code');assert.ok(code);
 const token=form=>call('/token',{authHeader:null,form,originHeader:null});
 assert.equal((await token({grant_type:'authorization_code',code,redirect_uri:redirect,client_id:client.client_id,code_verifier:'wrong'+verifier,resource:origin+'/mcp'})).status,400,'PKCE enforced');
 // Fresh authorization for the success path, independent of what the failed attempt did to the first code.
 const second=await pkce();
 q.set('code_challenge',second.challenge);
 const consent2=await call('/authorize?'+q,{cookie:cookieA});const html2=await consent2.text();
 const handle2=html2.match(/name="handle" value="([^"]+)"/)[1],cookie2=consent2.headers.getSetCookie().find(c=>c.startsWith('__Host-oauth-consent')).split(';')[0];
 const code2=new URL((await call('/authorize?'+q,{cookie:cookieA+'; '+cookie2,form:{handle:handle2,decision:'approve'}})).headers.get('location')).searchParams.get('code');
 const tokRes=await token({grant_type:'authorization_code',code:code2,redirect_uri:redirect,client_id:client.client_id,code_verifier:second.verifier,resource:origin+'/mcp'});
 assert.equal(tokRes.status,200);
 const tok=await tokRes.json();
 assert.equal(tok.token_type.toLowerCase(),'bearer');assert.ok(tok.access_token&&tok.refresh_token);
 // MCP with Bearer reaches exactly the room of browser A.
 const mcp=async(bearer,method,params,id=1)=>call('/mcp',{bearer,body:{jsonrpc:'2.0',id,method,params},originHeader:'https://claude.ai'});
 const init=await mcp(tok.access_token,'initialize',{protocolVersion:'2025-06-18',clientInfo:{name:'claude-ai',version:'1'}});
 assert.equal(init.status,200);assert.equal((await init.json()).result.serverInfo.name,'Anrufliste');
 assert.ok((await(await call('/api/snapshot',{cookie:cookieA})).json()).connections.claude);
 assert.deepEqual((await(await call('/api/snapshot',{cookie:cookieB})).json()).connections,{});
 const brief=await(await mcp(tok.access_token,'tools/call',{name:'get_research_brief',arguments:{}})).json();
 assert.equal(JSON.parse(brief.result.content[0].text).job_id,job.id);
 assert.equal((await mcp('x:y:z','tools/list')).status,401);
 assert.equal((await mcp(tok.access_token,'tools/list',undefined,2)).status,200);
 // Refresh token rotation.
 const r1=await(await token({grant_type:'refresh_token',refresh_token:tok.refresh_token,client_id:client.client_id})).json();
 assert.ok(r1.access_token&&r1.refresh_token);assert.notEqual(r1.refresh_token,tok.refresh_token);
 const r2=await(await token({grant_type:'refresh_token',refresh_token:r1.refresh_token,client_id:client.client_id})).json();
 assert.ok(r2.refresh_token);
 assert.equal((await token({grant_type:'refresh_token',refresh_token:tok.refresh_token,client_id:client.client_id})).status,400,'old refresh token invalid after rotation');
 assert.equal((await mcp(r2.access_token,'ping')).status,200);
 // Denying sends access_denied back to the client.
 const consent3=await call('/authorize?'+q,{cookie:cookieB});const html3=await consent3.text();
 const denied=await call('/authorize?'+q,{cookie:cookieB+'; '+consent3.headers.getSetCookie().find(c=>c.startsWith('__Host-oauth-consent')).split(';')[0],form:{handle:html3.match(/name="handle" value="([^"]+)"/)[1],decision:'deny'}});
 assert.equal(new URL(denied.headers.get('location')).searchParams.get('error'),'access_denied');
});

test('Allowed redirect URIs',()=>{
 for(const ok of ['https://claude.ai/api/mcp/auth_callback','https://claude.com/api/mcp/auth_callback','https://chatgpt.com/connector_platform_oauth_redirect','http://localhost:33418/callback','http://127.0.0.1:5000/cb'])assert.ok(redirectAllowed(ok),ok);
 for(const bad of ['https://evil.example/cb','http://claude.ai/api/mcp/auth_callback','https://claude.ai.evil.example/x','javascript:alert(1)','https://user@claude.ai/x'])assert.ok(!redirectAllowed(bad),bad);
});
