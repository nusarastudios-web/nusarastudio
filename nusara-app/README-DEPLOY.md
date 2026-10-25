# Deploy NUSARA

Situs + backend generator jadi satu aplikasi Node (tanpa dependensi).
Jalankan: `npm start` (port dari env `PORT`, default 3000).

## Render (gratis, dari repo GitHub)

1. Buat Web Service baru dari repo ini.
2. Build command: kosongkan (tidak ada dependensi). Start command: `npm start`.
3. Env vars:
   - `TRUST_PROXY=1`
   - `PUBLIC_BASE_URL=https://<nama-service>.onrender.com` (isi setelah URL jadi)
   - `POLLINATIONS_API_KEY=` (opsional; tanpa key memakai endpoint anonim Pollinations)
   - `FAL_KEY=` (wajib untuk video; tanpa ini tombol video nonaktif dengan pesan jujur)
4. Deploy ulang setelah mengisi `PUBLIC_BASE_URL` agar mode Image-to-Image
   dan video dari foto upload bisa memakai URL publik.

## Batas bawaan (per pengunjung, per IP)

- 10 gambar/jam, 3 video/hari, upload maks 8 MB, hasil tersimpan 60 menit.

## Catatan keamanan

Jangan taruh API key di `site.json` atau file front-end — file itu dikirim
ke browser. Key hanya lewat env var server.
