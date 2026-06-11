# Shipping Container Inventory Website

A simple shipping container inventory dashboard backed by Node and SQLite.

## Files

- `index.html` — main dashboard and modal form
- `styles.css` — page layout and styling
- `script.js` — frontend logic with API calls
- `server.js` — Node Express server and SQLite integration
- `package.json` — dependencies and start script
- `.gitignore` — ignores `node_modules` and database file

## How to run

1. Open a terminal in this folder.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in your browser.

## Features

- Fetches inventory from a SQLite database via API
- Adds, edits, and deletes records with backend persistence
- Searches inventory by vendor, location, size, type, condition, color, delivery, and notes
- Serves the website and API from the same Node server

## Notes

- This app now uses MySQL only. SQLite is no longer supported.
- Sample data is seeded on first run if the database is empty.
- Start the backend before using the site in the browser.

## Using a hosted MySQL database

Import your SQL file into the GoDaddy MySQL database and set these environment variables on your deployment host:

- `DB_HOST=<your-database-host>`
- `DB_USER=<mysql-username>`
- `DB_PASSWORD=<mysql-password>`
- `DB_NAME=<database-name>`
- `DB_PORT=3306` (optional)

The app will connect to MySQL using these credentials.

If you deploy to a service like Render, make sure the database host allows remote connections from the service, or host the app in the same environment as the database.

## Importing your GoDaddy SQL dump

1. Copy your SQL dump file into the project folder or note its local path.
2. Set your MySQL credentials in environment variables:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
   - `DB_PORT=3306` (optional)
3. Run:

```bash
npm run import-sql -- ./your-dump-file.sql
```

That script connects to your GoDaddy-hosted MySQL database and executes the dump statements.

## Verify the imported schema

After importing, verify the table and row count with a MySQL client, for example:

```bash
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW TABLES; SELECT COUNT(*) FROM containers;"
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
