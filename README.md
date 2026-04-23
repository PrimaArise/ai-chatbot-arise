# AI Chatbot Arise

Proyek Chatbot AI interaktif yang dibangun menggunakan **Next.js**, **Vercel AI SDK**, **Groq (LLaMA 3)**, dan **Supabase PostgreSQL + pgvector**. Aplikasi ini memungkinkan pengguna untuk bercakap-cakap dengan asisten virtual yang cerdas, menyimpan riwayat percakapan, dan menjawab pertanyaan berdasarkan **knowledge base** internal menggunakan teknologi **RAG (Retrieval-Augmented Generation)**.

## 🧠 Arsitektur RAG (Retrieval-Augmented Generation)

RAG adalah teknik yang memungkinkan AI menjawab berdasarkan dokumen spesifik yang Anda simpan — bukan semata-mata dari pengetahuan bawaan model. Berikut alur kerjanya:

```
[User bertanya]
      ↓
[Gemini API: Ubah pertanyaan → vektor embedding 768 dimensi]
      ↓
[Supabase pgvector: Cosine Similarity Search → top-3 chunk relevan]
      ↓
[Inject chunk sebagai "Konteks" ke dalam System Prompt]
      ↓
[Groq LLaMA 3: Hasilkan jawaban berbasis konteks → stream ke UI]
```

Kombinasi teknologi:
- **Gemini `text-embedding-004`** — Mengubah teks menjadi vektor numerik 768 dimensi
- **Supabase pgvector** — Database vektor untuk menyimpan dan mencari embedding secara efisien
- **Groq LLaMA 3.3 70B** — Model LLM untuk menghasilkan jawaban akhir dari konteks yang ditemukan
- **Prisma ORM** — Menjembatani skema database ke TypeScript dengan type-safe

## Fitur Utama

- ⚡ **Streaming Responses**: Respons AI mengalir real-time via Vercel AI SDK & Groq
- 🧠 **RAG Knowledge Base**: Bot bisa menjawab dari dokumen yang Anda indeks sendiri
- 📝 **Markdown Support**: Pesan AI dirender dengan rapi (teks tebal, tabel, blok kode)
- 🗄️ **Riwayat Obrolan**: Sidebar riwayat chat berbasis sesi pengguna
- 🔐 **Autentikasi**: Login & Register aman menggunakan Supabase Auth
- 🎨 **Modern UI**: Antarmuka modern dengan Tailwind CSS

## Prasyarat

Sebelum menjalankan proyek ini secara lokal, pastikan Anda telah memiliki:
- **Node.js** (Minimal versi 18.x)
- Akun **Groq Cloud** → [console.groq.com/keys](https://console.groq.com/keys)
- Akun **Google AI Studio** untuk Gemini API → [aistudio.google.com](https://aistudio.google.com)
- Akun **Supabase** dengan ekstensi `vector (pgvector)` aktif

## Panduan Instalasi & Menjalankan Secara Lokal

### 1. Clone & Install Dependensi
```bash
git clone <URL_REPO_ANDA>
cd ai-chatbot-arise
npm install
```

### 2. Siapkan Environment Variables

Buat file `.env.local` di *root* proyek dan isi sesuai konfigurasi Anda:
```env
# Groq API (LLM utama)
GROQ_API_KEY=your_groq_api_key_here

# Gemini API (untuk embedding RAG)
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

Buat juga file `.env` untuk Prisma CLI:
```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres"
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Aktifkan pgvector di Supabase

Di dashboard Supabase, buka **Database → Extensions** dan aktifkan ekstensi `vector`.

### 4. Sinkronisasi Skema Database (Prisma)

```bash
npx prisma db push
```

Perintah ini akan membuat tabel `Chat`, `Message`, `User`, dan `Document` (untuk RAG) di Supabase.

### 5. Jalankan Aplikasi

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

---

## 📤 Mengisi Knowledge Base (Ingestion)

Untuk mengindeks dokumen ke knowledge base RAG, gunakan endpoint `POST /api/ingest`.  
Contoh menggunakan `curl`:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Arise adalah asisten AI yang dikembangkan untuk membantu mahasiswa..."}'
```

Atau gunakan Postman/Insomnia untuk mengirimkan teks panjang (artikel, FAQ, materi pelajaran, dll.).  
Sistem akan **otomatis memotong** teks menjadi chunk berukuran ~400 kata dan menyimpan embeddingnya ke Supabase.

---

## 🔄 Alur Chat dengan RAG

Setiap kali pengguna mengirim pesan:
1. Pesan diubah menjadi vektor embedding oleh Gemini API
2. Supabase mencari dokumen dengan jarak cosine terdekat (top-3)
3. Dokumen relevan disuntikkan ke System Prompt Groq
4. Groq menghasilkan jawaban yang berlandaskan knowledge base tersebut
5. Jawaban di-stream real-time ke UI

---

## 🚀 Deployment ke Vercel

1. Push kode ke GitHub
2. Import repository di [vercel.com](https://vercel.com)
3. Tambahkan semua environment variables (termasuk `GEMINI_API_KEY`)
4. Deploy!
