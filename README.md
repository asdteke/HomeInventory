<p align="center">
  <img src="client/public/brand/logo-full-dark.png" alt="HomeInventory Logo" width="280" />
</p>

<h1 align="center">HomeInventory</h1>

<p align="center">
  The open-source project behind <a href="https://envanterim.net.tr">envanterim.net.tr</a><br/>
  An open-source home inventory management system to manage household items, rooms, and categories in one place.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#environment-variables">Environment</a> •
  <a href="#project-structure">Structure</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <strong>🌐 Language:</strong> English | <a href="README.tr.md">Türkçe</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.ar.md">العربية</a>
</p>

---

## Features

- 🏠 **Multi-house support** — Create or join households with shared inventories
- 📦 **Item management** — Track items with photos, quantities, barcodes, and descriptions
- 🏷️ **Categories & Rooms** — Organize items by custom categories, rooms, and locations
- 📱 **Barcode / QR scanning** — Quickly add or find items using your device camera
- 🔐 **Authentication** — JWT-based auth with Google OAuth support and email verification
- 👨‍💼 **Admin panel** — User management, ban controls, email sending, and system logs
- 📧 **Email system** — Transactional emails via Resend API (verification, admin notices)
- 💾 **Backup & Restore** — Export and import your inventory data
- 🌍 **Multi-language** — 50 languages supported (Turkish, English, German, Arabic, Spanish, and more)
- 🌙 **Dark / Light theme** — Auto-detects system preference
- 📱 **Responsive** — Mobile-first design, works on all screen sizes
- 🔍 **SEO ready** — Sitemap, robots.txt, meta tags, and IndexNow support

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Node.js** + **Express** | REST API server |
| **better-sqlite3** | Embedded SQLite database |
| **JWT** + **bcrypt** | Authentication & password hashing |
| **Passport.js** | Google OAuth 2.0 integration |
| **Helmet** | HTTP security headers |
| **express-rate-limit** | Brute-force / DDoS protection |
| **Resend** | Transactional email service |
| **Sharp** | Image processing & thumbnails |
| **i18next** | Server-side internationalization |

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** | UI library |
| **Vite** | Build tool & dev server |
| **Tailwind CSS** | Utility-first styling |
| **React Router v7** | Client-side routing |
| **Lucide React** | Icon library |
| **html5-qrcode** | Barcode & QR scanning |
| **react-i18next** | Frontend internationalization |
| **react-joyride** | Interactive onboarding tours |

## Quick Start

### Prerequisites
- **Node.js** ≥ 18 — [download](https://nodejs.org/)
- **npm** ≥ 9 (comes with Node.js)

### 1. Clone & Install

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# Install backend + frontend dependencies in one command
npm run install-all
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Open `.env` in your editor and set **at minimum** these values for local development:

```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=change-this-to-any-random-string-at-least-32-chars
```

> **💡 Tip:** You can generate a secure JWT_SECRET with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

The remaining variables (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, etc.) are **optional** for local development. Features that depend on them (Google login, email sending) will be gracefully disabled.

### 3. Start Development

```bash
npm run dev
```

This starts both backend and frontend concurrently. Open your browser:

| Service | URL |
|---|---|
| 🖥️ Frontend | http://localhost:5173 |
| ⚙️ Backend API | http://localhost:3001 |
| 📱 Network (phone) | `http://<your-local-ip>:5173` |

### 4. Production Build (optional)

```bash
# Build frontend for production
npm run build

# Start production server (serves built frontend + API)
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | ✅ | `development` or `production` |
| `PORT` | ✅ | Backend server port (default: `3001`) |
| `SITE_URL` | ✅ | Your site's public URL |
| `JWT_SECRET` | ✅ | Random secret for JWT signing (min 32 chars) |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth client secret |
| `RESEND_API_KEY` | ⬜ | Resend.com API key for emails |
| `SUPPORT_EMAIL` | ⬜ | Support email address |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Auto-promote this email to admin |
| `EXPOSE_SERVER_INFO` | ⬜ | Show server info endpoint (`true`/`false`) |
| `INDEXNOW_KEY` | ⬜ | IndexNow API key for SEO indexing |

> **⚠️ Never commit your `.env` file!** It is already in `.gitignore`.

## Project Structure

```
Home-inventory/
├── server.js                 # Express app entry point
├── auth.js                   # JWT middleware & token generation
├── database.js               # SQLite DB initialization & migrations
├── package.json              # Backend dependencies & scripts
├── .env.example              # Environment variable template
├── .gitignore
├── LICENSE
│
├── config/
│   └── i18n.js               # i18next server config
│
├── middleware/
│   └── auth.js               # Auth & admin middleware
│
├── routes/
│   ├── auth.js               # Login, register, OAuth, password
│   ├── items.js              # CRUD for inventory items
│   ├── categories.js         # Category management
│   ├── rooms.js              # Room management
│   ├── locations.js          # Location management
│   ├── barcode.js            # Barcode lookup & scanning
│   ├── houses.js             # Multi-house management
│   ├── admin.js              # Admin panel endpoints
│   ├── admin-email.js        # Admin email sending
│   ├── email.js              # Email verification & status
│   ├── backup.js             # Backup/restore endpoints
│   └── ...
│
├── utils/
│   ├── emailService.js       # Resend email integration
│   ├── indexNow.js           # IndexNow SEO submission
│   └── logger.js             # KVKK-compliant logging
│
├── locales/                  # Backend i18n (50 languages)
│
├── scripts/
│   ├── generate-locales.js   # Locale generation scripts
│   └── indexnow-submit.mjs   # CLI IndexNow submission
│
└── client/                   # React frontend
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── public/
    │   ├── brand/            # Logo assets (dark/light)
    │   ├── locales/          # Frontend i18n files
    │   ├── robots.txt
    │   └── sitemap.xml
    └── src/
        ├── App.jsx           # Root component & routing
        ├── main.jsx          # Entry point
        ├── index.css         # Global styles
        ├── i18n.js           # Frontend i18n config
        ├── components/       # All React components
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
        ├── context/          # React contexts (Auth, Theme)
        └── utils/            # Frontend utilities
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/items` | List items |
| `POST` | `/api/items` | Create item |
| `PUT` | `/api/items/:id` | Update item |
| `DELETE` | `/api/items/:id` | Delete item |
| `GET` | `/api/categories` | List categories |
| `GET` | `/api/rooms` | List rooms |
| `GET` | `/api/houses` | List user's houses |
| `GET` | `/api/admin/*` | Admin panel endpoints |
| `GET` | `/api/health` | Health check |

> All `/api/*` endpoints (except auth) require a JWT Bearer token.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Disclaimer

This is an independent open-source project. It is not affiliated with, endorsed by, or connected to any commercial product or company using a similar name.

## AI-Assisted Development

This project was developed with significant assistance from AI tools (including Google Gemini and OpenAI GPT).

## License

MIT — see [LICENSE](LICENSE) for details.
