// NUSARA — backend generator (nol dependensi, Node >= 18).
// Melayani file statis situs + API yang dipakai js/generator.js:
//   GET  /api/status            -> { configured, capabilities, limits }
//   POST /api/upload            -> { id }            (raw body, JPG/PNG/WebP <= 8 MB)
//   GET  /api/file/:id          -> file (dukung ?download=1&name=...)
//   POST /api/image             -> { id, url, type } (Pollinations, gratis tanpa key)
//   POST /api/video             -> { jobId }         (fal.ai, butuh FAL_KEY)
//   GET  /api/video/:jobId      -> { status, fileUrl?, message? }
//
// Env (opsional):
//   PORT (default 3000), PUBLIC_BASE_URL (URL publik server, wajib untuk
//   mode Image-to-Image & video dari foto upload), TRUST_PROXY=1 (Render),
//   POLLINATIONS_API_KEY (opsional; tanpa key memakai endpoint anonim),
//   FAL_KEY (wajib untuk video; tanpa ini video dinonaktifkan jujur).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || '';
const FAL_KEY = process.env.FAL_KEY || '';
// Panel kontrol tahap 1: kata sandi panel dipasang Pak sendiri di env Render
// (ADMIN_KEY). Tanpa ADMIN_KEY, panel gagal tertutup. Kunci tidak pernah
// ditulis di repo/file — hanya dibandingkan hash-nya dengan cookie login.
const ADMIN_KEY = process.env.ADMIN_KEY || '';
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function adminAuthed(req) {
  if (!ADMIN_KEY) return false;
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)nusara_admin=([0-9a-f]{64})/);
  return !!m && m[1] === sha256(ADMIN_KEY);
}

const ROOT = __dirname;
const MAX_UPLOAD = 8 * 1024 * 1024;
const TTL_MS = 60 * 60 * 1000;
const LIMITS = { maxUploadMB: 8, fileTtlMinutes: 60, imagesPerHour: 10, videosPerDay: 3 };
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const files = new Map();   // id -> { buf, type, createdAt }
const images = new Map();  // id -> { fileId, providerUrl, createdAt }
const videoJobs = new Map(); // jobId -> { falId, status, fileUrl, message }
const usage = new Map();   // ip -> { images: [ts], videos: [ts] }

// Buku tamu situs: hitungan kunjungan per hari (tayang + pengunjung unik).
// Hanya browser asli yang menjalankan JS yang mengirim beacon; ping penjaga,
// bot, dan curl tidak terhitung. Data hidup di memori saja — restart Render
// mengosongkan hitungan (lihat field `since` di /api/stats).
const visits = new Map(); // day(WIB) -> { views, uniques:Set<hash>, lastSeen:Map<ip,ts> }
const visitsStartedAt = Date.now();
const wibDay = (ts = Date.now()) => new Date(ts + 7 * 3600 * 1000).toISOString().slice(0, 10);
function recordVisit(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua.includes('Mozilla')) return; // bukan browser: ping/bot/curl tidak dihitung
  const ip = clientIp(req);
  const now = Date.now();
  const day = wibDay(now);
  let rec = visits.get(day);
  if (!rec) { rec = { views: 0, uniques: new Set(), lastSeen: new Map() }; visits.set(day, rec); }
  if (now - (rec.lastSeen.get(ip) || 0) < 10 * 1000) return; // kirim ganda tidak dihitung dua kali
  rec.lastSeen.set(ip, now);
  rec.views += 1;
  rec.uniques.add(crypto.createHash('sha256').update(ip + '|' + day).digest('hex'));
  if (visits.size > 40) for (const d of [...visits.keys()]) if (d < wibDay(now - 30 * 86400 * 1000)) visits.delete(d);
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
function checkQuota(ip, kind) {
  const now = Date.now();
  const u = usage.get(ip) || { images: [], videos: [] };
  usage.set(ip, u);
  if (kind === 'image') {
    u.images = u.images.filter((t) => now - t < 3600 * 1000);
    if (u.images.length >= LIMITS.imagesPerHour) return `Batas 10 gambar per jam tercapai. Coba lagi nanti.`;
    u.images.push(now);
  } else {
    u.videos = u.videos.filter((t) => now - t < 86400 * 1000);
    if (u.videos.length >= LIMITS.videosPerDay) return `Batas 3 video per hari tercapai. Coba lagi besok.`;
    u.videos.push(now);
  }
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, f] of files) if (now - f.createdAt > TTL_MS) files.delete(id);
  for (const [id, im] of images) if (now - im.createdAt > TTL_MS) images.delete(id);
}, 5 * 60 * 1000).unref();

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function sendErr(res, code, message, extra = {}) {
  sendJson(res, code, { error: message, retryable: true, ...extra });
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('Body terlalu besar.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const STYLE_SUFFIX = {
  realistic: ', photorealistic, highly detailed, natural lighting, sharp focus, realistic textures, professional product photography, balanced composition',
  cinematic: ', cinematic lighting, dramatic composition, film still, rich colors, depth of field, highly detailed, epic atmosphere',
  '3d': ', 3D animation style, soft studio lighting, high quality render, detailed textures, smooth shading, vibrant colors',
  illustration: ', detailed digital illustration, vibrant colors, clean lines, rich detail, polished artwork, expressive style',
};
const ASPECT_SIZE = { '1:1': [1024, 1024], '16:9': [1280, 720], '9:16': [720, 1280] };

function pollinationsUrl(prompt, { width, height, model, imageRef }) {
  const u = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  u.searchParams.set('model', model);
  u.searchParams.set('width', String(width));
  u.searchParams.set('height', String(height));
  u.searchParams.set('seed', String(Math.floor(Math.random() * 1e9)));
  u.searchParams.set('nologo', 'true');
  u.searchParams.set('private', 'true');
  // Catatan (uji 28 Okt 2026): endpoint anonim MENGABAIKAN parameter model
  // (flux/turbo/flux-realism menghasilkan berkas identik — selalu model
  // default), enhance hampir tidak berpengaruh, dan kapasitas gratis bisa
  // 503. Jadi perbaikan kualitas di jalur gratis hanya lewat prompt + retry.
  u.searchParams.set('enhance', 'true');
  if (imageRef) u.searchParams.set('image', imageRef);
  if (POLLINATIONS_API_KEY) u.searchParams.set('key', POLLINATIONS_API_KEY);
  return u.toString();
}

async function handleImage(req, res) {
  const ip = clientIp(req);
  let body;
  try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}'); }
  catch { return sendErr(res, 400, 'Body JSON tidak valid.'); }
  const mode = body.mode === 'image' ? 'image' : 'text';
  const prompt = String(body.prompt || '').trim();
  const style = String(body.style || '');
  const aspect = ASPECT_SIZE[body.aspect] ? body.aspect : '16:9';
  const [width, height] = ASPECT_SIZE[aspect];
  if (mode === 'text' && prompt.length < 3) return sendErr(res, 400, 'Tuliskan deskripsi gambar dulu (minimal 3 karakter).');
  if (mode === 'image' && !body.sourceId) return sendErr(res, 400, 'Unggah foto sumber dulu.');
  const quotaErr = checkQuota(ip, 'image');
  if (quotaErr) return sendErr(res, 429, quotaErr, { code: 'quota', retryable: false });

  let fullPrompt = prompt;
  let model = 'flux';
  let imageRef = null;
  if (mode === 'image') {
    const src = files.get(String(body.sourceId));
    if (!src) return sendErr(res, 404, 'Foto sumber tidak ditemukan atau sudah kedaluwarsa. Unggah ulang.');
    if (!PUBLIC_BASE_URL) return sendErr(res, 400, 'Mode Image to Image butuh URL publik server (PUBLIC_BASE_URL).', { retryable: false });
    model = 'kontext';
    imageRef = `${PUBLIC_BASE_URL}/api/file/${encodeURIComponent(String(body.sourceId))}`;
    fullPrompt = prompt || 'Edit gambar ini dengan kualitas tinggi.';
  }
  fullPrompt += STYLE_SUFFIX[style] || '';

  const url = pollinationsUrl(fullPrompt, { width, height, model, imageRef });
  let r;
  const fetchOnce = () => fetch(url, { signal: AbortSignal.timeout(90000) });
  try { r = await fetchOnce(); }
  catch { return sendErr(res, 502, 'Provider gambar tidak merespons. Coba lagi.'); }
  if (r.status === 503) {
    // Kapasitas gratis Pollinations sering penuh sesaat — coba ulang 1x
    // sesudah 10 detik (sesuai pesan provider sendiri).
    await new Promise((ok) => setTimeout(ok, 10 * 1000));
    try { r = await fetchOnce(); }
    catch { return sendErr(res, 502, 'Provider gambar tidak merespons. Coba lagi.'); }
  }
  if (!r.ok) {
    if (r.status === 503) return sendErr(res, 503, 'Server gambar gratis sedang penuh. Tunggu sebentar lalu coba lagi.', { retryable: true });
    const t = await r.text().catch(() => '');
    return sendErr(res, 502, `Provider gambar menolak permintaan (${r.status}). ${t.slice(0, 120)}`);
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) return sendErr(res, 502, 'Provider gambar mengembalikan respons tak terduga.');
  const buf = Buffer.from(await r.arrayBuffer());
  const id = crypto.randomUUID();
  files.set(id, { buf, type: ct.split(';')[0], createdAt: Date.now() });
  images.set(id, { fileId: id, providerUrl: url, createdAt: Date.now() });
  sendJson(res, 200, { id, url: `/api/file/${id}`, type: ct.split(';')[0] });
}

async function handleVideo(req, res) {
  const ip = clientIp(req);
  let body;
  try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}'); }
  catch { return sendErr(res, 400, 'Body JSON tidak valid.'); }
  const img = images.get(String(body.imageId || ''));
  if (!img) return sendErr(res, 404, 'Gambar sumber tidak ditemukan atau sudah kedaluwarsa. Buat gambar lagi.');
  if (!FAL_KEY) return sendErr(res, 400, 'Video AI belum aktif: FAL API key belum dipasang di server.', { code: 'video_needs_key', retryable: false });
  const quotaErr = checkQuota(ip, 'video');
  if (quotaErr) return sendErr(res, 429, quotaErr, { code: 'quota', retryable: false });

  // fal.ai butuh URL publik untuk image_url: pakai URL provider Pollinations
  // (publik) bila ada, kalau tidak pakai file kita lewat PUBLIC_BASE_URL.
  const imageUrl = img.providerUrl || (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/api/file/${img.fileId}` : null);
  if (!imageUrl) return sendErr(res, 400, 'Gambar sumber belum bisa diakses publik untuk video.', { retryable: false });

  let r;
  try {
    r = await fetch('https://queue.fal.run/fal-ai/ltx-video-lora/image-to-video', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: String(body.prompt || '').trim() || 'Gerakan natural yang halus, kamera stabil.', image_url: imageUrl }),
      signal: AbortSignal.timeout(60000),
    });
  } catch { return sendErr(res, 502, 'Provider video tidak merespons. Coba lagi.'); }
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return sendErr(res, 502, `Provider video menolak permintaan (${r.status}). ${t.slice(0, 160)}`);
  }
  const data = await r.json().catch(() => ({}));
  const falId = data.request_id;
  if (!falId) return sendErr(res, 502, 'Provider video tidak mengembalikan ID job.');
  const jobId = crypto.randomUUID();
  videoJobs.set(jobId, { falId, status: 'preparing', fileUrl: null, message: null });
  sendJson(res, 200, { jobId });
}

async function handleVideoStatus(req, res, jobId) {
  const job = videoJobs.get(jobId);
  if (!job) return sendErr(res, 404, 'Job video tidak ditemukan.');
  if (job.status === 'done') return sendJson(res, 200, { status: 'done', fileUrl: job.fileUrl });
  if (job.status === 'error') return sendJson(res, 200, { status: 'error', message: job.message || 'Gagal membuat video.', retryable: true });
  try {
    const r = await fetch(`https://queue.fal.run/fal-ai/ltx-video-lora/requests/${job.falId}/status`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
      signal: AbortSignal.timeout(30000),
    });
    const s = await r.json().catch(() => ({}));
    if (s.status === 'COMPLETED') {
      const rr = await fetch(`https://queue.fal.run/fal-ai/ltx-video-lora/requests/${job.falId}`, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(30000),
      });
      const done = await rr.json().catch(() => ({}));
      const videoUrl = done.video?.url || done.output?.video?.url || null;
      if (videoUrl) {
        job.status = 'done'; job.fileUrl = videoUrl;
        return sendJson(res, 200, { status: 'done', fileUrl: videoUrl });
      }
      job.status = 'processing';
      return sendJson(res, 200, { status: 'processing' });
    }
    if (s.status === 'FAILED' || s.status === 'CANCELLED') {
      job.status = 'error'; job.message = 'Provider video gagal memproses. Coba lagi.';
      return sendJson(res, 200, { status: 'error', message: job.message, retryable: true });
    }
    job.status = s.status === 'IN_PROGRESS' ? 'generating' : 'preparing';
    return sendJson(res, 200, { status: job.status });
  } catch {
    return sendJson(res, 200, { status: job.status });
  }
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;
    if (p === '/api/status') {
      return sendJson(res, 200, {
        configured: true,
        capabilities: { textToImage: true, imageToImage: true, imageToVideo: !!FAL_KEY },
        limits: LIMITS,
      });
    }
    if (p === '/api/upload' && req.method === 'POST') {
      const type = req.headers['content-type'] || '';
      if (!OK_TYPES.includes(type)) return sendErr(res, 400, 'Format tidak didukung. Gunakan JPG, PNG, atau WebP.');
      const buf = await readBody(req, MAX_UPLOAD);
      const id = crypto.randomUUID();
      files.set(id, { buf, type, createdAt: Date.now() });
      return sendJson(res, 200, { id });
    }
    if (p.startsWith('/api/file/')) {
      const id = decodeURIComponent(p.slice('/api/file/'.length));
      const f = files.get(id);
      if (!f) { res.writeHead(404); return res.end('Tidak ditemukan.'); }
      const headers = { 'Content-Type': f.type, 'Cache-Control': 'private, max-age=3600' };
      if (u.searchParams.get('download') === '1') {
        const name = u.searchParams.get('name') || 'nusara-file';
        headers['Content-Disposition'] = `attachment; filename="${name.replace(/"/g, '')}"`;
      }
      res.writeHead(200, headers);
      return res.end(f.buf);
    }
    if (p === '/api/image' && req.method === 'POST') return handleImage(req, res);
    if (p === '/api/video' && req.method === 'POST') return handleVideo(req, res);
    if (p.startsWith('/api/video/') && req.method === 'GET') {
      return handleVideoStatus(req, res, decodeURIComponent(p.slice('/api/video/'.length)));
    }
    if (p === '/api/visit' && req.method === 'POST') {
      await readBody(req, 1024).catch(() => null); // kuras body kecil beacon
      recordVisit(req);
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/stats' && req.method === 'GET') {
      const days = Math.min(30, Math.max(1, parseInt(u.searchParams.get('days') || '30', 10) || 30));
      const out = [];
      for (let i = days - 1; i >= 0; i--) {
        const day = wibDay(Date.now() - i * 86400 * 1000);
        const rec = visits.get(day);
        out.push({ date: day, views: rec ? rec.views : 0, visitors: rec ? rec.uniques.size : 0 });
      }
      return sendJson(res, 200, { since: new Date(visitsStartedAt).toISOString(), note: 'Hitungan mulai dari server start; restart Render mengosongkan hitungan.', days: out });
    }
    // Panel kontrol: login + gerbang /admin.html (tidak menyentuh situs publik).
    if (p === '/api/admin/login' && req.method === 'POST') {
      const body = await readBody(req, 4096).catch(() => null);
      let key = '';
      try { key = JSON.parse(String(body || '{}')).key || ''; } catch {}
      if (ADMIN_KEY && key === ADMIN_KEY) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `nusara_admin=${sha256(ADMIN_KEY)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}` });
        return res.end(JSON.stringify({ ok: true }));
      }
      return sendErr(res, 401, 'Kata sandi salah.');
    }
    if (p === '/api/admin/logout' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'nusara_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (p === '/admin.html') {
      if (!ADMIN_KEY) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kontrol NUSARA</title></head><body style="font-family:sans-serif;padding:24px"><h1>Panel belum diatur</h1><p>Pasang <b>ADMIN_KEY</b> di environment Render (service nusara), tunggu deploy selesai, lalu buka lagi halaman ini.</p></body></html>');
      }
      if (!adminAuthed(req)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Masuk — Kontrol NUSARA</title></head><body style="font-family:sans-serif;padding:24px;max-width:420px;margin:0 auto"><h1>Kontrol NUSARA</h1><p>Masukkan kata sandi panel (ADMIN_KEY yang dipasang di Render).</p><form id="f"><input id="k" type="password" autocomplete="current-password" style="width:100%;padding:12px;font-size:1rem"><p><button style="padding:12px 20px;font-size:1rem">Masuk</button></p><p id="e" style="color:#b00"></p></form><script>document.getElementById("f").addEventListener("submit",async(ev)=>{ev.preventDefault();const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:document.getElementById("k").value})});if(r.ok)location.reload();else document.getElementById("e").textContent="Kata sandi salah.";});</script></body></html>');
      }
      // Lolos: lanjut ke blok file statis di bawah (admin.html disajikan).
    }
    // File statis
    let filePath = p === '/' ? '/index.html' : p;
    filePath = path.normalize(path.join(ROOT, filePath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { res.writeHead(404); return res.end('Tidak ditemukan.'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    if (!res.headersSent) sendErr(res, 500, 'Kesalahan server. Coba lagi.');
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NUSARA server jalan di port ${PORT} (video: ${FAL_KEY ? 'aktif' : 'nonaktif — FAL_KEY belum dipasang'})`);
});
