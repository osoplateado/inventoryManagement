# Inventory Dashboard TODO

Tracks open action items for the inventory dashboard. Check items off as they're completed.

## Open

- [ ] Persist AI chat history — site is hosted on Render; figure out how to use Render's filesystem (or a DB) to store chat logs across requests/restarts
- [ ] Improve inventory table UX — add filtering and sorting
- [ ] Write a SQL script to delete entries based on criteria (location, vendor, etc.)
- [ ] Auto-update the geocode cache when a new location is added instead of only warming it on startup (`warmGeocodeCache` in server.js currently only runs once at boot via `app.listen`, so distance filtering won't work for a new location until the server restarts) — geocode new locations as part of the CSV import in `commitCSV`
- [ ] Move the hardcoded `PROTECTED_SENDERS` list in `commitCSV` (server.js) to an environment variable instead of hardcoding the emails in source
- [ ] Set up separate env var configs per Render deployment/service so this project's env vars aren't present/shared when a different project's service isn't using them

## In Progress

- [ ]

## Done

- [x] Prevent certain vendors' data from being overridden on import — protected sender emails (Mspence1290@gmail.com, betobeast1246@gmail.com, robertgraman1246@gmail.com) are now skipped in the delete-before-insert step in `commitCSV` (server.js)
