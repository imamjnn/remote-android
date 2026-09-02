# remote-android

Sistem tracking lokasi anak: backend Bun (SQLite + WebSocket realtime) + dashboard web untuk orang tua + app Android native untuk anak.

Single-parent: hanya ada satu akun orang tua per deployment (dibuat otomatis saat server pertama kali jalan, tidak ada halaman registrasi). Device Android auto-register ke akun itu begitu app dibuka pertama kali -- tidak ada input URL server atau kode pairing di app.

## Backend + dashboard

```bash
bun install
PARENT_EMAIL=you@example.com PARENT_PASSWORD=your-password bun run dev   # http://localhost:3000
```

Kalau `PARENT_EMAIL`/`PARENT_PASSWORD` tidak diset, server memakai default `admin@example.com` / `changeme123` (hanya untuk dev lokal -- jangan dipakai di deployment yang bisa diakses orang lain). Akun ini hanya dibuat sekali; setelah ada baris di tabel `parents`, env var itu diabaikan.

Endpoint utama: `/api/auth/*` (login/logout/me, tanpa register), `/api/devices/*` (termasuk `/api/devices/register` yang dipanggil app Android), `/ws/parent`, `/ws/device`. Lihat `server/` untuk detail.

Test backend:

```bash
bun test
```

Simulasi device anak tanpa Android (validasi pipeline WebSocket + peta):

```bash
bun run fake-device -- <deviceId> <deviceToken>
```

`deviceId`/`deviceToken` didapat dari `POST /api/devices/register` (endpoint yang sama yang dipanggil app Android saat pertama dibuka).

## Android app (child device)

Project Gradle terpisah di `android/`. minSdk 26, Kotlin + Jetpack Compose.

Alamat server di-hardcode saat build (bukan diisi manual di app). Default-nya `http://10.0.2.2:3000` (alias emulator ke localhost host). Untuk device fisik atau server lain, override dengan salah satu:

```bash
cd android
./gradlew -PserverUrl=http://192.168.1.10:3000 :app:assembleDebug
```

atau set `serverUrl=http://192.168.1.10:3000` di `android/local.properties` (gitignored) supaya tidak perlu diketik ulang tiap build.

Saat app dibuka pertama kali, ia langsung memanggil `/api/devices/register` sendiri dan muncul di dashboard tanpa aksi apa pun dari orang tua.
