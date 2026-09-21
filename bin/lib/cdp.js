/**
 * One DevTools connection, shared by the gates that drive a browser.
 *
 * This class existed four times — in qa-browser, qa-ux, qa-a11y and qa-perf —
 * and by the time it was pulled out here the copies had already drifted into
 * three different versions: a11y and perf had the plain one, ux had added
 * close(), browser had added send() and eval() as well. Nothing was wrong with
 * any of them; they simply grew where they were needed and nowhere else, which
 * is what copies do. The differences were purely additive, so this is the
 * superset and every caller keeps the behaviour it had.
 *
 * Kept deliberately small: open a socket, match replies to requests, hand
 * events to whoever asked for them. Each gate still decides what to drive and
 * what to assert — this only removes the part none of them wanted to own.
 */
'use strict';

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); this.listeners = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new Cdp(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.waiting.has(m.id)) {
        const { resolve, reject } = c.waiting.get(m.id);
        c.waiting.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) {
        c.listeners.forEach((fn) => fn(m));
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.waiting.has(id)) { this.waiting.delete(id); reject(new Error(method + ' timed out')); }
      }, 60000);
    });
  }
  on(fn) { this.listeners.push(fn); }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' — ' + expression.slice(0, 80));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (e) { /* already gone */ } }
}

module.exports = { Cdp };
