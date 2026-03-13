

A small memory-capsule web project with:

- a landing page that lists capsules from `capsules.json`
- individual capsule pages with music, notes, and local media uploads
- a photobooth builder for making shareable photo strips
- a Node backend for auth and persistent photobooth project storage

## Project Structure

- `index.html` - main landing page
- `script.js` / `style.css` - shared frontend behavior and styling
- `capsules.json` - capsule card data shown on the homepage
- `1/`, `2/`, `4/`, `5/`, `group/` - capsule subpages and their styles/assets
- `photobooth/` - photobooth UI for building/exporting strips
- `backend/` - Node server for static hosting, auth, and cloud save/load

## Features

- Dynamic capsule cards loaded from `capsules.json`
- Create-a-capsule form on the homepage
- Memory prompts, random capsule open, and note jar interactions
- Per-capsule local photo uploads stored in browser `localStorage`
- Photobooth templates, drag-and-drop image placement, PNG export, local draft save/load
- Optional account system with email verification and password reset token flows
- Optional cloud project persistence with shareable project links

## Run Locally

The safest local workflow is to use the backend server, because the frontend reads JSON and the photobooth cloud features depend on API routes.

### Option 1: Run the full app

From the repository root:

```bash
npm install --prefix backend
node backend/server.js
```

Then open:

```text
http://localhost:8787/
```

Photobooth page:

```text
http://localhost:8787/photobooth/index.html
```

### Option 2: Frontend-only preview

If you only want to inspect static HTML/CSS pages, you can use any local static server from the repo root. This is enough for visual work, but not for auth or cloud persistence.

## Backend Modes

### File storage mode

If `DATABASE_URL` is not set, the backend uses:

- `backend/data.json` for users, auth tokens, and saved projects

This is the easiest setup for development.

### PostgreSQL mode

Set environment variables before starting the server:

```bash
DATABASE_URL="postgres://user:pass@localhost:5432/photobooth" \
AUTH_SECRET="your-long-random-secret" \
BASE_URL="https://your-domain.com" \
node backend/server.js
```

Notes:

- `AUTH_SECRET` should be changed for any non-local environment.
- verification and reset links are returned by the API as tokens/URLs; SMTP is not configured here.
- cloud save requires a verified email account.

## Editing Content

### Add or update homepage capsules

Edit `capsules.json`.

Each entry controls:

- displayed name
- route slug
- directory to open
- photobooth person key
- whether the capsule is active

### Edit a capsule page

Update the relevant folder, for example:

- `1/1.html`
- `2/2.html`
- `4/amishe.html`
- `5/5.html`
- `group/group.html`

### Edit photobooth behavior

Files:

- `photobooth/index.html`
- `photobooth/style.css`
- `photobooth/script.js`

### Edit backend behavior

Files:

- `backend/server.js`
- `backend/package.json`

## Data and Persistence

- Homepage-created capsules and capsule media uploads are stored in the browser for the local user.
- Photobooth drafts are stored in `localStorage`.
- Backend-backed auth, tokens, and saved cloud projects live in `backend/data.json` or PostgreSQL, depending on configuration.

## Current Notes

- The repo contains a `backend/README.md` focused on the photobooth backend; this root README covers the full project.
- `TODO.md` currently exists but is empty.
