## Environment Setup

This project runs in production on a cloud VM behind Nginx and PM2. To avoid breaking production, never edit cloud files directly when preparing the repo for public GitHub.

### Safe workflow
1. Keep cloud as source-of-truth and read-only for analysis.
2. Copy required config structure to local only.
3. Keep secrets in local/private `.env` files and cloud secret stores.
4. Commit only safe files (`.env.example`, app code, docs).

### Local setup
1. Install dependencies:
   - `npm install`
   - `npm install --prefix client`
2. Create local env file from example:
   - `cp .env.example .env`
3. Fill `.env` with real values (never commit it).
4. Build/start:
   - Dev: `npm run dev`
   - Prod-like local: `npm run build --prefix client && npm run start`

### Required environment variables
- `NODE_ENV`
- `PORT`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`

### Optional environment variables
- `BOOTSTRAP_ADMIN_EMAIL`
- `EXPOSE_SERVER_INFO`
## Disclaimer

This project is an independent open-source project.
It is not affiliated with, endorsed by, or connected to any commercial product
or company using a similar name.