const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node import-sql.js <dump.sql>');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) {
    console.error(`SQL file not found: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
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
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
        ssl,
      };

  if (!connectionString && (!config.host || !config.user || !config.password || !config.database)) {
    console.error('PostgreSQL configuration is incomplete. Set DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.');
    process.exit(1);
  }

  const client = new Client(config);
  await client.connect();
  try {
    console.log(`Importing SQL from ${filePath} into ${config.user}@${config.host}/${config.database}`);
    await client.query(sql);
    console.log('SQL import completed successfully.');
  } catch (err) {
    console.error('SQL import failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});