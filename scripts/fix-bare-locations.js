// One-time cleanup: finds "location" values stored as just a city name (no state,
// e.g. "Columbus") and, when exactly one "City, ST" variant of that same city
// already exists elsewhere in the table (e.g. "Columbus, OH"), rewrites the bare
// rows to match it. This removes duplicate entries from location filters/dropdowns
// without guessing a state when the city is ambiguous (multiple states match, or
// none do) — those are left alone and printed for manual review.
//
// Unlike scripts/normalize-locations.js, this does NOT call OpenAI — it only
// merges bare city names into a state variant that's already present in your data,
// so no API key is required.
//
// Loads the same env vars as server.js (loads .env automatically).
// Run: node scripts/fix-bare-locations.js

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

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

async function confirm(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

// "City, ST" (2-letter state code) — anything else counts as "bare".
const CITY_STATE_RE = /^(.+),\s*([A-Za-z]{2})$/;

async function main() {
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

  const target = connectionString
    ? connectionString.replace(/:\/\/[^@]+@/, '://***:***@')
    : `${config.user}@${config.host}:${config.port}/${config.database}`;
  console.log(`Connecting to: ${target}`);

  const { rows } = await pool.query('SELECT DISTINCT location FROM containers WHERE location IS NOT NULL');
  const rawLocations = rows.map((r) => r.location).filter((l) => l && l.trim());
  console.log(`Found ${rawLocations.length} distinct location value(s).`);

  const withState = []; // { raw, city, state }
  const bare = []; // raw strings with no discernible state

  for (const loc of rawLocations) {
    const trimmed = loc.trim();
    const match = CITY_STATE_RE.exec(trimmed);
    if (match) {
      withState.push({ raw: loc, city: match[1].trim().toLowerCase(), state: match[2].toUpperCase() });
    } else {
      bare.push(loc);
    }
  }

  const changes = []; // { from, to }
  const ambiguous = []; // { city, matches: [state variants] }
  const noMatch = [];

  for (const loc of bare) {
    const cityKey = loc.trim().toLowerCase();
    const matches = [...new Map(
      withState.filter((w) => w.city === cityKey).map((w) => [w.state, w.raw])
    ).entries()];

    if (matches.length === 1) {
      changes.push({ from: loc, to: matches[0][1] });
    } else if (matches.length > 1) {
      ambiguous.push({ city: loc, matches: matches.map((m) => m[1]) });
    } else {
      noMatch.push(loc);
    }
  }

  if (ambiguous.length > 0) {
    console.log(`\n${ambiguous.length} bare city name(s) matched MULTIPLE states — skipping, please fix manually:`);
    for (const a of ambiguous) {
      console.log(`  "${a.city}" could be: ${a.matches.join(', ')}`);
    }
  }

  if (noMatch.length > 0) {
    console.log(`\n${noMatch.length} bare city name(s) had no "City, ST" match in your data — skipping:`);
    for (const n of noMatch) {
      console.log(`  "${n}"`);
    }
  }

  if (changes.length === 0) {
    console.log('\nNothing safe to auto-merge.');
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
