import * as agentModel from '../models/agentModel.js';
import * as userModel from '../models/userModel.js';

export async function list(req, res) {
  try {
    const agents = await agentModel.listAll();
    return res.json({ agents });
  } catch (err) {
    console.error('agents list error', err);
    return res.status(500).json({ error: 'Failed to load agents' });
  }
}

export async function create(req, res) {
  try {
    const { name, telegram_id } = req.body || {};
    if (!name || telegram_id == null || telegram_id === '') {
      return res.status(400).json({ error: 'name and telegram_id required' });
    }

    const telegramId = Number(telegram_id);
    const result = await agentModel.create(String(name).trim(), telegramId);

    // Auto-provision a scoped dashboard login for this agent — no Telegram
    // @username to go on here (this form doesn't collect one), so it falls
    // back to agent_<telegram_id>. `login` is null if that username somehow
    // already exists; the agent itself still gets created either way.
    let login = null;
    try {
      login = await userModel.ensureLoginForAgent({
        agentId: result.insertId,
        telegramUsername: null,
        telegramId,
      });
    } catch (err) {
      console.error('agents create: auto-login failed', err);
    }

    return res.status(201).json({ id: result.insertId, login });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'telegram_id already registered' });
    }
    console.error('agents create error', err);
    return res.status(500).json({ error: 'Failed to create agent' });
  }
}

export async function update(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const { name, telegram_id, is_active } = req.body || {};
    if (!name || telegram_id == null || telegram_id === '') {
      return res.status(400).json({ error: 'name and telegram_id required' });
    }

    await agentModel.update(id, {
      name: String(name).trim(),
      telegramId: Number(telegram_id),
      isActive: is_active !== false && is_active !== 0 && is_active !== '0',
    });

    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'telegram_id already registered' });
    }
    console.error('agents update error', err);
    return res.status(500).json({ error: 'Failed to update agent' });
  }
}

export async function remove(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    await agentModel.remove(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('agents delete error', err);
    return res.status(500).json({ error: 'Failed to delete agent' });
  }
}
