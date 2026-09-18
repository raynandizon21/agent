import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../db.js';
import * as userModel from '../models/userModel.js';

export async function ensureAdminUser() {
  if (await userModel.hasAnyUser()) return;

  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  await userModel.createUser(config.adminUsername, passwordHash, null);
  console.log(`Seeded admin user: ${config.adminUsername}`);
}

function toUserView(u) {
  return {
    id: u.id,
    username: u.username,
    agentId: u.agent_id ?? null,
    agentName: u.agent_name ?? null,
  };
}

export async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const user = await userModel.findByUsername(String(username));
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { sub: user.id, username: user.username, agentId: user.agent_id ?? null },
      config.jwtSecret,
      { expiresIn: '12h' }
    );

    return res.json({ token, user: toUserView(user) });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}

export async function me(req, res) {
  try {
    const user = await userModel.findById(req.user.sub);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.json({ user: toUserView(user) });
  } catch (err) {
    console.error('me error', err);
    return res.status(500).json({ error: 'Failed to load user' });
  }
}
