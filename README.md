# Sibil — dashboard pembayaran SulNet

Migrasi dashboard asli ke GitHub Pages. Tampilan gelap, pilihan bulan, total pelanggan, cash, transfer, belum bayar, persentase, grafik tahunan, dan perubahan status mengikuti kode awal. **Tidak membuat database/tagihan baru atau mengimpor data.**

Frontend: https://egantc.github.io/sibil/ . Backend: Apps Script. Spreadsheet tetap tab `Pembayaran 2026`, nama pelanggan kolom B mulai baris 4, header bulan baris 3 mulai kolom C. CASH dan TRUE dihitung sebagai cash, TRANSFER sebagai transfer, lainnya belum bayar. Reset menulis boolean false. Kolom rumus selain nama bulan tidak ditulis. Pelanggan bernama sama dibedakan menurut baris dan nama diperiksa ulang sebelum menyimpan. Jangan mengurutkan spreadsheet dari aplikasi lain saat melakukan pembaruan; ScriptLock hanya mengunci operasi Apps Script ini.

## Perbarui backend Google (wajib)

1. Di proyek Apps Script yang sudah digunakan, ganti seluruh `Code.gs` dengan `apps-script/Code.gs` dari repo ini. Fungsi lama tanpa pemeriksaan sesi jangan disisakan. `Sidebar.html` lama tidak diperlukan backend baru; tampilan disajikan GitHub Pages. Fungsi `doGet` hanya mengembalikan informasi API.
2. Manifest `appsscript.json` gunakan isi `apps-script/appsscript.json`. Tampilkan file manifest dari Setelan proyek, jangan membuat file `.json.gs`.
3. Pertahankan **Script Properties** `SPREADSHEET_ID` (ID saja), `ADMIN_USERNAME`, `ADMIN_PASSWORD` (minimal 6 karakter). Opsional `SHEET_NAME` untuk nama tab berbeda; default `Pembayaran 2026`.
4. Jalankan `setupSibil` dari editor untuk memverifikasi izin dan tab. Versi ini hanya membaca; tidak membuat tab atau mengubah sel. Jika ada tab Sibil_* dari percobaan sebelumnya, biarkan; backend ini tidak menggunakannya.
5. **Deploy/Terapkan → Manage deployments/Kelola deployment → Edit → New version/Versi baru → Deploy**. Execute as **Me**, akses **Anyone** bila diizinkan kebijakan akun Google. Dengan mengedit deployment yang sama, URL `/exec` tetap sama.
6. URL backend sudah di `public/config.js`. Bila membuat deployment baru dengan URL berbeda, perbarui file ini atau variable Actions `SIBIL_API_URL`. Variable tersebut mengalahkan konfigurasi file, jadi hapus variable lama jika masih berisi URL salah.

## GitHub Pages

Settings → Pages → Source → **GitHub Actions**. Workflow menguji kode dan menerbitkan hanya folder `public`. Setelah deployment sukses, buka website dan login memakai Properties. Bila memakai source branch/root, `index.html` mengarahkan ke `public/`.

Tidak perlu Render, Node hosting, service account, atau kartu kredit untuk alur ini. Kuota Google dan GitHub serta kebijakan akun tetap berlaku. Node 22 hanya untuk pemeriksaan developer dan CI, bukan server aplikasi: `npm ci`, `npm run check`, `npm test`.

## Verifikasi setelah deployment

Login → pilih bulan → cocokkan jumlah cash/transfer/belum bayar dengan Sheet. Pada pelanggan percobaan, simpan status, periksa hanya sel bulan tersebut berubah, lalu reset bila perlu. Periksa nama duplikat diproses sesuai baris yang dipilih. Logout harus menutup akses. Pengujian lokal menggunakan mock SpreadsheetApp/CacheService dan tidak membuktikan akses Google asli atau CORS deployment. Koneksi browser memakai POST text/plain, mengikuti redirect ContentService tanpa custom header; jangan gunakan no-cors atau mempublikasikan spreadsheet.

Sesi token hanya di memori browser, maksimal 6 jam dalam CacheService (bisa berakhir lebih awal). Refresh meminta login ulang. Cache membatasi kegagalan login secara global, bukan per IP. Jangan kirim password ke chat atau commit. Saat koneksi gagal setelah simpan, periksa sel sebelum mengulang. Data nama pelanggan ditampilkan dengan textContent. Reset meminta konfirmasi; pesan gagal tidak ditampilkan sebagai sukses.

Kode awal tidak menyediakan nominal tagihan atau tanggal transaksi. Fitur invoice, pembayaran sebagian, QRIS dan pemindahan data ditunda sesuai konsep awal. Riwayat commit menyimpan implementasi terdahulu bila dibutuhkan, tanpa memakainya di versi ini.
