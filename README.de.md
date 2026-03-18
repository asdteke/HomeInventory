<p align="center">
  <img src="client/public/brand/logo-full-dark.png" alt="HomeInventory Logo" width="280" />
</p>

<h1 align="center">HomeInventory</h1>

<p align="center">
  Das Open-Source-Projekt hinter <a href="https://envanterim.net.tr">envanterim.net.tr</a><br/>
  Verwalten Sie Ihre Haushaltsgegenstände, Räume und Kategorien an einem Ort.
</p>

<p align="center">
  <a href="#funktionen">Funktionen</a> •
  <a href="#technologie-stack">Technologien</a> •
  <a href="#schnellstart">Schnellstart</a> •
  <a href="#umgebungsvariablen">Umgebung</a> •
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
- 👨‍💼 **Admin-Panel** — Benutzerverwaltung, Sperren, E-Mail-Versand und Systemprotokolle
- 📧 **E-Mail-System** — Transaktions-E-Mails über die Resend-API (Verifizierung, Admin-Benachrichtigungen)
- 💾 **Sicherung & Wiederherstellung** — Exportieren und importieren Sie Ihre Inventardaten
- 🌍 **Mehrsprachig** — 50 Sprachen unterstützt (Türkisch, Englisch, Deutsch, Arabisch, Spanisch u.v.m.)
- 🌙 **Dunkles / Helles Design** — Erkennt automatisch die Systemeinstellung
- 📱 **Responsiv** — Mobile-First-Design, funktioniert auf allen Bildschirmgrößen
- 🔍 **SEO-bereit** — Sitemap, robots.txt, Meta-Tags und IndexNow-Unterstützung

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
```

> **💡 Tipp:** Sie können ein sicheres JWT_SECRET generieren mit:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Die übrigen Variablen (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY` usw.) sind für die lokale Entwicklung **optional**. Funktionen, die davon abhängen (Google-Login, E-Mail-Versand), werden automatisch deaktiviert.

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

## Umgebungsvariablen

Kopieren Sie `.env.example` nach `.env` und füllen Sie die erforderlichen Werte aus:

| Variable | Erforderlich | Beschreibung |
|---|---|---|
| `NODE_ENV` | ✅ | `development` oder `production` |
| `PORT` | ✅ | Backend-Server-Port (Standard: `3001`) |
| `SITE_URL` | ✅ | Öffentliche URL Ihrer Website |
| `JWT_SECRET` | ✅ | Zufälliger Schlüssel für JWT-Signierung (mind. 32 Zeichen) |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth Client-ID |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth Client-Secret |
| `RESEND_API_KEY` | ⬜ | Resend.com API-Schlüssel für E-Mails |
| `SUPPORT_EMAIL` | ⬜ | Support-E-Mail-Adresse |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Diese E-Mail automatisch zum Admin befördern |
| `EXPOSE_SERVER_INFO` | ⬜ | Server-Info-Endpoint anzeigen (`true`/`false`) |
| `INDEXNOW_KEY` | ⬜ | IndexNow-API-Schlüssel für SEO-Indizierung |

> **⚠️ Committen Sie niemals Ihre `.env`-Datei!** Sie ist bereits in `.gitignore` eingetragen.

## Mitwirken

1. Forken Sie das Repository
2. Erstellen Sie Ihren Feature-Branch (`git checkout -b feature/tolles-feature`)
3. Committen Sie Ihre Änderungen (`git commit -m 'Tolles Feature hinzufügen'`)
4. Pushen Sie den Branch (`git push origin feature/tolles-feature`)
5. Öffnen Sie einen Pull Request

## Haftungsausschluss

Dies ist ein unabhängiges Open-Source-Projekt. Es steht in keiner Verbindung zu einem kommerziellen Produkt oder Unternehmen mit ähnlichem Namen und wird von keinem solchen unterstützt.

## KI-unterstützte Entwicklung

Dieses Projekt wurde mit Hilfe von KI-Tools (einschließlich Google Gemini und OpenAI GPT) entwickelt. Der gesamte KI-generierte Code wurde vom Entwickler überprüft, getestet und validiert.

## Lizenz

MIT — siehe [LICENSE](LICENSE) für Details.
