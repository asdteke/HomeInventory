<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-full-dark.svg" />
    <img src="client/public/brand/logo-full-light.svg" alt="HomeInventory Logo" width="420" />
  </picture>
</p>

<h1 align="center">HomeInventory</h1>

<!-- Estado de la versión: línea de lanzamiento v2.2.0. -->

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
  <img src="https://github.com/asdteke/HomeInventory/actions/workflows/ci.yml/badge.svg" alt="CI status" />
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
  <a href="#documentación">Docs</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

## Vista previa

<p align="center">
  <img src="docs/assets/screenshot-landing.png" alt="Vista previa de la landing de HomeInventory" width="82%" />
</p>

<details>
<summary><strong>Más capturas: Inventario, Borrow Center, Vault, Categorías</strong></summary>

<br/>

<p align="center">
  <img src="docs/assets/screenshot-inventory.png" alt="Pantalla de inventario" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-borrow.png" alt="Pantalla de Borrow Center" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-vault.png" alt="Pantalla de Personal Vault" width="82%" />
</p>
<p align="center">
  <img src="docs/assets/screenshot-categories.png" alt="Pantalla de categorías" width="82%" />
</p>

</details>

HomeInventory está pensado para familias, compañeros de piso y hogares pequeños que necesitan un inventario práctico sin convertir registros privados en una hoja compartida.

> [!NOTE]
> **v2.2.0 es la línea de versión actual.** Cierra la alerta crítica de npm para `shell-quote`, sincroniza metadatos y documentación de la versión, publica paquetes verificados del launcher y documenta el estado upstream restante de Tauri/GLib. El trabajo de cámara móvil, TypeScript e interfaz queda en las secciones anteriores v2.1.x del changelog.

## Por qué HomeInventory

- **Un hogar, varias personas:** crea o únete a hogares, cambia el hogar activo y mantiene el inventario compartido limitado a los miembros correctos.
- **Registros reales de objetos:** fotos, habitaciones, ubicaciones, categorías, cantidades, garantías, facturas, notas y adjuntos.
- **Cliente con TypeScript:** la interfaz React ahora usa una base TypeScript/Vite, con mejor feedback del editor, refactors más seguros y comprobaciones en build.
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
| Lista de compras | Items manuales y vinculados al inventario, historial completado y sugerencias por bajo stock |
| Mantenimiento inteligente | Tareas recurrentes de cuidado, indicadores de vencimiento y cálculo automático de la próxima fecha |
| Etiquetas y escaneo | Escaneo de códigos de barras, etiquetas QR de objetos y acceso rápido móvil |
| Backup y restore | Exportación/importación solo para propietarios con confirmaciones protegidas |
| Auth y recuperación | JWT, Google OAuth, verificación por correo, TOTP 2FA, dispositivos de confianza y recovery keys |
| Desktop Launcher | GUI opcional con Tauri para setup local, chequeo de dependencias, inicio/parada de perfiles, backups, logs y acceso QR/LAN |
| Internacionalización | 100+ paquetes de locale seleccionables con fallback y validaciones automatizadas |

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

Elige el método de instalación que mejor encaje con tu flujo:

### Opción A: Desktop GUI Launcher

Para uso local o self-host, el Desktop GUI Launcher puede verificar dependencias, configurar un entorno local, aislar base de datos/uploads por perfil y ejecutar frontend y backend desde una sola ventana.

1. **Descargar:** Ve a [GitHub Releases](https://github.com/asdteke/HomeInventory/releases) y descarga el paquete del launcher para tu sistema operativo (`.dmg` para macOS, `.exe`/`.msi` para Windows, `.AppImage`/`.deb`/`.rpm` para Linux).
2. **Instalar y abrir:** Instala y ejecuta la aplicación.
3. **Iniciar:** Haz clic en **Launch HomeInventory**. El launcher revisa puertos, inicia API y UI, y muestra la URL local junto con un código QR para dispositivos en la misma red.

Para detalles de aislamiento y configuración avanzada, consulta [GUI_LAUNCHER.md](GUI_LAUNCHER.md).

---

### Opción B: Instalación por terminal

#### Requisitos

- Node.js 18+
- npm 9+
- Git

#### 1. Instalar dependencias

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
npm run install-all
```

#### 2. Crear el archivo de entorno local

```bash
cp .env.example .env
```

Configura al menos estos valores en `.env`:
```env
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
JWT_SECRET=un-secret-largo-y-aleatorio
APP_ENCRYPTION_KEY=32-byte-base64-o-64-char-hex-key
APP_ENCRYPTION_KEY_ID=2026-03-local
```
> [!TIP]
> Genera secretos seguros con `openssl rand -hex 32` para `JWT_SECRET` y `openssl rand -base64 32` para `APP_ENCRYPTION_KEY`.

#### 3. Ejecutar la app

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

#### 4. Build de producción

```bash
npm run build
npm start
```

---

### Opción C: Instalación con Docker

Despliega HomeInventory rápidamente con contenedores preconfigurados:

```bash
docker compose up -d
```
Para configuración avanzada, reverse proxy y despliegue en producción, consulta [DOCKER.md](DOCKER.md).

## Documentación

- [DOCKER.md](DOCKER.md): Docker, reverse proxy y autoalojamiento
- [GUI_LAUNCHER.md](GUI_LAUNCHER.md): Desktop GUI Launcher, aislamiento y guía de desarrollo
- [README_ENVIRONMENT_SETUP.md](README_ENVIRONMENT_SETUP.md): variables de entorno y gestión de secretos
- [CONTRIBUTING.md](CONTRIBUTING.md): guía de contribución
- [SECURITY.md](SECURITY.md): proceso para reportar vulnerabilidades
- [CHANGELOG.md](CHANGELOG.md): historial de versiones y notas de actualización
- [ROADMAP.md](ROADMAP.md): dirección del proyecto a corto plazo

Topics recomendados de GitHub para maintainers: `home-inventory`, `self-hosted`, `inventory-management`, `household`, `pwa`, `sqlite`, `express`, `react`, `docker`, `privacy`, `qr-code`, `barcode`, `2fa`.

## Nota sobre idiomas

El producto incluye **100+ paquetes de locale seleccionables**. Inglés y turco son los idiomas del producto revisados con más frecuencia; otras locales pueden hacer fallback por clave cuando falta una traducción.

## Contribuir

Los issues y pull requests son bienvenidos. Para cambios grandes, abre primero un issue para mantener la implementación alineada con el modelo de seguridad, el alcance por hogar y la estructura de localización.

## Nota legal

HomeInventory es un proyecto open source independiente. No está afiliado, respaldado ni conectado con ningún producto comercial o empresa que use un nombre similar.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
