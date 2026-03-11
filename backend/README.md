# Photobooth Backend

This backend now supports:

- Account signup/login
- Email verification (token flow)
- Password reset (token flow)
- Cloud project save/load
- Persistent share links (`?project=<id>`)

## 1) Local run (file database)

From repo root:

```bash
node backend/server.js
```

Open:

- `http://localhost:8787/photobooth/index.html`

Data is stored in `backend/data.json`.

## 2) PostgreSQL mode

Install backend deps:

```bash
npm install --prefix backend
```

Run with Postgres:

```bash
DATABASE_URL="postgres://user:pass@localhost:5432/photobooth" \
AUTH_SECRET="your-long-random-secret" \
BASE_URL="https://your-domain.com" \
node backend/server.js
```

When `DATABASE_URL` is present, the server auto-creates required tables.

## Notes

- `AUTH_SECRET` should be set in production.
- Verification/reset links are currently returned as placeholder URLs in API responses (no SMTP configured yet).
- Cloud save requires a verified email.
