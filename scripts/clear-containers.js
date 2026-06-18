// Deletes all rows from the containers table.
// Uses the same env vars as server.js: DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT.
// Run: node scripts/clear-containers.js

const { Pool } = require('pg');
const readline = require('readline');

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
