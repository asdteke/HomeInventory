<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-full-dark.svg" />
    <img src="client/public/brand/logo-full-light.svg" alt="HomeInventory Logo" width="420" />
  </picture>
</p>

<h1 align="center">HomeInventory</h1>

<!-- Sürüm durumu: v2.7.0 release line. -->

<p align="center">
  <strong>Paylaşımlı evler için özel, self-host edilebilir ev envanteri.</strong><br/>
  Eşyaları, garantileri, belgeleri, ödünç kayıtlarını ve hassas kişisel notları sakin bir React uygulamasında yönetin.
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
  <img src="https://github.com/asdteke/HomeInventory/actions/workflows/ci.yml/badge.svg" alt="CI status" />
  <img src="https://img.shields.io/badge/security-AES--256--GCM-2f6f55?style=for-the-badge" alt="AES-256-GCM encryption" />
  <img src="https://img.shields.io/badge/PWA-ready-334155?style=for-the-badge" alt="PWA ready" />
  <img src="https://img.shields.io/badge/Docker-supported-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker supported" />
  <img src="https://img.shields.io/badge/license-MIT-111827?style=for-the-badge" alt="MIT license" />
</p>

<p align="center">
  <a href="#önizleme">Önizleme</a> ·
  <a href="#neden-homeinventory">Neden</a> ·
  <a href="#özellikler">Özellikler</a> ·
  <a href="#güvenlik--gizlilik">Güvenlik</a> ·
  <a href="#hızlı-başlangıç">Hızlı Başlangıç</a> ·
  <a href="#dokümantasyon">Dokümanlar</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

## Önizleme

<p align="center">
  <img src="docs/assets/screenshot-landing.png" alt="HomeInventory açılış ekranı önizlemesi" width="82%" />
</p>

<details>
<summary><strong>Daha fazla ekran görüntüsü: Envanter, Kutular, Kutu İçeriği, Ödünç Merkezi, Kişisel Kasa, Kategoriler</strong></summary>

<br/>

<p align="center">
  <img src="docs/assets/screenshot-inventory.png" alt="Envanter ekranı" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-boxes.png" alt="Kutular ekranı" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-box-detail.png" alt="Kutu içeriği ekranı" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-borrow.png" alt="Ödünç Merkezi ekranı" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-vault.png" alt="Kişisel Kasa ekranı" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-categories.png" alt="Kategoriler ekranı" width="82%" />
</p>

</details>

HomeInventory; aileler, ev arkadaşları ve küçük haneler için özel kayıtları ortak bir tabloya dönüştürmeden pratik envanter yönetimi sağlar.

> [!NOTE]
> **v2.7.0 güncel release hattıdır.** Pratik parola kuralları, hesap bazlı kademeli giriş gecikmesi, offline zayıf parola koruması, mobil kamera için isteğe bağlı LAN HTTPS, beş launcher dili, rastgele port seçimi ve senkron yönetilen uygulama/Launcher güncellemeleri getirir.

## Neden HomeInventory

- **Tek ev, birden fazla kişi:** ev oluşturun veya eve katılın, aktif evi değiştirin ve ortak envanteri doğru üyelik kapsamında tutun.
- **Gerçek eşya kayıtları:** fotoğraf, oda, konum, kategori, miktar, garanti tarihi, fatura bilgisi, not ve ek dosya saklayın.
- **Toplu işleme uygun envanter:** birden fazla eşyayı seçin, oda/kategori/konum/görünürlük alanlarını toplu güncelleyin, güvenli şekilde silin ve stok, tarih, garanti, ödünç durumu, sahiplik ve konuma göre filtreleyin.
- **Mobilde kamera odaklı giriş:** desteklenen mobil tarayıcılarda eşya ve fatura fotoğrafını doğrudan çekin veya galeriden/dosyadan yüklemeye devam edin.
- **TypeScript destekli istemci:** React arayüzü TypeScript/Vite kod tabanına taşındı; editör geri bildirimi, refactor güveni ve build zamanı kontrolleri güçlendi.
- **Hassas veriler için daha doğru alan:** Personal Vault, çok özel kayıtları normal ev araması ve ortak çalışma akışından ayrı tutar.
- **Günlük kullanımda hızlı bulma:** rafın önündeyken arama, barkod tarama, QR etiketleri ve mobil uyumlu ekranlarla hızlı hareket edin.
- **Self-host için hazır:** Express, SQLite, Docker desteği, ortam dokümantasyonu ve production secret yükleme akışları dahildir.

## Özellikler

| Alan | Kapsam |
| --- | --- |
| Envanter | Eşyalar, kamera/galeri fotoğrafları, odalar, kategoriler, konumlar, miktarlar, garanti ve fatura metadata alanları |
| Kutular | Ortak veya kişisel kutular, tekli/toplu eşya atama, kamera/galeri fotoğrafı, oda seçimi ve aynı yerden konum oluşturma, korumalı taşıma/silme ve mevcut QR etiket baskısı |
| Toplu işlemler | Çoklu seçim, toplu kategori/oda/konum/görünürlük güncelleme, toplu silme, hızlı stok ayarı, gelişmiş filtreleme ve sıralama |
| Paylaşımlı evler | Ev oluşturma, ev erişim akışlarıyla katılma, aktif ev değiştirme ve üyeliğe göre veri kapsamı |
| Borrow Center | Gelen, giden ve aktif ödünç kayıtları; net istek durumları |
| Personal Vault | Kimlikler, mülk belgeleri, erişim kodları ve hassas notlar için istemci tarafında şifrelenen vault akışı |
| Alışveriş Listesi | Manuel ve envantere bağlı alışveriş öğeleri, tamamlanan geçmişi ve düşük stok önerileri |
| Akıllı Bakım | Tekrarlayan eşya bakım görevleri, gecikme göstergeleri ve otomatik sonraki bakım tarihi hesaplama |
| Etiket ve tarama | Önce yerel envanteri kullanan, dış katalog aramasını onaya bağlayan barkod akışı; responsive Full HD barkod/QR tarama, desteklenen cihazlarda flaş/zoom, markalı eşya/kutu QR etiketleri, oda/raf etiketleri ve kesim çizgileri |
| Uyarılar ve servis | Düşük stok, son kullanma, garanti, bakım ve ödünç iade için odaklı takip ekranları |
| Yedekleme ve geri yükleme | Sadece ev sahibine açık standart/tam dışa ve içe aktarma; parola ile şifreleme, kutu metadata'sı, atamaları ve arşiv durumu ile isteğe bağlı medya/ek dosya kapsamı |
| Aktivite geçmişi | Düzenleme, stok değişimi, ek dosya, ödünç ve toplu işlemler için korumalı eşya aktivite kaydı |
| Kimlik doğrulama | JWT, Google OAuth, e-posta doğrulama, TOTP 2FA, güvenilen cihaz ve recovery key |
| Masaüstü Başlatıcı | Yerel kurulum, bağımlılık kontrolü, profil başlatma/durdurma, otomatik tarayıcı açma, yedekleme, log, gelişmiş ayarlar, port kontrolü, QR/LAN erişimi ve [mobil kamera için isteğe bağlı offline HTTPS](docs/offline-mobile-https.md) sunan Tauri GUI ve release paketleri |
| Çok dil | Fallback davranışı ve otomatik doğrulama kontrolleriyle 100+ seçilebilir arayüz locale paketi |

## Güvenlik & Gizlilik

- **AES-256-GCM şifreleme**, hassas envanter, auth ve profil alanlarını disk veya SQLite üzerine yazılmadan önce korur.
- **Şifreli medya işleme**, görsel metadata bilgisini temizler ve ham upload yerine korumalı medya blob depolar.
- **Şifreli aktivite kaydı**, eşya aktivite aksiyonlarını ve detaylarını SQLite'a yazmadan önce korur.
- **Ev kapsamlı yetkilendirme**, oda, kategori, eşya, medya ve yedek verilerini aktif ev üyeliğiyle sınırlar.
- **Bağımsız kutu ve eşya gizliliği**, ortak kutunun her üyenin özel eşyasını normal envanter görünümünde açığa çıkarmadan barındırmasını; kişisel kutu ve tam konumunun yalnızca oluşturan kişiye görünmesini sağlar. Ev sahibi yedeği felaket kurtarma için özel ev kayıtlarını da içerir; indirme penceresinde parola ile şifreleme varsayılan olarak açıktır.
- **Personal Vault ayrımı**, en hassas kayıtları normal ortak envanter akışlarının dışında tutar.
- **Rate limit ve sertleştirilmiş auth rotaları**, giriş, yedekleme ve etkileşimli uçlarda brute-force ve kötüye kullanım riskini azaltır.
- **Bağımlılık güvenliği bakımı**, yüksek seviye npm uyarılarını CI içinde kapalı tutar; kalan Tauri/GLib uyarısı upstream Linux launcher bağımlılığı olarak takip edilir.

> [!IMPORTANT]
> HomeInventory güçlü sunucu taraflı şifreleme kullanır; ancak ana envanter şifreleme anahtarı yine sunucu tarafından yönetilir. Veritabanına ve runtime secret'lara erişimi olan bir işletmeci korumalı envanter verilerini çözebilir. Ortak ev akışlarından daha güçlü ayrım gerektiren kayıtlar için Personal Vault kullanın.

## Mimari

```text
React SPA (Vite, PWA, Tailwind)
        |
        v
Express API (JWT, OAuth, rate limit)
        |
        v
SQLite depolama + şifreli medya
```

## Teknoloji Yığını

| Backend | Frontend |
| --- | --- |
| Node.js, Express, better-sqlite3 | React 19, Vite, Tailwind CSS |
| JWT, bcrypt, Passport Google OAuth 2.0 | React Router v8, react-i18next |
| Helmet, express-rate-limit, i18next | Lucide React, html5-qrcode |
| Sharp, şifreli medya depolama | PWA-ready responsive arayüz |

## Hızlı Başlangıç

Çalışma akışınıza en uygun kurulum yöntemini seçin:

### Seçenek A: Masaüstü GUI Başlatıcı

Yerel/self-host kullanım için masaüstü GUI başlatıcı; bağımlılıkları doğrulayabilir, yerel ortamı hazırlayabilir, veritabanı/yükleme klasörlerini profil bazında izole edebilir ve frontend ile backend servislerini tek pencereden çalıştırabilir.

1. **İndir:** [GitHub Releases](https://github.com/asdteke/HomeInventory/releases) sayfasına gidin ve işletim sisteminize uygun launcher paketini indirin (`macOS` için `.dmg`, `Windows` için `.exe`/`.msi`, `Linux` için `.AppImage`/`.deb`/`.rpm`).
2. **Kur ve Aç:** İndirdiğiniz uygulamayı kurup çalıştırın.
3. **Başlat:** **Launch HomeInventory** butonuna tıklayın. Başlatıcı portları kontrol eder, API ve UI servislerini açar, ardından yerel URL ile aynı ağdaki cihazlar için QR kod gösterir.

Yalıtım detayları ve gelişmiş ayarlar için [GUI_LAUNCHER.tr.md](GUI_LAUNCHER.tr.md) kılavuzuna bakın.

---

### Seçenek B: Terminal Kurulumu

#### Gereksinimler
- Node.js 22.22.0+
- npm 9+
- Git

#### 1. Bağımlılıkları kur
```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
npm run install-all
```

#### 2. Yerel ortam dosyasını oluştur
```bash
cp .env.example .env
```
`.env` dosyasının içine en az şu değerleri tanımlayın:
```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=uzun-ve-rastgele-bir-secret
APP_ENCRYPTION_KEY=32-byte-base64-veya-64-char-hex-key
APP_ENCRYPTION_KEY_ID=2026-03-local
```
> [!TIP]
> Güvenli secret'lar oluşturmak için `JWT_SECRET` tarafında `openssl rand -hex 32`, `APP_ENCRYPTION_KEY` tarafında `openssl rand -base64 32` kullanabilirsiniz.

#### 3. Uygulamayı çalıştır
```bash
npm run dev
```
- Frontend (Ön Yüz): `http://localhost:5173`
- Backend API (Arka Yüz): `http://localhost:3001`

#### 4. Production build al
```bash
npm run build
npm start
```

---

### Seçenek C: Docker Kurulumu

HomeInventory'yi önceden yapılandırılmış konteynerler ile hızlıca dağıtın:

```bash
docker compose up -d
```
Gelişmiş yapılandırma, reverse proxy kurulumu ve canlı ortam dağıtımları için [DOCKER.md](DOCKER.md) dosyasına bakın.

## Dokümantasyon

- [DOCKER.md](DOCKER.md): Docker, reverse proxy ve self-hosting notları
- [GUI_LAUNCHER.tr.md](GUI_LAUNCHER.tr.md): Masaüstü GUI başlatıcı kurulumu, yalıtım detayları ve geliştirici kılavuzu
- [README_ENVIRONMENT_SETUP.md](README_ENVIRONMENT_SETUP.md): ortam değişkenleri ve secret yönetimi kurulumu
- [CONTRIBUTING.md](CONTRIBUTING.md): katkı yönergeleri
- [SECURITY.md](SECURITY.md): güvenlik açığı bildirim süreci
- [CHANGELOG.md](CHANGELOG.md): sürüm geçmişi ve yükseltme notları
- [ROADMAP.md](ROADMAP.md): kısa vadeli proje yönü
- [docs/release-checklist.md](docs/release-checklist.md): release, imzalama, launcher ve artifact doğrulama listesi

Bakımcılar için önerilen GitHub topic'leri: `home-inventory`, `self-hosted`, `inventory-management`, `household`, `pwa`, `sqlite`, `express`, `react`, `docker`, `privacy`, `qr-code`, `barcode`, `2fa`.

## Dil Notu

Ürün **100+ seçilebilir arayüz locale paketi** ile gelir. English ve Türkçe en aktif gözden geçirilen ürün dilleridir; diğer dillerde eksik çeviri olduğunda anahtar bazlı fallback çalışabilir.

## Katkıda Bulunma

Issue ve pull request'ler açıktır. Daha büyük değişiklikler için önce issue açmanız iyi olur; böylece uygulama güvenlik modeli, ev kapsamı ve lokalizasyon yapısıyla uyumlu kalır.

## Yasal Not

HomeInventory bağımsız bir açık kaynak projesidir. Benzer isim kullanan herhangi bir ticari ürün veya şirketle bağlantılı, onlar tarafından desteklenen ya da onlara bağlı değildir.

## Lisans

MIT. Detaylar için [LICENSE](LICENSE).
