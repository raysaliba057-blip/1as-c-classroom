'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_PATH = path.resolve(ROOT, process.env.DB_PATH || './data/classroom.sqlite');
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || './uploads');
const IS_PROD = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('ERROR: Set SESSION_SECRET to a random value of at least 32 characters in .env.'); process.exit(1);
}
if (!process.env.DELEGATE_PASSWORD || process.env.DELEGATE_PASSWORD.length < 12 || process.env.DELEGATE_PASSWORD.startsWith('replace-with-')) {
  console.error('ERROR: Set DELEGATE_PASSWORD to a unique password of at least 12 characters in .env.'); process.exit(1);
}
fs.mkdirSync(path.dirname(DB_PATH), {recursive:true}); fs.mkdirSync(UPLOAD_DIR, {recursive:true});
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS posts (
 id TEXT PRIMARY KEY,
 type TEXT NOT NULL CHECK(type IN ('hw','test','talk')),
 subject TEXT NOT NULL,
 title TEXT NOT NULL,
 date TEXT,
 notes TEXT NOT NULL DEFAULT '',
 images TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
 sid TEXT PRIMARY KEY,
 sess TEXT NOT NULL,
 expired INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_date ON posts(date, created_at);
`);

app.disable('x-powered-by');
app.set('trust proxy', IS_PROD ? 1 : false);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],scriptSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'100kb'}));
app.use(session({
 name:'as-c.sid', secret:process.env.SESSION_SECRET, resave:false, saveUninitialized:false,
 store:new SQLiteStore({db:'sessions.sqlite',dir:path.dirname(DB_PATH),table:'sessions',concurrentDB:true}),
 cookie:{httpOnly:true,sameSite:'strict',secure:IS_PROD,maxAge:8*60*60*1000}
}));
app.use('/uploads', express.static(UPLOAD_DIR, {fallthrough:false,immutable:true,maxAge:'1d',setHeaders(res){res.setHeader('X-Content-Type-Options','nosniff')}}));
app.use(express.static(path.join(ROOT,'public'), {extensions:['html']}));

const loginLimiter = rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,message:{error:'Too many login attempts. Please wait 15 minutes.'}});
function requireDelegate(req,res,next){if(req.session && req.session.delegate===true)return next();return res.status(401).json({error:'Delegate login required.'});}
function sameOrigin(req,res,next){
 const origin=req.get('origin');
 if (!origin) return res.status(403).json({error:'Missing request origin.'});
 try { const u=new URL(origin); if(u.host!==req.get('host') || !['http:','https:'].includes(u.protocol)) throw new Error('origin'); }
 catch { return res.status(403).json({error:'Cross-origin request blocked.'}); }
 next();
}
const storage = multer.diskStorage({
 destination: (_req,_file,cb)=>cb(null,UPLOAD_DIR),
 filename: (_req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())
});
const upload = multer({storage,limits:{fileSize:5*1024*1024,files:3},fileFilter:(_req,file,cb)=>{
 const ok=['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
 cb(ok?null:new Error('Only JPG, PNG, WEBP, and GIF images are allowed.'),ok);
}});
function cleanPost(row){return {...row,images:JSON.parse(row.images || '[]')}}
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.get('/api/me',(req,res)=>res.json({delegate:req.session?.delegate===true}));
app.get('/api/posts',(_req,res)=>{
 const rows=db.prepare("SELECT id,type,subject,title,date,notes,images,created_at FROM posts ORDER BY CASE WHEN date IS NULL OR date='' THEN 1 ELSE 0 END, date ASC, created_at DESC").all();
 res.set('Cache-Control','no-store'); res.json({posts:rows.map(cleanPost)});
});
app.post('/api/login',loginLimiter,sameOrigin,(req,res)=>{
 const password=String(req.body?.password || '');
 const a=Buffer.from(password); const b=Buffer.from(process.env.DELEGATE_PASSWORD);
 const ok=a.length===b.length && crypto.timingSafeEqual(a,b);
 if(!ok){return res.status(401).json({error:'Incorrect delegate password.'});}
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Could not start a secure session.'});req.session.delegate=true;req.session.save(e=>e?res.status(500).json({error:'Could not save login.'}):res.json({delegate:true}));});
});
app.post('/api/logout',sameOrigin,(req,res)=>{req.session.destroy(()=>{res.clearCookie('as-c.sid',{httpOnly:true,sameSite:'strict',secure:IS_PROD});res.json({ok:true});});});
app.post('/api/posts',requireDelegate,sameOrigin,upload.array('images',3),(req,res)=>{
 const body=req.body || {}; const type=String(body.type||''); const subject=String(body.subject||'').trim().slice(0,80); const title=String(body.title||'').trim().slice(0,160); const date=String(body.date||'').trim(); const notes=String(body.notes||'').trim().slice(0,5000);
 if(!['hw','test','talk'].includes(type))return res.status(400).json({error:'Invalid publication type.'});
 if(!subject||!title)return res.status(400).json({error:'Subject and title are required.'});
 if(date && !/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Invalid date.'});
 const images=(req.files||[]).map(f=>'/uploads/'+path.basename(f.filename)); const id=crypto.randomUUID();
 try{db.prepare('INSERT INTO posts(id,type,subject,title,date,notes,images) VALUES(?,?,?,?,?,?,?)').run(id,type,subject,title,date,notes,JSON.stringify(images));res.status(201).json({post:cleanPost(db.prepare('SELECT * FROM posts WHERE id=?').get(id))});}
 catch(e){for(const f of req.files||[])try{fs.unlinkSync(f.path)}catch{};console.error(e);res.status(500).json({error:'Could not save publication.'});}
});
app.delete('/api/posts/:id',requireDelegate,sameOrigin,(req,res)=>{
 const row=db.prepare('SELECT images FROM posts WHERE id=?').get(req.params.id); if(!row)return res.status(404).json({error:'Publication not found.'});
 const imgs=JSON.parse(row.images||'[]'); db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
 for(const url of imgs){const name=path.basename(url);const target=path.join(UPLOAD_DIR,name);if(target.startsWith(UPLOAD_DIR+path.sep))try{fs.unlinkSync(target)}catch{}}
 res.json({ok:true});
});
app.use((err,_req,res,_next)=>{if(err instanceof multer.MulterError){const message=err.code==='LIMIT_FILE_SIZE'?'Each image must be 5 MB or smaller.':err.code==='LIMIT_FILE_COUNT'?'You can attach up to 3 images.':'Image upload failed.';return res.status(400).json({error:message});}if(err) {console.error(err);return res.status(400).json({error:err.message||'Request failed.'});}res.status(404).json({error:'Not found.'});});
app.listen(PORT,'0.0.0.0',()=>console.log(`1AS-C classroom server listening on port ${PORT}`));
