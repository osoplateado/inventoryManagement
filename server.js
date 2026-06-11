const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const app = express();
let db;

function handleDbError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Database error' });
}

async function getRow(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0];
}

async function getRows(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function runStatement(sql, params = []) {
  const [result] = await db.execute(sql, params);
  return result;
}

async function initializeMySQL() {
  const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:  Number(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  console.log('Starting MySQL connection with:', {
    DB_HOST: config.host,
    DB_USER: config.user,
    DB_NAME: config.database,
    DB_PORT: config.port,
    password: config.passsword,
  });

  if (!config.host || !config.user || !config.password || !config.database) {
    console.error('MySQL configuration is incomplete. Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.');
    process.exit(1);
  }

  return mysql.createPool(config);
}

async function initializeDatabase() {
  db = await initializeMySQL();

  await runStatement(`
    CREATE TABLE IF NOT EXISTS containers (
      id VARCHAR(36) PRIMARY KEY,
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

  const row = await getRow('SELECT COUNT(*) AS count FROM containers');
  if (!row || row.count === 0) {
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

    for (const record of sampleRecords) {
      await runStatement(
        `INSERT INTO containers (
          id, vendor, location, size, type, condition,
          color, quantity, price, delivery, date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          record.notes,
        ]
      );
    }
  }
}

app.use(express.json());
app.use(express.static(__dirname));

app.get('/inventory', (req, res) => {
  res.sendFile(path.join(__dirname, 'inventory.html'));
});

app.get('/api/containers', async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM containers ORDER BY date DESC, vendor ASC');
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.post('/api/containers', async (req, res) => {
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

  try {
    await runStatement(
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
      ]
    );

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
  } catch (err) {
    handleDbError(res, err);
  }
});

app.put('/api/containers/:id', async (req, res) => {
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

  try {
    const result = await runStatement(
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
      ]
    );

    const changed = result.affectedRows;
    if (changed === 0) return res.status(404).json({ error: 'Record not found' });

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
  } catch (err) {
    handleDbError(res, err);
  }
});

app.delete('/api/containers/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await runStatement('DELETE FROM containers WHERE id = ?', [id]);
    const deleted = result.affectedRows;
    if (deleted === 0) return res.status(404).json({ error: 'Record not found' });
    res.status(204).end();
  } catch (err) {
    handleDbError(res, err);
  }
});

const port = process.env.PORT || 3000;

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
      console.log('Using MySQL database');
    });
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
