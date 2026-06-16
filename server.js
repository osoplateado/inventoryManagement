const express = require('express');
const fs = require('fs');
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
// Parse URL-encoded bodies (for form POSTs from some email providers)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Parse raw/text bodies (catch raw MIME or text payloads)
app.use(express.text({ type: ['text/*', 'message/rfc822', 'application/octet-stream'], limit: '20mb' }));

const staticPath = path.join(__dirname, 'dist');
app.use(express.static(staticPath));

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

// Simple AI query endpoint: performs a keyword search across container fields
app.post('/api/ai/query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query text required' });

    const q = `%${query}%`;
    const rows = await getRows(
      `SELECT * FROM containers WHERE
        vendor ILIKE $1 OR
        location ILIKE $1 OR
        size ILIKE $1 OR
        type ILIKE $1 OR
        container_condition ILIKE $1 OR
        color ILIKE $1 OR
        delivery ILIKE $1 OR
        notes ILIKE $1
      ORDER BY date DESC LIMIT 50`,
      [q]
    );

    res.json({ results: rows });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Inbound email webhook for inventory@robertgraman.com
app.post('/email/inbound', async (req, res) => {
  try {
    // Ensure emails directory exists
    const emailsDir = path.join(__dirname, 'emails');
    fs.mkdirSync(emailsDir, { recursive: true });

    // Collect useful pieces from common providers
    const headers = req.headers || {};
    const body = req.body;

    const to = headers.to || (body && body.to) || headers['recipient'] || 'unknown';
    const from = headers.from || (body && body.from) || headers['sender'] || 'unknown';
    const subject = headers.subject || (body && body.subject) || 'No subject';

    // Prepare a log object
    const emailRecord = {
      receivedAt: new Date().toISOString(),
      to,
      from,
      subject,
      headers,
      body,
    };

    // Log to console (prints contents)
    console.log('Inbound email received:', emailRecord);

    // Save to file for persistence
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const filePath = path.join(emailsDir, name);
    fs.writeFileSync(filePath, JSON.stringify(emailRecord, null, 2), 'utf8');

    res.status(200).json({ ok: true, saved: filePath });
  } catch (err) {
    console.error('Failed to handle inbound email:', err);
    res.status(500).json({ error: 'failed to process email' });
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
