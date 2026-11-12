# Instagram Post & Details Scraper

Scraper Instagram berbasis Playwright dan Apify untuk mengekstrak postingan (`/p/...`) dan reel (`/reel/...`) lengkap dengan **Like, Comment, View/Play, Caption, Author Username, Tipe Postingan, dan Waktu Upload** berdasarkan **Hashtag** dan **Keyword Pencarian**.

## Fitur Utama

- 🔍 **Scrape by Hashtag**: Kumpulkan link dan detail postingan dari halaman explore hashtag (misal: `#jember`).
- 🔎 **Scrape by Keyword**: Kumpulkan postingan dari explore search keyword (misal: `wisata jember`).
- 📊 **Detail Postingan Lengkap**:
  - `url`: Link langsung postingan/reel
  - `ownerUsername`: Username pembuat postingan
  - `caption`: Teks caption lengkap
  - `likesCount`: Jumlah like
  - `commentsCount`: Jumlah komentar
  - `videoViewCount`: Jumlah tayangan / views (jika video/reel)
  - `type`: Tipe konten (`Video` atau `Image`)
  - `timestamp`: Waktu unggah postingan (ISO 8601)
- 🔁 **Multi-Cycle Runs (`repeatCount`)**: Jalankan otomatis hingga puluhan siklus (misal 65 kali run) dalam satu kali eksekusi dengan jeda aman antar siklus.
- 🛡️ **Anti-Deduplikasi**: Riwayat postingan tersimpan di *Named Key-Value Store* (`instagram-scraped-history`) sehingga postingan yang sama tidak akan di-scrape ulang.
- 🛑 **Deteksi CAPTCHA & Checkpoint Aman**: Mendeteksi secara dini verifikasi CAPTCHA atau checkpoint Instagram dan melakukan penghentian aman (*graceful stop*) agar akun terhindar dari pemblokiran permanen.
- ⏱️ **Human-like Jitter Delay**: Jeda acak manusiawi antar scroll dan navigasi untuk meminimalkan kecurigaan sistem bot Instagram.
- 🍪 **Bypass Login Wall**: Mendukung autentikasi via `sessionid` atau cookie string lengkap dari browser.

---

## Cara Mendapatkan Cookie `sessionid`

Instagram mewajibkan login untuk melihat hasil pencarian dan explore:

1. Buka browser dan login ke akun [Instagram](https://www.instagram.com).
2. Tekan `F12` (atau klik kanan -> **Inspect**).
3. Buka tab **Application** (Chrome/Edge) atau **Storage** (Firefox).
4. Di panel kiri, klik **Cookies** -> `https://www.instagram.com`.
5. Cari cookie bernama `sessionid`, lalu copy nilainya.
6. Masukkan nilai tersebut ke input `sessionid`.

---

## Input Schema

Contoh input JSON untuk menjalankan 80 siklus:

```json
{
  "sessionid": "masukkan session id
",
  "hashtag": "jember",
  "keyword": "wisata jember",
  "maxPosts": 10,
  "scrollCount": 3,
  "scrapeDetails": true,
  "skipSeenPosts": true,
  "repeatCount": 80,
  "delayBetweenRunsSec": 60
}
```

### Parameter:
| Field | Tipe | Wajib | Deskripsi |
|---|---|---|---|
| `sessionid` | String | Ya* | Nilai cookie `sessionid` Instagram Anda. |
| `cookies` | String | Opsional | Full raw cookie string dari browser (opsional). |
| `hashtag` | String | Opsional* | Hashtag yang ingin di-scrape (dengan atau tanpa tanda `#`). |
| `keyword` | String | Opsional* | Kata kunci explore search yang ingin di-scrape. |
| `maxPosts` | Integer | Opsional | Maksimal postingan per target yang diambil per siklus (default: 10). |
| `scrollCount` | Integer | Opsional | Jumlah perulangan scroll ke bawah (default: 3). |
| `scrapeDetails` | Boolean | Opsional | Ambil detail postingan (like, comment, view, caption) (default: true). |
| `skipSeenPosts` | Boolean | Opsional | Lewati postingan yang sudah pernah di-scrape sebelumnya (default: true). |
| `repeatCount` | Integer | Opsional | Jumlah siklus pengulangan pencarian dalam 1 kali run (misal: 80, default: 80). |
| `delayBetweenRunsSec` | Integer | Opsional | Jeda waktu (detik) antar siklus agar aman dari rate-limit (default: 60). |

*\*Setidaknya salah satu dari `hashtag` atau `keyword` harus diisi.*

---

## Contoh Output Dataset

Setiap baris di dataset menyimpan informasi lengkap per postingan:

```json
{
  "inputUrl": "https://www.instagram.com/explore/search/keyword/?q=prabowo",
  "id": "3918156251791823418",
  "type": "Video",
  "shortCode": "DZgFloKhxI6",
  "caption": "#Prabowo #Indonesia #KataRakyat",
  "hashtags": [
    "Prabowo",
    "Indonesia",
    "KataRakyat"
  ],
  "mentions": [],
  "url": "https://www.instagram.com/p/DZgFloKhxI6/",
  "commentsCount": null,
  "firstComment": null,
  "latestComments": [],
  "dimensionsHeight": null,
  "dimensionsWidth": null,
  "displayUrl": null,
  "images": [],
  "likesCount": null,
  "videoPlayCount": null,
  "fbLikeCount": null,
  "fbPlayCount": null,
  "timestamp": null,
  "childPosts": [],
  "locationName": null,
  "ownerFullName": null,
  "ownerUsername": null,
  "ownerId": null,
  "productType": null,
  "videoDuration": null,
  "paidPartnership": null,
  "taggedUsers": [],
  "isPinned": null,
  "musicInfo": {
    "music_info": null,
    "original_sound_info": null
  },
  "coauthorProducers": [],
  "sharesCount": null,
  "originalHeight": null,
  "originalWidth": null,
  "alt": null,
  "videoViewCount": null,
  "locationId": null,
  "isCommentsDisabled": null
}
```

Semua hasil memakai field yang sama. Saat `scrapeDetails: true`, kegagalan ekstraksi modal dilanjutkan dengan membuka halaman post langsung. Jika detail tetap tidak tersedia, post dilewati tanpa ditandai sebagai sudah diambil. Saat `scrapeDetails: false`, hasil hanya memuat informasi dari URL. Data yang tidak tersedia bernilai `null`; koleksi yang tidak tersedia berupa `[]`. `musicInfo` selalu berisi `music_info` dan `original_sound_info`. ID disimpan sebagai string agar tidak kehilangan presisi. Reel memakai `type: "Video"`.

Field profil lengkap, lokasi, komentar individual, carousel, musik, kolaborator, Facebook, dan status kemitraan belum diekstrak dan memakai nilai kosong tersebut. Jumlah tayangan yang terbaca dipetakan ke `videoViewCount`; `videoPlayCount` tetap `null` jika tidak tersedia secara terpisah. Dimensi berasal dari media yang dimuat browser dan dapat berbeda dari resolusi unggahan asli.

## Tes ekstraksi browser

Jalankan `npm run test:browser` untuk menguji ekstraksi di Chromium lokal menggunakan fixture HTML tanpa akses Instagram. Perintah `apify run` sekarang mengompilasi TypeScript lalu menjalankan `dist/main.js` agar helper transformasi tsx tidak ikut terkirim melalui page.evaluate().


## Keamanan kredensial

Simpan cookie autentikasi hanya di `storage/key_value_stores/default/INPUT.json` atau environment lokal. Storage, file `.env`, cookie, `.npmrc`, dan log diabaikan Git. Jangan menaruh kredensial di source code, README, atau contoh input. `.gitignore` tidak menghapus rahasia yang sudah pernah masuk commit; jika itu terjadi, cabut atau rotasi kredensial tersebut dan bersihkan riwayat secara terpisah.
