# v0 Handoff Guide for HomeInventory

Bu rehberin amacı v0'a tasarım üretirken mevcut HomeInventory metinlerini korutmak.

## Temel Kural

v0'a sadece "tasarla" deme. Mutlaka şu kuralı ekle:

`Do not rewrite, shorten, simplify, or replace product copy unless explicitly marked as optional. Preserve existing labels, headings, CTA text, helper text, and feature wording from the provided source files.`

## v0'a Nasıl Vereceksin

En iyi sıra:

1. Önce ana prompt'u ver.
2. Sonra içerik kaynağı olarak dosyaları ekle.
3. Sonra ayrıca "copy lock" mesajı gönder.

Eğer v0 arayüzünde dosya yükleme varsa:

- Bu dosyaları yükle:
  - `client/src/locales/en/translation.json`
  - `client/src/components/LandingPage.jsx`
  - `client/src/components/Login.jsx`
  - `client/src/components/Register.jsx`
  - `client/src/components/Dashboard.jsx`
  - `client/src/components/ItemList.jsx`
  - `client/src/components/Settings.jsx`

Eğer dosya yükleme yoksa:

- Bu dosyalardan ilgili bölümleri kopyalayıp prompt altına yapıştır.
- En önemlisi `translation.json` içindeki metinler.

## v0 Composer'a Yapıştırılacak Ana Mesaj

```text
Design a modern, clean, light premium UI for HomeInventory.

Important constraints:
- Preserve the existing product structure and current features.
- Do not remove workflows.
- Do not rewrite product copy unless I explicitly ask.
- Use the provided source files as the source of truth for labels, headings, button text, helper text, and feature wording.
- Focus on visual redesign, hierarchy, spacing, layout, and component styling.
- Keep the app implementation-friendly in React + Tailwind style.

Design direction:
- modern
- clean
- warm neutral palette
- refined and premium, but not flashy
- calm, trustworthy, home-oriented
- avoid generic SaaS look
- avoid purple-heavy styling
- avoid excessive gradients
- desktop and mobile responsive

Screens to redesign:
- Landing page
- Login
- Register
- Dashboard
- Inventory list
- Settings

Preserve these feature areas in the design:
- multi-house / household sharing
- inventory items with quantity, room, category, location, privacy state
- barcode / QR flows
- personal vault
- security / recovery / 2FA
- backup / restore
- admin access
- multilingual product

Use the attached files as source of truth for content and product behavior.
Do not invent new marketing copy when existing copy already exists in the source files.
```

## v0 Composer'a Ardından Yapıştırılacak Copy Lock Mesajı

```text
Copy lock rules:

1. Use the exact existing text from the attached source files whenever possible.
2. Do not paraphrase headings.
3. Do not replace CTA labels.
4. Do not shorten descriptions.
5. If a text is missing, mark it clearly instead of inventing a new product message.
6. Visual redesign is allowed. Copy rewrite is not allowed.
```

## En Sağlıklı Kullanım Şekli

Landing için ayrı bir v0 oturumu aç:

- kaynak dosyalar:
  - `client/src/components/LandingPage.jsx`
  - `client/src/locales/en/translation.json`

Auth için ayrı oturum aç:

- kaynak dosyalar:
  - `client/src/components/Login.jsx`
  - `client/src/components/Register.jsx`
  - `client/src/locales/en/translation.json`

App shell / dashboard için ayrı oturum aç:

- kaynak dosyalar:
  - `client/src/components/Dashboard.jsx`
  - `client/src/components/ItemList.jsx`
  - `client/src/components/Settings.jsx`
  - `client/src/locales/en/translation.json`

Bu şekilde v0 daha az karışır ve copy'yi bozma ihtimali düşer.

## Özellikle Söylemen Gereken Cümle

```text
Treat attached code and translation files as locked product content. Redesign the UI, not the wording.
```

## Not

En güçlü metin kaynağı:

- `client/src/locales/en/translation.json`

Çünkü v0 JSX içinden bazen yapıyı anlar ama metni serbestçe yeniden yazmaya kalkabilir. Bu yüzden çeviri dosyası mutlaka eklenmeli.
