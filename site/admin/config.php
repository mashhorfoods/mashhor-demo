<?php
/* =============================================================================
   Admin configuration.

   ADMIN_PASSWORD_HASH is empty on purpose: nobody can sign in until the owner
   sets it. Open /admin/ once, type the password you want on the setup screen,
   and it shows you one line to paste here (via hPanel → File Manager). The
   password itself is never stored or sent anywhere — only its hash lives in
   this file.
   ============================================================================= */

const ADMIN_PASSWORD_HASH = '';

// Sign-in is refused after this many wrong passwords from one address …
const ADMIN_MAX_ATTEMPTS = 5;
// … for this many seconds.
const ADMIN_LOCKOUT = 900;
