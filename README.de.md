<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-full-dark.svg" />
    <img src="client/public/brand/logo-full-light.svg" alt="HomeInventory Logo" width="420" />
  </picture>
</p>

<h1 align="center">HomeInventory</h1>

<!-- Release status: v2.1.2 release line. -->

<p align="center">
  <strong>Private, selbst hostbare Haushaltsinventur für gemeinsam genutzte Zuhause.</strong><br/>
  Verwalte Gegenstände, Garantien, Dokumente, Ausleihen und sensible persönliche Datensätze in einer ruhigen React-App.
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
  <a href="#vorschau">Vorschau</a> ·
  <a href="#warum-homeinventory">Warum</a> ·
  <a href="#funktionen">Funktionen</a> ·
  <a href="#sicherheit--datenschutz">Sicherheit</a> ·
  <a href="#schnellstart">Schnellstart</a> ·
  <a href="#dokumentation">Docs</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

## Vorschau

<p align="center">
  <img src="docs/assets/screenshot-landing.png" alt="HomeInventory Landingpage-Vorschau" width="82%" />
</p>

<details>
<summary><strong>Weitere Screenshots: Inventar, Borrow Center, Vault, Kategorien</strong></summary>

<br/>

<p align="center">
  <img src="docs/assets/screenshot-inventory.png" alt="Inventaransicht" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-borrow.png" alt="Borrow Center Ansicht" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-vault.png" alt="Personal Vault Ansicht" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-categories.png" alt="Kategorienansicht" width="82%" />
</p>

</details>

HomeInventory ist für Familien, Wohngemeinschaften und kleine Haushalte gedacht, die ein praktisches Inventar brauchen, ohne private Datensätze in eine gemeinsame Tabelle zu verwandeln.

> [!NOTE]
> **v2.1.2 bringt native mobile Kamera-Foto-Unterstützung.** Diese Version fügt eine direkte Hardware-Kamera-Integration (`capture="environment"`) für Artikel- und Rechnungsuploads hinzu, während benutzerdefinierte Dateigalerie-Uploads beibehalten werden und eine 100%ige Lokalisierungsparietät über alle 100+ unterstützten Sprachen hinweg gewahrt bleibt.

## Warum HomeInventory

- **Ein Haushalt, mehrere Personen:** Haushalte erstellen oder beitreten, den aktiven Haushalt wechseln und gemeinsames Inventar auf die richtige Mitgliedschaft begrenzen.
- **Echte Gegenstandsdatensätze:** Fotos, Räume, Standorte, Kategorien, Mengen, Garantiedaten, Rechnungsdaten, Notizen und Anhänge erfassen.
- **TypeScript-gestützter Client:** Die React-Oberfläche läuft jetzt auf einer TypeScript/Vite-Codebasis, mit besserem Editor-Feedback, sichereren Refactorings und Build-Zeit-Prüfungen.
- **Ein besserer Ort für sensible Daten:** Personal Vault hält sehr private Datensätze von normaler Haushaltssuche und Zusammenarbeit getrennt.
- **Schnelle Suche im Alltag:** Suche, Barcode-Scan, QR-Etiketten und mobile Ansichten helfen direkt vor dem Regal.
- **Bereit fürs Self-Hosting:** Express, SQLite, Docker-Support, Umgebungsdokumentation und Secret-Loading für Produktion sind enthalten.

## Funktionen

| Bereich | Abdeckung |
| --- | --- |
| Inventar | Gegenstände, Fotos, Räume, Kategorien, Standorte, Mengen, Garantie- und Rechnungsmetadaten |
| Gemeinsame Haushalte | Haushalte erstellen, per Zugriffsfluss beitreten, aktiven Haushalt wechseln und Daten nach Mitgliedschaft begrenzen |
| Borrow Center | Eingehende, ausgehende und aktive Ausleihen mit klaren Anfragezuständen |
| Personal Vault | Clientseitig verschlüsselter Vault-Flow für Ausweise, Eigentumsdokumente, Zugriffscodes und sensible Notizen |
| Einkaufsliste | Manuelle und inventarverknüpfte Einkaufseinträge, Verlauf erledigter Einträge und Vorschläge bei niedrigem Bestand |
| Intelligente Wartung | Wiederkehrende Pflegeaufgaben, Überfälligkeitsanzeigen und automatische Berechnung des nächsten Fälligkeitsdatums |
| Labels und Scan | Barcode-Scan, Gegenstands-QR-Etiketten und mobiler Schnellzugriff |
| Backup und Restore | Export/Import nur für Eigentümer mit geschützten Bestätigungsabläufen |
| Auth und Wiederherstellung | JWT, Google OAuth, E-Mail-Verifizierung, TOTP 2FA, vertrauenswürdige Geräte und Recovery Keys |
| Desktop Launcher | Optionales Tauri-GUI für lokale Einrichtung, Abhängigkeitsprüfungen, Profil-Start/Stopp, Backups, Logs und QR/LAN-Zugriff |
| Internationalisierung | 100+ auswählbare UI-Locale-Pakete mit Fallback-Verhalten und automatisierten Prüfungen |

## Sicherheit & Datenschutz

- **AES-256-GCM-Verschlüsselung** schützt sensible Inventar-, Auth- und Profildaten, bevor sie auf Datenträger oder SQLite geschrieben werden.
- **Verschlüsselte Medienverarbeitung** entfernt Bildmetadaten und speichert geschützte Medien-Blobs statt roher Uploads.
- **Haushaltsgebundene Autorisierung** begrenzt Räume, Kategorien, Gegenstände, Medien und Backups auf die aktive Haushaltsmitgliedschaft.
- **Personal-Vault-Trennung** hält besonders sensible Datensätze außerhalb der normalen gemeinsamen Inventarflüsse.
- **Rate Limiting und gehärtete Auth-Routen** reduzieren Brute-Force- und Missbrauchsrisiken bei Login, Backup und interaktiven Endpunkten.

> [!IMPORTANT]
> HomeInventory nutzt starke serverseitige Verschlüsselung, aber der Hauptschlüssel für das Inventar wird weiterhin vom Server verwaltet. Ein Betreiber mit Zugriff auf Datenbank und Runtime-Secrets kann geschützte Inventardaten entschlüsseln. Nutze Personal Vault für Datensätze, die stärker von gemeinsamen Haushaltsabläufen getrennt sein müssen.

## Architektur

```text
React SPA (Vite, PWA, Tailwind)
        |
        v
Express API (JWT, OAuth, Rate Limiting)
        |
        v
SQLite-Speicher + verschlüsselte Medien
```

## Technologie-Stack

| Backend | Frontend |
| --- | --- |
| Node.js, Express, better-sqlite3 | React 18, Vite, Tailwind CSS |
| JWT, bcrypt, Passport Google OAuth 2.0 | React Router v6, react-i18next |
| Helmet, express-rate-limit, i18next | Lucide React, html5-qrcode |
| Sharp, verschlüsselte Medienspeicherung | PWA-ready responsive UI |

## Schnellstart

Wähle die Einrichtungsmethode, die am besten zu deinem Workflow passt:

### Option A: Desktop GUI Launcher

Für lokale oder selbst gehostete Nutzung kann der Desktop GUI Launcher Abhängigkeiten prüfen, eine lokale Umgebung konfigurieren, Datenbank und Uploads pro Profil isolieren und Frontend- sowie Backend-Dienste aus einem Fenster starten.

1. **Herunterladen:** Öffne die [GitHub Releases](https://github.com/asdteke/HomeInventory/releases) und lade das Launcher-Paket für dein Betriebssystem herunter (`.dmg` für macOS, `.exe`/`.msi` für Windows, `.AppImage`/`.deb`/`.rpm` für Linux).
2. **Installieren & Öffnen:** Installiere und starte die Anwendung.
3. **Starten:** Klicke auf **Launch HomeInventory**. Der Launcher prüft Ports, startet API und UI und zeigt danach die lokale URL sowie einen QR-Code für Geräte im selben Netzwerk.

Details zur Isolation und zu erweiterten Einstellungen findest du in [GUI_LAUNCHER.md](GUI_LAUNCHER.md).

---

### Option B: Terminal-Setup

#### Voraussetzungen

- Node.js 18+
- npm 9+
- Git

#### 1. Abhängigkeiten installieren

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
npm run install-all
```

#### 2. Lokale Umgebungsdatei erstellen

```bash
cp .env.example .env
```

Setze mindestens diese Werte in `.env`:
```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=ein-langer-zufaelliger-secret-wert
APP_ENCRYPTION_KEY=32-byte-base64-oder-64-char-hex-key
APP_ENCRYPTION_KEY_ID=2026-03-local
```
> [!TIP]
> Sichere Secrets kannst du mit `openssl rand -hex 32` für `JWT_SECRET` und `openssl rand -base64 32` für `APP_ENCRYPTION_KEY` erzeugen.

#### 3. App starten

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

#### 4. Produktions-Build erstellen

```bash
npm run build
npm start
```

---

### Option C: Docker-Setup

Stelle HomeInventory schnell mit vorkonfigurierten Containern bereit:

```bash
docker compose up -d
```
Für erweiterte Konfiguration, Reverse Proxy und Production-Deployment siehe [DOCKER.md](DOCKER.md).

## Dokumentation

- [DOCKER.md](DOCKER.md): Docker, Reverse Proxy und Self-Hosting
- [GUI_LAUNCHER.md](GUI_LAUNCHER.md): Desktop GUI Launcher, Isolation und Entwicklungsleitfaden
- [README_ENVIRONMENT_SETUP.md](README_ENVIRONMENT_SETUP.md): Umgebungsvariablen und Secret Management
- [CONTRIBUTING.md](CONTRIBUTING.md): Beitragsrichtlinien
- [SECURITY.md](SECURITY.md): Prozess zum Melden von Sicherheitslücken
- [CHANGELOG.md](CHANGELOG.md): Release-Historie und Upgrade-Hinweise
- [ROADMAP.md](ROADMAP.md): Kurzfristige Projektausrichtung

Empfohlene GitHub Topics für Maintainer: `home-inventory`, `self-hosted`, `inventory-management`, `household`, `pwa`, `sqlite`, `express`, `react`, `docker`, `privacy`, `qr-code`, `barcode`, `2fa`.

## Sprachhinweis

Das Produkt enthält **100+ auswählbare UI-Locale-Pakete**. Englisch und Türkisch sind die am aktivsten geprüften Produktsprachen; andere Locales können pro Schlüssel zurückfallen, wenn eine Übersetzung fehlt.

## Mitwirken

Issues und Pull Requests sind willkommen. Für größere Änderungen ist ein vorheriges Issue sinnvoll, damit die Umsetzung zum Sicherheitsmodell, zur Haushaltsabgrenzung und zur Lokalisierungsstruktur passt.

## Rechtlicher Hinweis

HomeInventory ist ein unabhängiges Open-Source-Projekt. Es ist nicht mit einem kommerziellen Produkt oder Unternehmen mit ähnlichem Namen verbunden, wird nicht von diesen unterstützt und ist ihnen nicht zugeordnet.

## Lizenz

MIT. Siehe [LICENSE](LICENSE).
