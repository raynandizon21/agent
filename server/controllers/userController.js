import bcrypt from 'bcryptjs';
import * as agentModel from '../models/agentModel.js';
import * as userModel from '../models/userModel.js';

function toView(u) {
  return {
    id: u.id,
    username: u.username,
    agent_id: u.agent_id,
    agent_name: u.agent_name,
    created_at: u.created_at,
  };
}

// null/'' = admin (unscoped); otherwise must be a real agent id.
async function normalizeAgentId(raw) {
  if (raw == null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return undefined; // signals "invalid"
  const agents = await agentModel.listAll();
  return agents.some((a) => a.id === id) ? id : undefined;
}

export async function list(req, res) {
  try {
    const users = await userModel.listAll();
    return res.json({ users: users.map(toView) });
  } catch (err) {
    console.error('users list error', err);
    return res.status(500).json({ error: 'Failed to load users' });
  }
}

export async function create(req, res) {
  try {
    const { username, password, agent_id } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const agentId = await normalizeAgentId(agent_id);
    if (agentId === undefined) {
      return res.status(400).json({ error: 'agent_id must be a valid agent, or blank for admin' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await userModel.createUser(String(username).trim(), passwordHash, agentId);
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'username already taken' });
    }
    console.error('users create error', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
}

export async function update(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const { agent_id, password } = req.body || {};

    if (agent_id !== undefined) {
      const agentId = await normalizeAgentId(agent_id);
      if (agentId === undefined) {
        return res.status(400).json({ error: 'agent_id must be a valid agent, or blank for admin' });
      }
      if (agentId !== null) {
        // Would this remove the last admin login? Block it — no one could
        // manage agents/users/clear-data afterwards.
        const target = (await userModel.listAll()).find((u) => u.id === id);
        if (target && target.agent_id == null && (await userModel.countAdmins()) <= 1) {
          return res
            .status(400)
            .json({ error: 'Cannot link the last admin login to an agent — at least one admin must remain.' });
        }
      }
      await userModel.updateAgentLink(id, agentId);
    }

    if (password) {
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
      }
      const passwordHash = await bcrypt.hash(String(password), 10);
      await userModel.updatePassword(id, passwordHash);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('users update error', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
}

export async function remove(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    if (id === req.user.sub) {
      return res.status(400).json({ error: "Can't delete the login you're currently using" });
    }

    const target = (await userModel.listAll()).find((u) => u.id === id);
    if (target && target.agent_id == null && (await userModel.countAdmins()) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin login' });
    }

    await userModel.remove(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('users delete error', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
}
