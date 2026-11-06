'use strict';
const express = require('express');
const path = require('path');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;
let db = null;

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null');
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('Firebase collegato correttamente');
  }
} catch (error) {
  console.error('Errore configurazione Firebase:', error.message);
}
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin === 'https://pikkio13677.github.io') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(
      origin === 'https://pikkio13677.github.io' ? 204 : 403
    );
  }

  next();
});
function xmlText(s='') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/<[^>]+>/g,'').trim();
}
function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  return (block.match(re)||[])[1] || '';
}
app.get('/api/health', (_req,res)=>res.json({ok:true,service:'PIKKIO',time:new Date().toISOString()}));
async function requireFirebaseAuth(req, res, next) {
  if (!db) {
    return res.status(503).json({
      error: 'Firebase non disponibile sul server'
    });
  }

  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      error: 'Autenticazione richiesta'
    });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.firebaseUid = decoded.uid;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Token Firebase non valido o scaduto'
    });
  }
}
app.get('/api/portfolio', requireFirebaseAuth, async (req, res) => {
  try {
    const ref = db.collection('users')
      .doc(req.firebaseUid)
      .collection('portfolio')
      .doc('current');

    const snapshot = await ref.get();
    const data = snapshot.exists ? snapshot.data() : {};

    res.json({
      holdings: Array.isArray(data.holdings) ? data.holdings : [],
      updatedAt: data.updatedAt?.toDate?.().toISOString() || null
    });
  } catch (error) {
    res.status(500).json({
      error: 'Impossibile leggere il portafoglio'
    });
  }
});
app.put('/api/portfolio', requireFirebaseAuth, async (req, res) => {
  const input = req.body?.holdings;

  if (!Array.isArray(input) || input.length > 100) {
    return res.status(400).json({
      error: 'Portafoglio non valido: massimo 100 titoli'
    });
  }

  const holdings = [];

  for (const item of input) {
    const ticker = String(item?.ticker || '').trim().toUpperCase();
    const name = String(item?.name || ticker).trim().slice(0, 80);
    const quantity = Number(item?.quantity);
    const price = Number(item?.price);

    if (
      !/^[A-Z0-9.^_=-]{1,20}$/.test(ticker) ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(price) || price < 0
    ) {
      return res.status(400).json({
        error: 'Dati dei titoli non validi'
      });
    }

    holdings.push({ ticker, name, quantity, price });
  }

  try {
    const ref = db.collection('users')
      .doc(req.firebaseUid)
      .collection('portfolio')
      .doc('current');

    await ref.set({
      holdings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ ok: true, count: holdings.length });
  } catch (error) {
    res.status(500).json({
      error: 'Impossibile salvare il portafoglio'
    });
  }
});
app.get('/api/news', async (_req,res) => {
  try {
    const response = await fetch('https://news.google.com/rss?hl=it&gl=IT&ceid=IT:it', {headers:{'User-Agent':'PIKKIO-Radar/1.0'}});
    if (!response.ok) throw new Error(`Feed not available (${response.status})`);
    const xml = await response.text();
    const articles = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,20).map(m=>{
      const b=m[1], link=xmlText(tag(b,'link')), title=xmlText(tag(b,'title'));
      let domain='Fonte web'; try { domain=new URL(link).hostname.replace(/^www\./,''); } catch {}
      return {title,url:link,domain,seen:xmlText(tag(b,'pubDate')),sourceCountry:'Notizia internazionale'};
    }).filter(a=>a.title && a.url);
    res.json({articles,updatedAt:new Date().toISOString(),source:'Google News RSS'});
  } catch(e) { res.status(502).json({error:'Feed not available',detail:e.message}); }
});

app.get('/api/quote/:ticker', async (req,res) => {
  const ticker=String(req.params.ticker||'').toUpperCase();
 if (!/^[A-Z0-9.^_=-]{1,20}$/.test(ticker)) return res.status(400).json({error:'Ticker non valido'}); 
  try {
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 PIKKIO/1.0'}});
    if(!r.ok) throw new Error(`Provider quotazioni (${r.status})`);
    const j=await r.json(), result=j.chart?.result?.[0], meta=result?.meta;
    const price=meta?.regularMarketPrice;
    if(!Number.isFinite(price)) throw new Error('Quotazione non disponibile per questo ticker');
    res.json({ticker,price,currency:meta.currency||null,asOf:meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():'non indicata',provider:'Yahoo Finance',delayed:true});
  } catch(e) { res.status(502).json({error:e.message}); }
});

app.get('/api/fx/:currency', async (req,res) => {
  const currency=String(req.params.currency||'').toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({error:'Valuta non valida'});
  if(currency==='EUR') return res.json({rate:1,currency:'EUR'});
  try {
    const r=await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=EUR`);
    if(!r.ok) throw new Error(`Cambio non disponibile (${r.status})`);
    const j=await r.json(), rate=j.rates?.EUR;
    if(!Number.isFinite(rate)) throw new Error('Cambio non disponibile');
    res.json({rate,currency,date:j.date,provider:'Frankfurter'});
  } catch(e) { res.status(502).json({error:e.message}); }
});

app.post('/api/analyze', async (req,res) => {
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'OPENAI_API_KEY non configurata sul server'});
  const holdings=Array.isArray(req.body?.holdings)?req.body.holdings.slice(0,50):[];
  const articles=Array.isArray(req.body?.articles)?req.body.articles.slice(0,30):[];
  const input=JSON.stringify({portafoglio:holdings.map(h=>({ticker:String(h.ticker||'').slice(0,20),nome:String(h.name||'').slice(0,80)})),notizie:articles.map(a=>({titolo:String(a.title||'').slice(0,300),fonte:String(a.domain||'').slice(0,100),url:String(a.url||'').slice(0,500)}))});
  try {
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',instructions:'Sei l’assistente informativo di PIKKIO. Analizza le notizie fornite e indica solo collegamenti plausibili con i titoli presenti. Distingui fatti, ipotesi e incertezze; cita i titoli delle notizie e le fonti fornite. Non dare ordini di acquisto o vendita, non inventare dati, non presentare una correlazione come causalità. Se le informazioni sono insufficienti, dichiaralo. Rispondi in italiano, in modo chiaro e prudente.',input, max_output_tokens:900})});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data.error?.message||'Errore del servizio AI'});
    const analysis=(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');
    res.json({analysis,model:process.env.OPENAI_MODEL||'gpt-4.1-mini',createdAt:new Date().toISOString()});
  } catch(e) { res.status(502).json({error:e.message}); }
});


  
  

  
    
  

  
  
      
      
    
  

  
    

    
      
      
    

    

    
      
    

    
      
      
    

  
    
    
    
    
    
  

app.use(express.static(__dirname,{extensions:['html']}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log(`PIKKIO server listening on ${PORT}`));
