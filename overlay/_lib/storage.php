<?php
/* =============================================================================
   Where leads live — one answer for lead.php (which writes them) and /admin/
   (which reads them).

   Outside the web root when the host allows it (../pixora-leads, next to
   public_html), otherwise _leads/ inside it, which its .htaccess keeps from
   ever being served. Only lead.php creates the folder; the admin page only
   looks for one that is already there.
   ============================================================================= */

function pixoraStorageDir(bool $create = false): ?string
{
    $site = dirname(__DIR__);
    foreach ([dirname($site) . '/pixora-leads', $site . '/_leads'] as $dir) {
        if (is_dir($dir) || ($create && @mkdir($dir, 0700, true))) {
            if (is_writable($dir)) {
                return $dir;
            }
        }
    }
    return null;
}
