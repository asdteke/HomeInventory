## Environment Setup

This repository contains a rebuilt frontend, encrypted storage flows, and optional secret-loading paths for Docker and OCI. Keep local and production secrets out of git.

### Safe workflow

1. Treat `.env` as local-only.
2. Commit only safe files such as `.env.example`, docs, and application code.
3. Use Docker secrets or OCI Secret Management for production secrets when possible.
4. Never copy real cloud secrets back into the repository.

### Local setup

1. Install dependencies:
   - `npm install`
   - `npm install --prefix client`
2. Create local env file:
   - `cp .env.example .env`
3. Set at least:
   - `NODE_ENV`
   - `PORT`
   - `SITE_URL`
   - `JWT_SECRET`
   - `APP_ENCRYPTION_KEY`
   - `APP_ENCRYPTION_KEY_ID`
4. Start locally:
   - `npm run dev`

### Optional local integrations

Set these only if you need the related feature locally:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `SUPPORT_EMAIL`

### Docker secrets

If you use `docker-compose.yml`, keep runtime secrets in files instead of `.env`.

Expected host-side files:

- `${HOMEINVENTORY_SECRETS_DIR:-./secrets}/jwt_secret.txt`
- `${HOMEINVENTORY_SECRETS_DIR:-./secrets}/app_encryption_key.txt`
- `${HOMEINVENTORY_SECRETS_DIR:-./secrets}/app_encryption_key_id.txt`

These are mounted inside the container at `/run/secrets` by default.

### OCI Secret Management

For OCI-hosted deployments:

1. Keep local development on plain `.env`.
2. Store production secrets in OCI Vault / Secret Management.
3. Allow the compute instance to read secret bundles.
4. Configure runtime bootstrap variables such as:
   - `SECRET_PROVIDER=oci`
   - `OCI_AUTH_MODE=instance_principal`
   - `OCI_REGION=<your-region>`
   - `OCI_VAULT_ID=<vault-ocid>` when secret names are used
   - `OCI_SECRET_MAPPINGS={"JWT_SECRET":"...","APP_ENCRYPTION_KEY":"...","APP_ENCRYPTION_KEY_ID":"..."}`

### Notes

- `server.js` bootstraps runtime secrets before loading the Express app.
- Maintenance commands such as encryption backfill and IndexNow submission use the same secret-loading path.
- `.env.example` is the only env file that should be committed.
