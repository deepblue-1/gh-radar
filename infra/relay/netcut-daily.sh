#!/bin/bash
# 평일 08:00~20:00 KST 연속 측정 (1초 주기). 2026-09-17~18 의 61분 주기 단절 재발 감시용.
# 저장소 원본: infra/relay/netcut-probe.sh · 문서: infra/relay/README.md
set -u
exec /usr/local/sbin/netcut-probe-260917 "/var/tmp/netcut-$(TZ=Asia/Seoul date +%y%m%d)" 43200
