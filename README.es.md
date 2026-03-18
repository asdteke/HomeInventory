<p align="center">
  <img src="client/public/brand/logo-full-dark.png" alt="HomeInventory Logo" width="280" />
</p>

<h1 align="center">HomeInventory</h1>

<p align="center">
  El proyecto de código abierto detrás de <a href="https://envanterim.net.tr">envanterim.net.tr</a><br/>
  Gestiona tus objetos del hogar, habitaciones y categorías en un solo lugar.
</p>

<p align="center">
  <a href="#características">Características</a> •
  <a href="#tecnologías">Tecnologías</a> •
  <a href="#inicio-rápido">Inicio Rápido</a> •
  <a href="#variables-de-entorno">Variables</a> •
  <a href="#licencia">Licencia</a>
</p>

<p align="center">
  <strong>🌐 Idioma:</strong> Español | <a href="README.md">English</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.de.md">Deutsch</a> | <a href="README.ar.md">العربية</a>
</p>

---

## Características

- 🏠 **Soporte multi-hogar** — Crea o únete a hogares con inventarios compartidos
- 📦 **Gestión de artículos** — Registra artículos con fotos, cantidades, códigos de barras y descripciones
- 🏷️ **Categorías y Habitaciones** — Organiza artículos por categorías, habitaciones y ubicaciones personalizadas
- 📱 **Escaneo de códigos de barras / QR** — Agrega o busca artículos rápidamente con la cámara de tu dispositivo
- 🔐 **Autenticación** — Inicio de sesión basado en JWT con soporte para Google OAuth y verificación por correo electrónico
- 👨‍💼 **Panel de administración** — Gestión de usuarios, bloqueos, envío de correos y registros del sistema
- 📧 **Sistema de correo** — Correos transaccionales vía API de Resend (verificación, avisos de admin)
- 💾 **Respaldo y restauración** — Exporta e importa tus datos de inventario
- 🌍 **Multi-idioma** — 50 idiomas soportados (turco, inglés, alemán, árabe, español y más)
- 🌙 **Tema oscuro / claro** — Detecta automáticamente la preferencia del sistema
- 📱 **Diseño responsivo** — Diseño mobile-first, funciona en todos los tamaños de pantalla
- 🔍 **Listo para SEO** — Sitemap, robots.txt, meta tags y soporte IndexNow

## Tecnologías

### Backend
| Tecnología | Propósito |
|---|---|
| **Node.js** + **Express** | Servidor REST API |
| **better-sqlite3** | Base de datos SQLite integrada |
| **JWT** + **bcrypt** | Autenticación y hash de contraseñas |
| **Passport.js** | Integración Google OAuth 2.0 |
| **Helmet** | Cabeceras de seguridad HTTP |
| **express-rate-limit** | Protección contra fuerza bruta / DDoS |
| **Resend** | Servicio de correo transaccional |
| **Sharp** | Procesamiento de imágenes y miniaturas |
| **i18next** | Internacionalización del servidor |

### Frontend
| Tecnología | Propósito |
|---|---|
| **React 18** | Biblioteca de interfaz de usuario |
| **Vite** | Herramienta de compilación y servidor de desarrollo |
| **Tailwind CSS** | Framework CSS |
| **React Router v7** | Enrutamiento del lado del cliente |
| **Lucide React** | Biblioteca de iconos |
| **html5-qrcode** | Escaneo de códigos de barras y QR |
| **react-i18next** | Internacionalización del frontend |
| **react-joyride** | Tours de incorporación interactivos |

## Inicio Rápido

### Requisitos previos
- **Node.js** ≥ 18 — [descargar](https://nodejs.org/)
- **npm** ≥ 9 (incluido con Node.js)

### 1. Clonar e instalar

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# Instalar dependencias del backend + frontend en un solo comando
npm run install-all
```

### 2. Crear archivo de entorno

```bash
cp .env.example .env
```

Abre `.env` en tu editor y configura **como mínimo** estos valores para desarrollo local:

```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=cambia-esto-por-un-texto-aleatorio-de-al-menos-32-caracteres
```

> **💡 Consejo:** Puedes generar un JWT_SECRET seguro con:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Las demás variables (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, etc.) son **opcionales** para desarrollo local. Las funciones que dependen de ellas (inicio con Google, envío de correos) se desactivarán automáticamente.

### 3. Iniciar el servidor de desarrollo

```bash
npm run dev
```

Esto inicia backend y frontend simultáneamente. Abre tu navegador:

| Servicio | URL |
|---|---|
| 🖥️ Frontend | http://localhost:5173 |
| ⚙️ Backend API | http://localhost:3001 |
| 📱 Red (teléfono) | `http://<tu-ip-local>:5173` |

### 4. Compilación para producción (opcional)

```bash
# Compilar frontend para producción
npm run build

# Iniciar servidor de producción (frontend compilado + API)
npm start
```

## Variables de Entorno

Copia `.env.example` a `.env` y completa los valores requeridos:

| Variable | Requerida | Descripción |
|---|---|---|
| `NODE_ENV` | ✅ | `development` o `production` |
| `PORT` | ✅ | Puerto del servidor backend (por defecto: `3001`) |
| `SITE_URL` | ✅ | URL pública de tu sitio |
| `JWT_SECRET` | ✅ | Clave secreta aleatoria para firmar JWT (mín. 32 caracteres) |
| `GOOGLE_CLIENT_ID` | ⬜ | ID de cliente de Google OAuth |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Secreto de cliente de Google OAuth |
| `RESEND_API_KEY` | ⬜ | Clave API de Resend.com para correos |
| `SUPPORT_EMAIL` | ⬜ | Dirección de correo de soporte |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Promover automáticamente este correo a admin |
| `EXPOSE_SERVER_INFO` | ⬜ | Mostrar endpoint de info del servidor (`true`/`false`) |
| `INDEXNOW_KEY` | ⬜ | Clave API de IndexNow para indexación SEO |

> **⚠️ ¡Nunca hagas commit de tu archivo `.env`!** Ya está incluido en `.gitignore`.

## Contribuir

1. Haz fork del repositorio
2. Crea tu rama de funcionalidad (`git checkout -b feature/funcionalidad-genial`)
3. Haz commit de tus cambios (`git commit -m 'Agregar funcionalidad genial'`)
4. Sube tu rama (`git push origin feature/funcionalidad-genial`)
5. Abre un Pull Request

## Aviso Legal

Este es un proyecto de código abierto independiente. No está afiliado, respaldado ni conectado con ningún producto comercial o empresa que use un nombre similar.

## Desarrollo Asistido por IA

Este proyecto fue desarrollado con la ayuda de herramientas de inteligencia artificial (incluyendo Google Gemini y OpenAI GPT). Todo el código generado por IA fue revisado, probado y validado por el desarrollador.

## Licencia

MIT — ver [LICENSE](LICENSE) para más detalles.
