#!/usr/bin/env node
// Start npm run server and an isolated headless Chrome with --remote-debugging-port=9339.
// Then: node scripts/test-mobile.mjs (BASE_URL and CHROME_DEBUG_URL are optional).
// Geocoding is controlled here to exercise response ordering without hitting the public provider.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { send, evaluate, pause, click, tap, fill, enter, screenshot, size, close } from './browser-client.mjs';
const base = process.env.BASE_URL || 'http://localhost:8787';
const artifacts = process.env.ARTIFACTS_DIR || '/tmp/side-quests-mobile-check';
mkdirSync(artifacts, { recursive: true });
const wait = async (expression, label=expression) => {
  for(let i=0;i<100;i++) {if(await evaluate(expression)) return;await pause(100);}
  throw Error(`Timed out: ${label}`);
};
const byText = async text => {
  const point = await evaluate(`(()=>{const e=[...document.querySelectorAll('[role="button"],button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)});if(!e)throw Error('Missing button');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await tap(point.x,point.y);
};
const openPicker = async () => {
  const selector = await evaluate(`(()=>{const e=[...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('Add a place'));e.setAttribute('data-test-place','');return '[data-test-place]';})()`);
  await click(selector);await wait(`!!document.querySelector('.sq-map')`);await pause(350);
};
const drop = async (x=.6,y=.55) => {
  const r=await evaluate(`(()=>{const r=document.querySelector('.sq-map').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
  await tap(r.x+r.w*x,r.y+r.h*y);await pause(60);
};
const name = () => evaluate(`document.querySelector('[aria-label="Name this spot"]')?.value`);
const reply = (index, body, status=200) => evaluate(`window.__geo[${index}].resolve(${JSON.stringify(body)},${status})`);
const count = () => evaluate('window.__geo.length');
const query = async text => {await fill('[aria-label="Search places"]',text);await enter();await pause(50);};
const hit = {name:"Patricia's Green",detail:'Hayes Valley, San Francisco',latitude:37.7762,longitude:-122.4241};
const errors=[];
await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument',{source:`
window.__errors=[]; addEventListener('error',e=>window.__errors.push(e.message));addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));
window.__states=[];const WS=window.WebSocket;window.WebSocket=class extends WS {constructor(...args){super(...args);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='state')window.__states.push(m.state);}catch{}})}};
`});
try {
 for(const [width,height] of ((process.argv.includes('--screens-only') || process.argv.includes('--joins-only')) ? [] : [[390,844],[360,640]])) {
  await size(width,height);
  await send('Emulation.setGeolocationOverride',{latitude:37.7749,longitude:-122.4194,accuracy:10});
  await send('Browser.grantPermissions',{origin:base,permissions:['geolocation']});
  await send('Page.navigate',{url:`${base}/?demo=writing&name=Mobile%20Tester`});
  await wait(`document.body.innerText.includes('WRITE QUESTS')`);
  await evaluate(`window.__geo=[];const realFetch=window.fetch;window.fetch=(url,init)=>String(url).includes('/api/geocode')?new Promise(resolve=>window.__geo.push({url:String(url),resolve:(body,status=200)=>resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}))})):realFetch(url,init)`);
  await openPicker();
  await drop();assert.equal(await count(),1);await reply(0,{name:'Auto-named street'});await pause(70);assert.equal(await name(),'Auto-named street');
  assert.equal(await evaluate(`document.querySelectorAll('.sq-pin').length`),2);
  // A reply for an older pin must not rename the new one.
  await drop(.35,.45);await drop(.7,.65);await reply(2,{name:'New pin'});await reply(1,{name:'Old pin'});await pause(70);assert.equal(await name(),'New pin');
  // Typing while reverse geocoding is pending must win.
  await drop(.45,.5);await fill('[aria-label="Name this spot"]','Our meeting point');await reply(3,{name:'Late street'});await pause(70);assert.equal(await name(),'Our meeting point');
  // A closed modal must ignore late search results, including on reopening.
  await query('old search');const oldSearch=(await count())-1;
  await click('[aria-label="Cancel"]');await pause(350);await openPicker();await reply(oldSearch,[{...hit,name:'Stale result'}]);await pause(60);
  assert.equal(await evaluate(`document.body.innerText.includes('Stale result')`),false);
  assert.equal(await name(),undefined);
  // New searches supersede old ones, and a selected result supersedes reverse lookup.
  await drop();const reverse=(await count())-1;
  await query('old query');const old=(await count())-1;
  await query("Patricia's Green");const latest=(await count())-1;
  await reply(latest,[hit]);await reply(old,[{...hit,name:'Wrong result'}]);await pause(70);
  assert.equal(await evaluate(`document.body.innerText.includes('Wrong result')`),false);
  await screenshot(`${artifacts}/search-${width}.png`);
  const result=await evaluate(`(()=>{const e=[...document.querySelectorAll('div')].find(e=>e.textContent===${JSON.stringify(hit.name)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await tap(result.x,result.y);await reply(reverse,{name:'Old map label'});await pause(100);assert.equal(await name(),hit.name);
  // Provider outages and genuine empty results have different messages.
  await query('unavailable');await reply((await count())-1,{},503);await pause(70);
  assert.ok(await evaluate(`document.body.innerText.includes("Search isn't working right now")`));
  await query('no result');await reply((await count())-1,[]);await pause(70);
  assert.ok(await evaluate(`document.body.innerText.includes('No match —')`));
  await screenshot(`${artifacts}/picker-${width}.png`);
  await byText('250 m');await byText('Pin it here');await pause(350);
  await fill('[aria-label="New quest"]','Take a photo at this park');
  await pause(150);
  await screenshot(`${artifacts}/attached-${width}.png`);
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('[aria-label="Add"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`),'Add button must remain inside the phone screen');
  await byText('Add');
  await wait(`window.__states.at(-1)?.quests.some(q=>q.text==='Take a photo at this park')`);
  const saved=await evaluate(`window.__states.at(-1).quests.find(q=>q.text==='Take a photo at this park').place`);
  assert.equal(saved.name,hit.name);assert.equal(saved.radius,250);assert.deepEqual(saved.coordinate,{latitude:hit.latitude,longitude:hit.longitude});
  errors.push(...await evaluate('window.__errors'));
  console.log(`PASS picker at ${width}x${height}: touch pin, auto-name, response races, search selection, errors, saved coordinates/radius`);
 }

 for(const [width,height] of (process.argv.includes('--joins-only') ? [] : [[390,844],[360,640]])) {
  await size(width,height);
  for(const phase of ['lobby','writing','review','playing','ended','verifying','scoreboard']) {
   await send('Page.navigate',{url:`${base}/?demo=${phase}&place=1&name=Mobile%20Tester`});
   await wait(`window.__states?.at(-1)?.phase===${JSON.stringify(phase)}`);
   await pause(450);
   await screenshot(`${artifacts}/${phase}-${width}.png`);
   assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),`${phase} horizontal document overflow`);
   if(phase==='playing') {
    await byText('Prove it');await pause(350);
    await send('Page.setInterceptFileChooserDialog',{enabled:true});
    await byText('Choose from library');
    await wait(`!!document.querySelector('input[type=file]')`);
    const doc=await send('DOM.getDocument');
    const file=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});
    await send('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[`${artifacts}/playing-${width}.png`]});
    await wait(`!!document.querySelector('[aria-label="Submit proof"]')`);
    await pause(100);await screenshot(`${artifacts}/photo-preview-${width}.png`);
    assert.ok(await evaluate(`(()=>{const r=document.querySelector('[aria-label="Submit proof"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`),'Photo submit must fit');
    await byText('Submit proof');
    await wait(`window.__states.at(-1).submissions.some(s=>s.proof.kind==='photo')`);
   }
   errors.push(...await evaluate('window.__errors'));
  }
  // Worst-width invite code must remain fully visible.
  await send('Page.navigate',{url:`${base}/join/WWWW`});
  await wait(`!!document.querySelector('[aria-label="Your name"]')`);await pause(250);
  const codeFits=await evaluate(`(()=>{const e=[...document.querySelectorAll('div')].find(e=>e.textContent==='WWWW');return e && e.scrollWidth<=e.clientWidth})()`);
  assert.ok(codeFits,'Wide invite code must not truncate');
  await screenshot(`${artifacts}/invite-wide-${width}.png`);
  console.log(`PASS screens at ${width}x${height}: all seven game phases, wide invite code, photo preview and real local upload`);
 }
 // A normal invite join saves the freshly typed name; blocked storage still permits joining.
 await send('Page.navigate',{url:`${base}/?create=1&name=Named%20Host`});
 await wait(`window.__states?.at(-1)?.phase==='lobby'`);
 const code=await evaluate('window.__states.at(-1).code');
 await evaluate(`localStorage.setItem('playerId',crypto.randomUUID());localStorage.removeItem('playerName')`);
 await send('Page.navigate',{url:`${base}/join/${code}`});
 await wait(`!!document.querySelector('[aria-label="Your name"]')`);
 await fill('[aria-label="Your name"]','Fresh Joiner');await byText(`Join ${code}`);
 await wait(`window.__states?.at(-1)?.players.some(p=>p.name==='Fresh Joiner')`);
 await wait(`document.body.innerText.includes('Named Host')`);
 const storageBlock=await send('Page.addScriptToEvaluateOnNewDocument',{source:`Storage.prototype.getItem=function(){throw new Error('Storage blocked for test')};Storage.prototype.setItem=function(){throw new Error('Storage blocked for test')};`});
 await send('Page.navigate',{url:`${base}/join/${code}`});
 await wait(`!!document.querySelector('[aria-label="Your name"]')`);
 await fill('[aria-label="Your name"]','Private Joiner');await byText(`Join ${code}`);
 await wait(`window.__states?.at(-1)?.players.some(p=>p.name==='Private Joiner')`);
 await wait(`document.body.innerText.includes('Named Host')`);
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:storageBlock.identifier});
 errors.push(...await evaluate('window.__errors'));
 console.log('PASS invite joins: immediate name saving, host display, blocked-storage fallback');
 assert.deepEqual(errors,[]);
} catch(error) {await screenshot(`${artifacts}/failure.png`);console.log(await evaluate(`({text:document.body.innerText,width:innerWidth,height:innerHeight,geo:window.__geo?.map(x=>x.url),errors:window.__errors})`));throw error;} finally {close();}
