// One-time migration: converts containers.price from TEXT (e.g. "$1,800") to NUMERIC(12,2).
// Safe to run once; if price is already numeric, ALTER COLUMN TYPE is a no-op error-free re-run
// only if the column is still TEXT — running it twice will fail harmlessly since the column
// will already be NUMERIC (regexp_replace only applies to text).
// Uses the same env vars as server.js (loads .env automatically).
// Run: node scripts/migrate-price-numeric.js

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

  const colInfo = await pool.query(
    `SELECT data_type FROM information_schema.columns WHERE table_name = 'containers' AND column_name = 'price'`
  );
  const currentType = colInfo.rows[0]?.data_type;
  console.log(`Current containers.price type: ${currentType}`);

  if (currentType === 'numeric') {
    console.log('price is already NUMERIC — nothing to do.');
    await pool.end();
    return;
  }

  const preview = await pool.query(
    `SELECT price, regexp_replace(price, '[^0-9.-]', '', 'g') AS cleaned FROM containers WHERE price IS NOT NULL AND price !~ '^\\s*-?[0-9]*\\.?[0-9]+\\s*$' LIMIT 20`
  );
  if (preview.rows.length > 0) {
    console.log(`\nWarning: ${preview.rows.length}+ row(s) have a price that isn't a clean number and will become NULL after stripping non-numeric characters, e.g.:`);
    for (const r of preview.rows) {
      console.log(`  "${r.price}" -> ${r.cleaned || 'NULL'}`);
    }
  }

  const ok = await confirm(
    '\nThis will ALTER containers.price from TEXT to NUMERIC(12,2), converting values like "$1,800" -> 1800.00. Type "yes" to confirm: '
  );
  if (!ok) {
    console.log('Aborted.');
    await pool.end();
    return;
  }

  await pool.query(`
    ALTER TABLE containers
    ALTER COLUMN price TYPE NUMERIC(12,2)
    USING NULLIF(regexp_replace(price, '[^0-9.-]', '', 'g'), '')::numeric
  `);

  console.log('Migration complete: containers.price is now NUMERIC(12,2).');
  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
