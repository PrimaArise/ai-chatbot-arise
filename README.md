# AI Chatbot Arise

Proyek Chatbot AI interaktif yang dibangun menggunakan **Next.js**, **Vercel AI SDK**, **Groq (LLaMA 3)**, dan **Supabase PostgreSQL + pgvector**. Aplikasi ini memungkinkan pengguna bercakap-cakap dengan asisten virtual cerdas, menyimpan riwayat percakapan, dan menjawab pertanyaan berdasarkan **knowledge base** internal menggunakan teknologi **RAG (Retrieval-Augmented Generation)**.

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router) |
| LLM | Groq — LLaMA 3.3 70B Versatile |
| LLM (Ringan) | Groq — LLaMA 3.1 8B Instant (query expansion & title gen) |
| Embedding | Google Gemini `gemini-embedding-2` (3072 dim) |
| Database | Supabase PostgreSQL + pgvector |
| ORM | Prisma |
| Auth | Supabase Auth |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/groq`) |
| Email OTP | Resend |
| UI | Tailwind CSS, Lucide Icons, React Hot Toast |
| Markdown | react-markdown + rehype-highlight |

---

## 🧠 Arsitektur RAG (Retrieval-Augmented Generation)

RAG adalah teknik yang memungkinkan AI menjawab berdasarkan dokumen spesifik yang Anda simpan — bukan semata-mata dari pengetahuan bawaan model. Berikut alur kerjanya (versi terbaru dengan **Two-Pass RAG + Query Expansion**):

```
[User bertanya]
      ↓
[LLaMA 3.1 8B: Expand query → istilah teknis + sinonim (HyDE-lite)]
      ↓
[Gemini API: Ubah expanded query → vektor embedding 3072 dimensi]
      ↓
[Supabase pgvector: Pass 1 — Cosine Similarity (threshold < 0.55) → top-5 chunk]
      ↓ (jika kosong)
[Supabase pgvector: Pass 2 Fallback (threshold < 0.68) → top-5 chunk]
      ↓
[Inject chunk sebagai "Konteks" ke dalam System Prompt]
      ↓
[Groq LLaMA 3.3 70B: Hasilkan jawaban berbasis konteks → stream ke UI]
      ↓
[Frontend: Tampilkan citation card "Sumber Referensi" di bawah jawaban AI]
```

---

## ✨ Fitur Utama

- ⚡ **Streaming Responses** — Respons AI mengalir real-time via Vercel AI SDK & Groq
- 🧠 **RAG Knowledge Base** — Bot menjawab dari dokumen yang Anda indeks sendiri
- 🔍 **Query Expansion (HyDE-lite)** — Query user diperluas oleh LLM kecil (8B) sebelum di-embed, meningkatkan akurasi retrieval untuk bahasa informal/kolokial
- 🎯 **Two-Pass RAG** — Pass 1 strict (0.55) + Pass 2 fallback (0.68) untuk memaksimalkan recall tanpa mengorbankan relevansi
- 🔀 **KB Toggle** — Aktifkan/matikan Knowledge Base langsung dari modal Kostumisasi AI
- 📎 **Citation Cards** — Bot menampilkan sumber referensi chunk yang dipakai untuk menjawab
- 📝 **Markdown Support** — Pesan AI dirender rapi (teks tebal, tabel, blok kode dengan syntax highlight)
- 🗄️ **Riwayat Obrolan** — Sidebar riwayat chat berbasis sesi per pengguna, dengan search dan rename
- 🔐 **Autentikasi Lengkap** — Login, Register, **Lupa Password**, dan **Reset Password** via Supabase Auth
- 🗂️ **Document Groups** — Chunk dikelompokkan per grup; rename inline, tambah chunk baru ke grup, hapus grup sekaligus
- ⚡ **Parallel Embedding** — Proses embedding dilakukan 5 concurrent; ingestion 3–5× lebih cepat
- 🤖 **AI Title Generator** — Judul chat di-generate otomatis oleh AI (LLaMA 3.1 8B) saat percakapan baru dimulai
- 📤 **Export Chat** — Ekspor riwayat percakapan ke file `.txt`
- 📊 **Dashboard Statistik** — Lihat total chat, pesan, dan aktivitas 7 hari terakhir
- 🌡️ **Adaptive Temperature** — Suhu model otomatis menyesuaikan mode: 0.5 (KB aktif/faktual) vs 0.7 (KB nonaktif/natural)
- ⏱️ **Rate Limiting** — Pembatasan 20 pesan/hari per user untuk mencegah penyalahgunaan
- 📱 **Mobile Responsive** — Modal Kostumisasi AI, halaman auth, dan dashboard dioptimalkan untuk layar kecil

---

## ⏱️ Rate Limiting

API chat dilindungi oleh **in-memory rate limiter**:

| Parameter | Nilai |
|---|---|
| Maksimum request | 20 per hari |
| Per | User ID (Supabase) |
| Window | 60 menit (sliding) |
| Response saat limit | HTTP `429` + pesan waktu reset dalam jam |

> **Catatan**: Rate limiter ini berbasis in-memory dan akan reset saat server restart. Untuk deployment multi-instance (misalnya Vercel dengan banyak serverless function), gunakan **Upstash Redis** sebagai pengganti.

---

## 🔐 Sistem Autentikasi

Arise menggunakan arsitektur **egalitarian** — semua user memiliki hak yang sama: upload dokumen, kelola knowledge base pribadi, dan akses seluruh fitur chat.

- **Login / Register** — via Supabase Auth (email + password)
- **Lupa Password** — kirim link reset via email (Supabase Auth + Resend)
- **Reset Password** — halaman `/reset-password` yang memvalidasi token Supabase

---

## 🔀 Fitur Toggle Knowledge Base

Di modal **Kostumisasi AI**, terdapat toggle untuk mengaktifkan/mematikan Knowledge Base:

| Status | Perilaku AI |
|---|---|
| **KB Aktif** (default) | AI menjawab **hanya** berdasarkan dokumen yang diindeks. Pertanyaan di luar dokumen ditolak dengan sopan. |
| **KB Nonaktif** | AI bebas menjawab dari pengetahuan umum tanpa batasan dokumen. Berguna saat belum ada dokumen atau ingin chat bebas. |

---

## Prasyarat

Sebelum menjalankan proyek ini secara lokal, pastikan Anda telah memiliki:
- **Node.js** (Minimal versi 18.x)
- Akun **Groq Cloud** → [console.groq.com/keys](https://console.groq.com/keys)
- Akun **Google AI Studio** untuk Gemini API → [aistudio.google.com](https://aistudio.google.com)
- Akun **Supabase** dengan ekstensi `vector (pgvector)` aktif
- Akun **Resend** (untuk fitur reset password via email) → [resend.com](https://resend.com)

---

## Panduan Instalasi & Menjalankan Secara Lokal

### 1. Clone & Install Dependensi
```bash
git clone <URL_REPO_ANDA>
cd ai-chatbot-arise
npm install
```

### 2. Siapkan Environment Variables

Buat file `.env.local` di *root* proyek:
```env
# ── LLM (Groq) ──
GROQ_API_KEY=your_groq_api_key_here

# ── Embedding (Gemini) ──
GEMINI_API_KEY=your_gemini_api_key_here

# ── Supabase Auth ──
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# ── Resend (pengiriman email reset password) ──
RESEND_API_KEY=re_your_resend_api_key_here
RESEND_FROM_EMAIL=onboarding@resend.dev
```

Buat juga file `.env` untuk Prisma CLI (database connection):
```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres"
```

### 3. Aktifkan pgvector di Supabase

Di dashboard Supabase, buka **Database → Extensions** dan aktifkan ekstensi `vector`.

### 4. Sinkronisasi Skema Database (Prisma)

```bash
npx prisma db push
```

Perintah ini akan membuat tabel `Chat`, `Message`, `User`, dan `Document` di Supabase.

### 5. Jalankan Aplikasi

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

---

## 📤 Mengisi Knowledge Base (Ingestion)

Gunakan UI bawaan — klik tombol **⚙️ Kostumisasi AI** di sidebar:
- **Tab "Upload"**: Upload file `.pdf`, `.txt`, atau `.md`. Tentukan nama grup (baru atau yang sudah ada). Sistem otomatis memotong teks menjadi chunk ~400 token dengan 80-token overlap, lalu mengindeks embedding ke Supabase secara **paralel (5 concurrent)**.
- **Tab "Kelola Chunks"**: Chunk dikelompokkan dalam **Grup Dokumen**. Tersedia fitur expand grup, rename grup, tambah chunk baru ke grup, hapus grup, edit chunk, dan bulk delete.

Atau via `curl` (mode developer):
```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Arise adalah asisten AI yang dikembangkan untuk membantu mahasiswa..."}'
```

---

## 🔄 Alur Chat dengan RAG

Setiap kali pengguna mengirim pesan:
1. **KB Check**: Sistem cek apakah Knowledge Base aktif (toggle) dan apakah dokumen tersedia
2. **Query Window**: 2 pesan user terakhir digabung sebagai query untuk embedding
3. **Query Expansion**: LLaMA 3.1 8B memperluas query ke istilah teknis & sinonim (HyDE-lite)
4. **Embedding**: Expanded query diubah menjadi vektor 3072 dimensi oleh Gemini API
5. **Retrieval Pass 1**: Supabase mencari top-5 chunk dengan cosine distance `< 0.55`
6. **Retrieval Pass 2** *(fallback)*: Jika pass 1 kosong, coba threshold lebih longgar `< 0.68`
7. **Inject Context**: Chunk relevan disuntikkan ke System Prompt Groq
8. **Streaming**: Groq (LLaMA 3.3 70B) menghasilkan jawaban dan di-stream real-time ke UI
9. **Citations**: Frontend menampilkan card **"Sumber Referensi"** di bawah pesan AI
10. **Token Guard**: History dibatasi maksimal 10 pesan ke Groq untuk mencegah token bloat

---

## 🔍 Parameter RAG (dapat dikonfigurasi di `src/app/api/chat/route.ts`)

| Konstanta | Default | Keterangan |
|-----------|---------|------------|
| `MAX_HISTORY_MESSAGES` | `10` | Maks pesan dikirim ke LLM (token bloat guard) |
| `RAG_DISTANCE_THRESHOLD` | `0.55` | Cosine distance maks Pass 1 (lebih kecil = lebih ketat) |
| `RAG_FALLBACK_THRESHOLD` | `0.68` | Cosine distance maks Pass 2 fallback |
| `RAG_TOP_K` | `5` | Jumlah chunk terbaik yang diambil per pass |
| `RAG_QUERY_WINDOW` | `2` | Jumlah pesan user terakhir sebagai query embedding |

---

## 🚀 Deployment ke Vercel

1. Push kode ke GitHub
2. Import repository di [vercel.com](https://vercel.com)
3. Tambahkan semua environment variables di **Settings → Environment Variables**:

| Variable | Environment |
|---|---|
| `GROQ_API_KEY` | Production + Preview |
| `GEMINI_API_KEY` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview |
| `DATABASE_URL` | Production + Preview |
| `DIRECT_URL` | Production + Preview |
| `RESEND_API_KEY` | Production + Preview |
| `RESEND_FROM_EMAIL` | Production + Preview |

4. Deploy!

> **Catatan**: Proyek ini sudah melewati full ESLint + TypeScript check tanpa error. Build Vercel berjalan tanpa flag `ignoreDuringBuilds`.

### Setup Reset Password (Supabase)

Tambahkan URL berikut ke **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:
```
https://natbot.vercel.app/reset-password
```
Tanpa konfigurasi ini, link reset password di email tidak akan bekerja.
