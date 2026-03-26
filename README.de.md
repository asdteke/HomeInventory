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
  Das Open-Source-Projekt hinter <a href="https://envanterim.net.tr">envanterim.net.tr</a><br/>
  Ein Open-Source-Hausverwaltungssystem mit Unterstützung für 100+ Sprachen und Verschlüsselung auf Feldebene für sensible Daten.
</p>

<p align="center">
  <a href="#funktionen">Funktionen</a> •
  <a href="#technologie-stack">Technologien</a> •
  <a href="#schnellstart">Schnellstart</a> •
  <a href="#docker">Docker</a> •
  <a href="#umgebungsvariablen">Umgebung</a> •
  <a href="#projektstruktur">Struktur</a> •
  <a href="#lizenz">Lizenz</a>
</p>

<p align="center">
  <strong>🌐 Sprache:</strong> Deutsch | <a href="README.md">English</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.es.md">Español</a> | <a href="README.ar.md">العربية</a>
</p>

---

## Funktionen

- 🏠 **Multi-Haus-Unterstützung** — Erstellen oder treten Sie Haushalten mit gemeinsamen Inventaren bei
- 📦 **Artikelverwaltung** — Verfolgen Sie Artikel mit Fotos, Mengen, Barcodes und Beschreibungen
- 🏷️ **Kategorien & Räume** — Organisieren Sie Artikel nach benutzerdefinierten Kategorien, Räumen und Standorten
- 📱 **Barcode-/QR-Scanning** — Fügen Sie Artikel schnell per Gerätekamera hinzu oder finden Sie sie
- 🔐 **Authentifizierung** — JWT-basierte Anmeldung mit Google OAuth und E-Mail-Verifizierung
- ✅ **2FA & vertrauenswürdige Geräte** — TOTP-Authenticator-Apps, Einmal-Backup-Codes und Remember-Device-Steuerung
- 🔒 **Persönlicher Tresor** — Im Browser erzeugte Tresorschlüssel und verschlüsselte private Datensätze für besonders sensible Inhalte
- 👨‍💼 **Admin-Panel** — Benutzerverwaltung, Sperren, E-Mail-Versand und Systemprotokolle
- 📧 **E-Mail-System** — Transaktions-E-Mails über die Resend-API (Verifizierung, Admin-Benachrichtigungen)
- 💾 **Sicherung & Wiederherstellung** — Exportieren und importieren Sie Ihre Inventardaten
- 🌍 **100+ Sprachen** — Die Benutzeroberfläche wird mit über 100 auswählbaren Sprachen ausgeliefert
- 🌙 **Dunkles / Helles Design** — Erkennt automatisch die Systemeinstellung
- 📱 **Responsiv** — Mobile-First-Design, funktioniert auf allen Bildschirmgrößen
- 🔍 **SEO-bereit** — Sitemap, robots.txt, Meta-Tags und IndexNow-Unterstützung
- 🛡️ **Feld-Ebenen-Verschlüsselung** — AES-256-GCM-Schutz für sensible Daten
- 🐳 **Docker- und Cloud-Secret-Bereitstellung** — Docker-Secrets und OCI-Runtime-Bootstrap für Produktionsschlüssel
- 🔑 **Sichere Passwortwiederherstellung** — E-Mail-basiertes Zurücksetzen oder Offline-Wiederherstellungsschlüssel

## Sicherheit & Privatsphäre (Serverseitige Verschlüsselung im Ruhezustand)

HomeInventory wurde mit Sicherheitsstandards auf Unternehmensniveau zum Schutz Ihrer persönlichen Daten entwickelt. Alle sensiblen Felder, Mediendateien und personenbezogenen Daten werden auf dem Server mit AES-256-GCM verschlüsselt, bevor sie auf die Festplatte oder in die Datenbank geschrieben werden. Dies schützt vor Datenbankdiebstahl und unbefugtem Dateizugriff. Hinweis: Da die Verschlüsselungsschlüssel serverseitig verwaltet werden, kann ein Serveradministrator mit Zugriff auf Datenbank und Umgebungsvariablen die Daten entschlüsseln.

- **Feld-Ebenen-Verschlüsselung**: Sensible Daten (Artikelnamen, Beschreibungen) werden über AES-256-GCM verschlüsselt.
- **Verschlüsselter Medienspeicher**: Fotos werden als AES-256-GCM verschlüsselte Blobs ohne EXIF-Metadaten gespeichert.
- **PII-Schutz**: Verschlüsselte E-Mails und Benutzernamen. Such-Token basierend auf HMAC-SHA-256.
- **Schlüsselrotation**: Unterstützung für einen Keyring, um kryptografische Schlüssel ohne Datenverlust zu wechseln.

## Technologie-Stack

### Backend
| Technologie | Zweck |
|---|---|
| **Node.js** + **Express** | REST-API-Server |
| **better-sqlite3** | Eingebettete SQLite-Datenbank |
| **JWT** + **bcrypt** | Authentifizierung & Passwort-Hashing |
| **Passport.js** | Google OAuth 2.0-Integration |
| **Helmet** | HTTP-Sicherheitsheader |
| **express-rate-limit** | Brute-Force-/DDoS-Schutz |
| **Resend** | Transaktions-E-Mail-Dienst |
| **Sharp** | Bildverarbeitung & Thumbnails |
| **i18next** | Serverseitige Internationalisierung |

### Frontend
| Technologie | Zweck |
|---|---|
| **React 18** | UI-Bibliothek |
| **Vite** | Build-Tool & Entwicklungsserver |
| **Tailwind CSS** | CSS-Framework |
| **React Router v7** | Client-seitiges Routing |
| **Lucide React** | Icon-Bibliothek |
| **html5-qrcode** | Barcode- & QR-Scanning |
| **react-i18next** | Frontend-Internationalisierung |
| **react-joyride** | Interaktive Einführungstouren |

## Schnellstart

### Voraussetzungen
- **Node.js** ≥ 18 — [herunterladen](https://nodejs.org/)
- **npm** ≥ 9 (wird mit Node.js mitgeliefert)

### 1. Klonen & Installieren

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# Backend- + Frontend-Abhängigkeiten in einem Befehl installieren
npm run install-all
```

### 2. Umgebungsdatei erstellen

```bash
cp .env.example .env
```

Öffnen Sie `.env` in Ihrem Editor und setzen Sie **mindestens** diese Werte für die lokale Entwicklung:

```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=aendern-sie-dies-in-einen-zufaelligen-string-mit-mind-32-zeichen
APP_ENCRYPTION_KEY=ersetzen-sie-dies-mit-einem-32-byte-base64-schluessel
APP_ENCRYPTION_KEY_ID=2026-03-local
```

> **💡 Tipp:** Sie können ein sicheres JWT_SECRET generieren mit:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Die übrigen Variablen (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY` usw.) sind für die lokale Entwicklung **optional**. Funktionen, die davon abhängen (Google-Login, E-Mail-Versand), werden automatisch deaktiviert.

> **🔐 Verschlüsselungsschlüssel:** Generieren Sie `APP_ENCRYPTION_KEY` mit:
> ```bash
> openssl rand -base64 32
> ```

### Optional: Oracle Cloud Secret Management

Wenn Sie HomeInventory auf einer Oracle Cloud Infrastructure (OCI) Compute-Instanz bereitstellen, können Sie Produktions-Secrets in OCI Secret Management speichern und zur Laufzeit vor dem App-Start laden lassen.

Empfohlenes Muster:

```env
SECRET_PROVIDER=oci
OCI_AUTH_MODE=instance_principal
OCI_REGION=eu-frankfurt-1
OCI_VAULT_ID=ocid1.vault.oc1..exampleuniqueID
OCI_SECRET_MAPPINGS={"JWT_SECRET":"homeinventory-jwt-secret","APP_ENCRYPTION_KEY":"homeinventory-app-encryption-key","APP_ENCRYPTION_KEY_ID":"homeinventory-app-encryption-key-id","RESEND_API_KEY":"homeinventory-resend-api-key"}
```

Hinweise:

- Lassen Sie `SECRET_PROVIDER=env` für die lokale Entwicklung.
- `OCI_SECRET_MAPPINGS` kann auf Secret-OCIDs oder Secret-Namen verweisen.
- `OCI_VAULT_ID` ist nur erforderlich, wenn Sie Secret-Namen statt OCIDs verwenden.
- Bei dateibasierten Docker-Secrets behalten Sie den Standard-Mount `/run/secrets` bei oder setzen `DOCKER_SECRETS_DIR`, wenn Ihre Laufzeit Secrets an einen anderen Pfad mountet.
- Der Server-Einstiegspunkt lädt Runtime-Secrets automatisch, sodass `node server.js`, `npm run dev` und `npm start` weiterhin funktionieren.
- Wartungsskripte wie Verschlüsselungs-Backfill und IndexNow-Einreichung verwenden denselben OCI-Bootstrap-Pfad.

### 3. Entwicklungsserver starten

```bash
npm run dev
```

Dies startet Backend und Frontend gleichzeitig. Öffnen Sie Ihren Browser:

| Dienst | URL |
|---|---|
| 🖥️ Frontend | http://localhost:5173 |
| ⚙️ Backend-API | http://localhost:3001 |
| 📱 Netzwerk (Handy) | `http://<ihre-lokale-ip>:5173` |

### 4. Produktions-Build (optional)

```bash
# Frontend für Produktion bauen
npm run build

# Produktionsserver starten (gebündeltes Frontend + API)
npm start
```

## Docker

Stellen Sie HomeInventory mit Docker für einfaches Self-Hosting bereit:

```bash
# Klonen und Verzeichnis betreten
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# Umgebungsdatei für nicht geheime Einstellungen erstellen
cp .env.example .env

# Docker-Secret-Dateien anlegen (oder mit HOMEINVENTORY_SECRETS_DIR einen anderen Ordner nutzen)
mkdir -p secrets
printf '%s' 'jwt-secret-hier-eintragen' > secrets/jwt_secret.txt
printf '%s' '32-byte-base64-key-hier-eintragen' > secrets/app_encryption_key.txt
printf '%s' '2026-compose' > secrets/app_encryption_key_id.txt

# Mit Docker Compose starten
docker compose up -d
```

Die App ist unter `http://localhost:3001` erreichbar.

`docker-compose.yml` liest Secret-Quelldateien auf dem Host standardmäßig aus `${HOMEINVENTORY_SECRETS_DIR:-./secrets}` und mountet sie im Container unter `/run/secrets`.

Die vollständige `.env`-Datei wird an den Container weitergegeben; optionale Einstellungen wie `APP_ENCRYPTION_KEYRING`, `EXPOSE_SERVER_INFO` und `INDEXNOW_*` funktionieren auch in Docker.

Für detaillierte Docker-Konfiguration, Reverse-Proxy-Setup, Backup/Wiederherstellung und Unraid-Bereitstellung siehe **[DOCKER.md](DOCKER.md)**.

## Umgebungsvariablen

Kopieren Sie `.env.example` nach `.env` und füllen Sie die erforderlichen Werte aus:

| Variable | Erforderlich | Beschreibung |
|---|---|---|
| `NODE_ENV` | ✅ | `development` oder `production` |
| `PORT` | ✅ | Backend-Server-Port (Standard: `3001`) |
| `SITE_URL` | ✅ | Öffentliche URL Ihrer Website |
| `SECRET_PROVIDER` | ⬜ | `env` (Standard) oder `oci` für OCI Secret Management Bootstrap |
| `OCI_AUTH_MODE` | ⬜ | Runtime-Auth-Modus für OCI (`instance_principal`) |
| `OCI_REGION` | ⬜ | Optionale OCI-Region für Secret-Abrufe |
| `OCI_VAULT_ID` | ⬜ | Erforderlich, wenn `OCI_SECRET_MAPPINGS` Secret-Namen nutzt |
| `OCI_SECRET_MAPPINGS` | ⬜ | JSON-Zuordnung von Env-Namen zu OCI Secret-OCIDs oder Namen |
| `OCI_SECRET_OVERWRITE` | ⬜ | Bereits gesetzte Env-Werte mit OCI-Secrets überschreiben |
| `OCI_SECRET_BUNDLE_STAGE` | ⬜ | Zu lesende Secret-Bundle-Stufe (`CURRENT` standardmäßig) |
| `DOCKER_SECRETS_DIR` | ⬜ | Überschreibt den Runtime-Pfad für dateibasierte Docker-Secrets (`/run/secrets`) |
| `JWT_SECRET` | ✅ | Zufälliger Schlüssel für JWT-Signierung (mind. 32 Zeichen) |
| `APP_ENCRYPTION_KEY` | ✅ | 32-Byte-Verschlüsselungsschlüssel für Feldschutz |
| `APP_ENCRYPTION_KEY_ID` | ✅ | Stabiler Schlüsselidentifikator |
| `APP_ENCRYPTION_KEYRING` | ⬜ | Optionale JSON-Zuordnung für Schlüsselrotation |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth Client-ID |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth Client-Secret |
| `RESEND_API_KEY` | ⬜ | Resend.com API-Schlüssel für E-Mails |
| `SUPPORT_EMAIL` | ⬜ | Support-E-Mail-Adresse |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Diese E-Mail automatisch zum Admin befördern |
| `EXPOSE_SERVER_INFO` | ⬜ | Server-Info-Endpoint anzeigen (`true`/`false`) |
| `APP_EMAIL_LANGUAGE` | ⬜ | Sprache für ausgehende E-Mails (Standard: `en`) |
| `INDEXNOW_KEY` | ⬜ | IndexNow-API-Schlüssel für SEO-Indizierung |
| `INDEXNOW_BASE_URL` | ⬜ | Basis-URL für IndexNow-Einreichungen |
| `INDEXNOW_ENDPOINT` | ⬜ | IndexNow-API-Endpoint-URL |
| `INDEXNOW_KEY_LOCATION` | ⬜ | Optionale Standort-Überschreibung für IndexNow-Schlüsseldatei |

> **⚠️ Committen Sie niemals Ihre `.env`-Datei!** Sie ist bereits in `.gitignore` eingetragen.

## Projektstruktur

```
Home-inventory/
├── app.js                    # Express-App-Setup & Middleware
├── server.js                 # Runtime-Bootstrap & Server-Einstiegspunkt
├── auth.js                   # JWT-Middleware & Token-Generierung
├── database.js               # SQLite-DB-Initialisierung & Migrationen
├── package.json              # Backend-Abhängigkeiten & Skripte
├── .env.example              # Vorlage für Umgebungsvariablen
├── .gitignore
├── LICENSE
│
├── config/
│   └── i18n.js               # i18next-Serverkonfiguration
│
├── middleware/
│   └── auth.js               # Auth- & Admin-Middleware
│
├── routes/
│   ├── auth.js               # Login, Registrierung, OAuth, Passwort
│   ├── items.js              # CRUD für Inventarartikel
│   ├── categories.js         # Kategorieverwaltung
│   ├── rooms.js              # Raumverwaltung
│   ├── locations.js          # Standortverwaltung
│   ├── barcode.js            # Barcode-Suche & Scanning
│   ├── houses.js             # Multi-Haus-Verwaltung
│   ├── admin.js              # Admin-Panel-Endpoints
│   ├── admin-email.js        # Admin-E-Mail-Versand
│   ├── email.js              # E-Mail-Verifizierung & Status
│   ├── backup.js             # Backup/Wiederherstellung
│   └── ...
│
├── utils/
│   ├── encryption.js         # AES-256-GCM-Feldverschlüsselungshilfen
│   ├── protectedFields.js    # Inventarfeld-Verschlüsselungs-/Entschlüsselungshilfen
│   ├── passwordRecovery.js   # Wiederherstellungsschlüssel-Generierung & Verifizierung
│   ├── mediaStorage.js       # Verschlüsselter Medienlese-/Schreibhilfen
│   ├── runtimeSecrets.js     # OCI Secret Management Bootstrap
│   ├── emailService.js       # Resend-E-Mail-Integration
│   ├── indexNow.js           # IndexNow-SEO-Einreichung
│   └── logger.js             # DSGVO-konforme Protokollierung
│
├── locales/                  # Backend-i18n (100+ Sprachen)
│
├── scripts/
│   ├── run-with-runtime-secrets.mjs # OCI-Runtime-Secret-Bootstrap für Wartungsskripte
│   ├── backfill-field-encryption.mjs # Legacy-Klartextfelder verschlüsseln
│   ├── generate-locales.js   # Sprachdatei-Generierungsskripte
│   └── indexnow-submit.mjs   # CLI IndexNow-Einreichung
│
└── client/                   # React-Frontend
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── public/
    │   ├── brand/            # Logo-Assets (dunkel/hell)
    │   ├── locales/          # Frontend-i18n-Dateien
    │   ├── robots.txt
    │   └── sitemap.xml
    └── src/
        ├── App.jsx           # Hauptkomponente & Routing
        ├── main.jsx          # Einstiegspunkt
        ├── index.css         # Globale Stile
        ├── i18n.js           # Frontend-i18n-Konfiguration
        ├── components/       # Alle React-Komponenten
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
        ├── context/          # React-Kontexte (Auth, Theme)
        └── utils/            # Frontend-Hilfsfunktionen
```

## API-Endpunkte

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| `POST` | `/api/auth/register` | Neuen Benutzer registrieren |
| `POST` | `/api/auth/login` | Anmelden |
| `GET` | `/api/items` | Artikel auflisten |
| `POST` | `/api/items` | Artikel erstellen |
| `PUT` | `/api/items/:id` | Artikel aktualisieren |
| `DELETE` | `/api/items/:id` | Artikel löschen |
| `GET` | `/api/categories` | Kategorien auflisten |
| `GET` | `/api/rooms` | Räume auflisten |
| `GET` | `/api/houses` | Häuser des Benutzers auflisten |
| `GET` | `/api/admin/*` | Admin-Panel-Endpunkte |
| `GET` | `/api/health` | Gesundheitsprüfung |

> Alle `/api/*`-Endpunkte (außer Auth) erfordern ein JWT-Bearer-Token.

## Mitwirken

1. Forken Sie das Repository
2. Erstellen Sie Ihren Feature-Branch (`git checkout -b feature/tolles-feature`)
3. Committen Sie Ihre Änderungen (`git commit -m 'Tolles Feature hinzufügen'`)
4. Pushen Sie den Branch (`git push origin feature/tolles-feature`)
5. Öffnen Sie einen Pull Request

## Haftungsausschluss

Dies ist ein unabhängiges Open-Source-Projekt. Es steht in keiner Verbindung zu einem kommerziellen Produkt oder Unternehmen mit ähnlichem Namen und wird von keinem solchen unterstützt.

## KI-unterstützte Entwicklung

Dieses Projekt wurde mit erheblicher Unterstützung von KI-Tools (einschließlich Google Gemini und OpenAI GPT) entwickelt.

## Lizenz

MIT — siehe [LICENSE](LICENSE) für Details.
