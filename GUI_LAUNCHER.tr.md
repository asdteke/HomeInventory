# HomeInventory Masaüstü GUI Başlatıcı (Beta)

HomeInventory Masaüstü Başlatıcı, **Tauri**, **React** ve **TypeScript** ile geliştirilmiş isteğe bağlı, platformlar arası bir masaüstü uygulamasıdır. Yerel/self-host kullanıcıların HomeInventory'yi başlatmasına, yerel profilleri yönetmesine, logları incelemesine, yedek almasına ve sık kullanılan ortam ayarlarını grafik arayüzden düzenlemesine yardımcı olur.

Launcher normal açık kaynak akışının yerine geçmez:

```bash
npm run install-all
npm run dev
```

CLI ve Docker hâlâ birinci sınıf kurulum yollarıdır. Launcher, masaüstü kontrol paneli tercih eden kullanıcılar için bir kolaylık katmanıdır.

## Öne Çıkan Özellikler

- **Tek tıkla yerel başlat/durdur:** HomeInventory API ve Vite istemcisini birlikte başlatır ve durdurur.
- **Profil yalıtımı:** Launcher tarafından yönetilen profiller ayrı veri, SQLite, upload ve şifreli medya yolları kullanır.
- **Bağımlılık doğrulama:** Node.js ve npm'i algılar; macOS/Linux GUI PATH ve Windows path çözümleme sorunlarını hesaba katar.
- **Port ve LAN kontrolü:** Başlatmadan önce yerel portları doğrular, aynı ağdaki cihazlar için QR kod gösterir.
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

## Kurulum

Çoğu kullanıcı için başlatıcıyı kaynak koddan derlemeye gerek yoktur. [GitHub Releases](https://github.com/asdteke/HomeInventory/releases) sayfasına gidip işletim sisteminize uygun launcher paketini indirin:

- **macOS:** `.dmg` veya `.app.zip`
- **Windows:** `.exe` veya `.msi`
- **Linux:** `.AppImage`, `.deb` veya `.rpm`

Launcher açıldıktan sonra **Launch HomeInventory** butonuna tıklayın. Başlatıcı bağımlılıkları ve portları kontrol eder, backend ile frontend'i başlatır, ardından yerel URL ve aynı ağdaki cihazlar için QR kod gösterir.

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

## Release Paketleme

Launcher, kaynak kod arşivinden ayrı release artifact'ları olarak paylaşılır:

```text
GitHub Release v2.2.0
├── HomeInventory.Launcher-macos.dmg
├── HomeInventory.Launcher-macos.app.zip
├── HomeInventory.Launcher_2.2.0_x64-setup.exe
├── HomeInventory.Launcher_2.2.0_x64_en-US.msi
├── HomeInventory.Launcher_2.2.0_amd64.AppImage
├── HomeInventory.Launcher_2.2.0_amd64.deb
└── HomeInventory.Launcher-2.2.0-1.x86_64.rpm
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
