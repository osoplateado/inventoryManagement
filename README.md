# Shipping Container Inventory Website

A simple shipping container inventory dashboard backed by Node and PostgreSQL.

## Files

- `index.html` — Vite entry point
- `styles.css` — page layout and styling
- `src/` — React frontend (components, App.jsx)
- `server.js` — Node Express server and PostgreSQL integration
- `package.json` — dependencies and start script
- `.gitignore` — ignores `node_modules`

## How to run

1. Open a terminal in this folder.
2. Run `npm install`.
3. Run `npm run build` to build the React app.
4. Run `npm start`.
5. Open `http://localhost:3000` in your browser.

## Local development

Copy `.env.example` to `.env` in the project root and fill in real values — it's loaded automatically, no extra flags needed.

Then start the frontend and backend together:

```bash
npm run dev:all
```

This runs Vite (frontend, `http://localhost:5173`) and the Node/Express API server (auto-restarts via nodemon) at the same time.

## Testing

Tests run against a **separate local Postgres database** — never the real Render production DB — and mock the OpenAI client, so they're free, deterministic, and safe to run repeatedly.

One-time setup (installs a local Postgres server and creates a dedicated test role/database):

```bash
sudo apt update
sudo apt install -y postgresql
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER inventory_test WITH SUPERUSER PASSWORD 'localtest';"
sudo -u postgres createdb -O inventory_test inventory_test
```

Note: WSL doesn't auto-start services on its own — after a reboot/new WSL session you'll need `sudo service postgresql start` again before running tests locally.

Then:

```bash
npm test              # run everything once
npm run test:watch    # watch mode
npm run test:unit     # pure-function unit tests only (no DB needed)
npm run test:integration  # route/DB integration tests only
```

Test layout:

- `tests/unit/` — pure functions exported from `server.js` (CSV parsing, price normalization, SQL filter building, etc.) — no DB, no network.
- `tests/integration/` — hits the real Express `app` (via `supertest`) against the local test Postgres DB, covering things like CSV import validation, container pagination/CRUD, and AI chat persistence. `tests/integration/testServer.js` boots the DB and truncates app tables between tests; every test file that needs the server imports `app` from there.
- `tests/frontend/` — React component tests (`@testing-library/react` + jsdom) with `fetch` mocked, no backend needed.

The OpenAI client is swapped for a mock in every integration test (see `server.js`'s `__setOpenAIClientForTests`, used by `tests/integration/testServer.js`) — no test ever makes a real, billed call to OpenAI.

CI (`.github/workflows/test.yml`) runs the full suite on every push/PR using a throwaway Postgres service container, then verifies the frontend build.

## Features

- React frontend built with Vite
- Fetches inventory from a PostgreSQL-backed API
- Adds, edits, and deletes records with backend persistence
- Searches inventory by vendor, location, size, type, condition, color, delivery, and notes
- Serves the React app and API from the same Node server

## Notes

- This app now uses PostgreSQL only.
- Build the React frontend before starting the server in production.

## Using a hosted PostgreSQL database

You can connect with a full connection string using `DATABASE_URL`, or by setting individual credentials:

- `DATABASE_URL=postgres://user:password@host:5432/dbname`
- OR set:
  - `DB_HOST=<your-database-host>`
  - `DB_USER=<postgres-username>`
  - `DB_PASSWORD=<postgres-password>`
  - `DB_NAME=<database-name>`
  - `DB_PORT=5432` (optional)

If `DATABASE_URL` is present, it will be used first.

If your Postgres provider requires SSL/TLS, either add `?sslmode=require` to `DATABASE_URL` or set `DATABASE_SSL=true`.

If you deploy to a service like Render, make sure the database host allows remote connections from the service, or host the app in the same environment as the database.

## Inbound email summaries

This app can receive email payloads on `/email/inbound`, summarize them with OpenAI, and store them in `email_summaries`.

Required environment variables:

- `OPENAI_API_KEY` — your OpenAI API key
- `OPENAI_MODEL` — optional, defaults to `gpt-3.5-turbo`

The webhook saves incoming email metadata and text, then creates a summary and inserts a record into PostgreSQL.

Example local test with ngrok:

```bash
npm start
ngrok http 3000
```

Then set your email automation POST URI to:

```text
https://<your-ngrok-id>.ngrok.io/email/inbound
```

Test the webhook with curl:

```bash
curl -X POST "http://localhost:3000/email/inbound" --data-binary @test.csv -H "Content-Type: text/csv"
```

Retrieve summaries from the backend:

```bash
curl http://localhost:3000/api/email-summaries
```

## Importing your SQL dump

1. Copy your SQL dump file into the project folder or note its local path.
2. Set your PostgreSQL credentials in environment variables:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
   - `DB_PORT=5432` (optional)
3. Run:

```bash
npm run import-sql -- ./your-dump-file.sql
```

That script connects to your PostgreSQL database and executes the dump statements.

## Deleting entries by criteria

`scripts/delete-by-vendor.js` deletes rows matching a value in a chosen column (`vendor`, `location`, `size`, `type`, `container_condition`, `color`, or `sender`). It loads `.env` automatically, previews the matching rows, and asks for confirmation before deleting.

```bash
# Exact match on vendor (default field)
npm run delete-by-vendor -- "Vendor Name"

# Exact match on a different field
npm run delete-by-vendor -- "Denver" --field=location

# Partial, case-insensitive match
npm run delete-by-vendor -- "denver" --field=location --contains

# Skip the confirmation prompt
npm run delete-by-vendor -- "Vendor Name" --yes
```

## Verify the imported schema

After importing, verify the table and row count with a PostgreSQL client, for example:

```bash
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "\dt; SELECT COUNT(*) FROM containers;"
```

If `containers` appears and returns a count, your import succeeded.

## Deploying to Render

1. Push this project to GitHub.
2. Create a new Web Service in Render and connect your GitHub repo.
3. Use these settings:
   - Build command: `npm install`
   - Start command: `npm start`
4. Attach a persistent disk to the service if you want the database to survive redeploys.
5. Open the Render URL, and the app will connect to PostgreSQL using the configured database settings.


TODO:
- make staging table to insert before going to real table
- make AI model loaded through ENV VAR

curl -X POST "http://localhost:3000/email/inbound" --data-binary @test.csv -H "Content-Type: text/csv"

Cost:
- 6/month for a database
- domain
- email sumerization. Free if below a certain credit threshold
psql $DATABASE_URL

SELECT SUM(quantity) AS total_containers FROM containers;
 SELECT COUNT(*) AS total_rows FROM containers;
