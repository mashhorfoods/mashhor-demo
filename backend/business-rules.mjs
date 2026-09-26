// ============================================================================
// BACKEND / BUSINESS RULES — Stage 15A. Formalizes `business_config`
// (Stage 13/15's own "explicitly NOT decided yet" table, migrations 002/003)
// into a versioned register with the exact schema the brief specifies:
// rule_id/category/name/description/current_value/allowed_values/status/
// source/effective_from/effective_to/updated_by/updated_at/notes. Nothing
// here invents a value — every seeded row documents EXACTLY the pending or
// technical-default state the codebase already had (migration
// 004_business_rules.sql); a rule only ever moves between DRAFT/PENDING/
// APPROVED/ACTIVE/DISABLED/SUPERSEDED through an explicit admin action,
// which is always audited (§18/§22) and never silently overwrites history
// (§17/§21 — the prior version is archived to business_config_history first).
// No second registry is created for anything that already has its own table
// (services/service_workflows, suppliers) — those are read, not duplicated,
// by pendingDecisions()/businessRuleMatrix() below (§30).
// ============================================================================
import { q, now, whereClause } from './db.mjs';
import { HttpError, str } from './http.mjs';
import { audit } from './staff.mjs';

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

export const RULE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'ACTIVE', 'DISABLED', 'SUPERSEDED'];

const nRule = (r) => ({
  ruleId: r.key, category: r.category, name: r.name, description: r.description,
  currentValue: J(r.value_json, null), allowedValues: J(r.allowed_values_json, null),
  status: r.status, source: r.source, effectiveFrom: r.effective_from ?? null, effectiveTo: r.effective_to ?? null,
  updatedBy: r.updated_by ?? null, updatedAt: r.updated_at, notes: r.notes ?? null,
});

export function listBusinessRules({ category = '', status = '' } = {}) {
  const { sql, params } = whereClause([['category = ?', category], ['status = ?', status]]);
  const rows = q.all(`SELECT * FROM business_config ${sql} ORDER BY category, key`, ...params);
  return { items: rows.map(nRule) };
}
export function businessRuleById(id) {
  const r = q.get('SELECT * FROM business_config WHERE key = ?', id);
  return r ? nRule(r) : null;
}
/** Every prior version of a rule, most recent first — nothing is ever deleted from here (§17/§21). */
export function businessRuleHistory(id) {
  return q.all('SELECT * FROM business_config_history WHERE rule_id = ? ORDER BY superseded_at DESC', id).map((r) => ({
    ruleId: r.rule_id, category: r.category, name: r.name, description: r.description, value: J(r.value_json, null),
    allowedValues: J(r.allowed_values_json, null), status: r.status, source: r.source, effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to, updatedBy: r.updated_by, notes: r.notes, supersededAt: r.superseded_at,
  }));
}

/** Archives the CURRENT row into history before overwriting it, then writes the change and an audit event — never
    a silent, unversioned overwrite. `patch.value`/`allowedValues`/`status`/`notes` are each optional; a field left
    out keeps its current value. Changing `status` stamps a fresh `effective_from` and clears `effective_to`. */
function applyRuleChange(id, patch, actor) {
  const r = q.get('SELECT * FROM business_config WHERE key = ?', id);
  if (!r) throw new HttpError(404, 'notFound');
  if (patch.status !== undefined && !RULE_STATUSES.includes(patch.status)) throw new HttpError(422, 'invalid');
  const t = now();
  // The history row and the overwrite are one change: never an archived row without its update, or the reverse.
  q.tx(() => {
    q.run(
      'INSERT INTO business_config_history (rule_id, category, name, description, value_json, allowed_values_json, status, source, effective_from, effective_to, updated_by, notes, superseded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      r.key, r.category, r.name, r.description, r.value_json, r.allowed_values_json, r.status, r.source, r.effective_from, t, r.updated_by, r.notes, t,
    );
    const value = patch.value !== undefined ? JSON.stringify(patch.value) : r.value_json;
    const allowedValues = patch.allowedValues !== undefined ? JSON.stringify(patch.allowedValues) : r.allowed_values_json;
    const status = patch.status !== undefined ? patch.status : r.status;
    const notes = patch.notes !== undefined ? (str(patch.notes, 2000) || null) : r.notes;
    const effectiveFrom = (patch.status !== undefined && patch.status !== r.status) ? t : r.effective_from;
    q.run(
      'UPDATE business_config SET value_json = ?, allowed_values_json = ?, status = ?, notes = ?, effective_from = ?, effective_to = NULL, updated_by = ?, updated_at = ? WHERE key = ?',
      value, allowedValues, status, notes, effectiveFrom, actor.id, t, id,
    );
    audit(actor, 'businessRule.update', 'businessRule', id, { status, previousStatus: r.status });
  });
  return businessRuleById(id);
}
export const updateBusinessRule = (id, patch, actor) => applyRuleChange(id, patch, actor);
export const activateBusinessRule = (id, actor) => applyRuleChange(id, { status: 'ACTIVE' }, actor);
export const disableBusinessRule = (id, actor) => applyRuleChange(id, { status: 'DISABLED' }, actor);

/** §19 — the Pending Decision Center: every register rule not yet ACTIVE/APPROVED, plus the per-entity gaps that
    already live in their own tables rather than a duplicated register row (§30): services with no workflow
    configured, and suppliers never verified as connected. Batched, not one query per row. */
export function pendingDecisions() {
  const rules = q.all("SELECT * FROM business_config WHERE status IN ('PENDING','DRAFT')").map((r) => ({
    id: r.key, category: r.category, name: r.name, status: r.status,
    reason: J(r.value_json, {})?.note ?? r.source, impact: 'business_rule',
  }));
  const services = q.all('SELECT id FROM services');
  const configuredServiceIds = new Set(q.all('SELECT DISTINCT service_id FROM service_workflows').map((r) => r.service_id));
  const unconfiguredServices = services.filter((s) => !configuredServiceIds.has(s.id)).map((s) => ({
    id: `service:${s.id}`, category: 'service_workflow', name: `${s.id} workflow`, status: 'NOT_CONFIGURED',
    reason: 'no workflow steps configured for this service', impact: 'service',
  }));
  const notConnectedSuppliers = q.all("SELECT id, name FROM suppliers WHERE integration_status != 'connected'").map((s) => ({
    id: `supplier:${s.id}`, category: 'supplier_integration', name: s.name, status: 'NOT_CONNECTED',
    reason: 'no real integration has been verified for this supplier', impact: 'supplier',
  }));
  return { items: [...rules, ...unconfiguredServices, ...notConnectedSuppliers] };
}

/** §27 — the final business rule matrix: every register rule plus one computed coverage row per per-entity
    category (service workflows, suppliers) — a plain tally of real rows, never a fabricated percentage. */
export function businessRuleMatrix() {
  const rows = q.all('SELECT * FROM business_config ORDER BY category, key').map((r) => ({
    category: r.category, rule: r.name, status: r.status, configured: r.status === 'ACTIVE' || r.status === 'APPROVED',
    source: r.source, impact: J(r.value_json, {})?.note ?? '',
  }));
  const services = q.all('SELECT id FROM services');
  const configuredServiceIds = new Set(q.all('SELECT DISTINCT service_id FROM service_workflows').map((r) => r.service_id));
  const configuredServices = services.filter((s) => configuredServiceIds.has(s.id)).length;
  rows.push({
    category: 'service_workflows', rule: 'Service workflow coverage',
    status: services.length && configuredServices === services.length ? 'ACTIVE' : configuredServices ? 'PARTIALLY_CONFIGURED' : 'NOT_CONFIGURED',
    configured: configuredServices > 0, source: 'services / service_workflows tables',
    impact: `${configuredServices}/${services.length} services have a configured workflow`,
  });
  const suppliers = q.all('SELECT integration_status FROM suppliers');
  const connected = suppliers.filter((s) => s.integration_status === 'connected').length;
  rows.push({
    category: 'suppliers', rule: 'Supplier integration coverage', status: connected ? 'PARTIALLY_CONFIGURED' : 'NOT_CONNECTED',
    configured: connected > 0, source: 'suppliers table', impact: `${connected}/${suppliers.length} suppliers verified connected`,
  });
  return { items: rows };
}
