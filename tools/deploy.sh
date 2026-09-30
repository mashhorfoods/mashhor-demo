#!/usr/bin/env bash
# Upload a built, tested site to the host (Hostinger) over FTP — what the
# workflow does after every push to main once the FTP secrets are set
# (LAUNCH.md, "النشر التلقائي").
#
#   FTP_SERVER=… FTP_USERNAME=… FTP_PASSWORD=… tools/deploy.sh <built site folder>
#
#   FTP_DIR       the site's folder as the FTP account sees it (public_html);
#                 it must exist — a wrong name stops the upload, it is never created
#   FTP_PROTOCOL  ftps (default: encrypted) or ftp
#
# In three passes, so a visitor never gets pages whose scripts the security
# policy does not know yet: files first, then the pages, then .htaccess (which
# carries the policy). Never overwritten: the admin password (admin/config.php
# is uploaded only if the server has none yet) and the requests people sent
# (_leads/ data). Nothing on the server is deleted.
set -euo pipefail

src=${1:?usage: tools/deploy.sh <built site folder>}
: "${FTP_SERVER:?FTP_SERVER is not set}" "${FTP_USERNAME:?FTP_USERNAME is not set}" "${FTP_PASSWORD:?FTP_PASSWORD is not set}"
dir=${FTP_DIR:-public_html}
case ${FTP_PROTOCOL:-ftps} in
  ftps) tls=yes ;;
  ftp) tls=no ;;
  *) echo "deploy: FTP_PROTOCOL must be ftps or ftp" >&2; exit 1 ;;
esac
[ -f "$src/index.html" ] && [ -f "$src/.htaccess" ] || { echo "deploy: $src is not a built site" >&2; exit 1; }

keep="--exclude-glob=admin/config.php --exclude-glob=_leads/*.csv --exclude-glob=_leads/*.json"
mirror="mirror --reverse --no-perms --no-umask --parallel=4 --verbose=1"
export LFTP_PASSWORD=$FTP_PASSWORD
lftp -c "
set cmd:fail-exit yes
set net:max-retries 3
set net:timeout 30
set net:reconnect-interval-base 5
set ftp:ssl-force $tls
set ftp:ssl-protect-data $tls
set ssl:verify-certificate yes
open --env-password -u '$FTP_USERNAME' '$FTP_SERVER'
cd '$dir'
$mirror $keep --exclude-glob=*.html --exclude-glob=.htaccess '$src' .
$mirror --include-glob=*.html --include-glob=*/ '$src' .
$mirror --include-glob=.htaccess --include-glob=*/ '$src' .
$mirror --only-missing --include-glob=config.php '$src/admin' admin
"
echo "deploy: $src uploaded to $FTP_SERVER:$dir"
