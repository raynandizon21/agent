import { EventEmitter } from 'node:events';

// App-wide event bus. Producers (telegram service) emit; the realtime
// WebSocket layer subscribes and fans out to connected browsers.
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export const Events = {
  MESSAGE: 'message',
  SETTLEMENT: 'settlement',
};
