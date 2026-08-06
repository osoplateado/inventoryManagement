# Inventory Dashboard TODO

Tracks open action items for the inventory dashboard. Check items off as they're completed.

## Open

- [ ] Move the hardcoded `PROTECTED_SENDERS` list in `commitCSV` (server.js) to an environment variable instead of hardcoding the emails in source
- [ ] Set up separate env var configs per Render deployment/service so this project's env vars aren't present/shared when a different project's service isn't using them
- [ ] Validate the CSV received on `/email/inbound` (via curl/Make) before processing — if it's not in proper CSV format, return a non-2xx error status code instead of `200` so the sender (Make) knows to reprocess/retry it, rather than silently accepting malformed data (`commitCSV` in server.js currently always returns 200 regardless of whether parsing succeeded)
- [ ] Add authentication to the API endpoints — `/api/containers` (POST/PUT/DELETE), `/api/ai/query`, and `/email/inbound` are all currently open with no auth, so anyone who finds the URL can add/edit/delete inventory or rack up OpenAI usage
- [ ] Add shared-secret/signature verification to `/email/inbound` so only requests actually from Make are processed — right now anyone who knows the endpoint URL can POST a CSV and have it processed as if it came from Make, including wiping a non-protected sender's data
- [ ] Add pagination/limit to `GET /api/containers` — currently returns the entire table on every dashboard load with no limit, which won't scale as the table grows

## In Progress

- [ ]

## Done

- [x] Persist AI chat history — site is hosted on Render, whose filesystem doesn't survive restarts/deploys, so history is now persisted in Postgres instead (`chat_messages` table in server.js, keyed by a per-browser `sessionId` in `localStorage`); `POST /api/ai/query` saves both sides of each exchange, `GET /api/chat/:sessionId` hydrates the widget on reload, and a new `/inventory/chats` page (`GET /api/chat`, `ChatHistoryPage.jsx`) lists every conversation across all sessions
- [x] Auto-update the geocode cache when a new location is added instead of only warming it on startup — `commitCSV`, `POST /api/containers`, and `PUT /api/containers/:id` in server.js now geocode any new/changed location right after writing it, instead of waiting for the next `warmGeocodeCache` boot run
- [x] Prevent certain vendors' data from being overridden on import — protected sender emails (Mspence1290@gmail.com, betobeast1246@gmail.com, robertgraman1246@gmail.com) are now skipped in the delete-before-insert step in `commitCSV` (server.js)
- [x] Write a script to delete entries based on criteria (location, vendor, etc.) — `scripts/delete-by-vendor.js`, run via `npm run delete-by-vendor -- "value" [--field=vendor|location|size|type|container_condition|color|sender] [--contains] [--yes]`
- [x] Store `price` as a numeric column instead of `TEXT` — schema updated to `NUMERIC(12,2)`, added `scripts/migrate-price-numeric.js` for existing DBs, normalized on insert/update/CSV import, and reformatted as `$1,800` in the dashboard table, AI query responses, and the edit modal
- [x] Improve inventory table UX — added Excel-style per-column filter dropdowns (checkbox value selection with search) and Sort A to Z / Z to A on every column, plus a "Clear Filters & Sort" button (`InventoryDashboard.jsx`)
- [x] Normalize location names on import — `commitCSV` now batch-normalizes all locations in an incoming CSV to canonical "City, ST" form via an LLM call before insert (`normalizeLocationsBatch`/`getNormalizedLocation` in server.js), and `scripts/normalize-locations.js` (`npm run normalize-locations`) cleans up already-imported duplicates like the multiple Baltimore variants
