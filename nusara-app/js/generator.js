// Workflow: Step 1 gambar -> Step 2 video -> Step 3 unduh. Semua hasil berasal dari server (provider AI sungguhan).
const $ = (s) => document.querySelector(s);
const state = { mode: 'text', sourceId: null, uploadUrl: null, image: null /* {id,url,type} */, video: null, status: null, busy: false, lastAction: null };

const api = async (path, opts = {}) => {
  let res;
  try { res = await fetch(path, opts); } catch { throw Object.assign(new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.'), { retryable: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Permintaan gagal (${res.status}).`), { retryable: data.retryable !== false, code: data.code, retryAfter: data.retryAfter });
  return data;
};
const show = (el, on) => { el.hidden = !on; };
const setRail = (n) => document.querySelectorAll('[data-rail]').forEach((li) => { const i = Number(li.dataset.rail); li.className = i < n ? 'done' : i === n ? 'on' : ''; });
const unlock = (id, bodyId, lockedId) => { $(id).classList.remove('is-locked'); show($(bodyId), true); show($(lockedId), false); };
const dlHref = (f, name) => `${f.url}?download=1&name=${encodeURIComponent(name)}`;
const stamp = () => new Date().toISOString().slice(0, 10);
const extOf = (t) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[t] || 'bin');

function showError(id, msg) { const b = $(id); b.querySelector('p').textContent = msg; show(b, true); }
function setBusy(btnIds, busy) {
  state.busy = busy;
  const c = state.status?.capabilities;
  btnIds.forEach((id) => { const b = $(id); if (!b) return; const off = !state.status?.configured || (id === '#gen-video' && !c?.imageToVideo) || (id === '#gen-image' && !(c?.textToImage || c?.imageToImage)); b.disabled = busy || off; });
}

// ---- Status provider (jujur) ----
async function loadStatus() {
  const box = $('#gen-status');
  try {
    const s = await api('/api/status');
    state.status = s;
    const c = s.capabilities || {};
    const l = s.limits || {};
    box.className = 'notice ok';
    box.textContent = c.imageToVideo
      ? 'Generator aktif: gambar dan video AI siap dipakai.'
      : 'Generator aktif untuk gambar. Video AI aktif setelah FAL API key dipasang di server.';
    $('#gen-quota').textContent = `Batas: ${l.imagesPerHour ?? 10} gambar per jam dan ${l.videosPerDay ?? 3} video per hari per pengunjung. Hasil disimpan sementara ${l.fileTtlMinutes ?? 60} menit lalu dihapus otomatis.`;
    for (const id of ['#tab-image', '#pick']) $(id).disabled = false;
    $('#gen-image').disabled = !(c.textToImage || c.imageToImage);
    $('#gen-video').disabled = !c.imageToVideo;
  } catch {
    state.status = { configured: false, capabilities: {}, limits: { maxUploadMB: 8, fileTtlMinutes: 60, imagesPerHour: 10, videosPerDay: 3 } };
    box.className = 'notice warn';
    box.textContent = 'Ini versi pratinjau statis. Generator AI belum aktif di sini karena butuh server dan API key. Tidak ada hasil palsu yang ditampilkan.';
    $('#gen-quota').textContent = 'Setelah dipasang di server, batas bawaan: 10 gambar per jam dan 3 video per hari per pengunjung.';
    for (const id of ['#gen-image', '#gen-video', '#tab-image', '#pick']) $(id).disabled = true;
  }
}

// ---- Tabs ----
function setMode(m) {
  state.mode = m;
  for (const k of ['text', 'image']) { const on = k === m; const t = $(`#tab-${k}`); t.classList.toggle('on', on); t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; show($(`#pane-${k}`), on); }
}
$('#tab-text').addEventListener('click', () => setMode('text'));
$('#tab-image').addEventListener('click', () => setMode('image'));
document.querySelector('.tabs').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const m = state.mode === 'text' ? 'image' : 'text'; if (!$(`#tab-${m}`).disabled) { setMode(m); $(`#tab-${m}`).focus(); } } });

// ---- Upload ----
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
async function handleFile(file) {
  show($('#img-error'), false);
  if (!file) return;
  const max = (state.status?.limits.maxUploadMB ?? 8) * 1024 * 1024;
  if (!OK_TYPES.includes(file.type)) return showError('#img-error', 'Format tidak didukung. Gunakan JPG, PNG, atau WebP.');
  if (file.size > max) return showError('#img-error', `Ukuran file ${(file.size / 1048576).toFixed(1)} MB melebihi batas ${state.status?.limits.maxUploadMB ?? 8} MB.`);
  if (state.uploadUrl) URL.revokeObjectURL(state.uploadUrl);
  state.uploadUrl = URL.createObjectURL(file); state.sourceId = null;
  $('#up-preview').src = state.uploadUrl; show($('#drop-empty'), false); show($('#drop-preview'), true);
  $('#img-status').textContent = 'Mengunggah foto…'; setBusy(['#gen-image'], true);
  try { const r = await api('/api/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }); state.sourceId = r.id; $('#img-status').textContent = 'Foto siap.'; }
  catch (e) { showError('#img-error', e.message); $('#img-status').textContent = ''; removeFile(); }
  setBusy(['#gen-image'], false);
}
function removeFile() { if (state.uploadUrl) URL.revokeObjectURL(state.uploadUrl); state.uploadUrl = null; state.sourceId = null; $('#file').value = ''; $('#up-preview').removeAttribute('src'); show($('#drop-preview'), false); show($('#drop-empty'), true); }
$('#pick').addEventListener('click', () => $('#file').click());
$('#swap').addEventListener('click', () => $('#file').click());
$('#remove').addEventListener('click', removeFile);
$('#file').addEventListener('change', (e) => handleFile(e.target.files[0]));
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

// ---- Step 1: image ----
async function generateImage() {
  if (state.busy) return;
  show($('#img-error'), false);
  const prompt = (state.mode === 'text' ? $('#prompt') : $('#prompt2')).value.trim();
  if (state.mode === 'text' && prompt.length < 3) return showError('#img-error', 'Tuliskan deskripsi gambar dulu (minimal 3 karakter).');
  if (state.mode === 'image' && !state.sourceId) return showError('#img-error', 'Unggah foto sumber dulu.');
  state.lastAction = 'image';
  setBusy(['#gen-image', '#regen'], true); $('#img-status').textContent = 'Membuat gambar… biasanya 10–60 detik.';
  try {
    const r = await api('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: state.mode, prompt, style: $('#style').value, aspect: $('#aspect').value, sourceId: state.sourceId }) });
    state.image = r; $('#img-out').src = r.url; $('#img-out').alt = `Hasil gambar: ${prompt || 'dari foto'}`.slice(0, 120);
    $('#dl-image').href = dlHref(r, `nusara-image-${stamp()}`); $('#dl-image2').href = $('#dl-image').href;
    $('#src-preview').src = r.url; show($('#img-result'), true); $('#img-status').textContent = '';
    $('#img-out').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (e) { showError('#img-error', e.message); $('#img-status').textContent = ''; }
  setBusy(['#gen-image', '#regen'], false);
}
$('#gen-image').addEventListener('click', generateImage);
$('#regen').addEventListener('click', generateImage);
$('#to-video').addEventListener('click', () => { if (!state.image) return; $('#src-preview').src = state.image.url; unlock('#step2', '#s2-body', '#locked2'); setRail(2); $('#step2').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#back-image').addEventListener('click', () => { setRail(1); $('#step1').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

// ---- Step 2: video ----
const ORDER = ['preparing', 'generating', 'processing', 'done'];
function paint(status) { const idx = ORDER.indexOf(status); document.querySelectorAll('#v-progress li').forEach((li, i) => { li.className = i < idx || status === 'done' ? 'done' : i === idx ? 'active' : ''; }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function generateVideo() {
  if (state.busy || !state.image) return;
  state.lastAction = 'video'; show($('#vid-error'), false); show($('#v-progress'), true); paint('preparing');
  setBusy(['#gen-video'], true);
  try {
    const r = await api('/api/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: state.image.id, prompt: $('#motion').value.trim(), duration: $('#duration').value || null, aspect: $('#vaspect').value }) });
    for (let n = 0; n < 900; n++) {
      await sleep(n < 5 ? 1000 : 2500);
      const j = await api(`/api/video/${r.jobId}`);
      paint(j.status);
      if (j.status === 'error') throw Object.assign(new Error(j.message), { retryable: j.retryable });
      if (j.status === 'done') { state.video = { url: j.fileUrl }; finishVideo(); return setBusy(['#gen-video'], false); }
    }
    throw new Error('Proses terlalu lama. Coba lagi nanti.');
  } catch (e) { show($('#v-progress'), false); showError('#vid-error', e.message); }
  setBusy(['#gen-video'], false);
}
function finishVideo() {
  const v = $('#final-video'); v.src = state.video.url; v.load();
  $('#dl-video').href = dlHref(state.video, `nusara-video-${stamp()}`);
  unlock('#step3', '#s3-body', '#locked3'); setRail(3); $('#step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#gen-video').addEventListener('click', generateVideo);
$('#another').addEventListener('click', () => { show($('#v-progress'), false); setRail(2); $('#step2').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#new-project').addEventListener('click', () => {
  Object.assign(state, { image: null, video: null, lastAction: null }); removeFile();
  $('#prompt').value = $('#prompt2').value = $('#motion').value = ''; show($('#img-result'), false); show($('#v-progress'), false);
  for (const [id, b, l] of [['#step2', '#s2-body', '#locked2'], ['#step3', '#s3-body', '#locked3']]) { $(id).classList.add('is-locked'); show($(b), false); show($(l), true); }
  $('#final-video').removeAttribute('src'); setRail(1); $('#step1').scrollIntoView({ behavior: 'smooth' });
});
document.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', () => (b.dataset.retry === 'image' ? generateImage() : generateVideo())));

loadStatus();
