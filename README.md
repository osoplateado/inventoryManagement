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

- The SQLite database file is created automatically by `server.js`.
- Sample data is seeded on first run if the database is empty.
- Start the backend before using the site in the browser.

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
