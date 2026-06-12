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
- Sample data is seeded on first run if the database is empty.
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
   - Set `DB_PATH=/disk/inventory.db` in Render environment variables.
5. If you already have a local `inventory.db`, include it in the repo for the initial deploy or copy it into the mounted disk inside the service.
6. Open the Render URL, and the app will read/write the SQLite file from the selected path.
