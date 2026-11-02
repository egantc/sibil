# Sibil — SulNet Billing

Website billing dengan **GitHub Pages + Google Apps Script + Google Sheets**, tanpa Render atau service account. QRIS ditunda. Frontend dan backend Apps Script sudah disiapkan; deployment dan akses spreadsheet asli perlu diatur oleh pemilik akun Google.

## 1. Siapkan Apps Script

1. Backup spreadsheet lama. Buat proyek di https://script.google.com dengan akun yang dapat mengedit spreadsheet.
2. Salin `apps-script/Code.gs` ke `Code.gs` proyek tersebut. Aktifkan tampilan manifest di Project Settings dan salin `apps-script/appsscript.json` ke manifest proyek.
3. Di **Project Settings → Script Properties**, isi `SPREADSHEET_ID`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD` (unik, minimal 12 karakter). Jangan simpan password di repo, halaman website, variable publik GitHub, atau chat.
4. Jalankan `setupSibil` dari editor, lalu berikan izin akses spreadsheet. Fungsi ini membuat empat tab baru bila belum ada, tanpa menimpa tab lama `Pembayaran 2026`.
5. Pilih **Deploy → New deployment → Web app**. Execute as: **Me**; Who has access: **Anyone**, bila diizinkan akun/organisasi Google. Backend memeriksa sesi pada setiap akses data. Akun Workspace yang melarang web app publik perlu perubahan kebijakan atau pendekatan deployment lain.
6. Salin URL deployment berakhiran `/exec`, bukan `/dev`. Setelah mengubah kode, edit deployment dan pilih versi baru untuk menerapkan pembaruan.

## 2. Aktifkan website

1. GitHub repo `egantc/sibil` → **Settings → Pages → Source → GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: buat `SIBIL_API_URL` berisi URL `/exec` Apps Script tadi. URL ini publik, bukan rahasia. Jangan memasukkan password di sini.
3. **Actions → Deploy frontend to GitHub Pages → Run workflow**.
4. Setelah workflow sukses, buka `https://egantc.github.io/sibil/`. Login, tambah pelanggan percobaan, buat tagihan, catat pembayaran sebagian, periksa tab Sheets dan riwayat, cetak kuitansi, lalu logout.

Frontend menggunakan POST `text/plain` tanpa custom header ke Apps Script ContentService agar tidak memerlukan CORS preflight. Token dikirim dalam body, disimpan hanya dalam memori browser, dan tidak masuk URL. Browser harus dapat mengikuti redirect Google dan membaca respons JSON. **Pengujian browser terhadap deployment `/exec` asli tetap diperlukan**; mock lokal tidak membuktikan konfigurasi akses Google/CORS berhasil. Jangan memakai `no-cors` karena respons tidak dapat dibaca. Jangan mempublikasikan spreadsheet sebagai data publik untuk mengatasi kegagalan koneksi.

## Fitur

Login/logout, ID pelanggan unik, pencarian dan edit pelanggan, paket/tarif, status aktif, tagihan unik pelanggan-periode, pembayaran cash/transfer sebagian, validasi kelebihan bayar, filter bulan/tahun, ringkasan, riwayat, kuitansi cetak, dan tombol pesan WhatsApp siap kirim. KPI uang masuk merujuk pembayaran untuk tagihan pada periode terpilih, bukan arus kas berdasarkan tanggal transaksi.

## Data dan batas layanan

| Tab | Header baris 1 (urut dari A) |
| --- | --- |
| Sibil_Pelanggan | id, name, phone, plan, rate, active |
| Sibil_Tagihan | id, customerId, period, amount, dueDate |
| Sibil_Pembayaran | id, invoiceId, amount, method, paidAt, createdAt |
| Sibil_Riwayat | id, actor, at, action, before, after |

Tab lama tidak diimpor otomatis: tarif, nomor WhatsApp, paket, tanggal bayar dan jatuh tempo perlu pemetaan yang benar sebelum migrasi. Nilai TRUE lama adalah status lunas cash, bukan nominal uang.

Apps Script menggunakan ScriptLock untuk operasi aplikasi. Sheets bukan database transaksional: error antar penulisan tab dapat menghasilkan penulisan sebagian. Periksa data sebelum mengulang pembayaran setelah error. Jangan mengedit tab Sibil bersamaan dari aplikasi lain. Riwayat dapat diedit pemilik spreadsheet dan bukan audit antimanipulasi. Fitur reversal/reset pembayaran belum disediakan.

Sesi memakai CacheService maksimal 6 jam, dapat hilang lebih awal dan meminta login ulang. Refresh frontend juga meminta login ulang. Batas login global 20 kegagalan per 15 menit karena Apps Script tidak menyediakan IP klien tepercaya; cache dapat dievikt sehingga bukan perlindungan brute-force yang persisten. Cocok untuk admin skala kecil, bukan layanan publik berskala besar. Kuota eksekusi, concurrency dan penyimpanan Google tetap berlaku. Umumnya akun Google biasa tidak membutuhkan kartu untuk Apps Script/Sheets dalam kuotanya; kebijakan layanan dapat berubah.

## Pengembangan dan pengujian

Node.js 22+: `npm ci`, `npm run check`, `npm test`. Pengujian mencakup API Node lokal, backend Apps Script dengan layanan Google simulasi, dan format transport frontend. Tidak membuktikan deployment Google asli.

`server.js` tetap tersedia sebagai alternatif lokal/Node, bukan syarat deployment Apps Script. Untuk demo lokal: salin `.env.example` ke `.env`, isi password admin, gunakan `DATA_MODE=demo`, lalu `npm start`. Demo menggunakan `.data/demo.json`, bukan spreadsheet asli. Konfigurasi Render tidak lagi menjadi jalur deployment utama.
