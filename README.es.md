<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-full-dark.svg" />
    <img src="client/public/brand/logo-full-light.svg" alt="HomeInventory Logo" width="420" />
  </picture>
</p>

<h1 align="center">HomeInventory</h1>

<p align="center">
  <strong>Inventario privado y autoalojable para hogares compartidos.</strong><br/>
  Gestiona objetos, garantías, documentos, préstamos y registros personales sensibles desde una app React tranquila.
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
  <img src="https://img.shields.io/badge/security-AES--256--GCM-2f6f55?style=for-the-badge" alt="AES-256-GCM encryption" />
  <img src="https://img.shields.io/badge/PWA-ready-334155?style=for-the-badge" alt="PWA ready" />
  <img src="https://img.shields.io/badge/Docker-supported-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker supported" />
  <img src="https://img.shields.io/badge/license-MIT-111827?style=for-the-badge" alt="MIT license" />
</p>

<p align="center">
  <a href="#vista-previa">Vista previa</a> ·
  <a href="#por-qué-homeinventory">Por qué</a> ·
  <a href="#funciones">Funciones</a> ·
  <a href="#seguridad--privacidad">Seguridad</a> ·
  <a href="#inicio-rápido">Inicio rápido</a> ·
  <a href="#documentación">Docs</a>
</p>

---

## Vista previa

<p align="center">
  <img src="docs/assets/screenshot-landing.png" alt="Vista previa de la landing de HomeInventory" width="88%" />
</p>

<details>
<summary><strong>Más capturas: Inventario, Borrow Center, Vault, Categorías</strong></summary>

<br/>

<p align="center">
  <img src="docs/assets/screenshot-inventory.png" alt="Pantalla de inventario" width="48%" />
  &nbsp;
  <img src="docs/assets/screenshot-borrow.png" alt="Pantalla de Borrow Center" width="48%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-vault.png" alt="Pantalla de Personal Vault" width="48%" />
  &nbsp;
  <img src="docs/assets/screenshot-categories.png" alt="Pantalla de categorías" width="48%" />
</p>

</details>

HomeInventory está pensado para familias, compañeros de piso y hogares pequeños que necesitan un inventario práctico sin convertir registros privados en una hoja compartida.

## Por qué HomeInventory

- **Un hogar, varias personas:** crea o únete a hogares, cambia el hogar activo y mantiene el inventario compartido limitado a los miembros correctos.
- **Registros reales de objetos:** fotos, habitaciones, ubicaciones, categorías, cantidades, garantías, facturas, notas y adjuntos.
- **Mejor lugar para datos sensibles:** Personal Vault mantiene los registros muy privados fuera de la búsqueda y colaboración normal del hogar.
- **Búsqueda rápida en la vida diaria:** búsqueda, escaneo de códigos de barras, etiquetas QR y pantallas móviles cuando estás delante del estante.
- **Listo para autoalojar:** incluye Express, SQLite, soporte Docker, documentación de entorno y flujos de carga de secretos para producción.

## Funciones

| Área | Qué cubre |
| --- | --- |
| Inventario | Objetos, fotos, habitaciones, categorías, ubicaciones, cantidades, garantía y metadatos de factura |
| Hogares compartidos | Crear hogares, unirse mediante flujos de acceso, cambiar hogar activo y limitar datos por membresía |
| Borrow Center | Préstamos entrantes, salientes y activos con estados de solicitud claros |
| Personal Vault | Flujo de vault cifrado del lado del cliente para IDs, documentos de propiedad, códigos de acceso y notas sensibles |
| Etiquetas y escaneo | Escaneo de códigos de barras, etiquetas QR de objetos y acceso rápido móvil |
| Backup y restore | Exportación/importación solo para propietarios con confirmaciones protegidas |
| Auth y recuperación | JWT, Google OAuth, verificación por correo, TOTP 2FA, dispositivos de confianza y recovery keys |
| Internacionalización | 100+ paquetes de locale seleccionables con fallback por clave |

## Seguridad & privacidad

- **Cifrado AES-256-GCM** protege datos sensibles de inventario, autenticación y perfil antes de escribirlos en disco o SQLite.
- **Procesamiento de medios cifrado** elimina metadatos de imágenes y guarda blobs protegidos en lugar de uploads crudos.
- **Autorización por hogar** limita habitaciones, categorías, objetos, medios y backups a la membresía del hogar activo.
- **Separación con Personal Vault** mantiene los registros más sensibles fuera de los flujos compartidos normales.
- **Rate limiting y rutas de auth endurecidas** reducen el riesgo de fuerza bruta y abuso en login, backup y endpoints interactivos.

> [!IMPORTANT]
> HomeInventory usa cifrado fuerte del lado del servidor, pero la clave principal del inventario sigue siendo administrada por el servidor. Un operador con acceso a la base de datos y secretos de runtime puede descifrar datos protegidos del inventario. Usa Personal Vault para registros que necesitan más separación de los flujos compartidos del hogar.

## Arquitectura

```text
React SPA (Vite, PWA, Tailwind)
        |
        v
Express API (JWT, OAuth, rate limiting)
        |
        v
SQLite + medios cifrados
```

## Tecnologías

| Backend | Frontend |
| --- | --- |
| Node.js, Express, better-sqlite3 | React 18, Vite, Tailwind CSS |
| JWT, bcrypt, Passport Google OAuth 2.0 | React Router v6, react-i18next |
| Helmet, express-rate-limit, i18next | Lucide React, html5-qrcode |
| Sharp, almacenamiento cifrado de medios | UI responsive y PWA-ready |

## Inicio rápido

### Requisitos

- Node.js 18+
- npm 9+
- Git

### 1. Instalar dependencias

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
npm run install-all
```

### 2. Crear el archivo de entorno local

```bash
cp .env.example .env
```

Configura al menos estos valores:

```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=un-secret-largo-y-aleatorio
APP_ENCRYPTION_KEY=32-byte-base64-o-64-char-hex-key
APP_ENCRYPTION_KEY_ID=2026-03-local
```

> [!TIP]
> Genera secretos locales seguros con `openssl rand -hex 32` para `JWT_SECRET` y `openssl rand -base64 32` para `APP_ENCRYPTION_KEY`.

Opcional en desarrollo local: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `RESEND_API_KEY`.

### 3. Ejecutar la app

```bash
npm run dev
```

URLs locales:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### 4. Build de producción

```bash
npm run build
npm start
```

### Alternativa con Docker

```bash
docker compose up -d
```

Para configuración avanzada, reverse proxy y despliegue en producción, consulta [DOCKER.md](DOCKER.md).

## Documentación

- [DOCKER.md](DOCKER.md): Docker, reverse proxy y autoalojamiento
- [README_ENVIRONMENT_SETUP.md](README_ENVIRONMENT_SETUP.md): variables de entorno y gestión de secretos
- [CONTRIBUTING.md](CONTRIBUTING.md): guía de contribución
- [SECURITY.md](SECURITY.md): proceso para reportar vulnerabilidades

## Nota sobre idiomas

El producto incluye **100+ paquetes de locale seleccionables**. Inglés y turco son los idiomas del producto revisados con más frecuencia; otras locales pueden hacer fallback por clave cuando falta una traducción.

## Contribuir

Los issues y pull requests son bienvenidos. Para cambios grandes, abre primero un issue para mantener la implementación alineada con el modelo de seguridad, el alcance por hogar y la estructura de localización.

## Nota legal

HomeInventory es un proyecto open source independiente. No está afiliado, respaldado ni conectado con ningún producto comercial o empresa que use un nombre similar.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
