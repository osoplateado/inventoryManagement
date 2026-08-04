// Deletes containers rows matching a given value in a chosen column
// (vendor, location, size, type, container_condition, color, or sender).
// Uses the same env vars as server.js: DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT.
// Loads .env automatically (same as server.js) if present.
//
// Usage:
//   node scripts/delete-by-vendor.js "Vendor Name"                        (exact match on vendor)
//   node scripts/delete-by-vendor.js "Denver" --field=location            (exact match on location)
//   node scripts/delete-by-vendor.js "denver" --field=location --contains (partial/case-insensitive match)
//   node scripts/delete-by-vendor.js "Vendor Name" --yes                  (skip confirmation prompt)

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

const ALLOWED_FIELDS = ['vendor', 'location', 'size', 'type', 'container_condition', 'color', 'sender'];

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
  const args = process.argv.slice(2);
  const skipConfirm = args.includes('--yes');
  const contains = args.includes('--contains');
  const fieldArg = args.find((a) => a.startsWith('--field='));
  const field = fieldArg ? fieldArg.slice('--field='.length) : 'vendor';
  const value = args.find((a) => !a.startsWith('--'));

  if (!value) {
    console.error('Usage: node scripts/delete-by-vendor.js "value" [--field=vendor|location|size|type|container_condition|color|sender] [--contains] [--yes]');
    process.exit(1);
  }

  if (!ALLOWED_FIELDS.includes(field)) {
    console.error(`Invalid --field "${field}". Allowed: ${ALLOWED_FIELDS.join(', ')}`);
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

  const whereClause = contains ? `${field} ILIKE $1` : `${field} = $1`;
  const whereParam = contains ? `%${value}%` : value;

  try {
    const { rows } = await pool.query(
      `SELECT id, vendor, location, size, type, quantity FROM containers WHERE ${whereClause} ORDER BY location`,
      [whereParam]
    );

    if (rows.length === 0) {
      console.log(`No rows found where ${field} ${contains ? 'contains' : 'equals'} "${value}".`);
      return;
    }

    console.log(`Found ${rows.length} row(s) where ${field} ${contains ? 'contains' : 'equals'} "${value}":`);
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.vendor}  |  ${r.location}  |  ${r.size}${r.type}  |  qty ${r.quantity}`);
    }

    if (!skipConfirm) {
      const ok = await confirm(`\nDelete these ${rows.length} row(s)? Type "yes" to confirm: `);
      if (!ok) {
        console.log('Aborted.');
        return;
      }
    }

    const result = await pool.query(`DELETE FROM containers WHERE ${whereClause}`, [whereParam]);
    console.log(`Deleted ${result.rowCount} row(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
