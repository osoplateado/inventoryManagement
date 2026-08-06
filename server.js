const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const { OpenAI } = require('openai');

// Load local dev env vars from .env (no-op in production, where env vars are
// set through the hosting platform instead). Never overwrites vars already
// set in the environment.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, '.env'));

const app = express();
let db;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function handleDbError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Database error' });
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

// Strip currency formatting ($, commas, spaces) and coerce to a number for the
// NUMERIC price column. Returns null for empty/unparseable input.
function normalizePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

// Format a numeric price (or the numeric-string pg returns) as "$1,800".
function formatPrice(value) {
  const num = Number(value);
  return value === null || value === undefined || value === '' || Number.isNaN(num)
    ? 'N/A'
    : `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
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
      price NUMERIC(12,2),
      delivery TEXT,
      date TEXT,
      notes TEXT,
      sender TEXT
    )
  `);

  // Chat history, keyed by a per-browser session id (see sessionId in
  // InventoryAgent.jsx) so conversations survive page reloads and — since
  // this is a real table, not the app's local disk — Render restarts/deploys,
  // which wipe anything written to the filesystem.
  await runStatement(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await runStatement(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
    ON chat_messages (session_id, created_at)
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
  const normalizedPrice = normalizePrice(price);

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
        normalizedPrice,
        delivery,
        date,
        notes,
        sender || null,
      ]
    );

    // Geocode the location now so distance filtering works for this row
    // without waiting for the next server restart's cache warm-up.
    if (location) {
      geocodeBatch([location]).catch(err =>
        console.error('[POST /api/containers] geocoding location failed:', err.message)
      );
    }

    res.status(201).json({
      id,
      vendor,
      location,
      size,
      type,
      container_condition,
      color,
      quantity: Number(quantity),
      price: normalizedPrice,
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

  const normalizedPrice = normalizePrice(price);

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
        normalizedPrice,
        delivery,
        date,
        notes,
        sender || null,
        id,
      ]
    );

    const changed = result.rowCount;
    if (changed === 0) return res.status(404).json({ error: 'Record not found' });

    // Geocode in case the location was edited to something not already cached.
    if (location) {
      geocodeBatch([location]).catch(err =>
        console.error('[PUT /api/containers] geocoding location failed:', err.message)
      );
    }

    res.json({
      id,
      vendor,
      location,
      size,
      type,
      container_condition,
      color,
      quantity: Number(quantity),
      price: normalizedPrice,
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

// ── AI query helpers ──────────────────────────────────────────────────────────

const MINI_MODEL = process.env.OPENAI_MINI_MODEL || 'gpt-4.1-nano';

function extractJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function classifyIntent(query) {
  const response = await openai.chat.completions.create({
    model: MINI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Classify the user query as "structured_query" or "knowledge_question".\n' +
          '"structured_query": counting containers, asking how many exist, asking about size/location/type/price/quantity/condition/color/availability/sort. ' +
          'Examples: "how many containers are available", "how many 40ft do you have", "list all containers", "cheapest containers near Dallas".\n' +
          '"knowledge_question": ONLY when the user explicitly asks about free-text notes, damage descriptions, or qualitative written observations in notes. ' +
          'Examples: "which containers have rust noted", "show containers with damage in the notes".\n' +
          'When in doubt, use "structured_query".\n' +
          'Reply with JSON only: {"intent":"structured_query"} or {"intent":"knowledge_question"}',
      },
      { role: 'user', content: query },
    ],
    temperature: 0,
    max_tokens: 30,
    response_format: { type: 'json_object' },
  });
  const parsed = extractJson(response.choices[0].message.content);
  return parsed?.intent === 'knowledge_question' ? 'knowledge_question' : 'structured_query';
}

async function generateFilters(query, history) {
  const priorMessages = (history || []).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text,
  }));

  const response = await openai.chat.completions.create({
    model: MINI_MODEL,
    messages: [
      {
        role: 'system',
        content: `Extract structured filters from the user's container inventory question. Reply with JSON only.
Schema (all fields optional, use null when not specified):
{
  "size": "20" | "40" | null,
  "type": string | null,
  "location": string | null,
  "maxDistance": number | null,
  "condition": string | null,
  "color": string | null,
  "maxPrice": number | null,
  "minQuantity": number | null,
  "sort": "price_asc" | "price_desc" | "quantity_desc" | "location_asc" | null,
  "limit": number | null,
  "noteKeywords": string | null
}

IMPORTANT: "noteKeywords" is ONLY for searching the free-text notes field. NEVER put generic phrases like "available", "for sale", "in stock", or "available for sale" into noteKeywords — these are natural language and do not filter notes. If the user says "available for sale" or "in stock", treat it as a count/listing query with no noteKeywords.

INHERITANCE RULE: If the current message references a previous result ("from that list", "those results", "cheapest/most expensive from that", etc.) WITHOUT specifying a new location or distance, inherit location and maxDistance from the most recent user message in conversation history that contained them.
If the current message specifies explicit new values (a city, a mileage), use those instead — do not inherit.

Examples:
- "40ft high cube in Denver under $3000" → {"size":"40","type":"HC","location":"Denver","maxPrice":3000}
- "cheapest containers near Houston" → {"location":"Houston","sort":"price_asc"}
- "how many 20ft are available" → {"size":"20","noteKeywords":null}
- "how many 40 foot containers are available for sale" → {"size":"40","noteKeywords":null}
- "how many containers are available for sale" → {"noteKeywords":null}
- "containers within 500 miles of Dallas" → {"location":"Dallas","maxDistance":500}
- "list all containers within 1000 miles of Saint Louis MO" → {"location":"Saint Louis","maxDistance":1000}
- "cheapest from that list" (history had "within 500 miles of Saint Louis") → {"location":"Saint Louis","maxDistance":500,"sort":"price_asc"}`,
      },
      ...priorMessages,
      { role: 'user', content: query },
    ],
    temperature: 0,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  });

  return extractJson(response.choices[0].message.content) ?? {};
}

function buildSqlFromFilters(filters) {
  const conditions = [];
  const params = [];

  if (filters.size) {
    params.push(`${filters.size}%`);
    conditions.push(`size ILIKE $${params.length}`);
  }
  if (filters.type) {
    params.push(`%${filters.type}%`);
    conditions.push(`type ILIKE $${params.length}`);
  }
  if (filters.location && !filters.maxDistance) {
    const cityOnly = filters.location.split(',')[0].trim();
    params.push(`%${cityOnly}%`);
    conditions.push(`location ILIKE $${params.length}`);
  }
  if (filters.condition) {
    params.push(`%${filters.condition}%`);
    conditions.push(`container_condition ILIKE $${params.length}`);
  }
  if (filters.color) {
    params.push(`%${filters.color}%`);
    conditions.push(`color ILIKE $${params.length}`);
  }
  if (filters.minQuantity) {
    params.push(filters.minQuantity);
    conditions.push(`quantity >= $${params.length}`);
  }
  if (filters.noteKeywords) {
    params.push(`%${filters.noteKeywords}%`);
    conditions.push(`notes ILIKE $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap = {
    price_asc: 'price ASC',
    price_desc: 'price DESC',
    quantity_desc: 'quantity DESC',
    location_asc: 'location ASC',
  };
  const orderBy = filters.sort && sortMap[filters.sort]
    ? `ORDER BY ${sortMap[filters.sort]}`
    : 'ORDER BY vendor ASC';

  // Only apply LIMIT in SQL when there is no distance filter — otherwise
  // we apply the limit in JS after filterByDistance runs.
  const limit = (filters.limit && !filters.maxDistance) ? `LIMIT ${Math.min(Number(filters.limit), 100)}` : '';

  return { sql: `SELECT * FROM containers ${where} ${orderBy} ${limit}`.trim(), params, jsLimit: filters.maxDistance && filters.limit ? Math.min(Number(filters.limit), 100) : null };
}

async function searchNotesSemantically(query) {
  // Extract keywords from query then use full-text ILIKE search on notes field.
  // (Replace with pgvector + OpenAI embeddings for true semantic search.)
  const kwResponse = await openai.chat.completions.create({
    model: MINI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Extract the 1-3 most important search keywords from the question. Reply with JSON only: {"keywords":"word1 word2"}',
      },
      { role: 'user', content: query },
    ],
    temperature: 0,
    max_tokens: 40,
    response_format: { type: 'json_object' },
  });

  let keywords = query;
  const kw = extractJson(kwResponse.choices[0].message.content);
  if (kw?.keywords) keywords = kw.keywords;

  const terms = keywords.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return getRows('SELECT * FROM containers ORDER BY vendor ASC');

  const conditions = terms.map((_, i) => `notes ILIKE $${i + 1}`);
  const params = terms.map(t => `%${t}%`);
  return getRows(
    `SELECT * FROM containers WHERE ${conditions.join(' OR ')} ORDER BY vendor ASC`,
    params
  );
}

async function summarizeContainerResults(query, rows, history) {
  const priorMessages = (history || []).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text,
  }));

  const totalQuantity = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  // Normalize location to a grouping key: city name only, lowercased
  function locKey(loc) {
    return (loc || '').split(',')[0].trim().toLowerCase();
  }
  // From all raw location strings that share a key, pick the best display name:
  // prefer the variant that includes a state/province code, then title-case it.
  function bestDisplayName(rawNames) {
    const withState = rawNames.find(n => n.includes(','));
    const base = withState || rawNames[0] || '';
    const [city, state] = base.split(',');
    const titleCity = city.trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(\w+)\b/g, w => w.toLowerCase().replace(/^./, c => c.toUpperCase()));
    return state ? `${titleCity}, ${state.trim().toUpperCase()}` : titleCity;
  }

  // Pre-aggregate by normalized location key
  const byLocation = {};
  const rawNamesByKey = {};
  for (const r of rows) {
    const raw = r.location || 'Unknown';
    const key = locKey(raw);
    if (!byLocation[key]) {
      byLocation[key] = { qty: 0, sizes: new Set(), types: new Set(), conditions: new Set(), prices: [], vendors: new Set(), senders: new Set(), rows: [] };
      rawNamesByKey[key] = new Set();
    }
    rawNamesByKey[key].add(raw);
    const entry = byLocation[key];
    entry.qty += Number(r.quantity) || 0;
    if (r.size) entry.sizes.add(r.size + 'ft');
    if (r.type) entry.types.add(r.type);
    if (r.container_condition) entry.conditions.add(r.container_condition);
    if (r.price) entry.prices.push(r.price);
    if (r.vendor) entry.vendors.add(r.vendor);
    if (r.sender) entry.senders.add(r.sender);
    entry.rows.push(r);
  }

  // Resolve display names
  const displayName = {};
  for (const key of Object.keys(byLocation)) {
    displayName[key] = bestDisplayName([...rawNamesByKey[key]]);
  }

  const locationCount = Object.keys(byLocation).length;
  const isPriceQuery = /cheap|expensive|lowest price|highest price|best price|most expensive/i.test(query);
  const USE_AGGREGATED = !isPriceQuery && (locationCount > 3 || rows.length > 20);

  // For aggregated results, build the formatted table in JS so the model
  // never has to decide which locations to include.
  let inventoryText;

  if (!rows.length) {
    inventoryText = 'No containers matched that criteria.';
  } else if (USE_AGGREGATED) {
    inventoryText = Object.entries(byLocation).map(([key, d]) => {
      const numericPrices = d.prices.map(p => parseFloat(String(p).replace(/[^0-9.]/g, ''))).filter(n => !isNaN(n) && n > 0);
      const priceStr = numericPrices.length
        ? `$${Math.min(...numericPrices).toLocaleString()} – $${Math.max(...numericPrices).toLocaleString()}`
        : 'N/A';
      const sendersStr = d.senders.size ? ` | Contacts: ${[...d.senders].join(', ')}` : '';
      return `Location: ${displayName[key]} | Total Qty: ${d.qty} | Sizes: ${[...d.sizes].join(', ')} | Types: ${[...d.types].join(', ')} | Conditions: ${[...d.conditions].join(', ')} | Price range: ${priceStr} | Vendors: ${[...d.vendors].join(', ')}${sendersStr}`;
    }).join('\n');
  } else {
    const displayRows = isPriceQuery ? rows.slice(0, 15) : rows;
    inventoryText = displayRows.map(r =>
      `Vendor: ${r.vendor}, Location: ${r.location}, Size: ${r.size}ft, Type: ${r.type}, Condition: ${r.container_condition}, Color: ${r.color}, Qty: ${r.quantity}, Price: ${formatPrice(r.price)}, Delivery: ${r.delivery || ''}${r.sender ? ', Contact: ' + r.sender : ''}${r.notes ? ', Notes: ' + r.notes : ''}`
    ).join('\n');
  }

  // For listing queries always build the response directly in JS so the LLM
  // cannot selectively omit rows or locations.
  const isListingQuery = /list|show|what.*available|within.*mile|all container/i.test(query);
  if (isListingQuery) {
    if (rows.length === 0) return 'No containers matched that criteria.';
    const sections = Object.entries(byLocation).map(([key, d]) => {
      const lines = d.rows.map(r =>
        `  - ${r.vendor}: ${r.size} ${r.type}, ${r.container_condition}, ${r.color}, Qty: ${r.quantity}, Price: ${formatPrice(r.price)}${r.delivery ? ', Delivery: ' + r.delivery : ''}${r.sender ? ', Contact: ' + r.sender : ''}${r.notes ? ', Notes: ' + r.notes : ''}`
      ).join('\n');
      return `**${displayName[key]}** (${d.qty} containers):\n${lines}`;
    });
    return `**${totalQuantity} total containers across ${locationCount} location${locationCount === 1 ? '' : 's'}:**\n\n${sections.join('\n\n')}`;
  }

  const systemContent = `You are an inventory assistant for a shipping container company.
IMPORTANT: The inventory data block below is the ONLY source of truth for this response. Any inventory data in the conversation history is from a previous query and must be ignored — use only what is shown here. Never invent numbers.
IMPORTANT: All rows below have already been pre-filtered to match the user's criteria, including any distance or proximity requirements. Do NOT question whether the results are within range — they already are. Answer the user's question directly using only the data provided.

Total containers across all results: ${totalQuantity}

${USE_AGGREGATED ? 'Inventory grouped by location:' : 'Matching inventory rows:'}
${inventoryText}`;

  const response = await openai.chat.completions.create({
    model: MINI_MODEL,
    messages: [
      { role: 'system', content: systemContent },
      ...priorMessages,
      { role: 'user', content: query },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  });

  return (response.choices[0].message.content ?? '').trim() || 'No answer generated.';
}

const geocodeCache = new Map();
let geocodeCacheReady = false;

const GEOCODE_CHUNK_SIZE = 40;

async function geocodeBatch(locations) {
  const uncached = [...new Set(locations.map(s => s.trim()).filter(Boolean))]
    .filter(loc => !geocodeCache.has(loc.toLowerCase()));
  if (uncached.length === 0) return;

  // Chunk the request — a single call covering hundreds of locations can produce
  // a JSON response long enough to get cut off by max_tokens, which silently
  // yields zero cached entries with no error.
  for (let i = 0; i < uncached.length; i += GEOCODE_CHUNK_SIZE) {
    const chunk = uncached.slice(i, i + GEOCODE_CHUNK_SIZE);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a geocoding service. Return a JSON object where each key is the EXACT location string provided and the value is [latitude, longitude]. Include ALL locations. Use city-center coordinates.',
        },
        { role: 'user', content: chunk.join('\n') },
      ],
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    const raw = extractJson(content);
    if (raw === null) {
      console.warn(`[geocodeBatch] failed to parse JSON for chunk of ${chunk.length} locations (finish_reason: ${response.choices[0].finish_reason}); skipping this chunk`);
      continue;
    }

    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') {
        geocodeCache.set(k.toLowerCase(), v);
      }
    }
  }
}

async function geocodeCities(locationStrings) {
  await geocodeBatch(locationStrings);
  const result = {};
  for (const loc of locationStrings) {
    const key = loc.trim().toLowerCase();
    const coords = geocodeCache.get(key);
    if (coords) result[key] = coords;
  }
  return result;
}

async function warmGeocodeCache() {
  try {
    const rows = await getRows('SELECT DISTINCT location FROM containers WHERE location IS NOT NULL');
    const locations = rows.map(r => r.location).filter(Boolean);
    console.log(`Warming geocode cache for ${locations.length} locations...`);
    await geocodeBatch(locations);
    geocodeCacheReady = true;
    console.log(`Geocode cache ready: ${geocodeCache.size} entries`);

    const missing = locations.filter(loc => !geocodeCache.has(loc.trim().toLowerCase()));
    if (missing.length > 0) {
      console.warn(`Geocode cache missing ${missing.length} location(s), not resolvable by geocoding: ${JSON.stringify(missing)}`);
    }
  } catch (err) {
    console.error('Geocode cache warm-up failed:', err.message);
  }
}

// ── Location normalization ──────────────────────────────────────────────────
// Different senders format the same city inconsistently (e.g. "BALTIMORE,MD",
// "Baltimore (MD)", "Baltimore, Maryland"), which otherwise creates duplicate
// entries in location filters/dropdowns. Normalize to a canonical "City, ST"
// form via an LLM call, cached so repeat variants are free after the first hit.
const locationNormalizeCache = new Map(); // rawLower -> canonical "City, ST"
const LOCATION_CHUNK_SIZE = 40;

async function normalizeLocationsBatch(rawLocations) {
  if (!process.env.OPENAI_API_KEY) return;

  const uncached = [...new Set(rawLocations.map(s => (s || '').trim()).filter(Boolean))]
    .filter(loc => !locationNormalizeCache.has(loc.toLowerCase()));
  if (uncached.length === 0) return;

  for (let i = 0; i < uncached.length; i += LOCATION_CHUNK_SIZE) {
    const chunk = uncached.slice(i, i + LOCATION_CHUNK_SIZE);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You normalize US city/state location strings for a shipping container inventory system. ' +
              'For each input string, return its canonical form as "City, ST" (title-case city name, ' +
              '2-letter uppercase USPS state code). Treat formatting differences as the same place: ' +
              '"BALTIMORE,MD", "Baltimore (MD)", "Baltimore, Maryland", and "baltimore, md" must all map ' +
              'to "Baltimore, MD". If a string has no discernible city/state (or is not a US location), ' +
              'return it trimmed with sensible title-casing instead of guessing. ' +
              'Return a JSON object mapping each EXACT input string (as given) to its normalized form.',
          },
          { role: 'user', content: chunk.join('\n') },
        ],
        temperature: 0,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      const raw = extractJson(content);
      if (raw === null) {
        console.warn(`[normalizeLocationsBatch] failed to parse JSON for chunk of ${chunk.length} locations (finish_reason: ${response.choices[0].finish_reason}); leaving them unnormalized`);
        continue;
      }

      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string' && v.trim()) {
          locationNormalizeCache.set(k.toLowerCase(), v.trim());
        }
      }
    } catch (err) {
      console.error('[normalizeLocationsBatch] request failed, leaving chunk unnormalized:', err.message);
    }
  }
}

// Falls back to the original (trimmed) string if normalization is unavailable or failed for it.
function getNormalizedLocation(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return trimmed;
  return locationNormalizeCache.get(trimmed.toLowerCase()) || trimmed;
}

async function getDrivingDistances(targetCoords, destCoordsMap) {
  // destCoordsMap: { 'city key': [lat, lon] }
  const entries = Object.entries(destCoordsMap);
  if (entries.length === 0) return {};

  // OSRM expects lon,lat order
  const coordStr = [targetCoords, ...entries.map(([, c]) => c)]
    .map(([lat, lon]) => `${lon},${lat}`)
    .join(';');

  const url = `http://router.project-osrm.org/table/v1/driving/${coordStr}?sources=0&annotations=distance`;
  console.log('OSRM url:', url);

  let data;
  try {
    const resp = await fetch(url);
    data = await resp.json();
  } catch (err) {
    console.error('OSRM fetch error:', err.message);
    return {};
  }

  console.log('OSRM response code:', data.code, '| distances row length:', data.distances?.[0]?.length);

  // distances[0] is source→each coord in meters; index 0 = source→itself (0)
  const distances = data.distances?.[0];
  if (!distances) return {};

  const result = {};
  entries.forEach(([key], i) => {
    const meters = distances[i + 1];
    result[key] = meters != null ? meters / 1609.344 : null;
  });
  console.log('driving distances (miles):', result);
  return result;
}

async function filterByDistance(targetLocation, maxDistanceMiles, rows) {
  const targetKey = targetLocation.trim().toLowerCase();
  const rowLocations = rows.map(r => (r.location || '').trim());

  const coords = await geocodeCities([targetLocation.trim(), ...rowLocations]);
  console.log('geocoded coords keys:', Object.keys(coords));
  console.log('looking up target key:', targetKey);

  const targetCoords = coords[targetKey];
  if (!targetCoords) {
    console.warn(`filterByDistance: could not geocode "${targetLocation}", skipping distance filter`);
    return rows;
  }

  const destCoordsMap = {};
  for (const loc of rowLocations) {
    const key = loc.toLowerCase();
    if (coords[key]) destCoordsMap[key] = coords[key];
  }

  const drivingDistances = await getDrivingDistances(targetCoords, destCoordsMap);

  const unknownCities = [];
  const filtered = rows.filter(r => {
    const key = (r.location || '').trim().toLowerCase();
    const distMiles = drivingDistances[key];
    if (distMiles == null) {
      unknownCities.push(r.location);
      return false;
    }
    return distMiles <= maxDistanceMiles;
  });

  if (unknownCities.length > 0) {
    console.warn('filterByDistance: no driving route found (excluded):', [...new Set(unknownCities)]);
  }

  return filtered;
}

// ── AI query endpoint ─────────────────────────────────────────────────────────

// Remember the last distance filter so follow-up queries ("cheapest from that list") can inherit it
let lastDistanceFilter = null;

const FOLLOW_UP_RE = /\b(that list|those|from (?:the|that)|same (?:area|location|list)|of (?:the|those|that))\b/i;

// Persist a chat message; logs but doesn't throw so a DB hiccup never breaks
// the actual AI response the user is waiting on.
async function saveChatMessage(sessionId, role, text) {
  if (!sessionId) return;
  try {
    await runStatement(
      'INSERT INTO chat_messages (id, session_id, role, text) VALUES ($1, $2, $3, $4)',
      [randomUUID(), sessionId, role, text]
    );
  } catch (err) {
    console.error('[saveChatMessage] failed to persist message:', err.message);
  }
}

// All conversations across every browser session, grouped and newest-first —
// backs the standalone chat history page.
app.get('/api/chat', async (req, res) => {
  try {
    const rows = await getRows(
      'SELECT session_id, role, text, created_at FROM chat_messages ORDER BY created_at ASC'
    );

    const bySession = new Map();
    for (const row of rows) {
      if (!bySession.has(row.session_id)) bySession.set(row.session_id, []);
      bySession.get(row.session_id).push({ role: row.role, text: row.text, createdAt: row.created_at });
    }

    const sessions = [...bySession.entries()]
      .map(([sessionId, messages]) => ({
        sessionId,
        startedAt: messages[0].createdAt,
        lastMessageAt: messages[messages.length - 1].createdAt,
        messages,
      }))
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.json({ sessions });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/chat/:sessionId', async (req, res) => {
  try {
    const rows = await getRows(
      'SELECT role, text FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.sessionId]
    );
    res.json({ messages: rows });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.delete('/api/chat/:sessionId', async (req, res) => {
  try {
    await runStatement('DELETE FROM chat_messages WHERE session_id = $1', [req.params.sessionId]);
    res.status(204).end();
  } catch (err) {
    handleDbError(res, err);
  }
});

app.post('/api/ai/query', async (req, res) => {
  try {
    const { query, history, sessionId } = req.body;
    if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query text required' });

    console.log('AI query:', query);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OpenAI API key not configured.' });
    }

    const intent = await classifyIntent(query);

    let rows;
    if (intent === 'knowledge_question') {
      rows = await searchNotesSemantically(query);
      if (rows.length === 0) {
        // Fallback: re-run as structured query in case the classifier misfired
        const filters = await generateFilters(query, history);
        const { sql, params } = buildSqlFromFilters(filters);
        rows = await getRows(sql, params);
      }
    } else {
      const filters = await generateFilters(query, history);

      // Inherit last distance filter when this is a follow-up that doesn't specify a new location
      if (!filters.maxDistance && !filters.location && lastDistanceFilter && FOLLOW_UP_RE.test(query)) {
        filters.location = lastDistanceFilter.location;
        filters.maxDistance = lastDistanceFilter.maxDistance;
      }
      // Save distance filter for future follow-ups
      if (filters.maxDistance && filters.location) {
        lastDistanceFilter = { location: filters.location, maxDistance: filters.maxDistance };
      }

      console.log('filters:', JSON.stringify(filters));
      const { sql, params, jsLimit } = buildSqlFromFilters(filters);
      rows = await getRows(sql, params);
      if (filters.maxDistance && filters.location) {
        rows = await filterByDistance(filters.location, filters.maxDistance, rows);
        console.log('rows after distance filter:', rows.length, [...new Set(rows.map(r => r.location))]);
      }

      // price is a NUMERIC column so SQL already sorts it correctly; this JS
      // re-sort just re-applies it after filterByDistance, which runs after
      // the SQL ORDER BY and can leave rows in a different order.
      if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
        const parsePrice = p => parseFloat(String(p || '').replace(/[^0-9.]/g, '')) || Infinity;
        rows = [...rows].sort((a, b) =>
          filters.sort === 'price_asc'
            ? parsePrice(a.price) - parsePrice(b.price)
            : parsePrice(b.price) - parsePrice(a.price)
        );
      }

      // Apply limit in JS after distance filter and sort
      if (jsLimit) rows = rows.slice(0, jsLimit);
    }

    const answer = await summarizeContainerResults(query, rows, history);

    // Persist both sides of the exchange so the conversation survives a page
    // reload or a server restart, not just the lifetime of the React state.
    await saveChatMessage(sessionId, 'user', query);
    await saveChatMessage(sessionId, 'assistant', answer);

    res.json({ answer });
  } catch (err) {
    console.error('AI query error:', err);
    res.status(500).json({ error: err.message || 'AI query failed.' });
  }
});

app.get('/api/geocode-status', (req, res) => {
  res.json({ ready: geocodeCacheReady });
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
    console.log('[email/inbound] content-type:', req.headers['content-type']);
    console.log('[email/inbound] body type:', typeof responseBody, 'isBuffer:', Buffer.isBuffer(responseBody));
    console.log('[email/inbound] body preview:', typeof responseBody === 'string'
      ? `${responseBody.length} chars: ${responseBody.slice(0, 300)}`
      : JSON.stringify(responseBody).slice(0, 300));
    commitCSV(responseBody).catch(err => console.error('[email/inbound] commitCSV failed:', err));

    const receivedAt = new Date();

    res.status(200).json({ ok: true});
  } catch (err) {
    console.error('Failed to handle inbound email:', err);
    res.status(500).json({ error: 'failed to process email' });
  }
});

async function commitCSV(csvText) {

    const raw = csvText;
    if (!raw || raw.trim().length === 0) {
      console.log('[commitCSV] empty/missing body, nothing to process');
      return;
    }

    // Clean common thousand separators in dollar amounts so CSV columns align
    const cleaned = cleanThousandSeparatorsInDollarAmounts(raw);

    const rows = parseCsv(cleaned);

    if (!rows || rows.length < 2) {
      console.log(`[commitCSV] parsed ${rows ? rows.length : 0} row(s), need at least a header + 1 data row — skipping`);
      return;
    }
    console.log(`[commitCSV] parsed ${rows.length} rows, header: ${JSON.stringify(rows[0])}`);

    const header = rows[0].map(h => (h || '').toString().trim());

    // Map CSV columns to containers table columns
    const mapping = {
      'Vendor': 'sender',
      'Depot': 'vendor',
      'Location': 'location',
      'Size': 'size',
      'Type': 'type',
      'Condition': 'container_condition',
      'Color': 'color',
      'Quantity': 'quantity',
      'Price': 'price',
      'Other Details': 'notes',
      'date': 'date',
    };

    const mappedHeaders = header.map(h => mapping[h] || null);

    // Determine sender from the first data row and delete their existing entries.
    // Some senders' data should never be wiped on import (e.g. it's manually curated).
    const PROTECTED_SENDERS = [
      'mspence1290@gmail.com',
      'sales@tri-statecontainers.com',
      'betobeast1246@gmail.com',
      'robertgraman1246@gmail.com',
    ];
    const senderColIndex = mappedHeaders.indexOf('sender');
    if (senderColIndex !== -1) {
      const firstDataRow = rows[1];
      const sender = (firstDataRow?.[senderColIndex] || '').toString().trim().replace(/^"|"$/g, '');
      if (sender && !PROTECTED_SENDERS.includes(sender.toLowerCase())) {
        const deleted = await runStatement('DELETE FROM containers WHERE sender = $1', [sender]);
        console.log(`Deleted ${deleted.rowCount} existing rows for sender: ${sender}`);
      } else if (sender) {
        console.log(`Skipping delete for protected sender: ${sender}`);
      }
    }

    const parsedRecords = [];
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
          record.price = normalizePrice(val);
        } else {
          record[key] = val;
        }
      }

      // Skip rows without vendor or location
      if (!record.vendor || !record.location) continue;

      parsedRecords.push(record);
    }

    // Normalize location strings as a batch so inconsistent formatting from
    // different senders (e.g. "BALTIMORE,MD", "Baltimore (MD)") collapses to
    // one canonical form instead of creating duplicate location entries.
    await normalizeLocationsBatch(parsedRecords.map(r => r.location));

    const inserted = [];
    for (const record of parsedRecords) {
      record.location = getNormalizedLocation(record.location);

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

    // Geocode any newly-seen locations right away instead of waiting for the
    // next server restart's warmGeocodeCache() run — otherwise distance
    // filtering silently excludes rows at a location added since boot.
    if (inserted.length > 0) {
      geocodeBatch(inserted.map(r => r.location)).catch(err =>
        console.error('[commitCSV] geocoding new locations failed:', err.message)
      );
    }
}

const port = process.env.PORT || 3000;
const host = '0.0.0.0';

initializeDatabase()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`Server listening on http://${host}:${port}`);
      console.log('Using PostgreSQL database');
    });
    warmGeocodeCache();
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
