const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const app = express();
let db;

function handleDbError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Database error' });
}

async function getRow(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0];
}

async function getRows(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function runStatement(sql, params = []) {
  const result = await db.query(sql, params);
  return result;
}

async function initializePostgres() {
  const connectionString = process.env.DATABASE_URL;
  const useSsl = process.env.DATABASE_SSL === 'true' || process.env.PGSSLMODE === 'require';
  const ssl = useSsl ? { rejectUnauthorized: false } : undefined;

  const config = connectionString
    ? { connectionString, max: 10, ssl }
    : {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || '5432'),
        max: 10,
        ssl,
      };

  console.log('Starting PostgreSQL connection with:', connectionString ? { DATABASE_URL: 'set', DATABASE_SSL: process.env.DATABASE_SSL } : {
    DB_HOST: config.host,
    DB_USER: config.user,
    DB_NAME: config.database,
    DB_PORT: config.port,
    DATABASE_SSL: process.env.DATABASE_SSL,
  });

  if (!connectionString && (!config.host || !config.user || !config.password || !config.database)) {
    console.error('PostgreSQL configuration is incomplete. Set DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.');
    process.exit(1);
  }

  return new Pool(config);
}

async function initializeDatabase() {
  db = await initializePostgres();

  await runStatement(`
    CREATE TABLE IF NOT EXISTS containers (
      id UUID PRIMARY KEY,
      vendor TEXT,
      location TEXT,
      size TEXT,
      type TEXT,
      container_condition TEXT,
      color TEXT,
      quantity INTEGER,
      price TEXT,
      delivery TEXT,
      date TEXT,
      notes TEXT
    )
  `);

  const row = await getRow('SELECT COUNT(*) AS count FROM containers');
  if (!row || Number(row.count) === 0) {
    const sampleRecords = [
      {
        vendor: 'ABC Containers',
        location: 'Memphis, TN',
        size: "40'",
        type: 'HC Cargo Worthy',
        container_condition: 'WWT',
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
        container_condition: '1-Trip',
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
          id, vendor, location, size, type, container_condition,
          color, quantity, price, delivery, date, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          randomUUID(),
          record.vendor,
          record.location,
          record.size,
          record.type,
          record.container_condition,
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
    container_condition,
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
        id, vendor, location, size, type, container_condition,
        color, quantity, price, delivery, date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        vendor,
        location,
        size,
        type,
        container_condition,
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
      container_condition,
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
    container_condition,
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
        vendor = $1,
        location = $2,
        size = $3,
        type = $4,
        container_condition = $5,
        color = $6,
        quantity = $7,
        price = $8,
        delivery = $9,
        date = $10,
        notes = $11
      WHERE id = $12`,
      [
        vendor,
        location,
        size,
        type,
        container_condition,
        color,
        Number(quantity),
        price,
        delivery,
        date,
        notes,
        id,
      ]
    );

    const changed = result.rowCount;
    if (changed === 0) return res.status(404).json({ error: 'Record not found' });

    res.json({
      id,
      vendor,
      location,
      size,
      type,
      container_condition,
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
    const result = await runStatement('DELETE FROM containers WHERE id = $1', [id]);
    const deleted = result.rowCount;
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
      console.log('Using PostgreSQL database');
    });
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
