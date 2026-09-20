#!/bin/bash
# 1회성 측정 (2026-09-17): 61분 주기 외부 단절이 어느 층에서 끊기는지 가른다.
# 읽기·핑만 한다. 720초 뒤 스스로 끝난다.
set -u
D=${1:?출력 디렉터리}
mkdir -p "$D"
DUR=${2:-720}

ts() { date -u +%H:%M:%S.%3N; }

# ① 호스트 내부: 메타데이터 서버 (HTTP — 긴 ICMP 연속 핑은 메타데이터 서버가 막는다)
( end=$((SECONDS+DUR)); while [ $SECONDS -lt $end ]; do
    echo "$(ts) $(curl -s -o /dev/null -m 0.9 -w '%{http_code} %{time_total}' -H 'Metadata-Flavor: Google' http://169.254.169.254/computeMetadata/v1/instance/id)"
    sleep 1; done ) > "$D/http-metadata.log" 2>&1 &
# ② Google 망: 8.8.8.8
timeout $DUR ping -D -O -i 1 -W 1 8.8.8.8 > "$D/ping-google.log" 2>&1 &
# ③ 국내 ISP: KT·LG U+ DNS
timeout $DUR ping -D -O -i 1 -W 1 168.126.63.1 > "$D/ping-kt.log" 2>&1 &
timeout $DUR ping -D -O -i 1 -W 1 164.124.101.2 > "$D/ping-lgu.log" 2>&1 &
# ④ KB 게이트웨이 (VPN tun0 경유)
timeout $DUR ping -D -O -i 1 -W 1 -I tun0 10.41.1.120 > "$D/ping-kb.log" 2>&1 &
# ⑤ 초당 NIC 카운터·CPU steal — 패킷이 NIC 를 나가는지/들어오는지, VM 이 멈췄는지
( end=$((SECONDS+DUR)); while [ $SECONDS -lt $end ]; do
    read -r _ rxb rxp _ _ _ _ _ _ txb txp _ < <(grep 'ens4:' /proc/net/dev | tr ':' ' ')
    steal=$(awk '/^cpu /{print $9}' /proc/stat)
    echo "$(ts) ens4_rxp=$rxp ens4_txp=$txp steal=$steal"
    sleep 1; done ) > "$D/counters.log" 2>&1 &
wait
echo "$(ts) done" >> "$D/counters.log"
