const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');

const app = express();
const dbPath = process.env.DB_PATH || path.join(__dirname, 'inventory.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Unable to open SQLite database:', err);
    process.exit(1);
  }
});

app.use(express.json());
app.use(express.static(__dirname));

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS containers (
        id TEXT PRIMARY KEY,
        vendor TEXT,
        location TEXT,
        size TEXT,
        type TEXT,
        condition TEXT,
        color TEXT,
        quantity INTEGER,
        price TEXT,
        delivery TEXT,
        date TEXT,
        notes TEXT
      )
    `);

    db.get('SELECT COUNT(*) AS count FROM containers', (err, row) => {
      if (err) {
        console.error('Failed to query container count:', err);
        return;
      }

      if (row.count === 0) {
        const sampleRecords = [
          {
            vendor: 'ABC Containers',
            location: 'Memphis, TN',
            size: "40'",
            type: 'HC Cargo Worthy',
            condition: 'WWT',
            color: 'Beige',
            quantity: 12,
            price: '$2,450',
            delivery: 'FOB',
            date: '2026-06-07',
            notes: 'Limited availability',
          },
          {
            vendor: 'Delta Container Co.',
            location: 'Jonesboro, AR',
            size: "20'",
            type: 'Side Door',
            condition: '1-Trip',
            color: 'Gray',
            quantity: 6,
            price: '$3,100',
            delivery: 'Delivered',
            date: '2026-06-08',
            notes: 'Ready to ship',
          },
        ];

        const stmt = db.prepare(`
          INSERT INTO containers (
            id, vendor, location, size, type, condition,
            color, quantity, price, delivery, date, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        sampleRecords.forEach((record) => {
          stmt.run(
            randomUUID(),
            record.vendor,
            record.location,
            record.size,
            record.type,
            record.condition,
            record.color,
            record.quantity,
            record.price,
            record.delivery,
            record.date,
            record.notes
          );
        });

        stmt.finalize();
      }
    });
  });
}

function handleDbError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Database error' });
}

app.get('/api/containers', (req, res) => {
  db.all('SELECT * FROM containers ORDER BY date DESC, vendor ASC', (err, rows) => {
    if (err) return handleDbError(res, err);
    res.json(rows);
  });
});

app.post('/api/containers', (req, res) => {
  const {
    vendor,
    location,
    size,
    type,
    condition,
    color,
    quantity,
    price,
    delivery,
    date,
    notes,
  } = req.body;

  const id = randomUUID();
  db.run(
    `INSERT INTO containers (
      id, vendor, location, size, type, condition,
      color, quantity, price, delivery, date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      vendor,
      location,
      size,
      type,
      condition,
      color,
      Number(quantity),
      price,
      delivery,
      date,
      notes,
    ],
    function (err) {
      if (err) return handleDbError(res, err);
      res.status(201).json({
        id,
        vendor,
        location,
        size,
        type,
        condition,
        color,
        quantity: Number(quantity),
        price,
        delivery,
        date,
        notes,
      });
    }
  );
});

app.put('/api/containers/:id', (req, res) => {
  const { id } = req.params;
  const {
    vendor,
    location,
    size,
    type,
    condition,
    color,
    quantity,
    price,
    delivery,
    date,
    notes,
  } = req.body;

  db.run(
    `UPDATE containers SET
      vendor = ?,
      location = ?,
      size = ?,
      type = ?,
      condition = ?,
      color = ?,
      quantity = ?,
      price = ?,
      delivery = ?,
      date = ?,
      notes = ?
    WHERE id = ?`,
    [
      vendor,
      location,
      size,
      type,
      condition,
      color,
      Number(quantity),
      price,
      delivery,
      date,
      notes,
      id,
    ],
    function (err) {
      if (err) return handleDbError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'Record not found' });
      res.json({
        id,
        vendor,
        location,
        size,
        type,
        condition,
        color,
        quantity: Number(quantity),
        price,
        delivery,
        date,
        notes,
      });
    }
  );
});

app.delete('/api/containers/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM containers WHERE id = ?', [id], function (err) {
    if (err) return handleDbError(res, err);
    if (this.changes === 0) return res.status(404).json({ error: 'Record not found' });
    res.status(204).end();
  });
});

const port = process.env.PORT || 3000;
initializeDatabase();
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
