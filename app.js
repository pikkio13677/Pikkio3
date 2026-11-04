'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let holdings=[],newsItems=[],quotes={},fx={},activeNewsFilter='all'; const KEY='pikkio.holdings.v2';
const euro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number.isFinite(Number(n))?Number(n):0);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2600)}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(holdings));render()}catch(e){toast('Memoria piena: esporta un backup CSV')}}
function quoteInEUR(h){const q=quotes[h.ticker];if(!q||!Number.isFinite(Number(q.price)))return null;const rate=q.currency==='EUR'?1:fx[q.currency];return Number.isFinite(rate)?Number(q.price)*rate:null}
function holdingMarkup(h,i){const current=quoteInEUR(h),cost=h.quantity*h.price,pnl=current===null?null:(current-h.price)*h.quantity,pct=cost>0&&pnl!==null?pnl/cost*100:null;return `<article class="holding"><div class="ticker-icon">${safe(h.ticker.slice(0,3))}</div><div class="holding-info"><b>${safe(h.name||h.ticker)}</b><small>${safe(h.ticker)} · ${h.quantity} quote · carico ${euro(cost)}${current===null?'':' · mercato '+euro(current*h.quantity)}</small>${pnl===null?'':`<small style="display:block;color:${pnl>=0?'#7fc9a0':'#e39a8b'}">${pnl>=0?'+':''}${euro(pnl)} (${pct>=0?'+':''}${pct.toFixed(2)}%) · ${safe(qDate(h.ticker))}</small>`}</div><div class="holding-value">${euro(cost)}<small style="display:block;color:var(--muted);font-weight:400">carico</small></div><button class="delete" data-edit="${i}" aria-label="Modifica ${safe(h.ticker)}" title="Modifica">✎</button><button class="delete" data-delete="${i}" aria-label="Elimina ${safe(h.ticker)}" title="Elimina">×</button></article>`}
function qDate(t){const q=quotes[t];return q?`${q.currency||''} · ${q.asOf||'data non indicata'}`:''}
function render(){const cost=holdings.reduce((s,h)=>s+h.quantity*h.price,0);const market=holdings.reduce((s,h)=>s+(quoteInEUR(h)??h.price)*h.quantity,0);const all=holdings.length>0&&holdings.every(h=>quoteInEUR(h)!==null);$('#totalValue').textContent=euro(all?market:cost);$('#totalLabel')?.replaceChildren(document.createTextNode(all?'Valore di mercato stimato':'Valore di carico'));$('#holdingCount').textContent=`${holdings.length} ${holdings.length===1?'strumento':'strumenti'}`;$('#homeHoldings').innerHTML=holdings.length?holdings.slice(0,4).map(holdingMarkup).join(''):'<p class="hint">Portafoglio vuoto: aggiungi un investimento.</p>';$('#portfolioList').innerHTML=holdings.length?holdings.map(holdingMarkup).join(''):'<p class="hint">Non hai ancora inserito investimenti.</p>';$$('[data-delete]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.delete);if(Number.isInteger(i)&&holdings[i]){holdings.splice(i,1);persist();toast('Titolo eliminato')}}));$$('[data-edit]').forEach(b=>b.addEventListener('click',()=>editHolding(Number(b.dataset.edit))));renderSignals()}
function go(tab){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.view').forEach(v=>v.classList.toggle('active',v.id===tab));window.scrollTo({top:0,behavior:'smooth'})}
$$('.tab').forEach(b=>b.addEventListener('click',()=>go(b.dataset.tab)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
const dlg=$('#holdingDialog');let editIndex=null;function editHolding(i){const h=holdings[i];if(!h)return;editIndex=i;const f=$('#holdingForm');f.elements.ticker.value=h.ticker;f.elements.name.value=h.name||'';f.elements.quantity.value=h.quantity;f.elements.price.value=h.price;$('#dialogTitle').textContent='Modifica investimento';dlg.showModal()}
$('#addBtn').addEventListener('click',()=>{editIndex=null;$('#holdingForm').reset();$('#dialogTitle').textContent='Aggiungi investimento';dlg.showModal()});
$('#holdingForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const f=new FormData(e.currentTarget),ticker=String(f.get('ticker')||'').trim().toUpperCase(),name=String(f.get('name')||'').trim()||ticker,quantity=Number(f.get('quantity')),price=Number(f.get('price'));if(!/^[A-Z0-9.^_-]{1,20}$/.test(ticker)||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0){toast('Controlla ticker, quantità e prezzo');return}const item={ticker,name,quantity,price};if(editIndex!==null&&holdings[editIndex])holdings[editIndex]=item;else holdings.push(item);persist();dlg.close();e.currentTarget.reset();editIndex=null;toast('Investimento salvato');refreshPrices()});
function parseCSV(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)throw Error('Il CSV non contiene righe dati');const delim=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';const parseLine=line=>{let out=[],v='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'&&q){v+='"';i++}else if(c==='"')q=!q;else if(c===delim&&!q){out.push(v.trim());v=''}else v+=c}if(q)throw Error('Virgolette non chiuse nel CSV');out.push(v.trim());return out};const header=parseLine(lines[0]).map(x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));const idx={ticker:header.indexOf('ticker'),name:header.indexOf('nome'),quantity:header.indexOf('quantita'),price:header.indexOf('prezzo_medio')};if(Object.values(idx).some(v=>v<0))throw Error('Intestazioni richieste: ticker,nome,quantita,prezzo_medio');const out=[];for(const line of lines.slice(1)){const r=parseLine(line);if(r.length<=Math.max(...Object.values(idx)))continue;const h={ticker:String(r[idx.ticker]||'').trim().toUpperCase(),name:String(r[idx.name]||'').trim(),quantity:Number(String(r[idx.quantity]).replace(',','.')),price:Number(String(r[idx.price]).replace(',','.'))};if(!/^[A-Z0-9.^_-]{1,20}$/.test(h.ticker)||!Number.isFinite(h.quantity)||h.quantity<=0||!Number.isFinite(h.price)||h.price<0)continue;h.name=h.name||h.ticker;out.push(h)}return out}
$('#csvFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const a=parseCSV(await f.text());if(!a.length)throw Error('Nessuna riga valida');holdings.push(...a);persist();toast(`Importati ${a.length} titoli`);refreshPrices()}catch(x){toast(x.message||'Errore CSV')}e.target.value=''});
$('#exportCSV').addEventListener('click',()=>{const rows=[['ticker','nome','quantita','prezzo_medio'],...holdings.map(h=>[h.ticker,h.name,h.quantity,h.price])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pikkio-portafoglio.csv';a.click();URL.revokeObjectURL(url);toast('Backup CSV creato')});
async function api(path){const r=await fetch('https://pikkio6-api.onrender.com'+path);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Servizio non disponibile (${r.status})`);return d}
async function refreshPrices(){if(!holdings.length){$('#quoteStatus').textContent='Aggiungi titoli per cercare le quotazioni.';return}$('#quoteStatus').textContent='Aggiornamento quotazioni e cambi…';let ok=0;for(const h of holdings){try{const d=await api('/api/quote/'+encodeURIComponent(h.ticker));if(Number.isFinite(Number(d.price))&&Number(d.price)>0){quotes[h.ticker]=d;ok++}}catch(e){}}const currencies=[...new Set(Object.values(quotes).map(q=>q.currency).filter(c=>c&&c!=='EUR'))];for(const c of currencies){try{const d=await api('/api/fx/'+encodeURIComponent(c));if(Number.isFinite(Number(d.rate)))fx[c]=Number(d.rate)}catch(e){}}render();const unknownCurrency=holdings.some(h=>quotes[h.ticker]&&!quotes[h.ticker].currency);$('#quoteStatus').textContent=`Quotazioni ricevute: ${ok}/${holdings.length}. Prezzi potenzialmente ritardati; cambi BCE/Frankfurter.${unknownCurrency?' Attenzione: valuta non riconosciuta per almeno un ticker; valore di mercato non convertito.':''} ${ok?'':'Verifica ticker e configurazione provider.'}`}
function renderNews(){
  const el=$('#newsList');
  if(!newsItems.length){
    el.innerHTML='<p class="hint">Nessuna notizia disponibile. Riprova più tardi.</p>';
    return;
  }

  const terms={
    ai:/\b(ai|artificial intelligence|machine learning|deep learning|generative ai|llm|chatgpt|openai|gemini|claude)\b|intelligenza artificiale/i,
    technology:/\b(technology|tech|tecnologia|semiconductor|chip|software|hardware|cybersecurity|robotics|smartphone|computer|cloud computing)\b/i
  };

  const filtered=newsItems.filter(n=>{
    const text=[n.title,n.domain,n.sourceCountry,n.description,n.summary].filter(Boolean).join(' ');
    if(activeNewsFilter==='ai') return terms.ai.test(text);
    if(activeNewsFilter==='technology') return terms.technology.test(text);
    return true;
  });

  if(!filtered.length){
    el.innerHTML='<p class="hint">Nessuna notizia trovata per questo filtro.</p>';
    return;
  }

  el.innerHTML=filtered.map(n=>`<article class="event"><div class="event-symbol">◉</div><div><span class="event-type">${safe(n.domain||'FONTE WEB')} · ${safe(n.seen||'')}</span><h3>${safe(n.title)}</h3><p>${safe(n.sourceCountry||'Notizia internazionale')}</p><a href="${safe(n.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--gold);font-size:12px">Apri fonte ↗</a></div></article>`).join('');
}$$('.news-filters [data-news-filter]').forEach(button=>{
  button.addEventListener('click',()=>{
    activeNewsFilter=button.dataset.newsFilter;
    $$('.news-filters [data-news-filter]').forEach(item=>{
      item.setAttribute('aria-pressed',String(item===button));
    });
    renderNews();
  });
});
function renderSignals(){const el=$('#signalList');if(!el)return;const matched=[];for(const n of newsItems){const text=(n.title+' '+(n.domain||'')).toLowerCase();for(const h of holdings){const ticker=h.ticker.toLowerCase(),name=(h.name||'').toLowerCase();if(text.includes(ticker)||(name.length>4&&text.includes(name))){matched.push({h,n,why:'Corrispondenza testuale'});continue}const sectors={energia:['oil','energy','gas','electricity','solar','wind','petrol','energia'],banche:['bank','rate','central bank','fed','ecb','bce','interest'],tecnologia:['artificial intelligence','chip','semiconductor','technology','ai','software'],geopolitica:['war','sanction','tariff','conflict','election','trade']};const sector=Object.entries(sectors).find(([k,words])=>words.some(w=>text.includes(w))&&((k==='energia'&&/en|oil|gas|renew|solar|petro/i.test(h.name+' '+ticker))||(k==='tecnologia'&&/tech|semi|chip|soft|ai|nvda|msft|goog/i.test(h.name+' '+ticker))||(k==='banche'&&/bank|fin|credit|visa|jpm/i.test(h.name+' '+ticker))||k==='geopolitica'));if(sector)matched.push({h,n,why:`Possibile collegamento settoriale: ${sector[0]}`})}}const unique=[...new Map(matched.map(x=>[x.h.ticker+'|'+x.n.url,x])).values()].slice(0,12);el.innerHTML=unique.length?unique.map(x=>`<article class="signal-example"><span class="signal-label risk">DA APPROFONDIRE · NON OPERATIVO</span><h3>${safe(x.h.name)} (${safe(x.h.ticker)})</h3><p>${safe(x.n.title)}</p><p>${safe(x.why)}. Corrispondenza automatica preliminare, non prova di impatto economico e non indicazione di acquisto/vendita.</p><a href="${safe(x.n.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--gold);font-size:12px">Verifica la notizia ↗</a></article>`).join(''):'<p class="hint">Nessuna corrispondenza rilevata. Questo non significa assenza di rischio.</p>'}
async function loadNews(){try{const d=await api('/api/news');newsItems=Array.isArray(d.articles)?d.articles:[];renderNews();renderGeopolitic();renderSignals;$('#newsStatus').textContent=`${newsItems.length} NOTIZIE CARICATE`;$('#connectionStatus').textContent='BACKEND COLLEGATO'}catch(e){$('#newsList').innerHTML='<p class="hint">Feed non disponibile: controlla la connessione e il server.</p>';$('#newsStatus').textContent='FONTE NON DISPONIBILE';$('#connectionStatus').textContent='BACKEND NON COLLEGATO'}}
// PIKKIO - MERCATI GLOBALI
const commodityAssets=[
{name:'Petrolio WTI',ticker:'CL=F',unit:'USD/barile'},
{name:'Petrolio Brent',ticker:'BZ=F',unit:'USD/barile'},
{name:'Gas naturale',ticker:'NG=F',unit:'USD/MMBtu'},
{name:'Oro',ticker:'GC=F',unit:'USD/oncia'},
{name:'Argento',ticker:'SI=F',unit:'USD/oncia'},
{name:'Rame',ticker:'HG=F',unit:'USD/libbra'},
{name:'Platino',ticker:'PL=F',unit:'USD/oncia'},
{name:'Palladio',ticker:'PA=F',unit:'USD/oncia'},
{name:'Mais',ticker:'ZC=F',unit:'USD/bushel'},
{name:'Grano',ticker:'ZW=F',unit:'USD/bushel'},
{name:'Soia',ticker:'ZS=F',unit:'USD/bushel'},
{name:'Caffè',ticker:'KC=F',unit:'USD/libbra'},
{name:'Zucchero',ticker:'SB=F',unit:'USD/libbra'}
];

const topPlayers=[
{name:'NVIDIA',ticker:'NVDA'},
{name:'Microsoft',ticker:'MSFT'},
{name:'Apple',ticker:'AAPL'},
{name:'Alphabet',ticker:'GOOGL'},
{name:'Amazon',ticker:'AMZN'},
{name:'Meta',ticker:'META'},
{name:'Broadcom',ticker:'AVGO'},
{name:'TSMC',ticker:'TSM'}
];

async function loadMarketPanel(items,listId,statusId){
 const list=$(listId),status=$(statusId);
 if(!list||!status)return;
 status.textContent='Aggiornamento dati di mercato…';
 const results=await Promise.all(items.map(async item=>{
  try{return {item,data:await api('/api/quote/'+encodeURIComponent(item.ticker))}}
  catch(e){return {item,data:null}}
 }));
 list.innerHTML=results.map(x=>{
  if(!x.data)return '<article class="holding"><b>'+safe(x.item.name)+'</b><small>Quotazione non disponibile</small></article>';
  return '<article class="holding"><div class="holding-info"><b>'+safe(x.item.name)+'</b><small>'+safe(x.item.ticker)+' · '+Number(x.data.price).toLocaleString('it-IT')+' '+safe(x.data.currency||'')+' · '+safe(x.item.unit||'')+'</small><small>'+safe(x.data.asOf||'Data non indicata')+'</small></div></article>';
 }).join('');
 const ok=results.filter(x=>x.data).length;
 status.textContent='Quotazioni ricevute: '+ok+'/'+items.length+'. Fonte Yahoo Finance; possibili ritardi.';
}

async function loadCentralBankRates(){
 const list=$('#centralBankList');
 const status=$('#ratesUpdated');
 if(!list||!status)return;
 status.textContent='Lettura dei dati ufficiali BCE…';
 const series=[
 ['B.U2.EUR.4F.KR.MRR_FR.LEV','BCE · Rifinanziamento'],
 ['D.U2.EUR.4F.KR.DFR.LEV','BCE · Depositi'],
 ['D.U2.EUR.4F.KR.MLFR.LEV','BCE · Prestito marginale']
 ];
 const results=await Promise.all(series.map(async s=>{
  try{
   const r=await fetch('https://data-api.ecb.europa.eu/service/data/FM/'+s[0]+'?format=csvdata&lastNObservations=1');
   if(!r.ok)throw Error();
   const rows=(await r.text()).trim().split(/\r?\n/);
   const h=rows[0].split(',');
   const v=rows[rows.length-1].split(',');
   return {name:s[1],value:Number(v[h.indexOf('OBS_VALUE')]),date:v[h.indexOf('TIME_PERIOD')]};
  }catch(e){return null}
 }));
 const valid=results.filter(x=>x&&Number.isFinite(x.value));
 list.innerHTML=valid.length?valid.map(x=>'<article class="holding"><div class="holding-info"><b>'+safe(x.name)+'</b><small>'+x.value.toLocaleString('it-IT')+'% · '+safe(x.date)+'</small></div></article>').join(''):'<p class="hint">Dati BCE momentaneamente non disponibili.</p>';
 status.textContent='Fonte ufficiale: Banca Centrale Europea. Ultime osservazioni disponibili.';
}

async function refreshMarkets(){
 const b=$('#refreshMarkets');
 if(b){b.disabled=true;b.textContent='Aggiornamento…'}
 try{
  await Promise.all([
   loadMarketPanel(commodityAssets,'#commodityList','#commodityUpdated'),
   loadCentralBankRates(),
   loadMarketPanel(topPlayers,'#techList','#techUpdated')
  ]);
 }finally{
  if(b){b.disabled=false;b.textContent='↻ Aggiorna mercati'}
 }
}

$('#refreshMarkets')?.addEventListener('click',refreshMarkets);
refreshMarkets();
// PIKKIO - AGGIORNAMENTO AUTOMATICO OGNI 10 MINUTI
setInterval(() => {
  refreshMarkets();
  loadNews();
  if (holdings.length) refreshPrices();
}, 10 * 60 * 1000);
$('#refreshPrices').addEventListener('click',refreshPrices);
$('#runAI').addEventListener('click',async()=>{const box=$('#aiResult');box.innerHTML='<b>Analisi in corso…</b><p>Invio al motore AI configurato sul server.</p>';try{const r=await fetch('https://pikkio6-api.onrender.com/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({holdings,articles:newsItems})}),d=await r.json();if(!r.ok)throw Error(d.error||'Servizio AI non disponibile');box.innerHTML=`<b>Analisi AI · ${safe(d.model||'')}</b><p style="white-space:pre-wrap">${safe(d.analysis||'Nessun risultato')}</p><p>Analisi informativa generata il ${safe(d.createdAt||'')}. Verifica le fonti e non usarla come ordine di investimento.</p>`}catch(e){box.innerHTML=`<b>Analisi AI non disponibile</b><p>${safe(e.message)}. Configura OPENAI_API_KEY sul server e riprova.</p>`}});
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');holdings=Array.isArray(saved)?saved.filter(h=>h&&typeof h.ticker==='string'&&Number(h.quantity)>0&&Number(h.price)>=0).map(h=>({...h,quantity:Number(h.quantity),price:Number(h.price)})):[]}catch{holdings=[]}render();loadNews();if(holdings.length)refreshPrices();
let deferredPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false});$('#installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').hidden=true});if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
