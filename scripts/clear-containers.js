// Deletes all rows from the containers table.
// Uses the same env vars as server.js: DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT.
// Run: node scripts/clear-containers.js

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const readline = require('readline');

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

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question('This will delete ALL rows in the containers table. Type "yes" to confirm: ', (answer) => {
      rl.close();
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
      }
      resolve();
    });
  });

  await pool.query('DROP TABLE containers');
  console.log('Table "containers" dropped.');

  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
