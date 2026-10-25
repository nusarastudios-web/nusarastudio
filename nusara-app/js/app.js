// Render konten dari /config/site.json. Edit file itu untuk memperbarui situs.
const $ = (s, r = document) => r.querySelector(s);
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const ext = (label, url, cls = 'btn btn-outline') => url
  ? h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer' }, label)
  : h('span', { class: 'btn is-off', 'aria-disabled': 'true', title: 'Link resmi belum diisi' }, `${label} (segera)`);

let cfg;
const waLink = (topic) => {
  const base = cfg.contact.defaultMessage;
  const text = topic ? `${base}\n\nKebutuhan: ${topic}` : base;
  return `https://wa.me/${cfg.contact.whatsappNumber}?text=${encodeURIComponent(text)}`;
};

function lightbox(src, alt) {
  const d = $('#lightbox');
  $('#lb-img').src = src; $('#lb-img').alt = alt; $('#lb-cap').textContent = alt;
  d.showModal();
}
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') e.target.close(); });

function zoomBtn(item, cls, label) {
  const b = h('button', { class: cls, type: 'button', 'aria-label': label });
  b.append(h('img', { src: item.thumb, alt: item.alt, loading: 'lazy', width: 640, height: 450 }));
  b.addEventListener('click', () => lightbox(item.image, item.alt));
  return b;
}

function render() {
  const { brand, founder, studio, digital, certifications, achievement, social, products, marketplace, contact } = cfg;
  if (brand.logoImage) document.querySelectorAll('[data-logo]').forEach((el) => el.replaceChildren(h('img', { src: brand.logoImage, alt: brand.name })));
  $('#year').textContent = new Date().getFullYear();

  // Founder
  $('#about-root').append(h('div', { class: 'founder', style: null },
    h('figure', { class: 'founder-photo' }, h('img', { src: founder.photo, alt: `Foto ${founder.name}`, width: 640, height: 640, loading: 'lazy' })),
    h('div', {}, h('h3', {}, founder.name), h('p', { class: 'role' }, founder.role), founder.bio.map((p) => h('p', {}, p)),
      h('div', { class: 'row' }, h('a', { class: 'btn btn-primary', href: '#portfolio' }, 'Explore My Work')))));

  // Services (Studio + Digital)
  const biz = (b, ctas, show) => h('article', {},
    h('h2', {}, b.title), h('p', { class: 'tagline' }, b.tagline), b.description.map((p) => h('p', {}, p)),
    h('ul', { class: 'chips' }, b.services.map((s) => h('li', {}, s))),
    show ? h('figure', { class: 'showcase' }, ...show.map((s) => s.type === 'video'
      ? [h('video', { controls: true, preload: 'none', poster: s.poster, playsinline: true }, h('source', { src: s.src, type: 'video/mp4' })), h('figcaption', {}, s.caption)]
      : [h('img', { src: s.src, alt: s.caption, loading: 'lazy' }), h('figcaption', {}, s.caption)]).flat()) : null,
    h('div', { class: 'row' }, ctas));
  const sr = $('#services-root');
  sr.append(h('div', { class: 'biz' },
    biz(studio, [h('a', { class: 'btn btn-primary', href: '#portfolio' }, 'Lihat Portofolio Studio'), h('a', { class: 'btn btn-outline', href: waLink('Produksi Video AI'), target: '_blank', rel: 'noopener noreferrer' }, 'Konsultasi Proyek')], studio.showcase),
    biz(digital, [h('a', { class: 'btn btn-primary', href: '#products' }, 'Jelajahi Produk Digital'), h('a', { class: 'btn btn-outline', href: waLink('AI Agent Setup'), target: '_blank', rel: 'noopener noreferrer' }, 'Konsultasi AI')])));

  // Certifications
  const cr = $('#cert-root');
  cr.append(h('p', { class: 'sub' }, 'Pembelajaran dan sertifikasi yang mendukung pemahaman dasar tentang penerapan AI, produktivitas bisnis, keamanan siber, dan penyusunan prompt.'));
  cr.append(h('div', { class: 'cert-grid' }, certifications.map((c) => {
    const card = h('article', { class: 'cert' }, zoomBtn(c, 'cert-thumb', `Perbesar sertifikat ${c.name}`),
      h('div', { class: 'cert-body' }, h('h3', {}, c.name), h('p', { class: 'issuer' }, c.issuer), h('small', {}, c.issuerNote), h('small', {}, `Tanggal: ${c.date}`),
        h('small', {}, 'Nomor sertifikat:'), h('code', { class: 'serial' }, c.serial)));
    const v = h('button', { class: 'btn btn-outline', type: 'button' }, 'View Certificate');
    v.addEventListener('click', () => lightbox(c.image, c.alt));
    card.querySelector('.cert-body').append(v);
    return card;
  })));

  // Achievement
  const a = achievement;
  $('#ach-root').append(h('div', { class: 'ach' },
    h('div', {}, h('span', { class: 'ach-label' }, a.label), h('h3', {}, a.title), h('p', { style: null }, a.description),
      h('dl', {}, h('dt', {}, 'Kategori'), h('dd', {}, a.category), h('dt', {}, 'Tema'), h('dd', {}, a.theme))),
    h('div', { class: 'ach-imgs' }, a.images.map((i) => zoomBtn(i, '', `Perbesar: ${i.alt}`)))));

  // Portfolio
  const link = (o) => ext(o.label, o.url);
  $('#port-root').append(h('div', { class: 'port' },
    h('article', {}, h('h3', {}, 'Creator Portfolio — Sobat Jejak Alam'), h('p', {}, 'Portofolio konten digital dan eksplorasi storytelling visual.'), h('div', { class: 'row' }, link(social.creator.instagram), link(social.creator.tiktok))),
    h('article', {}, h('h3', {}, 'Business Portfolio — NUSARA'), h('p', {}, 'Ruang untuk melihat karya, layanan, dan perkembangan produk digital NUSARA.'),
      h('div', { class: 'row' }, ext(social.business.instagram.label, social.business.instagram.url, 'btn btn-ghost-light'), ext(social.business.tiktok.label, social.business.tiktok.url, 'btn btn-ghost-light')))));

  // Products
  const pr = $('#prod-root');
  pr.append(h('p', { class: 'sub' }, 'Tools dan layanan digital berbasis AI untuk mendukung produktivitas dan kebutuhan bisnis.'));
  pr.append(h('div', { class: 'prod-grid' }, products.map((p) => {
    const thumb = h('div', { class: 'prod-thumb' }, p.thumbnail ? h('img', { src: p.thumbnail, alt: `Thumbnail ${p.name}`, loading: 'lazy' }) : h('div', { class: 'ph', 'aria-hidden': 'true' }, p.name));
    const url = p.url || (p.whatsappTopic ? waLink(p.whatsappTopic) : null);
    return h('article', { class: 'prod' }, thumb, h('div', { class: 'prod-body' }, h('p', { class: 'cat' }, p.category), h('h3', {}, p.name), h('p', {}, p.description), ext(p.cta, url, 'btn btn-primary')));
  })));
  pr.append(h('div', { class: 'market' }, h('strong', {}, 'Pesan lewat marketplace:'), marketplace.map((m) => ext(m.label, m.url))));

  // Contact
  const cc = $('#contact-root');
  cc.append(h('p', { class: 'sub' }, 'Terbuka untuk kerja sama, konsultasi AI, pengembangan tools digital, produksi video berbasis AI, dan implementasi workflow AI agents untuk UMKM maupun perusahaan.'));
  const fs = h('fieldset', { class: 'topics' }, h('legend', {}, 'Kebutuhan konsultasi'),
    contact.topics.map((t, i) => h('label', { class: 'topic' }, h('input', { type: 'radio', name: 'topic', value: t.label, checked: i === 0 }), h('span', {}, t.label))));
  const wa = h('a', { class: 'btn btn-primary btn-lg', href: waLink(contact.topics[0].label), target: '_blank', rel: 'noopener noreferrer' }, 'Hubungi Admin NUSARA via WhatsApp');
  const prev = h('p', { class: 'wa-preview' });
  const upd = () => { const t = fs.querySelector('input:checked')?.value; wa.href = waLink(t); prev.textContent = `Pesan otomatis: “${contact.defaultMessage}” + Kebutuhan: ${t}`; };
  fs.addEventListener('change', upd); upd();
  cc.append(h('div', { class: 'contact' }, fs, h('div', {}, wa, prev, h('p', { class: 'wa-preview' }, `WhatsApp admin: ${contact.whatsappDisplay}`))));

  // Footer
  $('#foot-links').append(
    ...[['Instagram', social.creator.instagram.url], ['TikTok', social.creator.tiktok.url]].map(([l, u]) => u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, `${l} @sobatjejakalam`) : null),
    h('a', { href: waLink(), target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp'));
}

// Bumper video
const v = $('#bumper'), pb = $('#bumper-play');
pb.addEventListener('click', () => { if (v.paused) { v.play(); pb.textContent = '❚❚'; pb.setAttribute('aria-label', 'Jeda video'); } else { v.pause(); pb.textContent = '▶'; pb.setAttribute('aria-label', 'Putar video bumper'); } });

// Menu mobile
const burger = $('#burger'), nav = $('#nav');
burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); burger.setAttribute('aria-label', o ? 'Tutup menu' : 'Buka menu'); });
nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); burger.focus(); } });

try {
  cfg = await (await fetch('site.json', { cache: 'no-cache' })).json();
  render();
} catch (e) { console.error(e); document.querySelector('main').append(h('p', { class: 'wrap notice warn' }, 'Konten gagal dimuat. Muat ulang halaman.')); }
