import * as guestModel from '../models/guestModel.js';

export async function list(req, res) {
  try {
    const guests = await guestModel.listAll();
    return res.json({ guests });
  } catch (err) {
    console.error('guests list error', err);
    return res.status(500).json({ error: 'Failed to load guests' });
  }
}

export async function create(req, res) {
  try {
    const { telegram_id, guest_code, guest_name } = req.body || {};
    if (!guest_name) {
      return res.status(400).json({ error: 'guest_name required' });
    }

    const telegramId =
      telegram_id == null || telegram_id === '' ? null : Number(telegram_id);
    const guestCode =
      guest_code == null || guest_code === '' ? null : String(guest_code).trim();

    const result = await guestModel.create({
      telegramId,
      guestCode,
      guestName: String(guest_name).trim(),
      encodedBy: req.user.username,
    });

    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'guest_code or telegram_id already registered' });
    }
    console.error('guests create error', err);
    return res.status(500).json({ error: 'Failed to create guest' });
  }
}

export async function update(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const { telegram_id, guest_code, guest_name, active } = req.body || {};
    if (!guest_name) {
      return res.status(400).json({ error: 'guest_name required' });
    }

    const telegramId =
      telegram_id == null || telegram_id === '' ? null : Number(telegram_id);
    const guestCode =
      guest_code == null || guest_code === '' ? null : String(guest_code).trim();

    await guestModel.update(id, {
      telegramId,
      guestCode,
      guestName: String(guest_name).trim(),
      active: active !== false && active !== 0 && active !== '0',
      editedBy: req.user.username,
    });

    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'guest_code or telegram_id already registered' });
    }
    console.error('guests update error', err);
    return res.status(500).json({ error: 'Failed to update guest' });
  }
}

export async function remove(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    await guestModel.remove(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('guests delete error', err);
    return res.status(500).json({ error: 'Failed to delete guest' });
  }
}
