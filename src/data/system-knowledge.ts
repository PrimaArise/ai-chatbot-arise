/**
 * Built-in system knowledge untuk AI Arise.
 * Selalu diinjeksikan ke setiap system prompt — baik KB on maupun off.
 * 
 * Update file ini jika ada perubahan fitur atau deskripsi produk.
 * Sinkronkan juga dengan: d:\chatbot-ai\chatbot-knowledge.txt
 */
export const BUILT_IN_KNOWLEDGE = `
PANDUAN PENGGUNA — AI ARISE CHATBOT
=====================================
Terakhir diperbarui: Juni 2026

## APA ITU AI ARISE?

AI Arise adalah asisten AI berbasis percakapan yang dapat dikostumisasi dengan pengetahuan dokumen Anda sendiri. Setiap akun memiliki knowledge base pribadi yang terisolasi — data Anda tidak bisa diakses oleh user lain.

---

## CARA MULAI

### 1. Daftar Akun
- Buka halaman /register
- Masukkan email dan password (min. 10 karakter, harus mengandung angka dan huruf kapital)
- Klik "Daftar Sekarang"

### 2. Login
- Buka halaman /login
- Masukkan email dan password Anda

### 3. Mulai Chat
- Setelah login, Anda akan diarahkan ke /chat
- Ketik pesan di kolom input bawah dan tekan Enter atau klik tombol kirim

---

## FITUR UTAMA

### Chat dengan AI
- Percakapan natural language dengan AI Arise
- Riwayat chat tersimpan di sidebar kiri
- Bisa buat chat baru kapan saja dengan tombol "+" di sidebar

### Knowledge Base (Dokumen Pribadi)
Anda bisa mengunggah dokumen sendiri agar AI bisa menjawab berdasarkan isi dokumen tersebut.

Cara upload dokumen:
1. Klik tombol "Kostumisasi AI" di sidebar
2. Pilih tab "Upload"
3. Upload file (.txt, .md, .pdf) atau tempel teks langsung di textarea
4. Pilih grup baru atau grup yang sudah ada
5. Klik "Indeks ke Knowledge Base"

Cara aktifkan saat chat:
- Aktifkan toggle "Knowledge Base" di area input chat
- AI akan otomatis mencari dokumen relevan sebelum menjawab
- Jika toggle dimatikan, AI menjawab dari pengetahuan umum model + informasi sistem bawaan ini

Manajemen dokumen:
- Tab "Kelola Chunks" di panel Kostumisasi AI menampilkan semua dokumen Anda
- Dokumen dikelompokkan per "grup" (berdasarkan nama file atau grup manual)
- Fitur tersedia: rename grup, tambah chunk, edit konten chunk, hapus chunk, hapus grup, bulk delete

### Kostumisasi AI
- Klik "Kostumisasi AI" di sidebar untuk membuka panel pengaturan
- Tab "Upload": unggah dokumen ke knowledge base
- Tab "Kelola Chunks": lihat dan edit isi knowledge base per grup

### Rate Limit
- Batas 20 pesan per menit per akun
- Status sisa pesan ditampilkan di area input ("Batas pesan: X tersisa")
- Jika batas tercapai, tunggu hingga window 1 menit reset

### Reset Password
- Buka /forgot-password
- Masukkan email, cek inbox, klik link reset
- Set password baru di halaman /reset-password

---

## PERTANYAAN UMUM

Q: Apakah ada fitur admin?
A: Tidak. Semua akun memiliki hak akses yang sama. Tidak ada role admin atau user biasa.

Q: Apakah dokumen saya bisa dilihat user lain?
A: Tidak. Setiap knowledge base sepenuhnya pribadi dan terisolasi per akun.

Q: Format file apa yang didukung?
A: .txt, .md (Markdown), dan .pdf.

Q: Berapa batas ukuran file?
A: Tidak ada batas ketat, namun file yang sangat besar akan diproses lebih lama.

Q: Apa itu chunk?
A: Saat Anda mengupload dokumen, teks dipotong menjadi potongan kecil (chunk) sekitar 500 kata. Setiap chunk di-embed secara terpisah untuk pencarian yang lebih akurat.

Q: Mengapa AI tidak menjawab berdasarkan dokumen saya?
A: Pastikan toggle "Knowledge Base" aktif saat chat, dan dokumen sudah berhasil diindeks (muncul di tab "Kelola Chunks").

Q: Berapa batas pesan per menit?
A: 20 pesan per menit per akun.

Q: Apa perbedaan KB aktif vs KB nonaktif?
A: KB aktif: AI menjawab berdasarkan dokumen yang Anda upload. KB nonaktif: AI menjawab dari pengetahuan umum model sambil tetap memiliki informasi dasar tentang sistem AI Arise.
`.trim();
