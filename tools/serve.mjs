#!/usr/bin/env node
// `npm run serve` — serves the site the way GitHub Pages and the suites do:
// at http://localhost:8919/mashhor-demo/ (PORT overrides), which is the
// TEST_ORIGIN a suite run by hand and the BASE the audits default to.
import { staticServer } from '../tests/env.mjs';

const port = Number(process.env.PORT) || 8919;
const { origin } = await staticServer({ port, host: null });
console.log(`serving the site at ${origin}/mashhor-demo/  (Ctrl+C to stop)`);
