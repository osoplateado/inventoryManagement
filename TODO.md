# Inventory Dashboard TODO

Tracks open action items for the inventory dashboard. Check items off as they're completed.

## Open

- [ ] Persist AI chat history — site is hosted on Render; figure out how to use Render's filesystem (or a DB) to store chat logs across requests/restarts
- [ ] Auto-update the geocode cache when a new location is added instead of only warming it on startup (`warmGeocodeCache` in server.js currently only runs once at boot via `app.listen`, so distance filtering won't work for a new location until the server restarts) — geocode new locations as part of the CSV import in `commitCSV`
- [ ] Move the hardcoded `PROTECTED_SENDERS` list in `commitCSV` (server.js) to an environment variable instead of hardcoding the emails in source
- [ ] Set up separate env var configs per Render deployment/service so this project's env vars aren't present/shared when a different project's service isn't using them
- [ ] Validate the CSV received on `/email/inbound` (via curl/Make) before processing — if it's not in proper CSV format, return a non-2xx error status code instead of `200` so the sender (Make) knows to reprocess/retry it, rather than silently accepting malformed data (`commitCSV` in server.js currently always returns 200 regardless of whether parsing succeeded)
- [ ] Add authentication to the API endpoints — `/api/containers` (POST/PUT/DELETE), `/api/ai/query`, and `/email/inbound` are all currently open with no auth, so anyone who finds the URL can add/edit/delete inventory or rack up OpenAI usage
- [ ] Add shared-secret/signature verification to `/email/inbound` so only requests actually from Make are processed — right now anyone who knows the endpoint URL can POST a CSV and have it processed as if it came from Make, including wiping a non-protected sender's data
- [ ] Add pagination/limit to `GET /api/containers` — currently returns the entire table on every dashboard load with no limit, which won't scale as the table grows
- [ ] Normalize location names on import — inconsistent formatting from different senders creates duplicate entries for the same city in filters/dropdowns (e.g. "Baltimore (MD)", "Baltimore, MD", "BALTIMORE, MD", "BALTIMORE,MD" all show up separately instead of collapsing into one)

## In Progress

- [ ]

## Done

- [x] Prevent certain vendors' data from being overridden on import — protected sender emails (Mspence1290@gmail.com, betobeast1246@gmail.com, robertgraman1246@gmail.com) are now skipped in the delete-before-insert step in `commitCSV` (server.js)
- [x] Write a script to delete entries based on criteria (location, vendor, etc.) — `scripts/delete-by-vendor.js`, run via `npm run delete-by-vendor -- "value" [--field=vendor|location|size|type|container_condition|color|sender] [--contains] [--yes]`
- [x] Store `price` as a numeric column instead of `TEXT` — schema updated to `NUMERIC(12,2)`, added `scripts/migrate-price-numeric.js` for existing DBs, normalized on insert/update/CSV import, and reformatted as `$1,800` in the dashboard table, AI query responses, and the edit modal
- [x] Improve inventory table UX — added Excel-style per-column filter dropdowns (checkbox value selection with search) and Sort A to Z / Z to A on every column, plus a "Clear Filters & Sort" button (`InventoryDashboard.jsx`)
