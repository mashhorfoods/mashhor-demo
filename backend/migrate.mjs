import { assertConfig } from './config.mjs';
import { migrate } from './db.mjs';
assertConfig();
const n = migrate();
console.log(`migrations applied: ${n}`);
