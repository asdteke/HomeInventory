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
  El proyecto de código abierto detrás de <a href="https://envanterim.net.tr">envanterim.net.tr</a><br/>
  Un sistema de gestión de inventario doméstico de código abierto con soporte de interfaz en 100+ idiomas y cifrado a nivel de campo para datos sensibles.
</p>

<p align="center">
  <a href="#características">Características</a> •
  <a href="#tecnologías">Tecnologías</a> •
  <a href="#inicio-rápido">Inicio Rápido</a> •
  <a href="#docker">Docker</a> •
  <a href="#variables-de-entorno">Variables</a> •
  <a href="#estructura-del-proyecto">Estructura</a> •
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
- 🌍 **100+ idiomas** — La interfaz incluye más de 100 idiomas seleccionables para acceso global
- 🌙 **Tema oscuro / claro** — Detecta automáticamente la preferencia del sistema
- 📱 **Diseño responsivo** — Diseño mobile-first, funciona en todos los tamaños de pantalla
- 🔍 **Listo para SEO** — Sitemap, robots.txt, meta tags y soporte IndexNow
- 🛡️ **Cifrado a nivel de campo** — Protección AES-256-GCM para datos sensibles
- 🔑 **Recuperación de contraseña segura** — Restablecimiento por correo o Clave de Recuperación sin conexión

## Seguridad y Privacidad (Arquitectura de Conocimiento Cero)

HomeInventory está diseñado con seguridad de nivel empresarial para garantizar que sus datos personales permanezcan completamente privados.

- **Cifrado a nivel de campo**: Los datos sensibles (nombres de artículos, descripciones) se cifran mediante AES-256-GCM.
- **Almacenamiento multimedia cifrado**: Las fotos se almacenan como datos cifrados (AES-256-GCM) sin metadatos EXIF.
- **Protección de datos (PII)**: Correos electrónicos y nombres de usuario cifrados. Búsqueda basada en token HMAC-SHA-256.
- **Rotación de claves**: Soporte para anillo de claves (Keyring) para rotar la clave principal de cifrado sin romper datos antiguos.

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
APP_ENCRYPTION_KEY=reemplazar-con-base64-de-32-bytes
APP_ENCRYPTION_KEY_ID=2026-03-local
```

> **💡 Consejo:** Puedes generar un JWT_SECRET seguro con:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Las demás variables (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, etc.) son **opcionales** para desarrollo local. Las funciones que dependen de ellas (inicio con Google, envío de correos) se desactivarán automáticamente.

> **🔐 Clave de cifrado:** Genera `APP_ENCRYPTION_KEY` con:
> ```bash
> openssl rand -base64 32
> ```

### Opcional: Oracle Cloud Secret Management

Si despliegas HomeInventory en una instancia de Oracle Cloud Infrastructure (OCI), puedes almacenar los secretos de producción en OCI Secret Management y dejar que el runtime los cargue antes de iniciar la aplicación.

Patrón recomendado:

```env
SECRET_PROVIDER=oci
OCI_AUTH_MODE=instance_principal
OCI_REGION=eu-frankfurt-1
OCI_VAULT_ID=ocid1.vault.oc1..exampleuniqueID
OCI_SECRET_MAPPINGS={"JWT_SECRET":"homeinventory-jwt-secret","APP_ENCRYPTION_KEY":"homeinventory-app-encryption-key","APP_ENCRYPTION_KEY_ID":"homeinventory-app-encryption-key-id","RESEND_API_KEY":"homeinventory-resend-api-key"}
```

Notas:

- Deja `SECRET_PROVIDER=env` para desarrollo local.
- `OCI_SECRET_MAPPINGS` puede apuntar a OCIDs de secretos o nombres de secretos.
- `OCI_VAULT_ID` solo es necesario cuando usas nombres de secretos en lugar de OCIDs.
- El punto de entrada del servidor carga los secretos de runtime automáticamente, por lo que `node server.js`, `npm run dev` y `npm start` siguen funcionando.
- Los scripts de mantenimiento como backfill de cifrado y envío de IndexNow también usan la misma ruta de bootstrap OCI.

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

## Docker

Despliega HomeInventory con Docker para un auto-hosting sencillo:

```bash
# Clonar y entrar al directorio
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory

# Crear archivo de entorno
cp .env.example .env
# Edita .env y configura JWT_SECRET, APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_ID

# Iniciar con Docker Compose
docker compose up -d
```

La aplicación estará disponible en `http://localhost:3001`

El archivo `.env` completo se pasa al contenedor; configuraciones opcionales como `APP_ENCRYPTION_KEYRING`, `EXPOSE_SERVER_INFO` e `INDEXNOW_*` continúan funcionando en Docker.

Para configuración detallada de Docker, proxy inverso, respaldo/restauración y despliegue en Unraid, consulta **[DOCKER.md](DOCKER.md)**.

## Variables de Entorno

Copia `.env.example` a `.env` y completa los valores requeridos:

| Variable | Requerida | Descripción |
|---|---|---|
| `NODE_ENV` | ✅ | `development` o `production` |
| `PORT` | ✅ | Puerto del servidor backend (por defecto: `3001`) |
| `SITE_URL` | ✅ | URL pública de tu sitio |
| `JWT_SECRET` | ✅ | Clave secreta aleatoria para firmar JWT (mín. 32 caracteres) |
| `APP_ENCRYPTION_KEY` | ✅ | Clave de cifrado de 32 bytes para protección de campos |
| `APP_ENCRYPTION_KEY_ID` | ✅ | Identificador de clave estable |
| `APP_ENCRYPTION_KEYRING` | ⬜ | Mapa JSON opcional para rotación de claves |
| `GOOGLE_CLIENT_ID` | ⬜ | ID de cliente de Google OAuth |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Secreto de cliente de Google OAuth |
| `RESEND_API_KEY` | ⬜ | Clave API de Resend.com para correos |
| `SUPPORT_EMAIL` | ⬜ | Dirección de correo de soporte |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Promover automáticamente este correo a admin |
| `EXPOSE_SERVER_INFO` | ⬜ | Mostrar endpoint de info del servidor (`true`/`false`) |
| `APP_EMAIL_LANGUAGE` | ⬜ | Idioma de los correos salientes (por defecto: `en`) |
| `INDEXNOW_KEY` | ⬜ | Clave API de IndexNow para indexación SEO |
| `INDEXNOW_BASE_URL` | ⬜ | URL base para envíos de IndexNow |
| `INDEXNOW_ENDPOINT` | ⬜ | URL del endpoint de la API de IndexNow |
| `INDEXNOW_KEY_LOCATION` | ⬜ | Ubicación del archivo de clave IndexNow (opcional) |

> **⚠️ ¡Nunca hagas commit de tu archivo `.env`!** Ya está incluido en `.gitignore`.

## Estructura del Proyecto

```
Home-inventory/
├── app.js                    # Configuración de la app Express & middleware
├── server.js                 # Bootstrap de runtime & punto de entrada del servidor
├── auth.js                   # Middleware JWT & generación de tokens
├── database.js               # Inicialización de SQLite DB & migraciones
├── package.json              # Dependencias & scripts del backend
├── .env.example              # Plantilla de variables de entorno
├── .gitignore
├── LICENSE
│
├── config/
│   └── i18n.js               # Configuración i18next del servidor
│
├── middleware/
│   └── auth.js               # Middleware de auth & admin
│
├── routes/
│   ├── auth.js               # Login, registro, OAuth, contraseña
│   ├── items.js              # CRUD de artículos de inventario
│   ├── categories.js         # Gestión de categorías
│   ├── rooms.js              # Gestión de habitaciones
│   ├── locations.js          # Gestión de ubicaciones
│   ├── barcode.js            # Búsqueda & escaneo de códigos de barras
│   ├── houses.js             # Gestión multi-hogar
│   ├── admin.js              # Endpoints del panel de admin
│   ├── admin-email.js        # Envío de correo del admin
│   ├── email.js              # Verificación de correo & estado
│   ├── backup.js             # Respaldo/restauración
│   └── ...
│
├── utils/
│   ├── encryption.js         # Ayudantes de cifrado de campo AES-256-GCM
│   ├── protectedFields.js    # Ayudantes de cifrado/descifrado de campos de inventario
│   ├── passwordRecovery.js   # Generación & verificación de clave de recuperación
│   ├── mediaStorage.js       # Ayudantes de lectura/escritura de medios cifrados
│   ├── runtimeSecrets.js     # Bootstrap de OCI Secret Management
│   ├── emailService.js       # Integración de correo con Resend
│   ├── indexNow.js           # Envío de SEO IndexNow
│   └── logger.js             # Registro compatible con RGPD
│
├── locales/                  # Backend i18n (100+ idiomas)
│
├── scripts/
│   ├── run-with-runtime-secrets.mjs # Bootstrap de secretos OCI para scripts de mantenimiento
│   ├── backfill-field-encryption.mjs # Cifrar campos de texto plano heredados
│   ├── generate-locales.js   # Scripts de generación de idiomas
│   └── indexnow-submit.mjs   # Envío CLI de IndexNow
│
└── client/                   # Frontend React
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── public/
    │   ├── brand/            # Assets de logo (oscuro/claro)
    │   ├── locales/          # Archivos i18n del frontend
    │   ├── robots.txt
    │   └── sitemap.xml
    └── src/
        ├── App.jsx           # Componente raíz & enrutamiento
        ├── main.jsx          # Punto de entrada
        ├── index.css         # Estilos globales
        ├── i18n.js           # Configuración i18n del frontend
        ├── components/       # Todos los componentes React
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
        ├── context/          # Contextos React (Auth, Theme)
        └── utils/            # Utilidades del frontend
```

## Endpoints de la API

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/auth/register` | Registrar nuevo usuario |
| `POST` | `/api/auth/login` | Iniciar sesión |
| `GET` | `/api/items` | Listar artículos |
| `POST` | `/api/items` | Crear artículo |
| `PUT` | `/api/items/:id` | Actualizar artículo |
| `DELETE` | `/api/items/:id` | Eliminar artículo |
| `GET` | `/api/categories` | Listar categorías |
| `GET` | `/api/rooms` | Listar habitaciones |
| `GET` | `/api/houses` | Listar hogares del usuario |
| `GET` | `/api/admin/*` | Endpoints del panel de admin |
| `GET` | `/api/health` | Verificación de salud |

> Todos los endpoints `/api/*` (excepto auth) requieren un token JWT Bearer.

## Contribuir

1. Haz fork del repositorio
2. Crea tu rama de funcionalidad (`git checkout -b feature/funcionalidad-genial`)
3. Haz commit de tus cambios (`git commit -m 'Agregar funcionalidad genial'`)
4. Sube tu rama (`git push origin feature/funcionalidad-genial`)
5. Abre un Pull Request

## Aviso Legal

Este es un proyecto de código abierto independiente. No está afiliado, respaldado ni conectado con ningún producto comercial o empresa que use un nombre similar.

## Desarrollo Asistido por IA

Este proyecto fue desarrollado con la asistencia significativa de herramientas de inteligencia artificial (incluyendo Google Gemini y OpenAI GPT).

## Licencia

MIT — ver [LICENSE](LICENSE) para más detalles.
