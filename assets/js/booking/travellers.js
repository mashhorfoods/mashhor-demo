/* ============================================================================
   BOOKING / TRAVELLERS — passenger and contact forms as data. Stage 11

   A form is a list of fields per traveller TYPE and SERVICE. The page draws
   whatever is listed here and nothing more (§14: no unnecessary
   information). Validation is field-level and returns the field to mark.
   ========================================================================= */

export const NATIONALITIES = [
  { value: 'SD', labelAr: 'السودان', labelEn: 'Sudan' }, { value: 'SA', labelAr: 'السعودية', labelEn: 'Saudi Arabia' },
  { value: 'EG', labelAr: 'مصر', labelEn: 'Egypt' }, { value: 'AE', labelAr: 'الإمارات', labelEn: 'United Arab Emirates' },
  { value: 'JO', labelAr: 'الأردن', labelEn: 'Jordan' }, { value: 'TR', labelAr: 'تركيا', labelEn: 'Türkiye' },
  { value: 'KE', labelAr: 'كينيا', labelEn: 'Kenya' }, { value: 'ET', labelAr: 'إثيوبيا', labelEn: 'Ethiopia' },
  { value: 'GB', labelAr: 'المملكة المتحدة', labelEn: 'United Kingdom' }, { value: 'OTHER', labelAr: 'أخرى', labelEn: 'Other' },
];

/** The list of travellers a booking needs forms for, from the context counts. */
export function travellerSlots(travellers) {
  const slots = [];
  for (let i = 0; i < (travellers.adults ?? 0); i++) slots.push({ id: `adult-${i + 1}`, type: 'adult', index: i + 1 });
  for (let i = 0; i < (travellers.children ?? 0); i++) slots.push({ id: `child-${i + 1}`, type: 'child', index: i + 1 });
  for (let i = 0; i < (travellers.infants ?? 0); i++) slots.push({ id: `infant-${i + 1}`, type: 'infant', index: i + 1 });
  return slots;
}

/** Fields for one traveller. `mode: 'request'` asks only for a name. */
export function travellerFields(type, service, mode = 'search') {
  const base = [
    { id: 'firstName', type: 'text', label: 'bk.tr.firstName', required: true, autocomplete: 'given-name', latin: true },
    { id: 'lastName',  type: 'text', label: 'bk.tr.lastName',  required: true, autocomplete: 'family-name', latin: true },
  ];
  if (mode === 'request') return base;
  const full = [
    ...base,
    { id: 'dob', type: 'date', label: 'bk.tr.dob', required: true },
    { id: 'gender', type: 'select', label: 'bk.tr.gender', required: true, options: [{ value: 'F', labelAr: 'أنثى', labelEn: 'Female' }, { value: 'M', labelAr: 'ذكر', labelEn: 'Male' }] },
    { id: 'nationality', type: 'select', label: 'bk.tr.nationality', required: true, options: NATIONALITIES },
  ];
  if (service === 'flights') full.push(
    { id: 'passport', type: 'text', label: 'bk.tr.passport', required: true, autocomplete: 'off', document: true, help: 'bk.tr.passport.help' },
    { id: 'passportExpiry', type: 'date', label: 'bk.tr.passportExpiry', required: true, help: 'bk.tr.passportExpiry.help' },
  );
  return full;
}

export const CONTACT_FIELDS = [
  { id: 'email', type: 'email', label: 'bk.contact.email', required: true, autocomplete: 'email', help: 'bk.contact.email.help' },
  { id: 'phone', type: 'tel', label: 'bk.contact.phone', required: true, autocomplete: 'tel', help: 'bk.contact.phone.help' },
];

const yearsAt = (dob, on) => { const d = new Date(dob); const o = new Date(on); let y = o.getFullYear() - d.getFullYear(); const m = o.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && o.getDate() < d.getDate())) y--; return y; };

/**
 * Validate one traveller's values. `travelDate` (ISO) drives the age and
 * passport-expiry checks. Returns [{ field, key }] — the message key is
 * translated by the page.
 */
export function validateTraveller(type, values, fields, travelDate) {
  const errors = [];
  for (const f of fields) {
    const v = String(values[f.id] ?? '').trim();
    if (f.required && !v) { errors.push({ field: f.id, key: 'bk.err.required' }); continue; }
    if (!v) continue;
    if (f.latin && !/^[A-Za-z][A-Za-z' -]{0,39}$/.test(v)) errors.push({ field: f.id, key: 'bk.err.latin' });
    if (f.document && !/^[A-Za-z0-9]{4,20}$/.test(v)) errors.push({ field: f.id, key: 'bk.err.document' });
    if (f.id === 'dob') {
      const age = travelDate ? yearsAt(v, travelDate) : yearsAt(v, new Date());
      if (Number.isNaN(age) || age < 0) errors.push({ field: f.id, key: 'bk.err.dob' });
      else if (type === 'adult' && age < 12) errors.push({ field: f.id, key: 'bk.err.adultAge' });
      else if (type === 'child' && (age < 2 || age > 11)) errors.push({ field: f.id, key: 'bk.err.childAge' });
      else if (type === 'infant' && age >= 2) errors.push({ field: f.id, key: 'bk.err.infantAge' });
    }
    if (f.id === 'passportExpiry' && travelDate && v <= travelDate) errors.push({ field: f.id, key: 'bk.err.passportExpiry' });
  }
  return errors;
}
export function validateContact(values) {
  const errors = [];
  const email = String(values.email ?? '').trim(); const phone = String(values.phone ?? '').trim();
  if (!email) errors.push({ field: 'email', key: 'bk.err.required' }); else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push({ field: 'email', key: 'bk.err.email' });
  if (!phone) errors.push({ field: 'phone', key: 'bk.err.required' }); else if (!/^\+?[\d\s-]{7,20}$/.test(phone)) errors.push({ field: 'phone', key: 'bk.err.phone' });
  return errors;
}
