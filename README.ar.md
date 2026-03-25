<div dir="rtl">

<p align="center">
  <img src="client/public/brand/logo-full-dark.png" alt="HomeInventory Logo" width="280" />
</p>

<h1 align="center">HomeInventory</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Security-AES--256--GCM-blue?style=for-the-badge&logo=security" alt="Security" />
  <img src="https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  المشروع مفتوح المصدر وراء <a href="https://envanterim.net.tr">envanterim.net.tr</a><br/>
  نظام إدارة مخزون منزلي مفتوح المصدر يدعم أكثر من 100 لغة في الواجهة مع تشفير على مستوى الحقل للبيانات الحساسة.
</p>

<p align="center">
  <a href="#المميزات">المميزات</a> •
  <a href="#التقنيات">التقنيات</a> •
  <a href="#البدء-السريع">البدء السريع</a> •
  <a href="#docker">Docker</a> •
  <a href="#متغيرات-البيئة">متغيرات البيئة</a> •
  <a href="#هيكل-المشروع">الهيكل</a> •
  <a href="#الرخصة">الرخصة</a>
</p>

<p align="center">
  <strong>🌐 اللغة:</strong> العربية | <a href="README.md">English</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a>
</p>

---

## المميزات

- 🏠 **دعم منازل متعددة** — أنشئ منزلاً جديداً أو انضم إلى منزل قائم مع مخزون مشترك
- 📦 **إدارة العناصر** — تتبع العناصر بالصور والكميات والباركود والأوصاف
- 🏷️ **الفئات والغرف** — نظّم العناصر حسب فئات وغرف ومواقع مخصصة
- 📱 **مسح الباركود / QR** — أضف أو ابحث عن العناصر بسرعة باستخدام كاميرا جهازك
- 🔐 **المصادقة** — تسجيل دخول بـ JWT مع دعم Google OAuth والتحقق عبر البريد الإلكتروني
- 👨‍💼 **لوحة الإدارة** — إدارة المستخدمين، الحظر، إرسال البريد الإلكتروني، وسجلات النظام
- 📧 **نظام البريد** — رسائل بريد إلكتروني عبر Resend API (التحقق، إشعارات المدير)
- 💾 **النسخ الاحتياطي والاستعادة** — تصدير واستيراد بيانات المخزون
- 🌍 **100+ لغة** — تأتي الواجهة مع أكثر من 100 لغة قابلة للاختيار للوصول العالمي
- 🌙 **وضع داكن / فاتح** — يكتشف تفضيل النظام تلقائياً
- 📱 **تصميم متجاوب** — تصميم للجوال أولاً، يعمل على جميع أحجام الشاشات
- 🔍 **جاهز لـ SEO** — خريطة الموقع، robots.txt، علامات meta، ودعم IndexNow
- 🛡️ **تشفير على مستوى الحقل** — حماية AES-256-GCM للبيانات الحساسة
- 🔑 **استرداد آمن لكلمة المرور** — إعادة تعيين بالبريد الإلكتروني أو مفتاح استرداد دون اتصال

## الأمان والخصوصية (بنية عدم المعرفة - Zero-Knowledge)

تم تصميم HomeInventory بمعايير أمان مؤسسية لضمان بقاء بياناتك الشخصية خاصة تماماً.

- **تشفير على مستوى الحقل**: يتم تشفير البيانات الحساسة (أسماء العناصر والأوصاف) بواسطة AES-256-GCM قبل حفظها.
- **تخزين الوسائط المشفر**: يتم تخزين الصور بعد إزالة البيانات الوصفية (EXIF) الخاصة بها وتشفيرها بواسطة AES-256-GCM.
- **حماية البيانات الشخصية (PII)**: يتم تشفير رسائل البريد الإلكتروني وأسماء المستخدمين. يستند البحث إلى رموز HMAC-SHA-256.
- **تدوير المفاتيح**: دعم "حلقة المفاتيح" (Keyring) لتغيير المفتاح الأساسي دون فقدان الوصول للبيانات القديمة.

## التقنيات

### الخلفية (Backend)
| التقنية | الغرض |
|---|---|
| **Node.js** + **Express** | خادم REST API |
| **better-sqlite3** | قاعدة بيانات SQLite مدمجة |
| **JWT** + **bcrypt** | المصادقة وتشفير كلمات المرور |
| **Passport.js** | تكامل Google OAuth 2.0 |
| **Helmet** | رؤوس أمان HTTP |
| **express-rate-limit** | الحماية من هجمات القوة الغاشمة / DDoS |
| **Resend** | خدمة البريد الإلكتروني |
| **Sharp** | معالجة الصور والصور المصغرة |
| **i18next** | دعم تعدد اللغات من جانب الخادم |

### الواجهة الأمامية (Frontend)
| التقنية | الغرض |
|---|---|
| **React 18** | مكتبة واجهة المستخدم |
| **Vite** | أداة البناء وخادم التطوير |
| **Tailwind CSS** | إطار عمل CSS |
| **React Router v7** | التوجيه من جانب العميل |
| **Lucide React** | مكتبة الأيقونات |
| **html5-qrcode** | مسح الباركود و QR |
| **react-i18next** | دعم تعدد اللغات للواجهة |
| **react-joyride** | جولات تعريفية تفاعلية |

## البدء السريع

### المتطلبات الأساسية
- **Node.js** ≥ 18 — [تحميل](https://nodejs.org/)
- **npm** ≥ 9 (يأتي مع Node.js)

### 1. استنساخ وتثبيت

<div dir="ltr">

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# تثبيت جميع التبعيات (الخلفية + الواجهة) بأمر واحد
npm run install-all
```

</div>

### 2. إنشاء ملف البيئة

<div dir="ltr">

```bash
cp .env.example .env
```

</div>

افتح `.env` في محررك وعيّن **كحد أدنى** هذه القيم للتطوير المحلي:

<div dir="ltr">

```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=غير-هذا-إلى-نص-عشوائي-لا-يقل-عن-32-حرفاً
APP_ENCRYPTION_KEY=استبدل-بمفتاح-تشفير-32-بايت
APP_ENCRYPTION_KEY_ID=2026-03-local
```

</div>

> **💡 نصيحة:** يمكنك توليد JWT_SECRET آمن بواسطة:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

المتغيرات المتبقية (`GOOGLE_CLIENT_ID`، `RESEND_API_KEY`، إلخ) **اختيارية** للتطوير المحلي. الميزات التي تعتمد عليها (تسجيل الدخول بـ Google، إرسال البريد) ستُعطّل تلقائياً.

> **🔐 مفتاح التشفير:** قم بتوليد `APP_ENCRYPTION_KEY` بواسطة:
> ```bash
> openssl rand -base64 32
> ```

### اختياري: Oracle Cloud Secret Management

إذا كنت تنشر HomeInventory على مثيل Oracle Cloud Infrastructure (OCI)، يمكنك تخزين أسرار الإنتاج في OCI Secret Management وتحميلها تلقائياً قبل بدء التطبيق.

النمط الموصى به:

<div dir="ltr">

```env
SECRET_PROVIDER=oci
OCI_AUTH_MODE=instance_principal
OCI_REGION=eu-frankfurt-1
OCI_VAULT_ID=ocid1.vault.oc1..exampleuniqueID
OCI_SECRET_MAPPINGS={"JWT_SECRET":"homeinventory-jwt-secret","APP_ENCRYPTION_KEY":"homeinventory-app-encryption-key","APP_ENCRYPTION_KEY_ID":"homeinventory-app-encryption-key-id","RESEND_API_KEY":"homeinventory-resend-api-key"}
```

</div>

ملاحظات:

- اترك `SECRET_PROVIDER=env` للتطوير المحلي.
- `OCI_SECRET_MAPPINGS` يمكن أن يشير إلى OCIDs أو أسماء الأسرار.
- `OCI_VAULT_ID` مطلوب فقط عند استخدام أسماء الأسرار بدلاً من OCIDs.
- نقطة دخول الخادم تحمّل الأسرار تلقائياً، لذا `node server.js` و `npm run dev` و `npm start` تستمر بالعمل.
- برامج الصيانة مثل backfill التشفير وإرسال IndexNow تستخدم نفس مسار OCI bootstrap.

### 3. تشغيل خادم التطوير

<div dir="ltr">

```bash
npm run dev
```

</div>

هذا يشغل الخلفية والواجهة معاً. افتح متصفحك:

| الخدمة | العنوان |
|---|---|
| 🖥️ الواجهة الأمامية | http://localhost:5173 |
| ⚙️ واجهة API | http://localhost:3001 |
| 📱 الشبكة (الهاتف) | `http://<عنوان-IP-المحلي>:5173` |

### 4. بناء الإنتاج (اختياري)

<div dir="ltr">

```bash
# بناء الواجهة للإنتاج
npm run build

# تشغيل خادم الإنتاج (الواجهة المبنية + API)
npm start
```

</div>

## Docker

انشر HomeInventory باستخدام Docker للاستضافة الذاتية السهلة:

<div dir="ltr">

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
cp .env.example .env
# عدّل .env وعيّن JWT_SECRET, APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_ID
docker compose up -d
```

</div>

التطبيق سيكون متاحاً على `http://localhost:3001`

يتم تمرير ملف `.env` الكامل إلى الحاوية؛ الإعدادات الاختيارية مثل `APP_ENCRYPTION_KEYRING` و `EXPOSE_SERVER_INFO` و `INDEXNOW_*` تستمر بالعمل في Docker.

للتفاصيل حول إعداد Docker والبروكسي العكسي والنسخ الاحتياطي/الاستعادة ونشر Unraid، انظر **[DOCKER.md](DOCKER.md)**.

## متغيرات البيئة

انسخ `.env.example` إلى `.env` واملأ القيم المطلوبة:

| المتغير | مطلوب | الوصف |
|---|---|---|
| `NODE_ENV` | ✅ | `development` أو `production` |
| `PORT` | ✅ | منفذ خادم الخلفية (افتراضي: `3001`) |
| `SITE_URL` | ✅ | عنوان URL العام لموقعك |
| `JWT_SECRET` | ✅ | مفتاح سري عشوائي لتوقيع JWT (32 حرفاً على الأقل) |
| `APP_ENCRYPTION_KEY` | ✅ | مفتاح تشفير عشوائي 32 بايت |
| `APP_ENCRYPTION_KEY_ID` | ✅ | مُعرف مفتاح التشفير الأساسي |
| `APP_ENCRYPTION_KEYRING` | ⬜ | خريطة JSON اختيارية لتدوير المفاتيح |
| `GOOGLE_CLIENT_ID` | ⬜ | معرّف عميل Google OAuth |
| `GOOGLE_CLIENT_SECRET` | ⬜ | سر عميل Google OAuth |
| `RESEND_API_KEY` | ⬜ | مفتاح API لـ Resend.com للبريد الإلكتروني |
| `SUPPORT_EMAIL` | ⬜ | عنوان بريد الدعم |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | ترقية هذا البريد تلقائياً إلى مدير |
| `EXPOSE_SERVER_INFO` | ⬜ | إظهار نقطة نهاية معلومات الخادم (`true`/`false`) |
| `APP_EMAIL_LANGUAGE` | ⬜ | لغة رسائل البريد الإلكتروني الصادرة (افتراضي: `en`) |
| `INDEXNOW_KEY` | ⬜ | مفتاح IndexNow API لفهرسة SEO |
| `INDEXNOW_BASE_URL` | ⬜ | عنوان URL الأساسي لعمليات إرسال IndexNow |
| `INDEXNOW_ENDPOINT` | ⬜ | عنوان URL لنقطة نهاية IndexNow API |
| `INDEXNOW_KEY_LOCATION` | ⬜ | موقع ملف مفتاح IndexNow (اختياري) |

> **⚠️ لا تقم أبداً بعمل commit لملف `.env`!** إنه مدرج بالفعل في `.gitignore`.

## هيكل المشروع

<div dir="ltr">

```
Home-inventory/
├── app.js                    # Express app setup & middleware
├── server.js                 # Runtime bootstrap & server entry point
├── auth.js                   # JWT middleware & token generation
├── database.js               # SQLite DB initialization & migrations
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
│
├── config/
│   └── i18n.js
│
├── middleware/
│   └── auth.js
│
├── routes/
│   ├── auth.js, items.js, categories.js, rooms.js
│   ├── locations.js, barcode.js, houses.js
│   ├── admin.js, admin-email.js, email.js, backup.js
│   └── ...
│
├── utils/
│   ├── encryption.js, protectedFields.js, passwordRecovery.js
│   ├── mediaStorage.js, runtimeSecrets.js, emailService.js
│   ├── indexNow.js, logger.js
│   └── ...
│
├── locales/                  # Backend i18n (100+ languages)
├── scripts/                  # Maintenance & generation scripts
│
└── client/                   # React frontend
    ├── src/
    │   ├── components/       # Dashboard, ItemList, ItemForm, ...
    │   ├── context/          # Auth, Theme contexts
    │   └── utils/
    └── public/
        ├── brand/, locales/, robots.txt, sitemap.xml
        └── ...
```

</div>

## نقاط نهاية API

| الطريقة | نقطة النهاية | الوصف |
|---|---|---|
| `POST` | `/api/auth/register` | تسجيل مستخدم جديد |
| `POST` | `/api/auth/login` | تسجيل الدخول |
| `GET` | `/api/items` | عرض العناصر |
| `POST` | `/api/items` | إنشاء عنصر |
| `PUT` | `/api/items/:id` | تحديث عنصر |
| `DELETE` | `/api/items/:id` | حذف عنصر |
| `GET` | `/api/categories` | عرض الفئات |
| `GET` | `/api/rooms` | عرض الغرف |
| `GET` | `/api/houses` | عرض منازل المستخدم |
| `GET` | `/api/admin/*` | نقاط نهاية لوحة الإدارة |
| `GET` | `/api/health` | فحص الصحة |

> جميع نقاط نهاية `/api/*` (باستثناء auth) تتطلب رمز JWT Bearer.

## المساهمة

1. قم بعمل Fork للمستودع
2. أنشئ فرع الميزة الخاص بك (`git checkout -b feature/ميزة-رائعة`)
3. قم بعمل commit لتغييراتك (`git commit -m 'إضافة ميزة رائعة'`)
4. ادفع الفرع (`git push origin feature/ميزة-رائعة`)
5. افتح Pull Request

## إخلاء المسؤولية

هذا مشروع مفتوح المصدر مستقل. لا علاقة له بأي منتج تجاري أو شركة تستخدم اسماً مشابهاً، ولا يحظى بدعمها أو ارتباطها.

## التطوير بمساعدة الذكاء الاصطناعي

تم تطوير هذا المشروع بمساعدة كبيرة من أدوات الذكاء الاصطناعي (بما في ذلك Google Gemini و OpenAI GPT).

## الرخصة

MIT — انظر [LICENSE](LICENSE) للتفاصيل.

</div>
