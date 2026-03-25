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
  <a href="https://envanterim.net.tr">envanterim.net.tr</a>'nin açık kaynak projesidir.<br/>
  100+ dil destekli arayüz ve hassas veriler için alan bazlı şifreleme sunan açık kaynak ev envanter sistemi.
</p>

<p align="center">
  <a href="#özellikler">Özellikler</a> •
  <a href="#teknoloji-yığını">Teknolojiler</a> •
  <a href="#hızlı-başlangıç">Kurulum</a> •
  <a href="#docker">Docker</a> •
  <a href="#ortam-değişkenleri">Ortam Değişkenleri</a> •
  <a href="#proje-yapısı">Proje Yapısı</a> •
  <a href="#lisans">Lisans</a>
</p>

<p align="center">
  <strong>🌐 Dil:</strong> Türkçe | <a href="README.md">English</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.ar.md">العربية</a>
</p>

---

## Özellikler

- 🏠 **Çoklu ev desteği** — Yeni ev oluşturun veya mevcut bir eve katılın, envanterleri paylaşın
- 📦 **Eşya yönetimi** — Fotoğraf, miktar, barkod ve açıklamayla eşyalarınızı takip edin
- 🏷️ **Kategoriler & Odalar** — Eşyaları özel kategoriler, odalar ve konumlarla düzenleyin
- 📱 **Barkod / QR tarama** — Cihaz kamerasıyla hızla eşya ekleyin veya bulun
- 🔐 **Kimlik doğrulama** — JWT tabanlı giriş, Google OAuth ve e-posta doğrulama desteği
- 🛡️ **Alan bazlı şifreleme** — Hassas doğrulama ve envanter alanları için AES-256-GCM koruması
- 👨‍💼 **Admin paneli** — Kullanıcı yönetimi, yasaklama, e-posta gönderimi ve sistem logları
- 📧 **E-posta sistemi** — Resend API ile doğrulama ve bilgilendirme e-postaları
- 💾 **Yedekleme & Geri Yükleme** — Envanter verilerinizi dışa/içe aktarın
- 🌍 **100+ dil destekli arayüz** — Frontend küresel kullanım için 100'den fazla seçilebilir dille gelir
- 🌙 **Karanlık / Aydınlık tema** — Sistem tercihini otomatik algılar
- 📱 **Duyarlı tasarım** — Mobil öncelikli, tüm ekran boyutlarında çalışır
- 🔍 **SEO hazır** — Sitemap, robots.txt, meta etiketler ve IndexNow desteği
- 🔑 **Güvenli Şifre Kurtarma** — E-posta tabanlı veya çevrimdışı (offline) Kurtarma Anahtarı ile yerel hesap kurtarma

## Güvenlik ve Gizlilik (Sunucu Taraflı Durağan Şifreleme)

HomeInventory, kişisel verilerinizi korumak için kurumsal düzeyde güvenlik standartlarıyla tasarlanmıştır. Tüm hassas alanlar, medya dosyaları ve kişisel veriler, diske veya veritabanına yazılmadan önce sunucuda AES-256-GCM ile şifrelenir. Bu, veritabanı hırsızlığına ve yetkisiz dosya erişimine karşı koruma sağlar. Not: şifreleme anahtarları sunucu tarafında yönetildiğinden, hem veritabanına hem de ortam değişkenlerine erişimi olan bir sunucu yöneticisi verileri çözebilir.

- **Alan Bazlı Şifreleme (Field-Level Encryption)**: Eşya isimleri, açıklamaları, özel oluşturulan kategori ve oda adları veritabanına yazılmadan önce AES-256-GCM ile şifrelenir.
- **Şifreli Medya Depolama**: Yüklenen tüm fotoğrafların ve küçük resimlerin EXIF (konum, tarih, cihaz) metadataları otomatik silinir. Dosyalar diske AES-256-GCM ile şifrelenmiş bulanık baytlar (blob) olarak yazılır ve sadece kimliği doğrulanmış kullanıcılar için RAM'de anlık olarak çözülerek sunulur.
- **Kişisel Veri Koruması (PII)**: Kullanıcı e-posta adresleri ve isimleri şifreli saklanır. Giriş işlemleri, orijinal veriyi ele vermeyen ve Rainbow Table saldırılarına karşı korumalı HMAC-SHA-256 tabanlı arama token'ları (lookup token) ile gerçekleştirilir.
- **Anahtar Rotasyonu (Key Rotation)**: Sistem, ana şifreleme anahtarının (Master Key) periyodik olarak değiştirilebilmesine olanak tanıyan bir "Keyring" (Anahtarlık) mimarisi kullanır. Bu sayede aktif anahtar değişse bile eski veriler sorunsuz bir şekilde okunmaya devam eder.

## Teknoloji Yığını

### Backend
| Teknoloji | Amaç |
|---|---|
| **Node.js** + **Express** | REST API sunucusu |
| **better-sqlite3** | Gömülü SQLite veritabanı |
| **JWT** + **bcrypt** | Kimlik doğrulama & şifre hashleme |
| **Passport.js** | Google OAuth 2.0 entegrasyonu |
| **Helmet** | HTTP güvenlik başlıkları |
| **express-rate-limit** | Brute-force / DDoS koruması |
| **Resend** | İşlemsel e-posta servisi |
| **Sharp** | Görüntü işleme & küçük resimler |
| **i18next** | Sunucu tarafı çoklu dil desteği |

### Frontend
| Teknoloji | Amaç |
|---|---|
| **React 18** | Kullanıcı arayüzü kütüphanesi |
| **Vite** | Derleme aracı & geliştirme sunucusu |
| **Tailwind CSS** | CSS framework |
| **React Router v7** | İstemci tarafı yönlendirme |
| **Lucide React** | İkon kütüphanesi |
| **html5-qrcode** | Barkod & QR tarama |
| **react-i18next** | Frontend çoklu dil desteği |
| **react-joyride** | İnteraktif tanıtım turu |

## Hızlı Başlangıç

### Gereksinimler
- **Node.js** ≥ 18 — [indir](https://nodejs.org/)
- **npm** ≥ 9 (Node.js ile birlikte gelir)

### 1. Klonla & Kur

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# Backend + frontend bağımlılıklarını tek komutla kur
npm run install-all
```

### 2. Ortam Dosyasını Oluştur

```bash
cp .env.example .env
```

`.env` dosyasını editörünüzde açın ve **en azından** şu değerleri girin:

```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=en-az-32-karakter-uzunlugunda-rastgele-bir-metin-yazin
APP_ENCRYPTION_KEY=32-byte-base64-veya-64-karakter-hex-anahtar
APP_ENCRYPTION_KEY_ID=2026-03-local
```

> **💡 İpucu:** Güvenli bir JWT_SECRET oluşturmak için:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

> **🔐 Şifreleme anahtarı:** `APP_ENCRYPTION_KEY` üretmek için:
> ```bash
> openssl rand -base64 32
> ```

`APP_ENCRYPTION_KEY` ve `APP_ENCRYPTION_KEY_ID` zorunludur; çünkü hassas alan şifrelemesi uygulama açılışında fail-secure çalışır. Diğer değişkenler (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY` vb.) local geliştirme için **opsiyoneldir**. Bu değişkenlere bağlı özellikler (Google giriş, e-posta gönderimi) otomatik olarak devre dışı kalır.

### Opsiyonel: Oracle Cloud Secret Management

HomeInventory'yi bir Oracle Cloud Infrastructure (OCI) compute instance üzerinde dağıtıyorsanız, production sırlarını OCI Secret Management'ta tutabilir ve çalışma zamanında uygulama başlamadan önce yükletebilirsiniz.

Önerilen yapılandırma:

```env
SECRET_PROVIDER=oci
OCI_AUTH_MODE=instance_principal
OCI_REGION=eu-frankfurt-1
OCI_VAULT_ID=ocid1.vault.oc1..exampleuniqueID
OCI_SECRET_MAPPINGS={"JWT_SECRET":"homeinventory-jwt-secret","APP_ENCRYPTION_KEY":"homeinventory-app-encryption-key","APP_ENCRYPTION_KEY_ID":"homeinventory-app-encryption-key-id","RESEND_API_KEY":"homeinventory-resend-api-key"}
```

Notlar:

- Yerel geliştirme için `SECRET_PROVIDER=env` bırakın.
- `OCI_SECRET_MAPPINGS` gizli OCID'lere veya gizli adlara işaret edebilir.
- `OCI_VAULT_ID` yalnızca gizli OCID'ler yerine gizli adlar kullandığınızda gereklidir.
- Sunucu giriş noktası artık çalışma zamanı sırlarını otomatik olarak yükler, dolayısıyla `node server.js`, `npm run dev` ve `npm start` komutları çalışmaya devam eder.
- Şifreleme backfill ve IndexNow gönderimi gibi bakım betikleri de aynı OCI bootstrap yolunu kullanır.

### 3. Geliştirme Sunucusunu Başlat

```bash
npm run dev
```

Bu komut backend ve frontend'i aynı anda başlatır. Tarayıcınızı açın:

| Servis | Adres |
|---|---|
| 🖥️ Frontend | http://localhost:5173 |
| ⚙️ Backend API | http://localhost:3001 |
| 📱 Ağ (telefon) | `http://<yerel-ip-adresiniz>:5173` |

### 4. Production Derlemesi (opsiyonel)

```bash
# Frontend'i production için derle
npm run build

# Production sunucusunu başlat (derlenmiş frontend + API)
npm start
```

## Docker

Kolay self-hosting için HomeInventory'yi Docker ile dağıtın:

```bash
# Klonla ve dizine gir
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# Ortam dosyasını oluştur
cp .env.example .env
# .env dosyasını düzenleyip JWT_SECRET, APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_ID değerlerini ayarlayın

# Docker Compose ile başlat
docker compose up -d
```

Uygulama `http://localhost:3001` adresinde erişilebilir olacaktır.

Tam `.env` dosyası konteyner'a aktarılır; `APP_ENCRYPTION_KEYRING`, `EXPOSE_SERVER_INFO` ve `INDEXNOW_*` gibi opsiyonel ayarlar Docker'da da çalışmaya devam eder.

Detaylı Docker yapılandırması, reverse proxy kurulumu, yedekleme/geri yükleme ve Unraid dağıtımı için **[DOCKER.md](DOCKER.md)** belgesine bakın.

## Ortam Değişkenleri

`.env.example` dosyasını `.env` olarak kopyalayıp gerekli değerleri doldurun:

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `NODE_ENV` | ✅ | `development` veya `production` |
| `PORT` | ✅ | Backend sunucu portu (varsayılan: `3001`) |
| `SITE_URL` | ✅ | Sitenizin genel URL'si |
| `JWT_SECRET` | ✅ | JWT imzalama için rastgele gizli anahtar (min 32 karakter) |
| `APP_ENCRYPTION_KEY` | ✅ | Hassas alanları koruyan 32-byte şifreleme anahtarı |
| `APP_ENCRYPTION_KEY_ID` | ✅ | Yeni şifreli kayıtlar için sabit anahtar kimliği |
| `APP_ENCRYPTION_KEYRING` | ⬜ | Rotation sonrası eski verileri çözmek için legacy anahtarları içeren opsiyonel JSON haritası |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth istemci kimliği |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth istemci gizli anahtarı |
| `RESEND_API_KEY` | ⬜ | Resend.com API anahtarı (e-posta için) |
| `SUPPORT_EMAIL` | ⬜ | Destek e-posta adresi |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Bu e-postayı otomatik admin yap |
| `EXPOSE_SERVER_INFO` | ⬜ | Sunucu bilgi endpoint'ini göster (`true`/`false`) |
| `APP_EMAIL_LANGUAGE` | ⬜ | Gönderilen e-postaların dili (varsayılan: `en`) |
| `INDEXNOW_KEY` | ⬜ | SEO indeksleme için IndexNow API anahtarı |
| `INDEXNOW_BASE_URL` | ⬜ | IndexNow gönderimleri için temel URL |
| `INDEXNOW_ENDPOINT` | ⬜ | IndexNow API endpoint URL'si |
| `INDEXNOW_KEY_LOCATION` | ⬜ | İsteğe bağlı IndexNow anahtar dosyası konum override'u |

> **⚠️ `.env` dosyanızı asla commit etmeyin!** Zaten `.gitignore`'da tanımlıdır.

## Proje Yapısı

```
Home-inventory/
├── app.js                    # Express uygulama kurulumu & middleware
├── server.js                 # Çalışma zamanı başlatıcı & sunucu giriş noktası
├── auth.js                   # JWT middleware & token oluşturma
├── database.js               # SQLite DB başlatma & migration'lar
├── package.json              # Backend bağımlılıkları & komutlar
├── .env.example              # Ortam değişkeni şablonu
├── .gitignore
├── LICENSE
│
├── config/
│   └── i18n.js               # i18next sunucu yapılandırması
│
├── middleware/
│   └── auth.js               # Kimlik doğrulama & admin middleware
│
├── routes/
│   ├── auth.js               # Giriş, kayıt, OAuth, şifre işlemleri
│   ├── items.js              # Eşya CRUD işlemleri
│   ├── categories.js         # Kategori yönetimi
│   ├── rooms.js              # Oda yönetimi
│   ├── locations.js          # Konum yönetimi
│   ├── barcode.js            # Barkod arama & tarama
│   ├── houses.js             # Çoklu ev yönetimi
│   ├── admin.js              # Admin panel endpoint'leri
│   ├── admin-email.js        # Admin e-posta gönderimi
│   ├── email.js              # E-posta doğrulama & durum
│   ├── backup.js             # Yedekleme/geri yükleme
│   └── ...
│
├── utils/
│   ├── encryption.js         # AES-256-GCM alan şifreleme yardımcıları
│   ├── protectedFields.js    # Envanter alanı şifreleme/çözme yardımcıları
│   ├── passwordRecovery.js   # Kurtarma anahtarı oluşturma & doğrulama
│   ├── mediaStorage.js       # Şifreli medya okuma/yazma yardımcıları
│   ├── runtimeSecrets.js     # OCI Secret Management başlatıcısı
│   ├── emailService.js       # Resend e-posta entegrasyonu
│   ├── indexNow.js           # IndexNow SEO gönderimi
│   └── logger.js             # KVKK uyumlu loglama
│
├── locales/                  # Backend çoklu dil dosyaları (100+ dil)
│
├── scripts/
│   ├── run-with-runtime-secrets.mjs # OCI bakım betikleri için çalışma zamanı sır başlatıcısı
│   ├── backfill-field-encryption.mjs # Legacy düz metin alanları şifreler
│   ├── generate-locales.js   # Dil dosyası oluşturma betikleri
│   └── indexnow-submit.mjs   # CLI IndexNow gönderimi
│
└── client/                   # React frontend
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── public/
    │   ├── brand/            # Logo dosyaları (koyu/açık)
    │   ├── locales/          # Frontend çoklu dil dosyaları
    │   ├── robots.txt
    │   └── sitemap.xml
    └── src/
        ├── App.jsx           # Ana bileşen & yönlendirme
        ├── main.jsx          # Giriş noktası
        ├── index.css         # Genel stiller
        ├── i18n.js           # Frontend i18n yapılandırması
        ├── components/       # Tüm React bileşenleri
        │   ├── Dashboard.jsx
        │   ├── ItemList.jsx
        │   ├── ItemForm.jsx
        │   ├── CategoryManager.jsx
        │   ├── RoomManager.jsx
        │   ├── Settings.jsx
        │   ├── AdminPanel.jsx
        │   ├── BarcodeScanner.jsx
        │   ├── LandingPage.jsx
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   └── ...
        ├── context/          # React context'leri (Auth, Theme)
        └── utils/            # Frontend yardımcı fonksiyonlar
```

## API Endpoint'leri

| Metod | Endpoint | Açıklama |
|---|---|---|
| `POST` | `/api/auth/register` | Yeni kullanıcı kaydı |
| `POST` | `/api/auth/login` | Giriş yap |
| `GET` | `/api/items` | Eşyaları listele |
| `POST` | `/api/items` | Eşya oluştur |
| `PUT` | `/api/items/:id` | Eşya güncelle |
| `DELETE` | `/api/items/:id` | Eşya sil |
| `GET` | `/api/categories` | Kategorileri listele |
| `GET` | `/api/rooms` | Odaları listele |
| `GET` | `/api/houses` | Kullanıcının evlerini listele |
| `GET` | `/api/admin/*` | Admin panel endpoint'leri |
| `GET` | `/api/health` | Sağlık kontrolü |

> Tüm `/api/*` endpoint'leri (auth hariç) JWT Bearer token gerektirir.

## Katkıda Bulunma

1. Depoyu fork'layın
2. Özellik dalınızı oluşturun (`git checkout -b feature/harika-ozellik`)
3. Değişikliklerinizi commit'leyin (`git commit -m 'Harika özellik ekle'`)
4. Dalınıza push'layın (`git push origin feature/harika-ozellik`)
5. Pull Request açın

## Yasal Uyarı

Bu bağımsız bir açık kaynak projesidir. Benzer isim kullanan herhangi bir ticari ürün veya şirketle bağlantılı, onlar tarafından desteklenen veya onlara bağlı değildir.

## Yapay Zeka Destekli Geliştirme

Bu proje, yapay zeka araçlarının (Google Gemini ve OpenAI GPT dahil) önemli desteğiyle geliştirilmiştir.

## Lisans

MIT — detaylar için [LICENSE](LICENSE) dosyasına bakın.
