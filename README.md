# AI Chatbot Arise

Proyek Chatbot AI interaktif yang dibangun menggunakan **Next.js**, **Vercel AI SDK**, **Groq (LLaMA 3)**, dan **Supabase PostgreSQL + pgvector**. Aplikasi ini memungkinkan pengguna bercakap-cakap dengan asisten virtual cerdas, menyimpan riwayat percakapan, dan menjawab pertanyaan berdasarkan **knowledge base** internal menggunakan teknologi **RAG (Retrieval-Augmented Generation)**.

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router) |
| LLM | Groq — LLaMA 3.3 70B Versatile |
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

---

## ✨ Fitur Utama

- ⚡ **Streaming Responses** — Respons AI mengalir real-time via Vercel AI SDK & Groq
- 🧠 **RAG Knowledge Base** — Bot menjawab dari dokumen yang Anda indeks sendiri
- 🔀 **KB Toggle** — Aktifkan/matikan Knowledge Base langsung dari modal Kostumisasi AI
- 📎 **Citation Cards** — Bot menampilkan sumber referensi chunk yang dipakai untuk menjawab
- 📝 **Markdown Support** — Pesan AI dirender rapi (teks tebal, tabel, blok kode dengan syntax highlight)
- 🗄️ **Riwayat Obrolan** — Sidebar riwayat chat berbasis sesi per pengguna, dengan search dan rename
- 🔐 **Autentikasi Lengkap** — Login, Register, **Lupa Password**, dan **Reset Password** via Supabase Auth
- 🗂️ **Document Groups** — Chunk dikelompokkan per grup; rename inline, tambah chunk baru ke grup, hapus grup sekaligus
- ⚡ **Parallel Embedding** — Proses embedding dilakukan 5 concurrent; ingestion 3–5× lebih cepat
- 🤖 **AI Title Generator** — Judul chat di-generate otomatis oleh AI saat percakapan baru dimulai
- 📤 **Export Chat** — Ekspor riwayat percakapan ke file `.txt`
- 📊 **Dashboard Statistik** — Lihat total chat, pesan, dan aktivitas 7 hari terakhir
- 🛡️ **Role System** — Admin dapat upload dokumen global (amber 🟡) vs pribadi (biru 🔵), dengan warna ikon berbeda
- 🔑 **OTP Admin Promotion** — Promosi ke role Admin via kode OTP 6-digit yang dikirim ke email admin
- ⏱️ **Rate Limiting** — Pembatasan 20 request/menit per user untuk mencegah penyalahgunaan
- 📱 **Mobile Responsive** — Modal Kostumisasi AI, halaman auth, dan dashboard dioptimalkan untuk layar kecil

---

## ⏱️ Rate Limiting

API chat dilindungi oleh **in-memory rate limiter**:

| Parameter | Nilai |
|---|---|
| Maksimum request | 20 per menit |
| Per | User ID (Supabase) |
| Window | 60 detik (sliding) |
| Response saat limit | HTTP `429` + pesan waktu reset dalam detik |

> **Catatan**: Rate limiter ini berbasis in-memory dan akan reset saat server restart. Untuk deployment multi-instance (misalnya Vercel dengan banyak serverless function), gunakan **Upstash Redis** sebagai pengganti.

---

## 🔐 Sistem Autentikasi & Role

### Role User
- **User (default)** — Dapat chat, upload dokumen pribadi, kelola knowledge base milik sendiri
- **Admin** — Semua akses User + upload dokumen global (berlaku untuk semua user) + lihat statistik seluruh sistem

### Promosi ke Admin (OTP Flow)
1. User klik **Role: User** di sidebar → klik **Kirim Permintaan ke Admin**
2. Sistem mengirim kode OTP 6-digit ke email admin (`ADMIN_INVITE_EMAIL`) via Resend
3. Admin membagikan kode OTP ke user yang bersangkutan
4. User memasukkan kode OTP → role berubah menjadi Admin
5. OTP berlaku **10 menit** dan hanya bisa digunakan sekali (single-use)

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
- Akun **Resend** (untuk fitur OTP email) → [resend.com](https://resend.com)

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

# ── Admin OTP Email ──
ADMIN_INVITE_EMAIL=email_admin_anda@gmail.com

# ── Resend (pengiriman OTP via email) ──
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

Perintah ini akan membuat tabel `Chat`, `Message`, `User`, `Document`, dan `PromoteToken` di Supabase.

### 5. Jalankan Aplikasi

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

---

## 📤 Mengisi Knowledge Base (Ingestion)

Gunakan UI bawaan — klik tombol **⚙️ Kostumisasi AI** di sidebar:
- **Tab "Upload"**: Upload file `.pdf`, `.txt`, atau `.md`. Tentukan nama grup (baru atau yang sudah ada). Sistem otomatis memotong teks menjadi chunk ~400 token dengan 80-token overlap, lalu mengindeks embedding ke Supabase secara **paralel (5 concurrent)**.
- **Tab "Kelola Chunks"**: Chunk dikelompokkan dalam **Grup Dokumen**. Tersedia fitur expand grup, rename grup, tambah chunk baru ke grup, hapus grup, edit chunk, dan bulk delete. Ikon amber 🟡 = Global, biru 🔵 = Pribadi.

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
2. **Query Window**: 3 pesan user terakhir digabung sebagai query embedding agar konteks tidak hilang
3. **Embedding**: Query diubah menjadi vektor 3072 dimensi oleh Gemini API
4. **Retrieval**: Supabase mencari top-5 chunk dengan jarak cosine `< 0.42`
5. **Inject Context**: Chunk relevan disuntikkan ke System Prompt Groq
6. **Streaming**: Groq menghasilkan jawaban dan di-stream real-time ke UI
7. **Citations**: Frontend menampilkan card **"Sumber Referensi"** di bawah pesan AI
8. **Token Guard**: History dibatasi maksimal 10 pesan ke Groq untuk mencegah token bloat

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
3. Tambahkan semua environment variables di **Settings → Environment Variables**:

| Variable | Environment |
|---|---|
| `GROQ_API_KEY` | Production + Preview |
| `GEMINI_API_KEY` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview |
| `DATABASE_URL` | Production + Preview |
| `DIRECT_URL` | Production + Preview |
| `ADMIN_INVITE_EMAIL` | Production + Preview |
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
