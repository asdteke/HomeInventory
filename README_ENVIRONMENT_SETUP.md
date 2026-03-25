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

### Optional: OCI Secret Management on Oracle Cloud
If the app runs on an OCI compute instance, you can keep production secrets in OCI Secret Management instead of the VM `.env`.

Suggested setup:
1. Keep local development on plain `.env`.
2. Create production secrets in OCI Vault / Secret Management.
3. Put the compute instance in a dynamic group.
4. Grant the instance permission to read secret bundles in the target compartment.
5. Set `SECRET_PROVIDER=oci` and define `OCI_SECRET_MAPPINGS` in the production environment.

Example runtime variables:
- `SECRET_PROVIDER=oci`
- `OCI_AUTH_MODE=instance_principal`
- `OCI_REGION=<your-region>`
- `OCI_VAULT_ID=<vault-ocid>` when mappings use secret names
- `OCI_SECRET_MAPPINGS={"JWT_SECRET":"homeinventory-jwt-secret","APP_ENCRYPTION_KEY":"homeinventory-app-encryption-key","APP_ENCRYPTION_KEY_ID":"homeinventory-app-encryption-key-id"}`

Example IAM policy:
- `allow dynamic-group <your-instance-dynamic-group> to read secret-bundles in compartment <your-compartment>`

The production entrypoint `server.js` now bootstraps OCI secrets automatically before loading the Express app, and maintenance commands such as encryption backfill and IndexNow submission use the same bootstrap path.
## Disclaimer

This project is an independent open-source project.
It is not affiliated with, endorsed by, or connected to any commercial product
or company using a similar name.
