# Inventory Dashboard TODO

Tracks open action items for the inventory dashboard. Check items off as they're completed.

## Open

- [ ] Persist AI chat history — site is hosted on Render; figure out how to use Render's filesystem (or a DB) to store chat logs across requests/restarts
- [ ] Improve inventory table UX — add filtering and sorting
- [ ] Write a SQL script to delete entries based on criteria (location, vendor, etc.)

## In Progress

- [ ]

## Done

- [x] Prevent certain vendors' data from being overridden on import — protected sender emails (Mspence1290@gmail.com, betobeast1246@gmail.com, robertgraman1246@gmail.com) are now skipped in the delete-before-insert step in `commitCSV` (server.js)
