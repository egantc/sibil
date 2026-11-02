# Sibil — SulNet Billing

Website admin billing dengan backend Node.js dan Google Sheets. QRIS belum diimplementasikan. Repository ini menyimpan frontend dan backend; menjalankannya memerlukan hosting Node, bukan GitHub Pages saja.

## Jalankan lokal

Node.js 22+:

```sh
npm ci
cp .env.example .env
# Edit .env: isi ADMIN_PASSWORD dengan password unik minimal 12 karakter.
npm start
```

Buka port 3000 di mesin sendiri. `DATA_MODE=demo` menggunakan `.data/demo.json`, bukan spreadsheet asli. Tidak ada password bawaan. `npm run dev` mengaktifkan restart otomatis; `npm test` menjalankan pengujian API end-to-end dengan data sementara; `npm run check` memeriksa sintaks.

## Google Sheets asli

1. Aktifkan Google Sheets API pada proyek Google Cloud dan siapkan service account. Simpan credential JSON di luar repo, arahkan `GOOGLE_APPLICATION_CREDENTIALS` ke path-nya, atau gunakan Application Default Credentials pada hosting yang mendukungnya.
2. Bagikan spreadsheet ke alamat service account dengan izin Editor.
3. Buat empat tab berikut, dengan header persis pada baris 1. Jangan rename atau menimpa tab lama `Pembayaran 2026`.

| Tab | Header (urut dari kolom A) |
| --- | --- |
| Sibil_Pelanggan | id, name, phone, plan, rate, active |
| Sibil_Tagihan | id, customerId, period, amount, dueDate |
| Sibil_Pembayaran | id, invoiceId, amount, method, paidAt, createdAt |
| Sibil_Riwayat | id, actor, at, action, before, after |

4. Isi `SPREADSHEET_ID`, set `DATA_MODE=sheets`, restart server. Uji login, tambah pelanggan percobaan, buat tagihan, bayar sebagian, lalu periksa tab pembayaran dan riwayat. Hapus data percobaan hanya setelah backup dan saat server berhenti.

Credential Google tidak dikirim ke browser. Tidak ada ketergantungan pada Apps Script atau `google.script.run` lagi. Model baru mendukung filter periode lintas tahun, pelanggan aktif/nonaktif, invoice unik pelanggan-periode, pembayaran cash/transfer sebagian, kuitansi cetak, tombol WhatsApp yang membuka pesan siap kirim, dan audit perubahan aplikasi. KPI uang masuk menghitung pembayaran untuk invoice pada periode terpilih, bukan arus kas menurut tanggal transaksi.

## Migrasi data lama

Backend hanya menyentuh empat tab `Sibil_*`; tab lama tetap dipertahankan. Import otomatis data lama belum disediakan: sheet lama tidak memuat tarif, nomor telepon, paket, tanggal pembayaran, dan jatuh tempo yang dibutuhkan model baru. Jangan mengarang data ini. Backup spreadsheet dan tentukan pemetaan tarif/identitas sebelum import. Nilai TRUE lama berarti lunas cash, TRANSFER berarti lunas transfer, bukan nominal uang. Jangan menjalankan dua aplikasi yang menulis model data berbeda sebagai sumber kebenaran bersamaan.

## Batas operasional

- Jalankan **satu proses/instance** backend. Antrean dalam proses mencegah pembaruan bertabrakan dari aplikasi ini. Sheets tidak menyediakan transaksi database; jangan edit tab Sibil secara bersamaan dari luar aplikasi. Audit di Sheets bukan log antimanipulasi.
- Sesi dan pembatasan login disimpan dalam memori; restart memutus sesi. Untuk multi-instance perlu database, session store, rate limiter bersama, serta penyimpanan transaksi yang mendukung atomicity.
- Gunakan HTTPS sebelum produksi dan `NODE_ENV=production` untuk cookie Secure. Bila reverse proxy mengakhiri TLS, konfigurasi proxy tepercaya dan pemeriksaan origin perlu disesuaikan dengan hosting terpilih sebelum deploy.
- Tidak ada hapus/reset pembayaran lewat UI untuk menjaga jejak pencatatan. Koreksi transaksi/reversal, backup otomatis, serta integrasi QRIS adalah pekerjaan lanjutan.
- Uji lokal demo tidak membuktikan akses Google Sheets produksi. Tidak ada deploy otomatis atau konfigurasi hosting yang dipilih.

## GitHub Pages + backend terpisah

Frontend dapat dipublikasikan di `https://egantc.github.io/sibil/` menggunakan workflow `.github/workflows/pages.yml`. Workflow hanya mengunggah folder `public`; backend, kredensial Google, file data lokal, dan `.env` tidak ikut diterbitkan.

1. Di repository GitHub: **Settings → Pages → Source → GitHub Actions**.
2. Jalankan backend di hosting Node.js 22+ dengan `npm ci` dan `npm start`, satu instance. Gunakan environment variables di pengaturan hosting, bukan file rahasia dalam repo. Isi konfigurasi Google Sheets dan password admin sesuai instruksi sebelumnya. Set `FRONTEND_ORIGIN=https://egantc.github.io` dan `NODE_ENV=production`. Frontend dan backend harus memakai HTTPS.
3. Bila provider memakai satu reverse proxy tepercaya, set `TRUST_PROXY_HOPS=1` hanya setelah memastikan topologi hosting. Jangan mengaktifkannya pada server yang langsung terbuka ke internet.
4. Di **Settings → Secrets and variables → Actions → Variables**, buat variable publik `SIBIL_API_URL` berisi origin backend, misalnya `https://billing-api.example.com`, tanpa path atau trailing slash. Ini bukan password.
5. Jalankan ulang workflow Deploy frontend to GitHub Pages di tab Actions. URL aplikasi hanya dinyatakan aktif setelah workflow berhasil dan halaman dapat dibuka.

Tanpa URL backend, frontend menampilkan pesan konfigurasi, tidak menganggap data demo sebagai data asli. Frontend memakai bearer token di memori untuk menghindari ketergantungan pada third-party cookies. Refresh halaman meminta login ulang ketika frontend dan backend terpisah. CORS hanya mengizinkan origin yang dikonfigurasi, bukan wildcard; API tetap memerlukan autentikasi. Session berlaku maksimal 8 jam dan dicabut saat logout. Health check `/health` hanya membuktikan proses hidup; uji login dan baca/tulis data diperlukan untuk memverifikasi Google Sheets.

Belum ada hosting backend yang dipilih atau diprovisikan oleh repository ini. Domain contoh bukan endpoint aktif. Jangan mengunggah credential service account atau password ke variable publik Pages. GitHub Pages tidak menjalankan server Node.
