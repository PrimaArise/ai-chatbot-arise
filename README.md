# AI Chatbot Arise

Proyek Chatbot AI interaktif yang dibangun menggunakan **Next.js**, **Vercel AI SDK**, **Groq (LLaMA 3)**, dan **Supabase PostgreSQL + pgvector**. Aplikasi ini memungkinkan pengguna untuk bercakap-cakap dengan asisten virtual yang cerdas, menyimpan riwayat percakapan, dan menjawab pertanyaan berdasarkan **knowledge base** internal menggunakan teknologi **RAG (Retrieval-Augmented Generation)**.

## 🧠 Arsitektur RAG (Retrieval-Augmented Generation)

RAG adalah teknik yang memungkinkan AI menjawab berdasarkan dokumen spesifik yang Anda simpan — bukan semata-mata dari pengetahuan bawaan model. Berikut alur kerjanya:

```
[User bertanya]
      ↓
[Gemini API: Ubah 3 pesan user terakhir → vektor embedding 3072 dimensi]
      ↓
[Supabase pgvector: Cosine Similarity Search (threshold < 0.42) → top-5 chunk]
      ↓
[Inject chunk sebagai "Konteks" ke dalam System Prompt]
      ↓
[Groq LLaMA 3: Hasilkan jawaban berbasis konteks → stream ke UI]
      ↓
[Frontend: Tampilkan citation card "Sumber Referensi" di bawah jawaban AI]
```

Kombinasi teknologi:
- **Gemini `gemini-embedding-2`** — Mengubah teks menjadi vektor numerik 3072 dimensi
- **Supabase pgvector** — Database vektor untuk menyimpan dan mencari embedding secara efisien
- **Groq LLaMA 3.3 70B** — Model LLM untuk menghasilkan jawaban akhir dari konteks yang ditemukan
- **Prisma ORM** — Menjembatani skema database ke TypeScript dengan type-safe
- **Vercel AI SDK** — Menangani streaming response dan data annotations ke frontend

## Fitur Utama

- ⚡ **Streaming Responses**: Respons AI mengalir real-time via Vercel AI SDK & Groq
- 🧠 **RAG Knowledge Base**: Bot bisa menjawab dari dokumen yang Anda indeks sendiri
- 📎 **Citation Cards**: Bot menampilkan sumber referensi chunk mana yang dipakai untuk menjawab
- 📝 **Markdown Support**: Pesan AI dirender dengan rapi (teks tebal, tabel, blok kode)
- 🗄️ **Riwayat Obrolan**: Sidebar riwayat chat berbasis sesi pengguna
- 🔐 **Autentikasi**: Login & Register aman menggunakan Supabase Auth
- 🗂️ **Kelola Knowledge Base**: Upload PDF/TXT/MD, edit chunk, hapus satu atau massal
- 🎨 **Modern UI**: Antarmuka modern dark-mode

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

Gunakan UI bawaan — klik tombol **⚙️ Kostumisasi AI** di sidebar:
- **Tab "Upload Dokumen"**: Upload file `.pdf`, `.txt`, atau `.md`. Sistem otomatis memotong teks menjadi chunk ~400 kata dengan 50-kata overlap dan mengindeks embedding ke Supabase.
- **Tab "Kelola Chunks"**: Lihat, edit, hapus satu atau banyak chunk sekaligus.

Atau via `curl` (mode developer):
```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Arise adalah asisten AI yang dikembangkan untuk membantu mahasiswa..."}'
```

---

## 🔄 Alur Chat dengan RAG

Setiap kali pengguna mengirim pesan:
1. **Query Window**: 3 pesan user terakhir digabung sebagai query embedding (bukan hanya 1 pesan) agar konteks percakapan tidak hilang
2. **Embedding**: Query diubah menjadi vektor 3072 dimensi oleh Gemini API
3. **Retrieval**: Supabase mencari top-5 chunk dengan jarak cosine `< 0.42` (threshold ketat untuk mengurangi noise)
4. **Inject Context**: Chunk relevan disuntikkan ke System Prompt Groq
5. **Streaming**: Groq menghasilkan jawaban dan di-stream real-time ke UI
6. **Citations**: Frontend menampilkan card **"Sumber Referensi"** yang bisa diklik di bawah pesan AI — menampilkan snippet tiap chunk beserta persentase relevansinya
7. **Token Guard**: History percakapan dibatasi maksimal 10 pesan dikirim ke Groq (pesan pertama + 9 terbaru) untuk mencegah token bloat

---

## 🔍 Parameter RAG (dapat dikonfigurasi di `src/app/api/chat/route.ts`)

| Konstanta | Default | Keterangan |
|-----------|---------|------------|
| `MAX_HISTORY_MESSAGES` | `10` | Maks pesan dikirim ke LLM (token bloat guard) |
| `RAG_DISTANCE_THRESHOLD` | `0.42` | Maks cosine distance dianggap relevan (lebih kecil = lebih ketat) |
| `RAG_TOP_K` | `5` | Jumlah chunk terbaik yang diambil |
| `RAG_QUERY_WINDOW` | `3` | Jumlah pesan user terakhir sebagai query embedding |

---

## 🚀 Deployment ke Vercel

1. Push kode ke GitHub
2. Import repository di [vercel.com](https://vercel.com)
3. Tambahkan semua environment variables di Settings → Environment Variables:
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DATABASE_URL`
   - `DIRECT_URL`
4. Deploy!

> **Catatan**: Proyek ini sudah melewati full ESLint + TypeScript check tanpa error. Build Vercel berjalan tanpa flag `ignoreDuringBuilds`.

