// Shared test environment: where the site is served and which browser runs.
// `npm test` (tests/run.mjs) sets both; running one suite by hand falls back
// to a local server at :8919 and the bundled Chromium when one exists.
import { existsSync } from 'node:fs';
process.env.TEST_ORIGIN ??= 'http://localhost:8919';
if (!process.env.CHROMIUM && existsSync('/opt/pw-browsers/chromium')) process.env.CHROMIUM = '/opt/pw-browsers/chromium';
