import { query } from '../db.js';

export async function hasAnyUser() {
  const rows = await query('SELECT id FROM users LIMIT 1');
  return rows.length > 0;
}

export async function createUser(username, passwordHash) {
  return query(
    'INSERT INTO users (username, password_hash) VALUES (:username, :passwordHash)',
    { username, passwordHash }
  );
}

export async function findByUsername(username) {
  const rows = await query(
    'SELECT id, username, password_hash FROM users WHERE username = :username LIMIT 1',
    { username }
  );
  return rows[0] ?? null;
}
