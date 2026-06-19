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
    model: MINI_MODEL,
    messages: [
      { role: 'system', content: 'You are an assistant that summarizes inbound email messages for a shipping container inventory manager. Create a concise summary of the email, including the sender, location, size, type, container condition, color, quantity, price, and any other details.' },
      { role: 'user', content: prompt },
    ],
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
          'Classify the user query as either "structured_query" (asking for containers by size, location, type, price, quantity, condition, color, sort, availability) ' +
          'or "knowledge_question" (asking about free-text notes, damage comments, specific descriptions written in notes, or qualitative observations). ' +
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

INHERITANCE RULE: If the current message references a previous result ("from that list", "those results", "cheapest/most expensive from that", etc.) WITHOUT specifying a new location or distance, inherit location and maxDistance from the most recent user message in conversation history that contained them.
If the current message specifies explicit new values (a city, a mileage), use those instead — do not inherit.

Examples:
- "40ft high cube in Denver under $3000" → {"size":"40","type":"HC","location":"Denver","maxPrice":3000}
- "cheapest containers near Houston" → {"location":"Houston","sort":"price_asc"}
- "how many 20ft are available" → {"size":"20"}
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
    params.push(filters.size);
    conditions.push(`size = $${params.length}`);
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
      byLocation[key] = { qty: 0, sizes: new Set(), types: new Set(), conditions: new Set(), prices: [], vendors: new Set(), rows: [] };
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
  let preformattedTable = null;

  if (!rows.length) {
    inventoryText = 'No containers matched that criteria.';
  } else if (USE_AGGREGATED) {
    const lines = Object.entries(byLocation).map(([key, d]) =>
      `- **${displayName[key]}**: ${d.qty} containers | Sizes: ${[...d.sizes].join(', ')} | Types: ${[...d.types].join(', ')} | Conditions: ${[...d.conditions].join(', ')}`
    );
    preformattedTable = `**${totalQuantity} total containers across ${locationCount} locations:**\n${lines.join('\n')}`;
    inventoryText = Object.entries(byLocation).map(([key, d]) => {
      const numericPrices = d.prices.map(p => parseFloat(String(p).replace(/[^0-9.]/g, ''))).filter(n => !isNaN(n) && n > 0);
      const priceStr = numericPrices.length
        ? `$${Math.min(...numericPrices).toLocaleString()} – $${Math.max(...numericPrices).toLocaleString()}`
        : 'N/A';
      return `Location: ${displayName[key]} | Total Qty: ${d.qty} | Sizes: ${[...d.sizes].join(', ')} | Types: ${[...d.types].join(', ')} | Conditions: ${[...d.conditions].join(', ')} | Price range: ${priceStr} | Vendors: ${[...d.vendors].join(', ')}`;
    }).join('\n');
  } else {
    const displayRows = isPriceQuery ? rows.slice(0, 15) : rows;
    inventoryText = displayRows.map(r =>
      `Vendor: ${r.vendor}, Location: ${r.location}, Size: ${r.size}ft, Type: ${r.type}, Condition: ${r.container_condition}, Color: ${r.color}, Qty: ${r.quantity}, Price: ${r.price}, Delivery: ${r.delivery || ''}${r.notes ? ', Notes: ' + r.notes : ''}`
    ).join('\n');
  }

  // For listing queries with many locations, return the JS-formatted table directly
  // so the model cannot selectively omit locations.
  const isListingQuery = /list|show|what.*available|within.*mile|all container/i.test(query);
  if (preformattedTable && isListingQuery) {
    return preformattedTable;
  }

  const systemContent = `You are an inventory assistant for a shipping container company.
IMPORTANT: The inventory data block below is the ONLY source of truth for this response. Any inventory data in the conversation history is from a previous query and must be ignored — use only what is shown here. Never invent numbers.

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

// Approximate coordinates for cities that appear in inventory
const CITY_COORDS = {
  'atlanta': [33.749, -84.388],
  'baltimore': [39.290, -76.612],
  'boston': [42.360, -71.059],
  'calgary': [51.045, -114.072],
  'charleston': [32.777, -79.931],
  'chicago': [41.878, -87.630],
  'cincinnati': [39.103, -84.512],
  'cleveland': [41.499, -81.694],
  'columbus': [39.961, -82.999],
  'dallas': [32.777, -96.797],
  'denver': [39.739, -104.990],
  'detroit': [42.331, -83.046],
  'edmonton': [53.546, -113.494],
  'el paso': [31.762, -106.485],
  'halifax': [44.649, -63.575],
  'houston': [29.760, -95.370],
  'indianapolis': [39.768, -86.158],
  'jacksonville': [30.332, -81.656],
  'kansas city': [39.100, -94.579],
  'los angeles': [34.052, -118.244],
  'louisville': [38.253, -85.759],
  'memphis': [35.150, -90.049],
  'miami': [25.762, -80.192],
  'minneapolis': [44.978, -93.265],
  'mobile': [30.695, -88.040],
  'montreal': [45.502, -73.567],
  'nashville': [36.163, -86.782],
  'new orleans': [29.951, -90.072],
  'new york': [40.713, -74.006],
  'norfolk': [36.851, -76.286],
  'oakland': [37.804, -122.271],
  'omaha': [41.257, -95.935],
  'regina': [50.445, -104.619],
  'saint louis': [38.627, -90.199],
  'st. louis': [38.627, -90.199],
  'st louis': [38.627, -90.199],
  'salt lake city': [40.761, -111.891],
  'saskatoon': [52.133, -106.670],
  'savannah': [32.084, -81.100],
  'seattle': [47.606, -122.332],
  'tacoma': [47.253, -122.444],
  'tampa': [27.951, -82.457],
  'toronto': [43.653, -79.383],
  'vancouver': [49.283, -123.121],
  'wilmington': [34.226, -77.945],
  'winnipeg': [49.895, -97.138],
};

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function filterByDistance(targetLocation, maxDistanceMiles, rows) {
  const targetKey = targetLocation.split(',')[0].trim().toLowerCase();
  const targetCoords = CITY_COORDS[targetKey];

  if (!targetCoords) {
    console.warn(`filterByDistance: no coordinates for "${targetLocation}", skipping distance filter`);
    return rows;
  }

  const unknownCities = [];
  const filtered = rows.filter(r => {
    const cityKey = (r.location || '').split(',')[0].trim().toLowerCase();
    const coords = CITY_COORDS[cityKey];
    if (!coords) {
      unknownCities.push(r.location);
      return false;
    }
    const dist = haversineMiles(targetCoords[0], targetCoords[1], coords[0], coords[1]);
    return dist <= maxDistanceMiles;
  });

  if (unknownCities.length > 0) {
    console.warn('filterByDistance: unknown cities (excluded):', [...new Set(unknownCities)]);
  }

  return filtered;
}

// ── AI query endpoint ─────────────────────────────────────────────────────────

// Remember the last distance filter so follow-up queries ("cheapest from that list") can inherit it
let lastDistanceFilter = null;

const FOLLOW_UP_RE = /\b(that list|those|from (?:the|that)|same (?:area|location|list)|of (?:the|those|that))\b/i;

app.post('/api/ai/query', async (req, res) => {
  try {
    const { query, history } = req.body;
    if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query text required' });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OpenAI API key not configured.' });
    }

    const intent = await classifyIntent(query);

    let rows;
    if (intent === 'knowledge_question') {
      rows = await searchNotesSemantically(query);
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

      // Sort by numeric price in JS — DB price column is text like "$1500"
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
    res.json({ answer });
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
