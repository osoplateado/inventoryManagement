// One-time cleanup: normalizes existing containers.location values to a canonical
// "City, ST" form via OpenAI, so inconsistent formatting from different senders
// (e.g. "BALTIMORE,MD", "Baltimore (MD)", "Baltimore, Maryland") collapses into
// one value instead of showing up as separate entries in filters/dropdowns.
// Uses the same env vars as server.js (loads .env automatically).
// Run: node scripts/normalize-locations.js

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');
const { OpenAI } = require('openai');

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
loadEnvFile(path.join(__dirname, '..', '.env'));

function extractJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function confirm(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

const CHUNK_SIZE = 40;

async function normalizeBatch(openai, locations) {
  const map = new Map();
  for (let i = 0; i < locations.length; i += CHUNK_SIZE) {
    const chunk = locations.slice(i, i + CHUNK_SIZE);
    console.log(`Normalizing ${i + 1}-${Math.min(i + CHUNK_SIZE, locations.length)} of ${locations.length}...`);

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

    const raw = extractJson(response.choices[0].message.content);
    if (raw === null) {
      console.warn(`  failed to parse JSON for this chunk (finish_reason: ${response.choices[0].finish_reason}); leaving these unnormalized`);
      continue;
    }
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.trim()) map.set(k, v.trim());
    }
  }
  return map;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set — required to normalize locations.');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  const useSsl = process.env.DATABASE_SSL === 'true' || process.env.PGSSLMODE === 'require';
  const ssl = useSsl ? { rejectUnauthorized: false } : undefined;

  const config = connectionString
    ? { connectionString, ssl }
    : {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || '5432'),
        ssl,
      };

  const pool = new Pool(config);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const target = connectionString
    ? connectionString.replace(/:\/\/[^@]+@/, '://***:***@')
    : `${config.user}@${config.host}:${config.port}/${config.database}`;
  console.log(`Connecting to: ${target}`);

  const { rows } = await pool.query('SELECT DISTINCT location FROM containers WHERE location IS NOT NULL');
  const rawLocations = rows.map((r) => r.location).filter(Boolean);
  console.log(`Found ${rawLocations.length} distinct location value(s).`);

  const normalized = await normalizeBatch(openai, rawLocations);

  const changes = rawLocations
    .filter((loc) => normalized.has(loc) && normalized.get(loc) !== loc)
    .map((loc) => ({ from: loc, to: normalized.get(loc) }));

  if (changes.length === 0) {
    console.log('Nothing to normalize — all locations already canonical.');
    await pool.end();
    return;
  }

  console.log(`\n${changes.length} location value(s) will be rewritten:`);
  for (const c of changes) {
    console.log(`  "${c.from}" -> "${c.to}"`);
  }

  const ok = await confirm(`\nApply these ${changes.length} change(s) to containers.location? Type "yes" to confirm: `);
  if (!ok) {
    console.log('Aborted.');
    await pool.end();
    return;
  }

  let totalUpdated = 0;
  for (const c of changes) {
    const result = await pool.query('UPDATE containers SET location = $1 WHERE location = $2', [c.to, c.from]);
    totalUpdated += result.rowCount;
  }

  console.log(`Done. Updated ${totalUpdated} row(s) across ${changes.length} distinct location value(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
