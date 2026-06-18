const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const { OpenAI } = require('openai');

const app = express();
let db;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function getEmailText(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body === 'object') {
    return body.text || body.body || body.html || JSON.stringify(body);
  }
  return String(body);
}

// Simple CSV parser that respects quoted fields
function parseCsv(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // lookahead for escaped quote
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
      continue;
    }
    if (ch === '\r') continue; // strip CR from CRLF line endings
    if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += ch;
  }
  // push last token
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function cleanThousandSeparatorsInDollarAmounts(text) {
  // Replace occurrences like $1,800 or $12,345.67 -> $1800 and $12345.67
  return text.replace(/\$(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/g, (_m, g1) => '$' + g1.replace(/,/g, ''));
}


async function summarizeEmail({ to, from, subject, text }) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is not set. Skipping AI summary.');
    return 'OpenAI API key not configured. Summary unavailable.';
  }

  const prompt = `Email received by inventory@robertgraman.com from ${from} with subject \"${subject}\" and body \n${text}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are an assistant that summarizes inbound email messages for a shipping container inventory manager. Create a concise summary of the email, including the sender, location, size, type, container condition, color, quantity, price, and any other details.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 250,
  });

  console.log('OpenAI response:', response?.choices?.[0]?.message?.content?.trim() || 'No summary generated.');
  return response?.choices?.[0]?.message?.content?.trim() || 'No summary generated.';
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
      notes TEXT,
      sender TEXT
    )
  `);

}

// Capture raw body for fallback and debugging
app.use(express.json({
  verify: (req, _res, buf) => {
    try { req.rawBody = buf.toString(); } catch (e) { req.rawBody = undefined; }
  },
  limit: '20mb',
}));
// Parse URL-encoded bodies (for form POSTs from some email providers)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Parse raw/text bodies (catch raw MIME or text payloads, including CSV)
app.use(express.text({ type: ['text/*', 'message/rfc822', 'application/octet-stream', 'text/csv'], limit: '20mb' }));

// If JSON parsing fails (e.g., client sent CSV with wrong Content-Type),
// fall back to the captured raw body instead of crashing the request.
app.use((err, req, res, next) => {
  if (err && (err instanceof SyntaxError || err.type === 'entity.parse.failed')) {
    console.warn('Body parse failed, falling back to raw body.');
    // provide the raw text as req.body so downstream handlers can use it
    req.body = req.rawBody || '';
    return next();
  }
  return next(err);
});

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
    sender,
  } = req.body;

  const id = randomUUID();

  try {
    await runStatement(
      `INSERT INTO containers (
        id, vendor, location, size, type, container_condition,
        color, quantity, price, delivery, date, notes, sender
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
        from || null,
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
      sender: sender || null,
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
    sender,
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
        notes = $11,
        sender = $12
      WHERE id = $13`,
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
        sender || null,
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
      sender: sender || null,
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

app.post('/api/ai/query', async (req, res) => {
  try {
    const { query, history } = req.body;
    if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query text required' });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OpenAI API key not configured.' });
    }

    const rows = await getRows('SELECT * FROM containers ORDER BY vendor ASC');
    const inventoryText = rows.length
      ? rows.map(r =>
          `Vendor: ${r.vendor}, Location: ${r.location}, Size: ${r.size}ft, Type: ${r.type}, Condition: ${r.container_condition}, Color: ${r.color}, Qty: ${r.quantity}, Price: ${r.price}, Delivery: ${r.delivery || ''}${r.notes ? ', Notes: ' + r.notes : ''}${r.sender ? ', Sender: ' + r.sender : ''}`
        ).join('\n')
      : 'No containers in inventory.';

    const systemPrompt = `You are an inventory assistant for a shipping container company. Answer questions based ONLY on the inventory data provided below — never guess or make up numbers.

COUNTING RULES (follow exactly):
- The "Qty" field is the number of containers in that row. Never count rows — always sum the Qty values.
- When asked how many containers are available in total, add up every Qty value in the list.
- When filtering (e.g. by size, location, type, condition), add up the Qty values only for matching rows.
- Always show your arithmetic: list the matching rows with their Qty, then state the total.
- If no rows match, say "0 containers found matching that criteria."

LOCATION/PROXIMITY RULES (follow exactly):
- If the user asks for "closest" or "nearest" containers but does not say where they are, ask: "What city or zip code are you shipping to?"
- Once you have the user's location, use your knowledge of US geography to rank the inventory locations by driving distance from that point — closest first.
- List each location in ranked order with the available containers at that location (Vendor, Size, Type, Condition, Qty, Price).
- Only include locations that actually appear in the inventory — never suggest a location not in the data.
- If the user specifies a state or region (e.g. "Southeast", "Texas"), filter to inventory locations within or nearest to that area.
- Always clarify that distances are approximate and the customer should confirm availability before arranging transport.

Current inventory:
${inventoryText}`;

    const priorMessages = (history || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...priorMessages,
        { role: 'user', content: query },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    res.json({ answer: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error('AI query error:', err);
    res.status(500).json({ error: err.message || 'AI query failed.' });
  }
});

app.get('/api/email-summaries', async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM email_summaries ORDER BY received_at DESC');
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
    const responseBody = req.body;
    commitCSV(responseBody);
    
    const receivedAt = new Date();

    res.status(200).json({ ok: true});
  } catch (err) {
    console.error('Failed to handle inbound email:', err);
    res.status(500).json({ error: 'failed to process email' });
  }
});

async function commitCSV(csvText) {

    const raw = csvText;
    if (!raw || raw.trim().length === 0) return res.status(400).json({ error: 'Empty body' });

    // Clean common thousand separators in dollar amounts so CSV columns align
    const cleaned = cleanThousandSeparatorsInDollarAmounts(raw);

    const rows = parseCsv(cleaned);

    if (!rows || rows.length < 2) return ;

    const header = rows[0].map(h => (h || '').toString().trim());

    // Map CSV columns to containers table columns
    const mapping = {
      'Vendor': 'vendor',
      'Location': 'location',
      'Size': 'size',
      'Type': 'type',
      'Condition': 'container_condition',
      'Color': 'color',
      'Quantity': 'quantity',
      'Price': 'price',
      'Other Details': 'notes',
      'Email Sender': 'sender',
      'date': 'date',
    };

    const mappedHeaders = header.map(h => mapping[h] || null);

    // Determine sender from the first data row and delete their existing entries
    const senderColIndex = mappedHeaders.indexOf('sender');
    if (senderColIndex !== -1) {
      const firstDataRow = rows[1];
      const sender = (firstDataRow?.[senderColIndex] || '').toString().trim().replace(/^"|"$/g, '');
      if (sender) {
        const deleted = await runStatement('DELETE FROM containers WHERE sender = $1', [sender]);
        console.log(`Deleted ${deleted.rowCount} existing rows for sender: ${sender}`);
      }
    }

    const inserted = [];
    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      if (cols.length === 1 && cols[0].trim() === '') continue; // skip empty

      const record = {
        vendor: null,
        location: null,
        size: null,
        type: null,
        container_condition: null,
        color: null,
        quantity: null,
        price: null,
        delivery: null,
        date: null,
        notes: null,
        sender: null,
      };

      for (let i = 0; i < mappedHeaders.length; i++) {
        const key = mappedHeaders[i];
        if (!key) continue;
        let val = (cols[i] || '').toString().trim();
        // remove surrounding quotes
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (key === 'quantity') {
          const n = parseInt(val.replace(/[^0-9\-]/g, ''), 10);
          record.quantity = Number.isNaN(n) ? null : n;
        } else if (key === 'price') {
          // normalize price like $1800
          record.price = val.replace(/\s+/g, '');
        } else {
          record[key] = val;
        }
      }


      // Skip rows without vendor or location
      if (!record.vendor || !record.location) continue;

      // Insert into DB
      await runStatement(
        `INSERT INTO containers (
          id, vendor, location, size, type, container_condition,
          color, quantity, price, delivery, date, notes, sender
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          randomUUID(),
          record.vendor,
          record.location,
          record.size,
          record.type,
          record.container_condition,
          record.color,
          record.quantity === null ? 0 : record.quantity,
          record.price,
          record.delivery || '',
          record.date || '',
          record.notes || '',
          record.sender || '',
        ]
      );
      inserted.push(record);
    }
}

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
