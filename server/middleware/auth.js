import jwt from 'jsonwebtoken';
import { config } from '../db.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// A user linked to an agent (req.user.agentId set) only ever sees that
// agent's own data (see messageModel/settlementModel `agentId` filter).
// Anything account-wide — managing agents, managing logins, wiping data —
// is admin-only: a login with no agent link (agentId null/undefined).
export function requireAdmin(req, res, next) {
  if (req.user?.agentId != null) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
