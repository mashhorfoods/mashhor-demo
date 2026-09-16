/* ============================================================================
   NUMBER ONE — FOUNDATION ENTRY POINT
   نمبرون للسفر و السياحة — Stage 10.1

   The barrel: every public part of the system from one place, for the
   style guide, the browser suites and the QA console. A PAGE imports
   `page.js` and its own component module instead, so it loads only what
   it draws (Stage 10.12 cleanup).

   Deliberately NOT here: routing, data fetching, booking logic. Stage 11
   onwards adds those around this layer, not inside it. §26 / §28 / §34
   ========================================================================= */

export * from './core/dom.js';
export * from './core/i18n.js';
export * from './core/format.js';
export * from './core/booking.js';
export * from './data/config.js';
export * from './data/services.js';
export * from './data/service-details.js';
export * from './data/destinations.js';
export * from './data/offers.js';
export * from './data/navigation.js';
export * from './data/footer.js';
export * from './data/home.js';
export * from './components/ui.js';
export * from './components/cards.js';
export * from './components/search.js';
export * from './components/states.js';
export * from './components/header.js';
export * from './components/footer.js';
export * from './components/home.js';
export * from './components/services.js';
export * from './components/service-detail.js';
export * from './components/destinations.js';
export * from './components/offers.js';
export * from './components/booking.js';
export * from './components/supervisor.js';
export * from './data/supervisors.js';

export { boot, mountPage, bottomNav } from './page.js';
