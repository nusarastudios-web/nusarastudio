// Workflow: prompt/foto -> gambar AI -> unduh. Semua hasil berasal dari server (provider AI sungguhan).
const $ = (s) => document.querySelector(s);
const state = { mode: 'text', sourceId: null, uploadUrl: null, image: null /* {id,url,type} */, status: null, busy: false };

const api = async (path, opts = {}) => {
  let res;
  try { res = await fetch(path, opts); } catch { throw Object.assign(new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.'), { retryable: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Permintaan gagal (${res.status}).`), { retryable: data.retryable !== false, code: data.code, retryAfter: data.retryAfter });
  return data;
};
const show = (el, on) => { el.hidden = !on; };
const dlHref = (f, name) => `${f.url}?download=1&name=${encodeURIComponent(name)}`;
const stamp = () => new Date().toISOString().slice(0, 10);

function showError(id, msg) { const b = $(id); b.querySelector('p').textContent = msg; show(b, true); }
function setBusy(btnIds, busy) {
  state.busy = busy;
  const c = state.status?.capabilities;
  btnIds.forEach((id) => { const b = $(id); if (!b) return; const off = !state.status?.configured || (id === '#gen-image' && !(c?.textToImage || c?.imageToImage)); b.disabled = busy || off; });
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
    box.textContent = 'Generator aktif: tulis prompt, jadi gambar.';
    $('#gen-quota').textContent = `Batas: ${l.imagesPerHour ?? 10} gambar per jam per pengunjung. Hasil disimpan sementara ${l.fileTtlMinutes ?? 60} menit lalu dihapus otomatis.`;
    for (const id of ['#tab-image', '#pick']) $(id).disabled = false;
    $('#gen-image').disabled = !(c.textToImage || c.imageToImage);
  } catch {
    state.status = { configured: false, capabilities: {}, limits: { maxUploadMB: 8, fileTtlMinutes: 60, imagesPerHour: 10, videosPerDay: 3 } };
    box.className = 'notice warn';
    box.textContent = 'Ini versi pratinjau statis. Generator AI belum aktif di sini karena butuh server dan API key. Tidak ada hasil palsu yang ditampilkan.';
    $('#gen-quota').textContent = 'Setelah dipasang di server, batas bawaan: 10 gambar per jam per pengunjung.';
    for (const id of ['#gen-image', '#tab-image', '#pick']) $(id).disabled = true;
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

// ---- Generate image ----
async function generateImage() {
  if (state.busy) return;
  show($('#img-error'), false);
  const prompt = (state.mode === 'text' ? $('#prompt') : $('#prompt2')).value.trim();
  if (state.mode === 'text' && prompt.length < 3) return showError('#img-error', 'Tuliskan deskripsi gambar dulu (minimal 3 karakter).');
  if (state.mode === 'image' && !state.sourceId) return showError('#img-error', 'Unggah foto sumber dulu.');
  setBusy(['#gen-image', '#regen'], true); $('#img-status').textContent = 'Membuat gambar… biasanya 10–60 detik.';
  try {
    const r = await api('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: state.mode, prompt, style: $('#style').value, aspect: $('#aspect').value, sourceId: state.sourceId }) });
    state.image = r; $('#img-out').src = r.url; $('#img-out').alt = `Hasil gambar: ${prompt || 'dari foto'}`.slice(0, 120);
    $('#dl-image').href = dlHref(r, `nusara-image-${stamp()}`);
    show($('#img-result'), true); $('#img-status').textContent = '';
    $('#img-out').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (e) { showError('#img-error', e.message); $('#img-status').textContent = ''; }
  setBusy(['#gen-image', '#regen'], false);
}
$('#gen-image').addEventListener('click', generateImage);
$('#regen').addEventListener('click', generateImage);
document.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', generateImage));

loadStatus();
