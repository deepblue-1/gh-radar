#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# kbvpn-vpnc-wrapper — openconnect 용 vpnc-script 래퍼 (split-tunnel 강제)
# 설치 위치: /usr/local/sbin/kbvpn-vpnc-wrapper (0700)
# 호출 경로: kbvpn-connect → openconnect --script=/usr/local/sbin/kbvpn-vpnc-wrapper
#
# ── 왜 필요한가 (RESEARCH Pitfall 10 · T-15-11) ──────────────────
# openconnect 는 기본 vpnc-script 로 "서버가 푸시한" 라우트를 그대로 설치한다.
# KB 서버가 default route 를 푸시하면 VM 의 모든 아웃바운드가 KB 로 넘어가고,
# 그 순간 아래가 전부 동시에 죽는다:
#   · Secret Manager / Artifact Registry / Cloud Logging (관리 평면)
#   · Caddy 의 ACME 인증서 발급·갱신 → 며칠 뒤 TLS 만료
#   · Supabase 호출
#   · IAP 터널 SSH → **복구 수단 자체를 잃는다**
# 인바운드 443 은 conntrack 덕에 잠시 버티지만, 비대칭 경로가 되면 신규 연결이 죽는다.
#
# 그래서 stock vpnc-script 를 부르기 **전에** CISCO_SPLIT_INC_* 를 직접 export 해
# "10.41.0.0/16 만 터널로" 를 강제한다. 서버 푸시를 덮어쓰는 방식이라 추가 패키지가 0 이다.
#
# ── 대안 (채택하지 않음) ────────────────────────────────────────
# 2순위: `vpn-slice` (PyPI 0.16.1). 가장 검증된 split-tunnel 도구지만
#        **Debian 저장소에 없어** pipx 로 PyPI 에서 받아야 한다.
#        공급망 표면이 늘어나므로 자동 설치 코드를 넣지 않는다.
#        전환이 필요하면 별도 승인 체크포인트를 거친다 (T-15-SC).
# 3순위: 연결 후 `ip route del default dev tun0` 사후 교정 — 경합이 있어 권장하지 않는다.
#
# 검증 방법 (D-03 선검증 ⑤):
#   연결 후 `ip route` 의 default 가 ens4 로 유지되는가
#   `curl -s ifconfig.me` 가 여전히 VM 공인 IP 인가
#   `curl -sI https://secretmanager.googleapis.com` 이 응답하는가
# ═══════════════════════════════════════════════════════════════

set -eu

# KB DMA 게이트웨이 대역만 터널링한다 (게이트웨이 실서버 10.41.1.120).
export CISCO_SPLIT_INC=1
export CISCO_SPLIT_INC_0_ADDR=10.41.0.0
export CISCO_SPLIT_INC_0_MASK=255.255.0.0
export CISCO_SPLIT_INC_0_MASKLEN=16

# 서버 배너는 저널로 흘리지 않는다 (불필요한 노이즈 · 내용 통제 불가).
unset CISCO_BANNER

# Debian 의 vpnc-scripts 패키지가 제공하는 stock 스크립트로 위임한다.
exec /usr/share/vpnc-scripts/vpnc-script "$@"
