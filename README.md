# AI Chatbot Arise

Proyek Chatbot AI interaktif yang dibangun menggunakan **Next.js**, **Vercel AI SDK**, **Groq (LLaMA 3)**, dan **Prisma (SQLite)**. Aplikasi ini memungkinkan pengguna untuk bercakap-cakap dengan asisten virtual yang cerdas serta menyimpan riwayat percakapan secara otomatis.

## Fitur Utama
- ⚡ **Streaming Responses**: Menggunakan Vercel AI SDK dan kapabilitas Groq untuk memberikan respons AI yang mengalir dan super cepat secara *real-time*.
- 📝 **Markdown Support**: Pesan AI dirender dengan rapi baik format teks tebal, tabel, hingga blok kode.
- 🗄️ **Riwayat Obrolan**: Sistem obrolan berkelanjutan dengan sidebar riwayat berbasis sesi (chat room).
- 🎨 **Modern UI**: Antarmuka modern yang dikembangkan dengan **Tailwind CSS**.

## Prasyarat
Sebelum menjalankan proyek ini secara lokal, pastikan Anda telah memiliki hal-hal di bawah ini:
- **Node.js** (Minimal versi 18.x)
- Akun dan **API Key Groq** (Dapatkan di [Groq Cloud](https://console.groq.com/keys))

## Panduan Instalasi & Menjalankan Secara Lokal

1. **Clone repository ini** (jika belum):
   ```bash
   git clone <URL_REPO_ANDA>
   cd ai-chatbot-arise
   ```

2. **Instal dependensi bawaan proyek:**
   ```bash
   npm install
   ```

3. **Siapkan Environment Variables (.env.local):**
   Buat file bernama `.env.local` di *root* (folder terluar) proyek, lalu salin dan isi dengan key Anda:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. **Siapkan atau Reset Database Lokal (Prisma):**
   Konfigurasi database berjalan di SQLite secara bawaan. Anda bisa menjalankan perintah ini untuk memastikan tabel terbuat sempurna:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Jalankan Aplikasi Mode Pengembangan (Localhost):**
   ```bash
   npm run dev
   ```

6. **Buka di Browser:**
   Kunjungi [http://localhost:3000](http://localhost:3000) dan mulailah mengobrol!

---

## 🚀 (Penting) Rencana Deployment ke Vercel
Saat ini aplikasi masih menggunakan **SQLite** (`dev.db`). Jika ingin di-*deploy* ke platfom Vercel agar bisa online selamanya, penggunaan SQLite **tidak disarankan** karena keterbatasan filesystem *serverless*.
Anda perlu mengalihkan file `schema.prisma` ini agar terhubung dengan [Supabase PostgreSQL](https://supabase.com) atau provider database serupa, dan mengubah variabel `DATABASE_URL`.
