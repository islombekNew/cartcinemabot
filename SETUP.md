# 🎬 Professional Kino Boti — To'liq Qo'llanma

## Imkoniyatlar

- 🔍 Kino qidirish (nom yoki kod orqali)
- 🔥 Top kinolar (ko'rishlar bo'yicha)
- 🆕 Yangi qo'shilganlar
- 🎭 Janrlar bo'yicha
- 💎 Premium tizim (480p/720p bepul, 1080p/4K pullik)
- 📢 Majburiy obuna (admin paneldan boshqariladi)
- 🌐 3 til (o'zbek / rus / ingliz)
- 🛠 To'liq admin panel
- 📦 Baza kanaldan forward (katta kinolar ham ishlaydi, sifat saqlanadi)

---

## 1. O'rnatish

```bash
npm install
npm start
```

Konsolda `✅ KINO BOT ishga tushdi!` chiqsa — tayyor.

## 2. ⚠️ Xavfsizlik (MUHIM!)

Token chatда yuborilgani uchun uni almashtiring:
1. @BotFather → `/mybots` → botni tanlang → **API Token → Revoke**
2. Yangi tokenni `.env` ga yozing
3. `.env` ni hech qachon GitHub'ga yuklamang (`.gitignore` da)
4. Agar PostgreSQL ishlatadigan bo‘lsangiz, `.env` ga `DATABASE_URL` qo‘shing

---

## 3. Birinchi sozlash (ketma-ketlik MUHIM!)

### A) Baza kanal yaratish
Kinolar saqlanadigan **maxfiy kanal** yarating (private bo'lsin):
1. Yangi kanal oching (masalan "Kino Baza")
2. Botingizni shu kanalga **admin** qiling
3. Kanalga bir nechta kino yuklang (har biri alohida post)

### B) Botga baza kanalni tanishtirish
1. Botda `/admin` → 🗂 **Baza kanal**
2. Baza kanaldan istalgan postni **botga forward qiling** → bot ID ni avtomatik oladi
   (yoki kanal ID sini qo'lda yozing: `-1001234567890`)

### C) Majburiy obuna kanallari
1. `/admin` → 📢 **Majburiy kanallar** → ➕ Kanal qo'shish
2. `@kanal_username | Kanal nomi` formatида yuboring
3. ⚠️ Botni har bir kanalga **admin** qiling (busiz a'zolik tekshirilmaydi!)

### D) Sozlamalar
`/admin` → ⚙️ Sozlamalar: karta raqami, premium narxi, premium kunlari, admin kontakt.

---

## 4. Kino qo'shish

`/admin` → 🎬 **Kino qo'shish**, keyin bot so'raydi:
1. **Nom** → masalan "Avatar"
2. **Yil** → 2009
3. **Janr** → tugmalardan tanlanadi
4. **Tavsif** → qisqa annotatsiya
5. **Reyting** → 7.9 (yoki "-")
6. **Kod** → 101 (qidiruvda ishlatiladi, yoki "-")
7. **Sifatlar** (480p, 720p, 1080p, 4K) — har biri uchun:
   - Baza kanaldan kinoni **FORWARD qiling**, YOKI
   - Baza kanaldagi post message ID raqamini yozing, YOKI
   - Bu sifat yo'q bo'lsa **"-"** yozing

> 💡 1080p va 4K avtomatik **Premium** deb belgilanadi. 480p/720p bepul.

---

## 5. Premium qanday ishlaydi

1. User 1080p/4K tugmasini bosadi → "Premium kerak" chiqadi
2. 💎 Premium → karta ko'rsatiladi → user to'laydi → "✅ To'lov qildim"
3. User skrinshot yuboradi → adminga keladi
4. Admin ✅ Tasdiqlash → userga avtomatik Premium beriladi (sozlangan kun)

---

## 6. Premium emoji (forward usuli)

Bot o'zi premium emoji qo'ya olmaydi (Telegram cheklovi), lekin:
- `/admin` → ⚙️ Sozlamalar → 👋 **Xush kelibsiz xabari**
- Xabarni avval **kanalingizga** premium emojilar bilan joylang
- Kanaldan botga **forward qiling** → emojilar harakatli saqlanadi
- Endi har /start da userlar shu chiroyli xabarni ko'radi

Broadcast'да ham xuddi shunday: kanaldan forward qilsangiz premium emoji saqlanadi.

---

## 7. Admin panel to'liq

| Tugma | Vazifa |
|---|---|
| 🎬 Kino qo'shish | Yuqoridagi 7 bosqich |
| 🗑 Kino o'chirish | Ro'yxatdan bosib o'chirish |
| 📊 Statistika | Userlar, premium, ko'rishlar, top kino |
| 💰 To'lovlar | Premium so'rovlar tarixi |
| 📢 Majburiy kanallar | Qo'shish / o'chirish |
| 🗂 Baza kanal | Kinolar manbasi |
| ⚙️ Sozlamalar | Karta, narx, kunlar, kontakt, welcome |
| 📣 Broadcast | Hammaga xabar |

---

## 8. Railway'ga deploy (24/7 ishlash)

1. Loyihani GitHub'ga yuklang (`.env` chiqmaydi)
2. Railway → New Project → Deploy from GitHub
3. **Variables**: `BOT_TOKEN`, `ADMIN_ID`, `BOT_NAME`
4. ⚠️ **Volume qo'shing** (data saqlanishi uchun):
   - Servicega o'ng tugma → Attach Volume → mount path: `/app/data`
   - Busiz har deployда kinolar/userlar o'chadi!
5. Start command: `npm start`

> ⚠️ Bot bir vaqtda faqat bitta joyda ishlasin. Railway'da ishga tushganда lokalни o'chiring (Ctrl+C), aks holда 409 Conflict.

---

## 9. Struktura

```
kinobot/
├── bot.js              # Asosiy fayl, menyu, routerlar
├── package.json
├── .env                # Token, admin ID, bot nomi
├── locales/
│   ├── uz.json         # 🇺🇿 o'zbekcha
│   ├── ru.json         # 🇷🇺 ruscha
│   └── en.json         # 🇬🇧 inglizcha
├── src/
│   ├── db.js           # JSON database (atomik yozish)
│   ├── i18n.js         # Tarjima tizimi
│   ├── state.js        # Multi-step holat
│   ├── subscription.js # Majburiy obuna
│   ├── movies.js       # Qidiruv, top, yangi, janr, forward
│   ├── premium.js      # Premium + to'lov + tasdiqlash
│   ├── profile.js      # Profil, til, yordam
│   └── admin.js        # To'liq admin panel
└── data/
    ├── users.json
    ├── movies.json
    ├── payments.json
    └── settings.json   # Sozlamalar, kanallar, baza kanal
```
