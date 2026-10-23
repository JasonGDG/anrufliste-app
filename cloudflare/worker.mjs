import {OAuthProvider,AuthorizationError,CimdFetchError} from '@cloudflare/workers-oauth-provider';
import {json} from './room.mjs';
export {ResearchRoom} from './room.mjs';
const encoder=new TextEncoder();
const base64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function equal(a,b){const hash=x=>crypto.subtle.digest('SHA-256',encoder.encode(x));const [x,y]=await Promise.all([hash(a),hash(b)]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0}
const sha256=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(x)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const escape=v=>String(v).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
function room(env,session){return env.ROOMS.get(env.ROOMS.idFromName(session))}
async function limitedBody(request){const reader=request.body?.getReader();if(!reader)return '';let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw Error('Anfrage zu groß')}chunks.push(value)}const result=new Uint8Array(size);let pos=0;for(const c of chunks){result.set(c,pos);pos+=c.length}return result}

const MCP_ORIGINS=['https://claude.ai','https://claude.com','https://chatgpt.com','https://chat.openai.com'];
// Redirect targets a dynamically registered client may use: the exact Claude callbacks, ChatGPT hosts
// (callback paths are not all documented, so host only), plus loopback for desktop/CLI clients.
const CLAUDE_CALLBACKS=['https://claude.ai/api/mcp/auth_callback','https://claude.com/api/mcp/auth_callback'];
const OPENAI_HOSTS=['chatgpt.com','chat.openai.com','platform.openai.com'];
export function redirectAllowed(uri){
 let u;try{u=new URL(uri)}catch{return false}
 if(u.hash||u.username||u.password)return false;
 if(u.protocol==='https:')return (CLAUDE_CALLBACKS.includes(u.origin+u.pathname)&&!u.search)||OPENAI_HOSTS.includes(u.hostname);
 return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);
}
// form-action must allow the redirect after the consent form (browsers check redirects of a form submission).
const FORM_ACTION="'self' https://claude.ai https://claude.com "+OPENAI_HOSTS.map(h=>'https://'+h).join(' ')+" http://localhost:* http://127.0.0.1:*";
const CSP=`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://api.anthropic.com; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action ${FORM_ACTION}`;
const PUBLIC_PAGES={'/impressum':'/impressum.html','/datenschutz':'/datenschutz.html'};
const SCOPE='anrufliste';
const DAY=86400;

function sessionFrom(request){return (request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-anrufliste_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1]}
const newSession=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
const sessionCookie=s=>`__Host-anrufliste_session=${s}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`;
async function basicOk(request,env){let credentials='';try{credentials=atob((request.headers.get('Authorization')||'').replace(/^Basic /,''))}catch{}return equal(credentials,'kollege:'+env.SHARE_PASSWORD)}
const loginRequired=()=>new Response('Bitte mit Benutzername und Passwort anmelden.',{status:401,headers:{'WWW-Authenticate':'Basic realm="Anrufliste", charset="UTF-8"','Cache-Control':'no-store'}});
function secure(response,{cookie,html}={}){
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','no-store');headers.set('X-Frame-Options','DENY');headers.set('Referrer-Policy','same-origin');headers.set('X-Content-Type-Options','nosniff');
 headers.set('Content-Security-Policy',CSP);
 if(html)headers.set('Content-Type','text/html; charset=utf-8');
 if(cookie)headers.append('Set-Cookie',cookie);
 return new Response(response.body,{status:response.status,headers});
}

// MCP request for one browser session: the room (Durable Object) of exactly that session answers.
async function forwardMcp(request,env,session){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 if(origin&&![url.origin,...MCP_ORIGINS].includes(origin))return json({error:'Origin nicht erlaubt'},403);
 let body;try{if(request.method==='POST')body=await limitedBody(request)}catch{return json({error:'Anfrage zu groß'},413)}
 return room(env,session).fetch(new Request('https://internal/internal/mcp',{method:request.method,headers:{'Content-Type':'application/json'},body}));
}

function page(title,body){return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><script src="/theme.js"></script><title>${escape(title)}</title><link rel="stylesheet" href="/legal.css"></head><body><main class="doc narrow">${body}</main></body></html>`}
function consentPage(details,handle){
 const name=escape(details.clientName);
 return page('Anrufliste verbinden',`<p class="brand">Anrufliste</p><h1>Anrufliste mit deinem Claude verbinden</h1>
<p><b>${name}</b> möchte auf deine Anruflisten in diesem Browser zugreifen: Aufträge lesen, gefundene Firmen speichern und Aufträge abschließen.</p>
<p class="muted">Der Zugang wird an <b>${escape(details.redirectHost)}</b> übergeben. Der Name des Programms stammt von ihm selbst und ist nicht geprüft.</p>
${details.redirectIsLoopback?'<p class="warn">Der Zugang geht an ein Programm auf deinem Computer. Nur fortfahren, wenn du die Verbindung gerade selbst gestartet hast.</p>':''}
<form method="post"><input type="hidden" name="handle" value="${escape(handle)}"><div class="actions"><button class="btn pri" name="decision" value="approve">Verbinden</button><button class="btn sec" name="decision" value="deny">Abbrechen</button></div></form>
<p class="muted small">Du kannst die Verbindung jederzeit in den Connector-Einstellungen deines Kontos trennen. <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a></p>`);
}
const errorPage=(message,status=400)=>secure(new Response(page('Verbindung fehlgeschlagen',`<p class="brand">Anrufliste</p><h1>Verbindung fehlgeschlagen</h1><p>${escape(message)}</p><p>Bitte in Claude erneut auf „Verbinden“ klicken.</p>`),{status}),{html:true});

async function authorize(request,env,session,cookie){
 const oauth=env.OAUTH_PROVIDER;
 try{
  if(request.method==='GET'){
   const authRequest=await oauth.parseAuthRequest(request);
   const details=await oauth.describeConsent(authRequest);
   const consent=await oauth.beginConsent(authRequest);
   return secure(new Response(consentPage(details,consent.handle),{headers:consent.headers}),{cookie,html:true});
  }
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'GET, POST'}});
  const origin=request.headers.get('Origin');
  // Browser schicken bei manchen Formularen Origin "null"; dann zählt die eindeutige Angabe Sec-Fetch-Site
  const site=request.headers.get('Sec-Fetch-Site');
  const sameOrigin=origin===new URL(request.url).origin||((!origin||origin==='null')&&(site==='same-origin'||!site));
  if(!sameOrigin||(site&&site!=='same-origin'))return errorPage('Ungültige Anfrageherkunft.',403);
  if(cookie)return errorPage('Bitte die Anrufliste zuerst in diesem Browser öffnen.');
  const form=await request.formData(),handle=String(form.get('handle')||'');
  if(form.get('decision')!=='approve'){const denied=await oauth.denyConsent(request,handle);return new Response(null,{status:302,headers:denied.headers})}
  const approved=await oauth.approveConsent(request,handle,{scope:[SCOPE]});
  const {redirectTo}=await oauth.completeAuthorization({request:approved.request,userId:(await sha256('anrufliste-user:'+session)).slice(0,32),metadata:{},scope:[SCOPE],props:{session}});
  approved.headers.set('Location',redirectTo);
  return new Response(null,{status:302,headers:approved.headers});
 }catch(error){
  if(error instanceof AuthorizationError&&error.redirectTo)return Response.redirect(error.redirectTo,302);
  if(error instanceof AuthorizationError)return errorPage(error.description||'Ungültige Autorisierungsanfrage.');
  if(error instanceof CimdFetchError)return errorPage('Das Programm konnte nicht geprüft werden.');
  throw error;
 }
}

// Everything that is not OAuth machinery or the MCP endpoint: website behind Basic-Auth, legal pages without.
const app={async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 if(PUBLIC_PAGES[url.pathname]||url.pathname==='/legal.css'||url.pathname==='/theme.js'||url.pathname.startsWith('/fonts/')){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  const target=new URL(PUBLIC_PAGES[url.pathname]||url.pathname,url.origin);
  const asset=await env.ASSETS.fetch(new Request(target,{method:request.method}));
  return secure(asset,{html:!!PUBLIC_PAGES[url.pathname]});
 }
 if(!await basicOk(request,env))return loginRequired();
 let session=sessionFrom(request),cookie;
 if(!session){session=newSession();cookie=sessionCookie(session)}
 if(url.pathname==='/authorize')return authorize(request,env,session,cookie);
 let response;
 if(url.pathname==='/api/connection'){
  response=json({url:url.origin+'/mcp'});
 }else if(url.pathname.startsWith('/api/')){
  if(request.method==='POST'&&(origin!==url.origin||!/^application\/json\b/i.test(request.headers.get('Content-Type')||'')))return json({error:'Ungültige Anfrageherkunft'},403);
  let body;try{if(request.method==='POST')body=await limitedBody(request)}catch{return json({error:'Anfrage zu groß'},413)}
  response=await room(env,session).fetch(new Request('https://internal'+url.pathname+url.search,{method:request.method,headers:{'Content-Type':'application/json'},body}));
 }else response=await env.ASSETS.fetch(request);
 return secure(response,{cookie});
}};

const mcpApi={fetch:(request,env,ctx)=>forwardMcp(request,env,ctx.props.session)};

// One provider per origin, because the canonical resource URL (origin + /mcp) is part of its configuration.
const providers=new Map();
export function provider(origin){
 if(!providers.has(origin))providers.set(origin,new OAuthProvider({
  apiRoute:'/mcp',apiHandler:mcpApi,defaultHandler:app,
  authorizeEndpoint:'/authorize',tokenEndpoint:'/token',clientRegistrationEndpoint:'/register',
  scopesSupported:[SCOPE],requiredScopes:[SCOPE],
  resourceMetadata:{resource:origin+'/mcp',authorization_servers:[origin],resource_name:'Anrufliste'},
  refreshTokenTTL:90*DAY,refreshTokenIdleTTL:90*DAY,
  clientRegistrationCallback:async({clientMetadata})=>{
   const uris=clientMetadata?.redirect_uris;
   if(!Array.isArray(uris)||!uris.length||!uris.every(redirectAllowed))return {code:'invalid_redirect_uri',description:'Nur Weiterleitungen zu Claude, ChatGPT oder einem lokalen Programm sind erlaubt.',status:400};
  }
 }));
 return providers.get(origin);
}

export default{
 async fetch(request,env,ctx){
  if(!env.SHARE_PASSWORD||!env.OAUTH_KV)return new Response('Passwortschutz noch nicht eingerichtet',{status:503});
  const url=new URL(request.url);
  // The former personal link /mcp/<session>.<signature> contained the session id and is gone.
  if(url.pathname.startsWith('/mcp/'))return json({error:'Dieser persönliche Connector-Link gilt nicht mehr. Bitte den Connector mit der Adresse …/mcp neu verbinden.'},410);
  // Some clients look for the resource metadata at the root; the resource itself is /mcp.
  if(url.pathname==='/.well-known/oauth-protected-resource')request=new Request(url.origin+'/.well-known/oauth-protected-resource/mcp',request);
  return provider(url.origin).fetch(request,env,ctx||{waitUntil(){},passThroughOnException(){}});
 }
};
