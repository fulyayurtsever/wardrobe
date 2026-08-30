const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

const db = new Database(path.join(__dirname, 'wardrobe.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wardrobe_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    image_path TEXT NOT NULL,
    image_hash TEXT NOT NULL,
    name TEXT,
    category TEXT,
    subcategory TEXT,
    color TEXT,
    pattern TEXT,
    material TEXT,
    fit TEXT,
    style TEXT,
    season TEXT,
    occasion TEXT,
    formality TEXT,
    brand TEXT,
    ai_status TEXT NOT NULL DEFAULT 'pending',
    ai_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, image_hash)
  );
`);

let user = db.prepare('SELECT id FROM users LIMIT 1').get();
if (!user) {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(id, new Date().toISOString());
  user = { id };
}

module.exports = {
  db,
  defaultUserId: user.id,
};
