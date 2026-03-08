const path = require('path');
const fs = require('fs');

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let dbReady;

if (DB_TYPE === 'mysql') {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'animatekids',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  dbReady = Promise.resolve(pool);
} else {
  // SQLite via sql.js (pure JS, no native build needed)
  const initSqlJs = require('sql.js');
  const dbPath = path.join(__dirname, 'animatekids.db');

  dbReady = initSqlJs().then((SQL) => {
    let sqlite;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      sqlite = new SQL.Database(buffer);
    } else {
      sqlite = new SQL.Database();
    }

    // Create tables
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Untitled',
        data TEXT,
        thumbnail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        size INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Save to disk
    const save = () => {
      const data = sqlite.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    };
    save();

    console.log('Using SQLite database at', dbPath);

    // Return a wrapper matching mysql2 pool.execute() interface
    return {
      execute: async (sql, params = []) => {
        if (sql.trimStart().toUpperCase().startsWith('SELECT')) {
          const stmt = sqlite.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          return [rows];
        } else {
          sqlite.run(sql, params);
          const insertId = sqlite.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
          const changes = sqlite.getRowsModified();
          save();
          return [{ insertId, affectedRows: changes }];
        }
      },
      end: async () => { save(); sqlite.close(); }
    };
  });
}

module.exports = dbReady;
