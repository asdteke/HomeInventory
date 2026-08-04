# HomeInventory Local Microsoft Store Listing Assets

This file collects the screenshot prompt and English Store listing copy for the first Microsoft Store submission of HomeInventory Local.

## Windows Codex Screenshot Prompt

Send this prompt to the Windows 11 Codex thread:

```text
HomeInventory Local Microsoft Store submission screenshots hazırlamanı istiyorum.

Amaç:
Microsoft Partner Center Store listing için temiz, profesyonel PNG screenshot seti üret.

Kurallar:
- Uygulama dili English olsun.
- Gerçek kişisel veri, gerçek email, gerçek adres, gerçek IP/QR, gerçek ürün fotoğrafı kullanma.
- Demo veriler kullan: Kitchen, Storage Room, Living Room, Laptop, Coffee Maker, Winter Box, First Aid Kit gibi.
- Screenshotlarda hata, terminal, dev tool, localhost URL, Codex, Windows görev çubuğu, özel dosya yolu görünmesin.
- Görüntüler 16:9 PNG olsun. Ekran 4K ise 3840x2160 olarak al. Eğer sorun olursa 1920x1080'e düşür.
- UI rahat okunur olsun; Windows display scaling gerekiyorsa %150 veya %175 kullan.
- Pencere tam ekrana yakın olsun.
- Eğer launcher ekranında LAN/QR/IP görünüyorsa onu screenshot'a alma veya gizle.
- Son çıktıları tek klasöre koy:
  C:\Users\<USER>\Desktop\HomeInventory-Store-Screenshots-20260615
- Dosyaları şu isimlerle kaydet:
  01-launch-homeinventory-local.png
  02-dashboard-overview.png
  03-add-inventory-item.png
  04-item-detail-media.png
  05-rooms-and-categories.png
  06-settings-backup-security.png
- Sonra klasörü zip yap:
  HomeInventory-Store-Screenshots-20260615.zip

İstenen screenshot sahneleri:
1. HomeInventory Local launcher: sade launch/ready ekranı. Güncelleme/GitHub/LAN alanı görünmesin.
2. Main dashboard: inventory summary, rooms/categories, recent items gibi uygulamanın ana değerini göster.
3. Add inventory item form: item name, room, category, quantity, optional barcode/warranty fields görünsün.
4. Item detail/media: bir demo item detail ekranı, fotoğraf/media alanı, notlar veya warranty bilgisi görünsün.
5. Rooms/categories/list view: ev eşyalarının organize edildiği liste/grid görünümü.
6. Settings/backup/security: local data, backup/export, security/privacy ayarlarını gösteren ekran.

Kontrol:
- Her PNG'yi açıp okunabilirlik, kırpılma, özel veri ve hata olmadığını kontrol et.
- Zip'i oluşturduktan sonra bana klasör yolunu ve zip yolunu bildir.
```

## Store Listing Copy

Use English only for the first submission, because the launcher is not fully localized to Turkish yet.

### Short Description

```text
A local-first household inventory app for organizing rooms, items, photos, warranties, and backups on your Windows device.
```

### Description

```text
HomeInventory Local helps you organize household items, rooms, categories, photos, warranty details, and important records from a self-contained Windows app.

The Microsoft Store version is designed for local-first use. It includes its own runtime and does not require users to install Node.js or development tools. App updates are delivered through Microsoft Store.

Use HomeInventory Local to:
- Create a structured inventory of household items
- Organize items by home, room, and category
- Add notes, quantities, purchase details, and warranty information
- Attach item photos and related media
- Keep important records in a more private Personal Vault area
- Create and restore local backups
- Optionally use barcode/product lookup when network access is available

HomeInventory Local stores application data on your device. Optional features such as barcode/product lookup, Google Sign-In, email delivery, or same-network access may use network services only when configured or triggered by the user.
```

### Search Terms

```text
home inventory, household inventory, inventory manager, item tracker, room organizer, local inventory, warranty tracker, home organization, belongings, personal inventory
```

### Release Notes

```text
Initial Microsoft Store release of HomeInventory Local. This version includes a self-contained Windows runtime, local-first inventory management, media support, backups, and Microsoft Store based updates.
```

### Copyright / Additional License Info

```text
Copyright 2026 HomeInventory contributors. HomeInventory Local includes open-source components subject to their respective licenses.
```

## Package Reminder

Use the Cloudflare-free MSI URL in Partner Center:

```text
https://packages.example.invalid/store-packages/homeinventory-local/2.6.2/HomeInventory-Local-2.6.2-x64-en-US.msi
```

Package settings:

```text
Architecture: x64
App type: MSI
Installer parameters: /qn
Languages: English
```

Return codes:

```text
Installation cancelled by user: 1602
Application already exists: 1638
Installation already in progress: 1618
Disk space is full: 112
Reboot required: 3010
Installation successful: 0
```
