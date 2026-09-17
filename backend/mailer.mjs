// BACKEND / MAILER — customer communication seam. `none` (the only implementation) records what WOULD be sent in the outbox
// with status 'queued' and never marks anything delivered: no screen or API may claim an e-mail or SMS was sent until a real
// provider is configured (BACKEND_MAILER) and its delivery result is recorded here. EMAIL / SMS DELIVERY: NOT CONNECTED.
import { q, now } from './db.mjs';
import { hex } from './http.mjs';
import { info } from './logger.mjs';
export function enqueue({ customerId = null, channel = 'email', template, payload = {} }) {
  const id = `msg_${hex(8)}`;
  q.run('INSERT INTO outbox (id, customer_id, channel, template, payload_json, status, created_at) VALUES (?,?,?,?,?,?,?)', id, customerId, channel, template, JSON.stringify(payload), 'queued', now());
  info('mailer.queued', { channel, template, delivery: 'none' });
  return { id, delivered: false };
}
