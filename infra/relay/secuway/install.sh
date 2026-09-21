#!/bin/bash
# Idempotent installer for the Kyobo SecuwaySSL persistent tunnel on radar-gw.
# Run ON the VM as root from the directory holding these files:
#   sudo ./install.sh
# Prereq: Secret Manager secret `kyobo-vpn-cred` exists (2 lines: id, password)
# and the VM service account has roles/secretmanager.secretAccessor on it.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
install -m 0755 "$here/secuway-fetch-secret" /usr/local/sbin/secuway-fetch-secret
install -m 0755 "$here/secuway-connect"      /usr/local/sbin/secuway-connect
install -m 0755 "$here/secuway-watchdog"     /usr/local/sbin/secuway-watchdog
install -m 0644 "$here/securwayssl.service"           /etc/systemd/system/securwayssl.service
install -m 0644 "$here/securwayssl-watchdog.service"  /etc/systemd/system/securwayssl-watchdog.service
install -m 0644 "$here/securwayssl-watchdog.timer"    /etc/systemd/system/securwayssl-watchdog.timer
systemctl daemon-reload
systemctl enable securwayssl.service securwayssl-watchdog.timer
echo "installed. start with: systemctl start securwayssl.service && systemctl start securwayssl-watchdog.timer"
