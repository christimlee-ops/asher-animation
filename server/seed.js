/**
 * Seed script — creates default user accounts.
 * Run once: node seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const dbReady = require('./db');

const users = [
  { username: 'Asher', email: 'asher@animatekids.app', password: 'asher2024!' },
  { username: 'TestUser', email: 'test@animatekids.app', password: 'testing123!' },
];

async function seed() {
  const db = await dbReady;

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    try {
      await db.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [u.username, u.email.toLowerCase(), hash]
      );
      console.log(`Created: ${u.username} / ${u.email} / ${u.password}`);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        console.log(`Already exists: ${u.username}`);
      } else {
        console.error(`Error creating ${u.username}:`, err.message);
      }
    }
  }

  await db.end();
  console.log('\nDone! Credentials:');
  users.forEach((u) => console.log(`  ${u.username}: email=${u.email}  password=${u.password}`));
}

seed();
