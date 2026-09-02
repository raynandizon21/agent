import * as agentModel from '../models/agentModel.js';

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

    const result = await agentModel.create(
      String(name).trim(),
      Number(telegram_id)
    );

    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'telegram_id already registered' });
    }
    console.error('agents create error', err);
    return res.status(500).json({ error: 'Failed to create agent' });
  }
}
