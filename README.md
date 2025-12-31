# dbchat

A lightweight **admin chat viewer + sender**.

- Frontend: plain `index.html` + `script.js` + `style.css`
- Backend: `Flask` API (`app.py`) with Postgres access via `psycopg`

The UI supports two modes:

- **DB mode**: Connect to a Postgres table, query messages, and send new admin messages (optionally with an attachment).
- **CSV mode**: Load a CSV file and browse chat history locally (no backend required).

## Project structure

- `index.html` — UI layout
- `style.css` — styling (dark/light theme + mobile responsive layout)
- `script.js` — frontend logic (modes, polling, chat rendering, sending)
- `app.py` — Flask backend (health check, DB test, query, send)
- `requirements.txt` — Python dependencies

## Requirements

- Python 3.10+ (recommended)
- A Postgres database (for DB mode)

## Setup

### 1) Create and activate a virtualenv

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2) Install dependencies

```bash
pip install -r requirements.txt
```

### 3) (Optional) Configure environment variables

The backend accepts a DB URL either from the request payload (`db_url`) or from the environment.

- `DATABASE_URL` (optional)
  - Example: `postgresql://user:pass@host:5432/dbname`
- `PORT` (optional)
  - Defaults to `8000`

## Run locally

### 1) Start the backend

```bash
python app.py
```

Production-style (Gunicorn):

```bash
gunicorn -w 2 -b 0.0.0.0:${PORT:-8000} app:app
```

By default it listens on:

- `http://localhost:8000`

### 2) Open the frontend

The frontend is static. You can open `index.html` directly, but using a simple local server is more reliable:

```bash
python3 -m http.server 5500
```

Then open:

- `http://localhost:5500/index.html`

### 3) Configure `API_BASE`

In `script.js`, `API_BASE` defaults to **same-origin**. That means:

- If you serve the frontend from the same domain as the backend, you do not need to change anything.
- If you open `index.html` directly or serve it from a different domain/port, set `API_BASE` to your backend URL, e.g. `http://localhost:8000`.

> DB features require `API_BASE` to be reachable.

## API

### `GET /api/health`

Returns API health.

Response:

```json
{ "ok": true, "ts": "2025-01-01T00:00:00+00:00" }
```

The frontend polls this endpoint every 5 seconds and sets the **Render: Connected/Disconnected** pill based on `ok`.

### `POST /api/db-test`

Payload:

```json
{ "db_url": "postgresql://..." }
```

Response:

```json
{ "ok": true, "connected": true }
```

### `POST /api/messages/query`

Payload:

```json
{
  "db_url": "postgresql://...",
  "table": "messages",
  "columns": ["id","user_identifier","sender","admin_name","message","file","created_at"],
  "since": "2025-01-01T00:00:00Z",
  "limit": 5000
}
```

Notes:

- If `since` is provided, records are filtered by `created_at > since`.
- `file` is returned as base64 if it is stored as bytes.

### `POST /api/messages/send`

Payload:

```json
{
  "db_url": "postgresql://...",
  "table": "messages",
  "columns": ["user_identifier","sender","admin_name","message","file","created_at"],
  "user_identifier": "user123",
  "sender": "admin",
  "admin_name": "Sumit",
  "message": "Hello",
  "file_base64": "...optional...",
  "created_at": "2025-01-01T00:00:00Z"
}
```

## Database table expectations

Your table must include (at minimum):

- `user_identifier` (text)
- `sender` (text) — `admin` or `user`
- `message` (text)
- `created_at` (timestamp)

Optional:

- `admin_name` (text)
- `file` (bytea) — attachments stored as raw bytes

## Frontend behavior

- **Manual refresh in DB mode** fetches only new rows (does not clear the current chat list).
- **New messages** appear with a small animation.
- **Duplicate pending/sent entries** are avoided by reconciling optimistic “pending” messages with the DB row once it appears.
- **CSV mode** hides DB-only controls (auto refresh + refresh button).
- **Reloading the page** starts fresh (no persisted session state).

## Troubleshooting

### “Render: Disconnected”

- Ensure the backend is running and `API_BASE` points to it.
- Verify:

```bash
curl http://localhost:8000/api/health
```

### DB mode not fetching

- Use **Settings → Postgres URL → Save connection**
- Confirm table name + columns match your schema
- Confirm CORS/network access between your static frontend and backend

### Attachments don’t preview

- Only these are previewed:
  - PDF
  - PNG
  - JPG/JPEG
- Max attachment size is 10MB

## Deployment notes (Render)

- Deploy `app.py` as a Render Web Service.
- Start command (example):

```bash
gunicorn -w 2 -b 0.0.0.0:$PORT app:app
```

- Set `PORT` via Render (Render typically injects `PORT`).
- If you want the backend to use a default DB URL without passing it from the UI, set `DATABASE_URL` in Render environment variables.

---

If you want, I can also add a sample SQL schema and a sample CSV format section, based on your real `messages` table columns.
