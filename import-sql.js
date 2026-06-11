const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

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
  const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    multipleStatements: true,
  };

  if (!config.host || !config.user || !config.password || !config.database) {
    console.error('MySQL configuration is incomplete. Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.');
    process.exit(1);
  }

  const connection = await mysql.createConnection(config);
  try {
    console.log(`Importing SQL from ${filePath} into ${config.user}@${config.host}/${config.database}`);
    await connection.query(sql);
    console.log('SQL import completed successfully.');
  } catch (err) {
    console.error('SQL import failed:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});