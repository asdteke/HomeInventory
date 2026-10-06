# HomeInventory Masaüstü GUI Başlatıcı (Beta)

HomeInventory Masaüstü Başlatıcı, **Tauri**, **React** ve **TypeScript** ile geliştirilmiş isteğe bağlı, platformlar arası bir masaüstü uygulamasıdır. Yerel/self-host kullanıcıların HomeInventory'yi başlatmasına, yerel profilleri yönetmesine, logları incelemesine, yedek almasına ve sık kullanılan ortam ayarlarını grafik arayüzden düzenlemesine yardımcı olur.

Launcher normal açık kaynak akışının yerine geçmez:

```bash
npm run install-all
npm run dev
```

CLI ve Docker hâlâ birinci sınıf kurulum yollarıdır. Launcher, masaüstü kontrol paneli tercih eden kullanıcılar için bir kolaylık katmanıdır.

## Öne Çıkan Özellikler

- **Tek tıkla yerel başlat/durdur:** HomeInventory'yi başlatır ve durdurur. Launcher tarafından yönetilen kurulumlar, hazır derlenmiş arayüzle production sunucusunu tek portta çalıştırır; özel kaynak klasörleri API ve Vite geliştirme düzenini korur.
- **Profil yalıtımı:** Launcher tarafından yönetilen profiller ayrı veri, SQLite, upload ve şifreli medya yolları kullanır.
- **Bağımlılık doğrulama:** Node.js ve npm'i algılar; macOS/Linux GUI PATH ve Windows path çözümleme sorunlarını hesaba katar.
- **Port ve LAN kontrolü:** Başlatmadan önce yerel portları doğrular, aynı ağdaki cihazlar için QR kod gösterir.
- **İsteğe bağlı offline mobil HTTPS:** Desteklenen telefon tarayıcılarının alan adı veya harici sertifika servisi olmadan kamera izni alabilmesi için launcher'a özel CA, süreli kurulum bağlantıları ve HTTPS LAN geçidi oluşturur. Normal HTTP varsayılan olarak kullanılmaya devam eder.
- **Beş launcher dili:** İngilizce, Türkçe, Almanca, İspanyolca ve Fransızca doğrudan launcher içinden seçilir ve yerel olarak hatırlanır.
- **Otomatik yerel geçiş:** Servisler hazır olduğunda yerel HomeInventory URL'sini tarayıcıda açabilir.
- **Entegre loglar:** Kurulum, backend, frontend ve launcher loglarını tek panelde toplar.
- **Yedekleme:** Launcher tarafından yönetilen profiller için yerel yedek oluşturur.
- **Gelişmiş ayarlar:** E-posta/admin bootstrap değerlerini, API/UI portlarını ve otomatik algılama yetmediğinde proje kökü, Node yolu veya npm yolu override ayarlarını yönetir.

## Güvenlik Modeli

- **React'ten rastgele shell yok:** React arayüzü işletim sistemine doğrudan rastgele komut göndermez.
- **Rust komut sınırı:** Süreç yönetimi, yedekleme, dosya yazma, path seçimi ve URL açma işlemleri doğrulanmış Tauri komutlarından geçer.
- **Minimal yetkiler:** Launcher, frontend tarafında geniş shell/dosya sistemi izinleri kullanmaz.
- **Süreç temizliği:** Launcher tarafından yönetilen servis process group'ları servis durdurulduğunda veya launcher kapandığında temizlenir.
- **İzole runtime yolları:** Profiller ayrı `HOMEINVENTORY_DATA_DIR`, `HOMEINVENTORY_DB_PATH` ve `HOMEINVENTORY_UPLOADS_DIR` değerleri kullanır.
- **Özel sertifika saklama:** CA ve sunucu özel anahtarları launcher uygulama-verisi dizininde, yönetilen uygulama arşivleri ile HomeInventory yedeklerinin dışında kalır. Telefona yalnızca herkese açık CA sunulur.

## Kurulum

Çoğu kullanıcı için başlatıcıyı kaynak koddan derlemeye gerek yoktur. [GitHub Releases](https://github.com/asdteke/HomeInventory/releases) sayfasına gidip işletim sisteminize uygun launcher paketini indirin:

- **macOS:** `.dmg` veya `.app.zip`
- **Windows:** `.exe` veya `.msi`
- **Linux:** `.AppImage`, `.deb` veya `.rpm`

İlk açılışta launcher **HomeInventory'yi Kur** butonunu gösterir. Launcher ile birlikte gelen HomeInventory sürümünü kurar ve ardından bir kez başlatır. Sonrasında **HomeInventory'yi Başlat** butonuna tıklayın: launcher portları kontrol eder, uygulamayı başlatır, arayüz gerçekten sunulana kadar bekler ve ardından yerel URL ile aynı ağdaki cihazlar için QR kod gösterir.

### İlk Kurulum ve Çalışma Modları

- **İlk kurulum:** Launcher, paketli uygulamayı launcher veri klasörüne (`managed-app/versions/<sürüm>`) açar, taşınabilir Node.js çalışma ortamını indirir ve yalnızca sunucu için `npm ci --omit=dev` çalıştırır. Arayüz arşivde hazır derlenmiş olarak gelir (`client/dist`); bu yüzden istemci bağımlılıklarına veya Vite derlemesine gerek yoktur. Bu adım bir kez internet bağlantısı ister ve genellikle bir ila üç dakika sürer. Kurulum sırasında uygulama başlatılıp durdurulmaz; kurulum başarılı olduktan sonra bir kez başlatılır.
- **Production modu (launcher tarafından yönetilen kurulumlar ve HomeInventory Local için varsayılan):** `NODE_ENV=production node server.js`, API'yi ve hazır arayüzü tek portta (varsayılan 3001) sunar. Launcher, uygulamayı hazır saymadan veya tarayıcıyı açmadan önce `/api/health` ve uygulama kabuğu için 120 saniyeye kadar bekler.
- **Geliştirme modu (özel kurulum klasörleri ve `client/dist` içermeyen eski yönetilen kurulumlar):** Launcher, daha önce olduğu gibi ayrı API ve arayüz portlarıyla `scripts/dev.mjs` çalıştırmaya devam eder. Repository içindeki `npm run dev` değişmez.
- **Özel klasör:** İlk kurulum ekranındaki **Özel bir kurulum klasörü kullan** seçeneği (veya **Geliştirici Araçları > Ayarlar > Kurulum klasörü**), seçtiğiniz bir klasöre kurma veya oradan çalıştırma davranışını korur.
- Kullanıcı verileri, profil verileri ve launcher yapılandırması önceki launcher uygulama-verisi konumlarında kalır.
- Launcher'ın başlattığı her sunucu sürecine `UPDATE_CHECK=false` verilir; böylece uygulamanın kendi GitHub sürüm kontrolü atlanır ve güncellemeleri launcher yönetir.

### İsteğe Bağlı Güncellemeler

Güncellemeler **HomeInventory'yi Başlat** butonunu hiçbir zaman engellemez veya onun yerine geçmez: Başlat her zaman kurulu sürümü çalıştırır. Güncelleme varsa launcher ayrı bir güncelleme kartında üç seçenek sunar:

- **Şimdi Güncelle** güncellemeyi kurar. Doğrulanmış çevrim içi bir sürümde önce yedek alır, yönetilen uygulamayı kurar ve ardından eşleşen launcher güncellemesini uygular (uygulama ve launcher birlikte yayımlanır).
- **Daha Sonra** öneriyi launcher yeniden açılana kadar gizler.
- **Bu Sürümü Atla** o sürümü kalıcı olarak gizler (launcher ayarlarına kaydedilir). Daha yeni bir sürüm yine önerilir. Karttaki **Güncellemeyi Göster** veya **Geliştirici Araçları > Güncellemeler**, atlanan ya da ertelenen güncellemeyi geri getirir.

Launcher'ın içinde gelen uygulama isteğe bağlı değildir. Daha yeni bir launcher kurduğunuzda, hiçbir şey çalışmıyorsa yönetilen uygulamayı otomatik olarak aynı sürüme getirir (uygulama dosyalarını değiştirir ve durmuş halde biter). Böylece launcher ile uygulama her zaman aynı sürümde olur.

Launcher açılırken güncellemeleri yine kontrol eder, ancak yalnızca kontrol eder; **Şimdi Güncelle** seçilmeden hiçbir şey indirilmez veya kurulmaz.

### İsteğe Bağlı Uygulama Penceresi (Beta)

Launcher varsayılan olarak HomeInventory'yi tarayıcınızda açar ve klasik launcher değişmeden kalır. HomeInventory'yi bir launcher penceresi içinde kullanmak için **Geliştirici Araçları > Ayarlar > Uygulama penceresi (beta)** seçeneğini açın.

- HomeInventory hazır olduğunda (veya **Uygulama Penceresini Aç** butonuna tıkladığınızda) launcher, daraltılabilir kenar çubuklu bir HomeInventory penceresi açar ve klasik launcher penceresini gizler.
- Kenar çubuğu durumu ve portu gösterir; **Başlat**, **Durdur**, **Yeniden Başlat**, **Tarayıcıda aç**, **Günlükler**, **Güncellemeler** ve **Ayarlar** (son ikisi klasik launcher'ı ilgili panelde açar) ile uygulama modunu yeniden kapatan **Klasik launcher'a dön** seçeneklerini sunar.
- Uygulama penceresini kapatmak klasik launcher'ı geri getirir ve HomeInventory'yi çalışır durumda bırakır. Klasik launcher'ı kapatmak ise yine HomeInventory'yi durdurur ve uygulama penceresini de kapatır.
- Uygulama, kendi webview'ında normal bir yerel sayfa olarak çalışır. Launcher komutlarını yalnızca kenar çubuğu çağırabilir (`capabilities/app-sidebar.json`); HomeInventory sayfasının launcher erişimi yoktur, yerel uygulamada kalır ve açılır pencere ya da başka siteler açamaz.
- Sınırlamalar: İşletim sisteminin webview'ına bağlı olarak kamera, dosya indirmeleri, açılır pencereler ve başka sitelere giden bağlantılar uygulama penceresinde çalışmayabilir. Barkod taraması ve bu durumlar için **Tarayıcıda aç** seçeneğini kullanın. Uygulama penceresi, Tauri'nin hâlâ kararsız (unstable) olarak işaretlediği çoklu webview API'sini kullanır.

LAN IP adresinde canlı mobil kamera erişimi güvenli tarayıcı bağlamı gerektirir. İsteğe bağlı, alan adsız kurulum ile güven/rotasyon sınırları [Offline Mobil HTTPS](docs/offline-mobile-https.md) belgesinde açıklanır.

## Kaynak Koddan Derleme

Tauri geliştirmesi için yerel derleme gereksinimlerini kurun:

- **macOS:** Xcode Komut Satırı Araçları (`xcode-select --install`)
- **Windows:** Microsoft C++ Derleme Araçları (Visual Studio Build Tools)
- **Linux:** `build-essential`, WebKitGTK 4.1 geliştirme paketleri, GTK/AppIndicator geliştirme paketleri ve `curl`

Repository ana dizininden:

```bash
npm run launcher:install
npm run launcher:dev
```

Bulunduğunuz platform için production masaüstü paketi oluşturun:

```bash
npm run launcher:build
```

Çapraz platform release paketleri `Launcher Packages` GitHub Actions workflow'u ile native macOS, Windows ve Linux runner'larında üretilir.

## Profil Dizinlerinin Yalıtılması

GUI üzerinden bir profil başlatıldığında launcher runtime verilerini app-data klasörlerine yönlendirir:

```text
Launcher app data
└── profiles/
    └── homeinventory/
        ├── data/
        │   └── inventory.db
        ├── uploads/
        └── env/
            └── launcher-secrets.env
```

Aktif süreç eşdeğer runtime değişkenlerini alır:

```env
HOMEINVENTORY_DATA_DIR=<launcher-app-data>/profiles/homeinventory/data
HOMEINVENTORY_DB_PATH=<launcher-app-data>/profiles/homeinventory/data/inventory.db
HOMEINVENTORY_UPLOADS_DIR=<launcher-app-data>/profiles/homeinventory/uploads
```

Bu yapı, kullanıcı açıkça yolları değiştirmediği sürece launcher tarafından yönetilen yerel çalıştırmaları normal repository `.env`, veritabanı ve uploads klasöründen ayrı tutar.

Launcher ayrıca `UPDATE_CHECK=false` ayarlar: HomeInventory'yi kendisi güncellediği için yönetici panelindeki GitHub yeni sürüm bildirimi (Docker ve komut satırı kurulumları içindir) kapalıdır ve GitHub'a hiç istek gönderilmez.

Sunucunun kendi otomatik yedekleri (**Yönetim paneli → Yedekler**) profil içinde, `inventory.db` dosyasının yanındaki `data/backups/` klasörüne yazılır. Launcher sunucuyu kendiliğinden yeniden başlatmaz. Yönetim panelinde bir geri yükleme hazırladıktan sonra, uygulanması için profili launcher'da durdurup yeniden başlatın. Bu yedekler `uploads/` klasörünü içermez ve yalnızca profilin şifreleme anahtarıyla kullanılabilir. Bu yüzden launcher'ın kendi yedeklerini de saklayın.

## Release Paketleme

Launcher, kaynak kod arşivinden ayrı release artifact'ları olarak paylaşılır:

```text
GitHub Release v2.7.0
├── HomeInventory.Launcher-macos.dmg
├── HomeInventory.Launcher-macos.app.zip
├── HomeInventory.Launcher_2.7.0_x64-setup.exe
├── HomeInventory.Launcher_2.7.0_x64_en-US.msi
├── HomeInventory.Launcher_2.7.0_amd64.AppImage
├── HomeInventory.Launcher_2.7.0_amd64.deb
└── HomeInventory.Launcher-2.7.0-1.x86_64.rpm
```

`Launcher Packages` GitHub Actions workflow'u bu paketleri native macOS, Windows ve Linux runner'larında üretilir. Tag push edildiğinde paketler normal kaynak kod arşivinin yanında eşleşen GitHub Release'e otomatik eklenir. Linux paketleri, Tauri patched GLib zincirine geçene kadar Tauri'nin mevcut GTK3/GLib bağımlılık hattını miras almaya devam eder.

## Sorun Giderme

### 1. macOS: "EPERM: operation not permitted, uv_cwd" Hatası veya Arka Planda Başlamama
Eğer launcher arayüzü açılıyor ancak **Launch HomeInventory** butonuna bastıktan sonra konsol loglarında `EPERM` veya `uv_cwd` hatası görüyorsanız ve durum "HomeInventory is starting" yazısında takılı kalıyorsa:
* **Uygulamayı DMG içinden çalıştırmayın:** DMG dosyasını açın, `HomeInventory Launcher` uygulamasını sürükleyip **`/Applications` (Uygulamalar)** klasörüne kopyalayın. Ardından DMG diskini çıkartın.
* **Karantina Kilidini Kaldırın:** Terminal uygulamasını açıp şu komutu çalıştırın:
  ```bash
  xattr -cr /Applications/HomeInventory\ Launcher.app
  ```
* **"Belgeler" (Documents) Klasör İzni:** Proje klasörünüz `Belgeler`, `Masaüstü` gibi korumalı sistem klasörlerinin altındaysa macOS erişimi kısıtlıyor olabilir:
  - **Sistem İzni Verin:** *Sistem Ayarları > Gizlilik ve Güvenlik > Dosyalar ve Klasörler* menüsüne gidin ve *HomeInventory Launcher* altındaki *Belgeler Klasörü* iznini açın.
  - **Alternatif (Önerilen):** Proje klasörünü `Documents` dışına, örneğin doğrudan kullanıcı ana dizininize (`/Users/<kullanıcıadınız>/HomeInventory`) taşıyın ve launcher ayarlarından bu yeni yolu seçin. Bu sayede macOS klasör korumalarını tamamen bypass etmiş olursunuz.

### 2. Windows: Mavi "SmartScreen" Engeli
İmzasız açık kaynak kodlu paketlerde Windows koruma ekranı gösterebilir. Bu engeli aşmak için:
* `.exe` dosyasını çalıştırdığınızda çıkan ekranda **Daha fazla bilgi (More info)** yazısına tıklayın.
* Beliren **Yine de çalıştır (Run anyway)** butonuna tıklayın. Bu işlem sadece o dosya için bir defaya mahsustur.
