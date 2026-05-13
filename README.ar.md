<div dir="rtl">

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-full-dark.svg" />
    <img src="client/public/brand/logo-full-light.svg" alt="HomeInventory Logo" width="420" />
  </picture>
</p>

<h1 align="center">HomeInventory</h1>

<!-- Release status: v2.0.0 is live. -->

<p align="center">
  <strong>جرد منزلي خاص وقابل للاستضافة الذاتية للمنازل المشتركة.</strong><br/>
  إدارة العناصر والضمانات والمستندات والإعارات والسجلات الشخصية الحساسة من تطبيق React هادئ.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.ar.md">العربية</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/asdteke/HomeInventory?style=for-the-badge&logo=github&color=f4c542" alt="GitHub stars" />
  <img src="https://img.shields.io/github/last-commit/asdteke/HomeInventory?style=for-the-badge&color=2f6f55" alt="Last commit" />
  <img src="https://img.shields.io/badge/security-AES--256--GCM-2f6f55?style=for-the-badge" alt="AES-256-GCM encryption" />
  <img src="https://img.shields.io/badge/PWA-ready-334155?style=for-the-badge" alt="PWA ready" />
  <img src="https://img.shields.io/badge/Docker-supported-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker supported" />
  <img src="https://img.shields.io/badge/license-MIT-111827?style=for-the-badge" alt="MIT license" />
</p>

<p align="center">
  <a href="#المعاينة">المعاينة</a> ·
  <a href="#لماذا-homeinventory">لماذا</a> ·
  <a href="#الميزات">الميزات</a> ·
  <a href="#الأمان--الخصوصية">الأمان</a> ·
  <a href="#البدء-السريع">البدء السريع</a> ·
  <a href="#التوثيق">التوثيق</a>
</p>

---

## المعاينة

<p align="center">
  <img src="docs/assets/screenshot-landing.png" alt="معاينة صفحة HomeInventory الرئيسية" width="88%" />
</p>

<details>
<summary><strong>لقطات إضافية: الجرد، Borrow Center، Vault، الفئات</strong></summary>

<br/>

<p align="center">
  <img src="docs/assets/screenshot-inventory.png" alt="شاشة الجرد" width="48%" />
  &nbsp;
  <img src="docs/assets/screenshot-borrow.png" alt="شاشة Borrow Center" width="48%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-vault.png" alt="شاشة Personal Vault" width="48%" />
  &nbsp;
  <img src="docs/assets/screenshot-categories.png" alt="شاشة الفئات" width="48%" />
</p>

</details>

HomeInventory صُمم للعائلات وزملاء السكن والمنازل الصغيرة التي تحتاج إلى جرد عملي من دون تحويل السجلات الخاصة إلى جدول مشترك.

## لماذا HomeInventory

- **منزل واحد وعدة أشخاص:** أنشئ منزلاً أو انضم إلى منزل، بدّل المنزل النشط، واجعل الجرد المشترك محصوراً بالأعضاء الصحيحين.
- **سجلات عناصر حقيقية:** الصور، الغرف، المواقع، الفئات، الكميات، تواريخ الضمان، بيانات الفواتير، الملاحظات والمرفقات.
- **مكان أفضل للبيانات الحساسة:** يحافظ Personal Vault على السجلات الخاصة جداً بعيداً عن البحث والتعاون العادي داخل المنزل.
- **عثور سريع في الحياة اليومية:** البحث، مسح الباركود، ملصقات QR، وشاشات مناسبة للجوال عندما تكون أمام الرف مباشرة.
- **جاهز للاستضافة الذاتية:** يتضمن Express وSQLite ودعم Docker وتوثيق البيئة وتدفقات تحميل الأسرار للإنتاج.

## الميزات

| المجال | ما يغطيه |
| --- | --- |
| الجرد | العناصر، الصور، الغرف، الفئات، المواقع، الكميات، وبيانات الضمان والفواتير |
| المنازل المشتركة | إنشاء المنازل، الانضمام عبر تدفقات الوصول، تبديل المنزل النشط، وحصر البيانات حسب العضوية |
| Borrow Center | سجلات الإعارة الواردة والصادرة والنشطة مع حالات طلب واضحة |
| Personal Vault | تدفق vault مشفر من جهة العميل للهويات ومستندات الملكية ورموز الوصول والملاحظات الحساسة |
| الملصقات والمسح | مسح الباركود، ملصقات QR للعناصر، والوصول السريع من الجوال |
| النسخ الاحتياطي والاستعادة | تصدير/استيراد مخصص للمالك فقط مع تأكيدات محمية |
| المصادقة والاسترداد | JWT وGoogle OAuth والتحقق بالبريد وTOTP 2FA والأجهزة الموثوقة ومفاتيح الاسترداد |
| التدويل | أكثر من 100 حزمة لغة للواجهة مع fallback لكل مفتاح |

## الأمان & الخصوصية

- **تشفير AES-256-GCM** يحمي بيانات الجرد والمصادقة والملف الشخصي الحساسة قبل كتابتها إلى القرص أو SQLite.
- **معالجة وسائط مشفرة** تزيل بيانات الصور الوصفية وتخزن blobs محمية بدلاً من الرفعات الخام.
- **تفويض محصور بالمنزل** يحد الغرف والفئات والعناصر والوسائط والنسخ الاحتياطية بعضوية المنزل النشط.
- **فصل Personal Vault** يبقي السجلات الأكثر حساسية خارج تدفقات الجرد المشتركة المعتادة.
- **تحديد المعدل وتحصين مسارات المصادقة** يقللان مخاطر القوة الغاشمة وإساءة الاستخدام في تسجيل الدخول والنسخ الاحتياطي والنقاط التفاعلية.

> [!IMPORTANT]
> يستخدم HomeInventory تشفيراً قوياً من جهة الخادم، لكن مفتاح تشفير الجرد الرئيسي ما يزال يُدار بواسطة الخادم. يمكن للمشغّل الذي يملك وصولاً إلى قاعدة البيانات وأسرار التشغيل فك بيانات الجرد المحمية. استخدم Personal Vault للسجلات التي تحتاج إلى فصل أقوى عن تدفقات المنزل المشتركة.

## المعمارية

<div dir="ltr">

```text
React SPA (Vite, PWA, Tailwind)
        |
        v
Express API (JWT, OAuth, rate limiting)
        |
        v
SQLite storage + encrypted media
```

</div>

## التقنيات

| الخلفية | الواجهة الأمامية |
| --- | --- |
| Node.js, Express, better-sqlite3 | React 18, Vite, Tailwind CSS |
| JWT, bcrypt, Passport Google OAuth 2.0 | React Router v6, react-i18next |
| Helmet, express-rate-limit, i18next | Lucide React, html5-qrcode |
| Sharp وتخزين وسائط مشفر | واجهة متجاوبة وجاهزة PWA |

## البدء السريع

### المتطلبات

- Node.js 18+
- npm 9+
- Git

### 1. تثبيت الاعتماديات

<div dir="ltr">

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
npm run install-all
```

</div>

### 2. إنشاء ملف البيئة المحلي

<div dir="ltr">

```bash
cp .env.example .env
```

</div>

اضبط هذه القيم على الأقل:

<div dir="ltr">

```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=replace-with-a-long-random-secret
APP_ENCRYPTION_KEY=replace-with-32-byte-base64-or-64-char-hex-key
APP_ENCRYPTION_KEY_ID=2026-03-local
```

</div>

> [!TIP]
> أنشئ أسراراً محلية آمنة باستخدام `openssl rand -hex 32` لقيمة `JWT_SECRET` و`openssl rand -base64 32` لقيمة `APP_ENCRYPTION_KEY`.

اختياري للتطوير المحلي: `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` و`RESEND_API_KEY`.

### 3. تشغيل التطبيق

<div dir="ltr">

```bash
npm run dev
```

</div>

العناوين المحلية:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### 4. بناء الإنتاج

<div dir="ltr">

```bash
npm run build
npm start
```

</div>

### بديل Docker

<div dir="ltr">

```bash
docker compose up -d
```

</div>

للتكوين المتقدم، reverse proxy، ونشر الإنتاج، راجع [DOCKER.md](DOCKER.md).

## التوثيق

- [DOCKER.md](DOCKER.md): Docker وreverse proxy والاستضافة الذاتية
- [README_ENVIRONMENT_SETUP.md](README_ENVIRONMENT_SETUP.md): متغيرات البيئة وإدارة الأسرار
- [CONTRIBUTING.md](CONTRIBUTING.md): إرشادات المساهمة
- [SECURITY.md](SECURITY.md): عملية الإبلاغ عن الثغرات

## ملاحظة حول اللغات

يأتي المنتج مع **أكثر من 100 حزمة لغة قابلة للاختيار للواجهة**. الإنجليزية والتركية هما أكثر لغات المنتج مراجعة؛ ويمكن للغات الأخرى استخدام fallback لكل مفتاح عند نقص الترجمة.

## المساهمة

نرحب بالـ issues وpull requests. للتغييرات الكبيرة، افتح issue أولاً حتى تبقى الإضافة متوافقة مع نموذج الأمان، ونطاق المنزل، وبنية الترجمة.

## ملاحظة قانونية

HomeInventory مشروع مفتوح المصدر ومستقل. لا يرتبط بأي منتج تجاري أو شركة تستخدم اسماً مشابهاً، ولا يمثلها أو يحصل على دعم منها.

## الرخصة

MIT. راجع [LICENSE](LICENSE).

</div>
