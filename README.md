# Shipping Container Inventory Website

A simple shipping container inventory dashboard backed by Node and PostgreSQL.

## Files

- `index.html` — main dashboard and modal form
- `styles.css` — page layout and styling
- `script.js` — frontend logic with API calls
- `server.js` — Node Express server and PostgreSQL integration
- `package.json` — dependencies and start script
- `.gitignore` — ignores `node_modules`

## How to run

1. Open a terminal in this folder.
2. Run `npm install`.
3. Run `npm run build` to build the React app.
4. Run `npm start`.
5. Open `http://localhost:3000` in your browser.

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