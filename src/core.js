/* Pure logic shared by the app and the tests. No DOM access here. */
const norm=t=>String(t).toLowerCase().replace(/[’`]/g,"'").replace(/[^\p{L}\p{N}]/gu,'');
const stKey=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

/* ---------- lyrics text -> stanzas ---------- */
const LABEL_WORDS='chorus|verse|bridge|pre-?chorus|intro|outro|refrain|hook|interlude|coda|tag|припев|куплет|бридж|мост|интро|финал|рефрен';
const LABEL=new RegExp('^\\[?\\s*(('+LABEL_WORDS+')(\\s*\\d+)?)\\s*\\]?\\s*:?$','i');
const CHORUSY=/^(chorus|refrain|hook|припев|рефрен)/i;
function labelOf(line){
  const l=line.trim(); let m=l.match(LABEL); if(m) return m[1].replace(/\s+/g,' ');
  m=l.match(/^\[\s*([^\]]{1,30}?)\s*\]$/); return m?m[1]:null;
}
function parseLyrics(text){
  const stanzas=String(text||'').replace(/\r/g,'').split(/\n\s*\n/).map(s=>s.replace(/^\n+|\s+$/g,'')).filter(Boolean).map(s=>{
    const lines=s.split('\n'); const label=labelOf(lines[0]);
    return {label,lines:label?lines.slice(1):lines};
  });
  const count={}; stanzas.forEach(s=>{ if(s.lines.length){ const k=stKey(s.lines.join('\n')); count[k]=(count[k]||0)+1; } });
  stanzas.forEach(s=>{ s.rep=!!(s.label&&CHORUSY.test(s.label))||(s.lines.length>0&&count[stKey(s.lines.join('\n'))]>1); });
  return stanzas;
}

/* ---------- files ---------- */
function hashText(text){ let h=0x811c9dc5; for(let i=0;i<text.length;i++){ h^=text.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; } return 'h'+h.toString(16); }
const clone=o=>JSON.parse(JSON.stringify(o));
const newId=now=>'u'+now.toString(36);
// Files come from other people: keep only the fields the app knows, with the right types.
const str=v=>typeof v==='string'?v:(typeof v==='number'?String(v):'');
function sanitizeLib(o){
  const gigs=(Array.isArray(o&&o.gigs)?o.gigs:[]).filter(g=>g&&typeof g.id==='string'&&/^[a-z0-9]+$/.test(g.id)&&typeof g.name==='string'&&Array.isArray(g.sets))
    .map(g=>({id:g.id,name:g.name,sets:g.sets.filter(s=>s&&typeof s==='object').map(s=>({name:str(s.name),songs:(Array.isArray(s.songs)?s.songs:[])
      .filter(x=>x&&typeof x==='object'&&str(x.t).trim()).map(x=>{ const y={t:str(x.t).trim()}; if(typeof x.a==='string'&&x.a) y.a=x.a; if(typeof x.x==='string'&&x.x) y.x=x.x; return y; })}))}));
  const texts={}; Object.entries(o&&o.texts&&typeof o.texts==='object'?o.texts:{}).forEach(([k,v])=>{ if(typeof v==='string') texts[k]=v; });
  return {kind:'lyrics-pack',v:o&&o.v===1?1:2,made:str(o&&o.made),gigs,texts};
}
function validateLyricsFile(o){
  if(!o||o.kind!=='lyrics-pack'||(o.v!==1&&o.v!==2)||!Array.isArray(o.gigs)) return {ok:false,error:'not a lyrics file'};
  const file=sanitizeLib(o);
  return file.gigs.length===o.gigs.length?{ok:true,file}:{ok:false,error:'broken gig in file'};
}
const importConflicts=(existing,incoming)=>incoming.filter(g=>existing.some(e=>e.id===g.id)).map(g=>g.id);
function applyLyricsImport(lib,file,mode){
  const out=clone(lib); out.v=2; out.texts=Object.assign({},out.texts||{},file.texts||{});
  clone(file.gigs).forEach(g=>{
    const i=out.gigs.findIndex(e=>e.id===g.id);
    if(i<0){ out.gigs.push(g); return; }
    if(mode==='replace'){ out.gigs[i]=g; return; }
    let n=2; while(out.gigs.some(e=>e.id===g.id+n)) n++;
    g.id=g.id+n; g.name=g.name+' ('+n+')'; out.gigs.push(g);
  });
  return out;
}
function makeLyricsFile(gigs,lyricsOf,today){
  const texts={};
  const out=gigs.map(g=>({id:g.id,name:g.name,sets:g.sets.map(s=>({name:s.name,songs:s.songs.map(x=>{
    const y={t:x.t}; if(x.a) y.a=x.a; const text=lyricsOf(x);
    if(text){ y.x=hashText(text); texts[y.x]=text; } return y; })}))}));
  return {kind:'lyrics-pack',v:2,made:today,gigs:out,texts};
}
function migratePlayed(gigs,get,set,del){
  gigs.forEach(g=>{ let i=0; g.sets.forEach(s=>s.songs.forEach(x=>{ const k='played:'+g.id+':'+i;
    if(get(k)){ set('played:'+g.id+':'+norm(x.t),true); del(k); } i++; })); });
}

/* ---------- gig editor list ---------- */
function flattenGig(gig){
  const items=[];
  gig.sets.forEach((s,i)=>{ if(s.name||i>0) items.push({k:'set',name:s.name}); s.songs.forEach(x=>items.push({k:'song',song:x})); });
  return items;
}
function unflattenGig(items){
  const sets=[];
  items.forEach(it=>{ if(it.k==='set'){ sets.push({name:it.name,songs:[]}); return; } if(!sets.length) sets.push({name:'',songs:[]}); sets[sets.length-1].songs.push(it.song); });
  return sets;
}

/* ---------- share links ---------- */
// A share link is <app address>#get=<code>. Everything after # stays on the phones: GitHub never sees it.
// code = "z" + base64url(deflate(JSON)), or "j" + base64url(JSON) where the browser can't compress.
function b64uEnc(bytes){ let s=''; for(let i=0;i<bytes.length;i+=0x8000) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64uDec(s){ const b=atob(String(s).replace(/-/g,'+').replace(/_/g,'/').replace(/\s+/g,'')); const out=new Uint8Array(b.length); for(let i=0;i<b.length;i++) out[i]=b.charCodeAt(i); return out; }
const pipeBytes=(bytes,stream)=>new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(b=>new Uint8Array(b));
async function packShare(obj,noZip){
  const raw=new TextEncoder().encode(JSON.stringify(obj));
  if(!noZip&&typeof CompressionStream==='function'){ try{ return 'z'+b64uEnc(await pipeBytes(raw,new CompressionStream('deflate-raw'))); }catch(e){} }
  return 'j'+b64uEnc(raw);
}
async function unpackShare(code){
  code=String(code||''); const kind=code[0]; let bytes=b64uDec(code.slice(1));
  if(kind==='z'){ if(typeof DecompressionStream!=='function') throw new Error('old browser'); bytes=await pipeBytes(bytes,new DecompressionStream('deflate-raw')); }
  else if(kind!=='j') throw new Error('not a share code');
  return JSON.parse(new TextDecoder().decode(bytes));
}
// The part of a link after #get= (the link may have been pasted with text around it).
const shareCodeOf=text=>{ const m=String(text||'').match(/#get=([A-Za-z0-9_-]+)/); return m?m[1]:null; };
const senderName=v=>typeof v==='string'?v.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,40):'';
// Keep only the chosen songs (by position in the gig); sets left empty are dropped.
function pickSongs(gig,keep){
  let i=0;
  return {id:gig.id,name:gig.name,sets:gig.sets.map(s=>({name:s.name,songs:s.songs.filter(x=>(x.title===undefined&&x.t===undefined)?true:keep.has(i++))}))
    .map(s=>({name:s.name,songs:s.songs.filter((x,k,a)=>!(x.break!==undefined&&(k===0||k===a.length-1||a[k-1].break!==undefined)))}))
    .filter(s=>s.songs.some(x=>x.title!==undefined||x.t!==undefined))};
}
