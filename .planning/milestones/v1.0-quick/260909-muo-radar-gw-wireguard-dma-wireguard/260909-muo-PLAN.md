---
phase: quick-260909-muo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - infra/relay/startup.sh
  - infra/relay/wireguard/client.conf.template
  - scripts/setup-relay-iam.sh
  - scripts/deploy-relay.sh
  - scripts/smoke-relay.sh
  - .gitignore
  - scripts/install-vpn-menubar.sh   # ⚠️ git 미추적 유지 — 절대 커밋하지 않는다
  - infra/relay/README.md
autonomous: true
requirements: [RELAY-03]

must_haves:
  truths:
    - "radar-gw 가 WireGuard 서버(wg0 10.20.0.1/24 · UDP 51820)를 부팅마다 멱등하게 올린다 — startup.sh 재실행이 서버 개인키를 재생성하지 않는다"
    - "서버 개인키·피어 공개키가 저장소·문서·계획 어디에도 없다. 키는 VM 의 /etc/wireguard/ 0600 안에만 존재한다"
    - "WireGuard 피어는 10.41.1.120 의 9100·22 두 포트에만 닿는다 — 그 외 wg0 출입 forward 는 명시 drop 이고, VM 의 기본 경로·tun0 라우트·kbvpn-* 자산은 변하지 않는다"
    - "docker 의 iptables FORWARD DROP 정책 아래에서도 wg0→tun0 이 통과한다 (DOCKER-USER ACCEPT 를 PostUp 이 넣고 PostDown 이 뺀다)"
    - "openconnect 가 재접속해 tun0 이 재생성돼도 규칙이 유효하다 — 인터페이스 이름(iifname/oifname) 기준이라 인덱스에 묶이지 않는다"
    - "gh-radar-vpc 방화벽이 4규칙이 되고, 4규칙을 기대하도록 setup-relay-iam.sh · deploy-relay.sh · smoke-relay.sh INV-2 가 함께 갱신된다"
    - "Mac/Windows 사용자가 저장소의 client.conf.template + README 만 보고 WireGuard 공식 앱에 프로필 `KB DMA` 를 만들 수 있다"
    - "메뉴바 앱의 DMA 터널이 gcloud·IAP·ssh -L·lo0 별칭 없이 `scutil --nc start/stop \"KB DMA\"` 만으로 동작한다 (sudo 불필요)"
    - "메뉴바 앱에서 KB VPN 직결과 DMA 터널의 상호배제 가드가 유지되고, 교보 모드는 한 줄도 바뀌지 않는다"
    - "scripts/install-vpn-menubar.sh 는 커밋되지 않는다 — .gitignore 가 이유 주석과 함께 이 파일을 무시한다"
    - "VM·GCP 실반영 명령이 SUMMARY 의 적용 런북에 그대로 적혀 있고, 미검증 항목이 정직하게 표로 남는다"
  artifacts:
    - path: "infra/relay/startup.sh"
      provides: "섹션 8 — WireGuard 서버(wg0) · nftables wgfwd · DOCKER-USER 우회 · wg-peer-add 헬퍼 · docker 이후 기동 드롭인"
      contains: "wg-quick@wg0"
    - path: "infra/relay/wireguard/client.conf.template"
      provides: "Mac/Windows 공용 WireGuard 클라이언트 프로필 템플릿 (플레이스홀더만, 실키 0건)"
      contains: "dma.jx1.io:51820"
    - path: "scripts/setup-relay-iam.sh"
      provides: "relay-allow-wireguard (udp:51820 ← 0.0.0.0/0, target-tags radar-gw) 4번째 규칙 + 가드 루프"
      contains: "relay-allow-wireguard"
    - path: "scripts/install-vpn-menubar.sh"
      provides: "메뉴바 앱 v3.5 — DMA 터널을 WireGuard 프로필 제어로 교체 (git 미추적 유지)"
      contains: "scutil"
    - path: "infra/relay/README.md"
      provides: "방화벽 4규칙 · §DMA 터널 재편(WireGuard 기본 / IAP 폴백) · 피어 발급 절차 · 검증·막힐 때 표"
      contains: "wg-peer-add"
  key_links:
    - from: "개발기 WireGuard 앱"
      to: "radar-gw:51820/udp"
      via: "Endpoint dma.jx1.io:51820 (relay-allow-wireguard 방화벽 규칙)"
      pattern: "51820"
    - from: "wg0 (10.20.0.0/24)"
      to: "tun0 → 10.41.1.120:{9100,22}"
      via: "nft inet wgfwd forward accept + postrouting masquerade + DOCKER-USER ACCEPT"
      pattern: "wgfwd"
    - from: "메뉴바 앱 DMA 터널 토글"
      to: "macOS WireGuard 프로필 \"KB DMA\""
      via: "scutil --nc start/stop/status"
      pattern: "scutil --nc"
---

<objective>
radar-gw 에 WireGuard 서버를 올려 개발기(Mac/Windows)가 **gcloud·IAP·ssh -L 없이** `10.41.1.120:9100` 에 직결하게 하고, macOS 메뉴바 앱의 「DMA 터널」 모드를 WireGuard 프로필 제어로 교체한다.

**Purpose:** 현재 경로(IAP + `ssh -L` + `lo0` 별칭)는 gcloud 인증·sudo 면제·고아 ssh 프로세스·2222 포워딩·`~/.ssh/config Match exec` 까지 붙은 5중 구조다. WireGuard 는 커널 모듈 하나로 같은 일을 하고, 클라이언트는 공식 앱이 재연결까지 맡는다. 개발기에서 없어지는 것: gcloud 의존 · sudo · 별칭 · 고아 프로세스 · 재연결 상한.

**Output:** VM 자산(startup.sh 섹션 8) · 방화벽 4번째 규칙 + 그 규칙을 기대하는 게이트 3종 · 클라이언트 템플릿 · 메뉴바 앱 v3.5 · README 재편 + 적용 런북.

**하지 않는 것 (명시):**
- VM·GCP 에 실제로 반영하지 않는다. startup.sh 재적용과 방화벽 생성은 **사용자 확인 후 오케스트레이터**가 실행한다 (실계좌 경로).
- `scripts/dma-tunnel.sh` · `scripts/dma-tunnel.ps1` 를 고치지 않는다 — UDP 51820 이 막힌 망을 위한 폴백으로 남긴다.
- `kbvpn-connect` · `kbvpn-vpnc-wrapper` · `openconnect@.service` · `kbvpn-route-guard` · `kbvpn-watchdog` · `kbvpn-renew` · Caddy · relay 컨테이너를 건드리지 않는다.
- 메뉴바 앱의 교보증권 모드와 KB VPN 직결(openconnect) 경로를 건드리지 않는다.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@infra/relay/README.md
@infra/relay/startup.sh
@infra/relay/kbvpn-vpnc-wrapper.sh
@scripts/setup-relay-iam.sh
@scripts/install-vpn-menubar.sh
@.planning/quick/260909-el9-dma-2-windows-powershell-macos-bash/260909-el9-SUMMARY.md

<facts>
<!-- 계획 시점에 실제로 읽고 확인한 값. 실행자는 다시 탐색하지 말 것. -->

**startup.sh 관례** — `set -euo pipefail` · `log()` 는 `[relay-startup]` 접두 · 섹션은 `# ──…` 박스에 번호(현재 1~7) · sbin 스크립트는 quoted heredoc(`<<'EOF'`)으로 생성 후 `chmod 0700` · systemd 유닛은 heredoc 후 `daemon-reload` → `enable --now` · 실패는 `|| log "WARN: …"` 로 부팅을 죽이지 않는다. 마지막 줄은 `log "═══ startup.sh 완료 ═══"`.

**게이트 3곳이 「정확히 3규칙」에 하드코딩돼 있다 (계획 시점 실측).**
- `scripts/deploy-relay.sh:150-161` — `EXPECTED_FW="relay-allow-https relay-allow-iap-ssh relay-allow-internal-order "` 문자열 완전 일치. **불일치 시 `exit 1` 이라 4번째 규칙을 만들면 배포가 즉시 막힌다.**
- `scripts/smoke-relay.sh:585-589` — INV-2 가 같은 문자열을 비교.
- `scripts/setup-relay-iam.sh:296-310` — VM 생성 전 가드 루프 `for RULE in relay-allow-https relay-allow-iap-ssh relay-allow-internal-order`.
- 정렬 순서: `https < iap-ssh < internal-order < wireguard` (`ia` < `in` < `wi`) → 새 이름은 문자열 **끝**에 붙는다.

**setup-relay-iam.sh 자산 루프(≈322행)는 건드리지 않는다** — WireGuard 자산은 전부 startup.sh 가 heredoc 으로 만들고, `client.conf.template` 은 개발기용이라 메타데이터에 실을 대상이 아니다.

**VM 사실** — `canIpForward=False`(README §현재 배포 상태). WireGuard 인바운드는 VM 자기 주소로 오는 UDP 이고, tun0 로 나가는 트래픽은 openconnect 가 TLS/DTLS 로 캡슐화해 출발지가 VM 자신이므로 GCE anti-spoof 와 무관하다 → **옵션을 켜지 않는다**(최소권한 유지, T-15-27).

**메뉴바 앱 구조 (scripts/install-vpn-menubar.sh, 1390행, 미추적·개인 파일)**
- bash 변수 → `Config.swift` heredoc 보간 → `main.swift`(quoted heredoc `<<'SWIFT_EOF'`) → `swiftc` 컴파일 → `~/Applications/VPN.app`.
- 지울 자리: gcloud 탐색 152-172행(`GCLOUD_BIN`·`GCLOUD_DIR`·`TUNNEL_PATH`) / sudoers `(2) DMA 터널` ifconfig 줄 249-250 / §4-b `~/.ssh/config` 블록 생성 264-291 / uninstall 의 `FORWARD_SPEC` pgrep 루프 + `ifconfig lo0 -alias` 114-115 / Swift 의 `tunnelAliasPresent()` 376-380 · `addAlias/removeAlias` 601-627 · `killTree/killOrphans` 629-645 · `sshLocalPortFree/launch` 647-698 · `handleExit`(재연결 5회) 700-735 · `cleanupLeftover` 820-829 · `TunnelState.leftover`.
- 유지: `inet4Addresses()` 349-368 · `kbVPNIP()` 370-374 · `reachable()`(nc -z, connect 후 즉시 close) 737-740 · `/healthz` 의 `"vpn":true` 판정과 **`-f` 를 쓰지 않는 이유 주석**(degraded 면 503 + 본문) 581-586 · 글리프 렌더 985-1005 · 상호배제 가드 1040-1075.
- 시각 표시 문자열 `v3.2` 는 **128행** (헤더 주석의 v3.4 와 별개).

**클라이언트 이름** — 터널 이름 `KB DMA` 고정. macOS WireGuard 앱은 **파일명이 터널 이름**이므로 `KB DMA.conf` 로 저장해야 `scutil --nc list` 에 그 이름이 뜬다.
</facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: VM 측 WireGuard 자산 + 방화벽 4번째 규칙 + 클라이언트 템플릿 + .gitignore</name>
  <files>infra/relay/startup.sh, infra/relay/wireguard/client.conf.template, scripts/setup-relay-iam.sh, scripts/deploy-relay.sh, scripts/smoke-relay.sh, .gitignore</files>
  <action>
**(a) `infra/relay/startup.sh` — 섹션 7 뒤, 완료 로그 앞에 「8. WireGuard 서버 (개발기 직결)」 섹션을 추가한다.** 기존 섹션 1~7 은 한 줄도 고치지 않는다. 섹션 박스 주석·`log()` 접두·heredoc 관례를 그대로 따른다.

1. 패키지: 기존 `apt-get install` 블록(섹션 2)은 그대로 두고, 섹션 8 안에서 `wireguard` `nftables` 를 `--no-install-recommends` 로 설치한다(이미 있으면 apt 가 no-op). Debian 12 커널 내장 모듈이므로 저장소 밖 패키지·DKMS 를 쓰지 않는다.
2. `install -d -m 0700 /etc/wireguard`.
3. **서버 개인키 1회 생성**: `/etc/wireguard/wg0.key` 가 없을 때만 `umask 077; wg genkey > /etc/wireguard/wg0.key` 후 `chmod 0600`. **이미 있으면 절대 재생성하지 않는다** — 재생성하면 모든 클라이언트 프로필이 무효가 된다. 로그는 「생성」/「기존 키 유지」 두 갈래.
4. **peers.conf**: `/etc/wireguard/peers.conf` 가 없으면 헤더 주석만 담긴 빈 파일을 0600 으로 만든다(사람이 관리하는 파일이므로 있으면 손대지 않는다).
5. **nft 규칙 파일** `/etc/wireguard/wgfwd.nft` (0600) 를 heredoc 으로 매 부팅 재작성:
   - `table inet wgfwd` 하나만 쓴다. forward 체인은 `type filter hook forward priority filter + 10; policy accept;` — **policy 를 drop 으로 두지 않는다.** 별도 테이블의 drop 정책은 docker 를 포함한 호스트 전체 forward 를 죽인다. 「나머지는 drop」은 **명시 규칙** `iifname "wg0" drop` · `oifname "wg0" drop` 을 마지막에 두어 구현한다.
   - 순서: ① MSS 클램프 `iifname "wg0" oifname "tun0" tcp flags syn tcp option maxseg size set rt mtu` 와 그 역방향 ② `iifname "wg0" oifname "tun0" ip daddr 10.41.1.120 tcp dport { 9100, 22 } accept` ③ `iifname "tun0" oifname "wg0" ct state established,related accept` ④ 위의 두 drop.
   - postrouting 체인 `type nat hook postrouting priority srcnat; policy accept;` 에 `oifname "tun0" ip saddr 10.20.0.0/24 masquerade`.
   - **`iif`/`oif`(인덱스) 대신 `iifname`/`oifname`(이름)을 쓴다** — openconnect 재접속으로 tun0 가 재생성되면 인덱스가 바뀌어 규칙이 조용히 죽는다. 이 이유를 파일 주석과 섹션 주석 양쪽에 적는다.
6. **wg0.conf** `/etc/wireguard/wg0.conf` (0600) 를 heredoc 으로 매 부팅 재작성. **개인키를 이 파일에 넣지 않는다** — 그래야 파일이 순수 생성물이 되어 멱등하다.
   - `[Interface] Address = 10.20.0.1/24` · `ListenPort = 51820` · `SaveConfig = false`.
   - `PostUp` 순서: ① `wg set %i private-key /etc/wireguard/wg0.key` ② `wg addconf %i /etc/wireguard/peers.conf || true`(빈 파일 허용) ③ `nft -f /etc/wireguard/wgfwd.nft` ④ DOCKER-USER 두 줄(아래 7번).
   - `PostDown`: DOCKER-USER 두 줄 `-D`(각각 `|| true`) → `nft delete table inet wgfwd || true`.
7. **Docker 함정 — 반드시 처리한다.** VM 에 docker.io 가 있어 iptables-nft 의 `filter/FORWARD` 정책이 **DROP** 이다. 별도 nft 테이블의 accept 는 이를 덮지 못한다(어느 base chain 이든 drop 판정이 나오면 그 자리에서 끝난다). docker 가 재생성 시에도 **보존하는 유일한 훅**인 `DOCKER-USER` 체인에 같은 조건을 넣는다. PostUp 은 중복 삽입을 막기 위해 **먼저 `-D` 로 지우고 `-I` 로 넣는다**(둘 다 `2>/dev/null || true`):
   - `iptables -I DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT`
   - `iptables -I DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`
   - PostDown 은 같은 두 줄을 `-D` 로. 근거(왜 nft accept 만으로는 안 되는가)를 섹션 주석에 적는다.
8. **기동 순서 드롭인** `/etc/systemd/system/wg-quick@wg0.service.d/10-after-docker.conf` (0644): `[Unit] After=docker.service` + `Wants=docker.service`. **이유:** DOCKER-USER 체인은 dockerd 가 만든다 — 부팅 시 wg-quick 이 먼저 뜨면 삽입이 조용히 실패한다.
9. `net.ipv4.ip_forward=1` 를 `/etc/sysctl.d/99-wireguard.conf` (0644) 에 쓰고 `sysctl --system >/dev/null` 로 즉시 적용.
10. **피어 추가 헬퍼** `/usr/local/sbin/wg-peer-add` (0700) 를 quoted heredoc 으로 설치. 사용법 `wg-peer-add <이름> <공개키> <10.20.0.N>`:
    - 인자 3개 아니면 usage + exit 64. 공개키는 base64 44자(`^[A-Za-z0-9+/]{43}=$`) 검증, 주소는 `^10\.20\.0\.([2-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])$` 검증(서버 `.1` 금지).
    - 이미 같은 공개키 또는 같은 주소가 `peers.conf` 에 있으면 **거부**(exit 1, 중복 IP 는 조용한 라우팅 오작동이 된다).
    - `peers.conf` 에 `# <이름>  (추가 YYYY-MM-DD)` 주석 + `[Peer]` / `PublicKey = …` / `AllowedIPs = <IP>/32` 를 append 하고 0600 유지.
    - wg0 이 살아 있으면(`wg show wg0 >/dev/null 2>&1`) `wg addconf wg0 /etc/wireguard/peers.conf` 로 **즉시 반영**하고, 아니면 「다음 기동 시 반영」을 안내한다.
    - 마지막에 `wg show wg0 peers | wc -l` 로 현재 피어 수를 출력한다. **공개키 전체를 화면에 출력하지 않는다.**
11. `systemctl daemon-reload` → `systemctl enable --now wg-quick@wg0` (실패 시 `log "WARN: …"` 로 부팅을 죽이지 않는다).
12. 기본 경로·tun0·`kbvpn-*` 자산을 **건드리지 않는다**는 문장을 섹션 주석에 남긴다.

**(b) `infra/relay/wireguard/client.conf.template` 신규.** 상단에 저장 방법 주석(`KB DMA.conf` 로 저장 → 앱이 파일명을 터널 이름으로 쓴다 / 개인키는 앱의 「빈 터널 만들기」가 생성 → 그 공개키를 관리자에게 전달 / **이 파일에 실키를 쓰지 않는다**), 본문은 플레이스홀더:
`[Interface]` `PrivateKey = <CLIENT_PRIVATE_KEY>` `Address = 10.20.0.<N>/32` / `[Peer]` `PublicKey = <SERVER_PUBLIC_KEY>` `Endpoint = dma.jx1.io:51820` `AllowedIPs = 10.41.1.120/32` `PersistentKeepalive = 25`.
`AllowedIPs` 가 `/32` 하나라서 기본 경로·사내망 나머지를 가져가지 않는다는 점을 주석으로 적는다.

**(c) `scripts/setup-relay-iam.sh`** — 5.4 절 (c) 뒤에 (d) 를 기존과 **같은 idempotent 패턴**으로 추가:
`relay-allow-wireguard` / `--rules=udp:51820` / `--source-ranges=0.0.0.0/0` / `--target-tags="$NETWORK_TAG"` / `--network="$VPC_NAME"` / description 은 `Phase15 relay: WireGuard from dev machines (peer pubkey is the real auth)`. 주석에 「출발지를 좁히지 않는 이유 = 개발기 공인 IP 가 유동. 실제 인증은 피어 공개키이며 키 없는 UDP 는 응답 없이 버려진다」를 적는다. 296행 가드 루프의 `for RULE in …` 목록에도 `relay-allow-wireguard` 를 추가하고, 14·250·251·310행의 「3규칙」 문구를 4규칙으로 고친다.

**(d) `scripts/deploy-relay.sh:150-161` · `scripts/smoke-relay.sh:585-589`** — 기대 문자열을 `"relay-allow-https relay-allow-iap-ssh relay-allow-internal-order relay-allow-wireguard "` 로 바꾸고 주석·라벨의 「3규칙」을 「4규칙」으로. **이 두 게이트는 방화벽 규칙이 실제로 생성되기 전까지 FAIL 한다** — deploy-relay.sh 는 `exit 1` 이라 배포가 막힌다. 그래서 적용 순서가 「방화벽 생성 → 그 다음 배포」임을 두 파일 주석과 Task 3 의 런북에 함께 적는다.

**(e) `.gitignore`** — 끝에 다음을 추가한다:
```
# 개인 파일 — KB VPN 접속 파라미터·계정·인증서 핀이 하드코딩돼 있다. 커밋 금지.
scripts/install-vpn-menubar.sh
```

**커밋:** `feat(quick-260909-muo): radar-gw 에 WireGuard 서버를 올린다` — `git add` 대상은 `infra/relay/startup.sh infra/relay/wireguard/client.conf.template scripts/setup-relay-iam.sh scripts/deploy-relay.sh scripts/smoke-relay.sh .gitignore` **정확히 6개 경로만**. `git add -A` · `git add scripts/` 금지(미추적 `scripts/dma-tunnel.*` · `install-vpn-menubar.sh` 가 딸려 들어간다).
  </action>
  <verify>
    <automated>bash -n infra/relay/startup.sh && bash -n scripts/setup-relay-iam.sh && bash -n scripts/deploy-relay.sh && bash -n scripts/smoke-relay.sh && test -f infra/relay/wireguard/client.conf.template && [ "$(grep -c 'relay-allow-wireguard' scripts/setup-relay-iam.sh)" -ge 2 ] && [ "$(grep -c 'relay-allow-wireguard' scripts/deploy-relay.sh)" -eq 1 ] && [ "$(grep -c 'relay-allow-wireguard' scripts/smoke-relay.sh)" -eq 1 ] && [ "$(grep -c 'DOCKER-USER' infra/relay/startup.sh)" -ge 4 ] && [ "$(grep -c 'iifname' infra/relay/startup.sh)" -ge 4 ] && [ "$(grep -cE '^[[:space:]]*(iif|oif) ' infra/relay/startup.sh)" -eq 0 ] && [ "$(grep -c 'wg-quick@wg0' infra/relay/startup.sh)" -ge 2 ] && [ "$(grep -c 'wg genkey' infra/relay/startup.sh)" -eq 1 ] && [ "$(grep -cE 'PrivateKey *= *[A-Za-z0-9+/]{43}=' infra/relay/wireguard/client.conf.template)" -eq 0 ] && git check-ignore -q scripts/install-vpn-menubar.sh && echo GATE-OK</automated>
  </verify>
  <done>startup.sh 에 섹션 8 이 있고 `bash -n` 통과. 서버 개인키 생성이 1회 조건부이고 wg0.conf 에 키가 없다. nft 규칙이 전부 `iifname/oifname` 이며 forward policy 가 drop 이 아니다. DOCKER-USER 삽입·삭제가 짝으로 있다. 방화벽 4번째 규칙이 setup-relay-iam.sh 에 있고 deploy/smoke 기대 문자열이 4개 이름이다. 클라이언트 템플릿에 실키 0건. `git check-ignore scripts/install-vpn-menubar.sh` 가 성공한다. 커밋에 6개 경로만 들어갔다.</done>
</task>

<task type="auto">
  <name>Task 2: 메뉴바 앱 v3.5 — DMA 터널을 WireGuard 프로필 제어로 교체</name>
  <files>scripts/install-vpn-menubar.sh</files>
  <action>
⚠️ **이 파일은 git 미추적을 유지한다. 어떤 경우에도 `git add` 하지 않는다.** (Task 1 의 .gitignore 항목이 사고를 막지만, 실행자도 명시적으로 지킨다.) 커밋 없음.
⚠️ **KB VPN 접속 파라미터(서버·계정·authgroup·인증서 핀)와 교보 관련 값은 한 글자도 바꾸지 않는다. 그 값을 SUMMARY·로그·대화에 옮겨 적지 않는다.**

**bash 파트**
1. 헤더(3-53행): 제목을 `(v3.5)` 로. 맨 위에 `v3.5 변경점` 블록 신설 — DMA 터널을 WireGuard 프로필 제어로 교체 / 개발기에서 sudo·별칭·외부 CLI 의존이 사라짐 / 재연결은 WireGuard 앱이 맡음. 하위 v3.4·v3.3 블록은 이력으로 남기되 **더 이상 사실이 아님**을 한 줄로 표시한다. 「설치되는 것」 목록에서 `ifconfig` sudoers 항목을 뺀다. 글리프 설명에서 `◇ 터널 잔여물` 줄을 삭제(● 직결 / ◆ DMA / ○ 끊김 / ◌ 처리중 4종만 남긴다).
   - **변경점 서술에 `gcloud`·`lo0`·`2222`·`killOrphans` 같은 토큰을 그대로 쓰지 않는다**(검증 grep 이 자기무효화된다). 「외부 CLI 경유 포워딩 경로」처럼 쓴다.
2. 128행 `(v3.2)` → `(v3.5)`.
3. 설정 변수: `TUNNEL_VM`/`TUNNEL_ZONE`/`TUNNEL_PROJECT`/`FORWARD_SPEC`/`SSH_LOCAL_PORT`/`SSH_TARGET_PORT`/`SSH_FORWARD_SPEC` 삭제. 신규 `TUNNEL_NAME="KB DMA"`(**한 곳에서만 정의** — 앱이 이름을 거부하면 여기만 고치면 되게), `WG_APP="/Applications/WireGuard.app"`, `WG_PREFIX="10.20.0."`. `GW_ADDR`·`GW_PORT`·`HEALTH_URL`·`TUNNEL_LOG`·`SSH_USER`·`SSH_TARGET_HOST` 는 유지.
4. gcloud 탐색 블록(152-172행) 통째 삭제. 대신 `WG_APP` 존재 여부를 `c_ok`/`c_warn` 으로 보고(없어도 설치는 계속한다 — 상태 표시는 동작).
5. sudoers: `(2) DMA 터널` 주석과 `ifconfig lo0 alias/-alias` 줄 삭제. `(1) VPN 직결` 두 스크립트만 남긴다(주석도 「VPN 직결 전용」으로 정정).
6. §4-b 삭제 → **§4-b 를 「구 블록 정리」로 대체**: `~/.ssh/config` 가 있으면 `# >>> kbvpn dma ssh >>>` ~ `# <<< kbvpn dma ssh <<<` 블록을 sed 로 제거하고 `c_ok "구 ~/.ssh/config 터널 블록 제거 (WireGuard 직결에서는 불필요)"`. 새 블록은 만들지 않는다. `SSH_CONFIG`·블록 마커 변수는 이 정리와 uninstall 을 위해 남긴다.
7. uninstall 절(107-126행): `FORWARD_SPEC` pgrep 루프와 `ifconfig lo0 -alias` 줄 삭제. `~/.ssh/config` 블록 제거는 유지. 「WireGuard 프로필 `KB DMA` 는 건드리지 않는다 — 앱에서 직접 지운다」를 안내로 출력.
8. `Config.swift` heredoc: `gcloudBin`·`tunnelPath`·`tunnelVM`·`tunnelZone`·`tunnelProject`·`forwardSpec`·`sshLocalPort`·`sshForwardSpec` 삭제, `tunnelName`·`wgApp`·`wgPrefix` 추가.
9. 말미 안내 출력(1372-1385행): 글리프 4종으로, 터널 설명을 「WireGuard 프로필 `KB DMA` 직결」로, SSH 줄을 `ssh ${SSH_USER}@${SSH_TARGET_HOST}` 로, 선행 점검 항목을 새 4종으로 갱신. **최초 1회 프로필 등록 안내**(WireGuard 앱에서 빈 터널 생성 → 공개키 전달 → 관리자가 `wg-peer-add` → `KB DMA` 로 저장)를 3줄 이내로 넣고 상세는 `infra/relay/README.md` 를 가리킨다.

**Swift 파트 (`main.swift` heredoc)**
10. `tunnelAliasPresent()` 삭제 → `func wgTunnelIP() -> String?` 신설: `inet4Addresses()` 중 `iface.hasPrefix("utun") && address.hasPrefix(Config.wgPrefix)` 첫 값. (`inet4Addresses()`·`kbVPNIP()`·`kyoboIP()` 는 그대로 재사용.)
11. `enum TunnelState { case off, up, connecting }` — `.leftover`·`.reconnecting` 제거.
12. `TunnelController` 재작성 (프로세스를 소유하지 않는 컨트롤러):
    - 삭제: `process`·`startedAt`·`attempt`·`maxReconnect`·`wanted`·`reconnects`·`sshForwardActive`·`environment`·`addAlias`·`removeAlias`·`killTree`·`killOrphans`·`sshLocalPortFree`·`launch`·`handleExit`·`cleanupLeftover`·`shutdownSync`.
    - 유지: `queue`·`log()`/`appendToLog`·`onChange`·`reachable()`(nc -z, connect 후 즉시 close — **로그인·주문 프레임 금지 주석 그대로**).
    - `private func scutilStatus() -> String`: `run("/usr/sbin/scutil", ["--nc", "status", Config.tunnelName])` 의 **첫 줄**을 trim 해서 반환.
    - `func state() -> TunnelState`: 첫 줄이 `Connected` 이거나 `wgTunnelIP() != nil` → `.up`; `Connecting`/`Disconnecting` → `.connecting`; 그 외 → `.off`.
    - `func preflight() -> [Check]` **4종**: ① `WireGuard 앱 설치` = `FileManager.fileExists(Config.wgApp)` ② `프로필 "KB DMA" 존재` = `scutil --nc list` 출력에 `Config.tunnelName` 포함 ③ `VM 쪽 VPN 활성` = 기존 `/healthz` `"vpn":true` 로직·**`-f` 미사용 주석 그대로 유지** ④ `로컬 KB VPN 충돌 없음` = 기존 `kbVPNIP()` 판정 그대로. 실패 detail 은 조치 문구로(예: 프로필 없음 → 「WireGuard 앱에서 `KB DMA` 프로필을 먼저 등록 — infra/relay/README.md」).
    - `func start(completion:)`: preflight → 첫 실패 시 중단 → `scutil --nc start "KB DMA"` → 최대 20초 동안 0.5초 간격으로 `state() == .up` 대기 → 올라오면 `reachable()` 을 최대 10초 재시도 → 성공하면 `completion(true, "")`. 실패(연결 안 됨 / 도달 안 됨)면 `scutil --nc stop` 으로 되돌리고 사유 메시지. 로그 형식은 기존 `──── 터널 시작 ────` + `PASS/FAIL` 줄을 유지한다.
    - `func stop(completion:)`: `scutil --nc stop` 후 최대 10초 `.off` 대기, 로그 후 completion.
    - **앱 종료 시 터널을 내리지 않는다** — 우리 자식 프로세스가 아니고 잔여물 위험도 없다. `applicationWillTerminate` 의 `tunnel.shutdownSync()` 호출을 지우고, 그 이유를 헤더 주석에 한 줄 남긴다.
13. `refresh()`: `tunnelAvailable` 판정을 `FileManager.fileExists(Config.wgApp)` 로 교체하고 비활성 문구를 「터널 연결 (WireGuard 앱 없음)」로. 터널 줄은 `.up` → `"터널: 연결됨 — 10.41.1.120:9100  (WireGuard KB DMA)"`, `.connecting` → `"터널: 처리 중…"`, `.off` → `"터널: 연결 안 됨"`. `.leftover` 분기 전부 삭제. **상호배제 가드는 그대로**(VPN 연결 시 터널 버튼 잠금 / 터널 활성 시 VPN 버튼 잠금). 글리프 로직에서 `.leftover → ◇` 만 제거하고 ● ◆ ○ ◌ 는 유지.
14. `toggleTunnel()`: `.up`/`.connecting` → stop, `.off` → (KB VPN 직결이면 거부 알림) → start. `.leftover` 분기 삭제.
15. `sshCommand()` → `"ssh " + Config.sshUser + "@" + Config.sshTargetHost`. `kbSSHCopy` 활성 조건은 `state() == .up` 하나로(`sshForwardActive` 참조 제거), 제목은 `"SSH 명령 복사 (" + sshCommand() + ")"`.
16. `checkTunnel()` 은 구조 유지(무변경 점검) — 항목 수만 4종으로 자연히 바뀐다.

**셀프 체크(실행자):** 남은 파일에서 `gcloudBin`·`ifconfig`·`tunnel-through-iap`·`killOrphans`·`leftover`·`2222` 식별자가 0건인지 확인한 뒤 검증 명령을 돌린다.
  </action>
  <verify>
    <automated>bash -n scripts/install-vpn-menubar.sh && SW=$(mktemp) && awk "/^cat > \"\\\$BUILD\/main.swift\" <<'SWIFT_EOF'$/{f=1;next} /^SWIFT_EOF$/{f=0} f" scripts/install-vpn-menubar.sh > "$SW" && swiftc -parse "$SW" && [ "$(grep -c 'tunnel-through-iap\|GCLOUD_BIN\|gcloudBin\|TUNNEL_PATH\|tunnelPath' scripts/install-vpn-menubar.sh)" -eq 0 ] && [ "$(grep -c 'ifconfig\|killOrphans\|killTree\|leftover\|SSH_LOCAL_PORT\|sshForwardSpec\|SSH_FORWARD_SPEC\|Match host' scripts/install-vpn-menubar.sh)" -eq 0 ] && [ "$(grep -c 'scutil' scripts/install-vpn-menubar.sh)" -ge 5 ] && [ "$(grep -c 'TUNNEL_NAME=' scripts/install-vpn-menubar.sh)" -eq 1 ] && [ "$(grep -c 'v3.5' scripts/install-vpn-menubar.sh)" -ge 2 ] && [ "$(grep -c 'v3\.2)' scripts/install-vpn-menubar.sh)" -eq 0 ] && [ "$(git status --porcelain scripts/install-vpn-menubar.sh)" = "" ] && echo GATE-OK</automated>
  </verify>
  <done>`bash -n` 과 추출한 `main.swift` 의 `swiftc -parse` 가 통과한다. gcloud·ifconfig·ssh 포워딩·잔여물 식별자가 0건이고 `scutil` 호출이 5건 이상이다. `TUNNEL_NAME` 이 한 곳에만 정의된다. 헤더와 128행이 v3.5 다. 교보 코드와 KB 직결 경로가 diff 에 없다. **`git status --porcelain scripts/install-vpn-menubar.sh` 이 빈 출력**(= .gitignore 적용으로 미추적조차 표시되지 않음)이고 커밋이 생성되지 않았다.</done>
</task>

<task type="auto">
  <name>Task 3: README 재편 + 적용 런북</name>
  <files>infra/relay/README.md</files>
  <action>
1. **§구성 개요** — `### 방화벽 3규칙` 제목을 `### 방화벽 4규칙` 으로 바꾸고 표에 행 추가: `relay-allow-wireguard | udp:51820 | 0.0.0.0/0 | 개발기 WireGuard 직결 (인증은 피어 공개키)`. 출발지를 좁히지 않은 이유를 표 아래 한 문장으로.
2. **날짜 붙은 스냅샷 행(79·157·240행 부근)은 값을 고치지 않는다** — 그 시점의 증거다. 각 행 끝에 `(당시 — 현재는 4규칙, §구성 개요)` 만 덧붙인다. README 의 「날짜 붙은 절은 스냅샷, 현재값은 §현재 운영 상태가 정본」 규율을 그대로 따른다.
3. **§DMA 터널 재편** — 현재 절을 두 갈래로 나눈다:
   - **A. WireGuard 직결 (기본)** — 경로 `개발기 WireGuard 앱 → UDP 51820 → radar-gw wg0 → tun0 → 10.41.1.120`. Mac/Windows 공통 절차: ① 공식 앱 설치 ② 「빈 터널 만들기」로 키쌍 생성 ③ 공개키를 관리자에게 전달 ④ 관리자가 VM 에서 `sudo /usr/local/sbin/wg-peer-add <이름> <공개키> 10.20.0.<N>` ⑤ 서버 공개키 확인 `sudo wg show wg0 public-key` ⑥ `infra/relay/wireguard/client.conf.template` 을 채워 **`KB DMA.conf`** 로 저장 후 import(파일명이 곧 터널 이름이며, macOS 메뉴바 앱이 이 이름으로 `scutil` 제어한다) ⑦ 연결 후 `nc -z 10.41.1.120 9100`. **개인키·공개키 실값을 문서에 적지 않는다**를 굵게.
   - **B. IAP 터널 (폴백)** — `scripts/dma-tunnel.sh` / `.ps1`. **UDP 51820 이 막힌 망**(사내 방화벽·일부 호텔/공용 Wi-Fi)에서 쓴다. 기존 사용법·선행 점검 표·종료 코드·실측 근거(quick-260909-el9)는 **삭제하지 않고** 이 하위 절로 옮긴다.
   - D-27 경고(터널 너머는 실계좌 · TCP 도달성 확인까지만 · 로그인·주문 금지)를 두 갈래 **모두**의 머리에 유지한다.
4. **§검증 명령** (새 하위 절): VM 에서 `systemctl is-active wg-quick@wg0` · `sudo wg show` (핸드셰이크·피어 수, **키 값 노출 주의** 한 줄) · `sudo nft list table inet wgfwd` · `sudo iptables -S DOCKER-USER` · `ip route show default`(여전히 `ens4` 인지) / 클라이언트에서 `nc -z 10.41.1.120 9100`.
5. **§막힐 때** 표를 새 원인들로 확장: 핸드셰이크는 되는데 9100 이 안 열림 → **docker 재시작으로 DOCKER-USER 규칙이 날아갔다** → `sudo systemctl restart wg-quick@wg0` / 핸드셰이크 자체가 없음 → 방화벽 `relay-allow-wireguard` 미생성 또는 망이 UDP 51820 차단 → **B(IAP 폴백)** 로 / 연결은 되는데 대용량 응답에서 멈춤 → MSS 클램프 확인(`nft list table inet wgfwd`) / tun0 재생성 후 무반응 → 규칙은 이름 기준이라 유효하나 openconnect 상태부터 확인(§VPN 조작) / `deploy-relay.sh` 가 방화벽 불일치로 `exit 1` → **방화벽 4번째 규칙을 먼저 만든다**.
6. **§파일 맵(부팅 자산 표)** 에 추가: `/etc/wireguard/wg0.conf` 0600 _(생성됨)_ · `/etc/wireguard/wgfwd.nft` 0600 _(생성됨)_ · `/usr/local/sbin/wg-peer-add` 0700 _(생성됨)_ · `/etc/sysctl.d/99-wireguard.conf` 0644 _(생성됨)_ · `/etc/systemd/system/wg-quick@wg0.service.d/10-after-docker.conf` 0644 _(생성됨)_ · `/etc/wireguard/wg0.key` 0600 **(VM 이 1회 생성 — 재작성하지 않는다)** · `/etc/wireguard/peers.conf` 0600 **(사람이 관리 — 없으면 빈 파일만 만든다)** · 저장소 `infra/relay/wireguard/client.conf.template` (개발기용, VM 배치 없음). 「_(생성됨)_ 은 매 부팅 재작성」 문장에 **키·피어 2종은 예외**임을 명시한다.
7. **§적용 런북** (새 절, 순서 고정) — 실행 주체는 **사용자 확인 후 오케스트레이터**이며 실행 결과는 SUMMARY 에 붙인다:
   ```bash
   # ① 방화벽 4번째 규칙 (deploy-relay.sh 게이트가 이 규칙을 기대하므로 반드시 먼저)
   GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh
   # ② 메타데이터 갱신은 ① 이 함께 수행한다. VM 재적용:
   gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
     --command='sudo google_metadata_script_runner startup'
   # ③ 확인 (읽기만)
   gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
     --command='systemctl is-active wg-quick@wg0; sudo wg show wg0 public-key; sudo nft list table inet wgfwd; ip route show default'
   # ④ 피어 등록 (사용자 공개키를 받은 뒤)
   gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
     --command='sudo /usr/local/sbin/wg-peer-add <이름> <공개키> 10.20.0.<N>'
   ```
   ③ 에서 `ip route show default` 가 `dev ens4` 가 아니면 **즉시 중단**하고 §VPN 조작 의 복구 절차로 간다는 문장을 붙인다.
8. **SUMMARY 에 남길 것** (Task 3 의 산출물 일부): 위 런북을 명령 그대로 복사하고, **미검증 표**를 만든다 — VM 실반영·`wg show` 핸드셰이크·nft/DOCKER-USER 실측·클라이언트 `nc -z`·메뉴바 v3.5 런타임(`scutil` 제어)·macOS 앱이 공백 포함 이름 `KB DMA` 를 수용하는지. 각 행에 「누가 언제」를 적는다. 이름이 거부되면 `TUNNEL_NAME` 한 곳과 `.conf` 파일명만 `KB-DMA` 로 바꾸면 된다는 회피책도 적는다.

**커밋:** `docs(quick-260909-muo): WireGuard 직결 운영 문서와 적용 런북` — `git add infra/relay/README.md` **한 경로만**.
  </action>
  <verify>
    <automated>[ "$(grep -c '방화벽 4규칙' infra/relay/README.md)" -ge 1 ] && [ "$(grep -n '3규칙' infra/relay/README.md | grep -vc '당시')" -eq 0 ] && [ "$(grep -c 'relay-allow-wireguard' infra/relay/README.md)" -ge 2 ] && [ "$(grep -c 'wg-peer-add' infra/relay/README.md)" -ge 2 ] && [ "$(grep -c 'DOCKER-USER' infra/relay/README.md)" -ge 1 ] && [ "$(grep -c 'client.conf.template' infra/relay/README.md)" -ge 1 ] && [ "$(grep -c 'dma-tunnel.sh' infra/relay/README.md)" -ge 1 ] && [ "$(grep -c 'google_metadata_script_runner startup' infra/relay/README.md)" -ge 2 ] && [ "$(grep -cE '[A-Za-z0-9+/]{43}=' infra/relay/README.md)" -eq 0 ] && echo GATE-OK</automated>
  </verify>
  <done>방화벽 표가 4규칙이고 남은 「3규칙」 표현은 전부 `(당시 …)` 가 붙은 스냅샷 행뿐이다. §DMA 터널이 WireGuard(기본)/IAP(폴백) 두 갈래이고 폴백 절의 기존 내용(선행 점검·종료 코드·el9 실측)이 보존됐다. 검증 명령·막힐 때 표·파일 맵·적용 런북이 있다. README 에 base64 키 형태 문자열 0건. 커밋은 README 한 경로만.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 공인 인터넷 → radar-gw UDP 51820 | 새로 여는 유일한 공인 인바운드. 인증은 피어 공개키(WireGuard 암호학적 핸드셰이크) |
| wg0 (10.20.0.0/24) → tun0 → KB 사내망 | VM 이 처음으로 **라우터**가 되는 지점. 너머는 실계좌가 걸린 실 게이트웨이 |
| 개발기 키체인·WireGuard 앱 프로필 | 클라이언트 개인키 보관처. 저장소 밖 |
| /etc/wireguard/ (0600) | 서버 개인키·피어 목록. 저장소·문서·계획에 사본 없음 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-MUO-01 | Spoofing | 공인망에서 51820 로 오는 임의 트래픽 | mitigate | source-range 를 넓게 두는 대신 **인증을 공개키로** 한다. WireGuard 는 유효 키 없는 패킷에 응답하지 않아(silent drop) 포트 스캔에 노출 표면이 생기지 않는다 |
| T-MUO-02 | Elevation of Privilege | 피어가 사내망 전체로 횡이동 | mitigate | forward 는 `10.41.1.120` 의 `{9100,22}` 만 accept, 나머지 wg0 출입은 **명시 drop**. 클라이언트 `AllowedIPs` 도 `/32` 하나 |
| T-MUO-03 | Elevation of Privilege | 터널을 통한 실계좌 주문 | mitigate | 메뉴바 앱은 `nc -z`(connect 후 즉시 close)까지만. 프레임을 쓰지 않는다(D-27). README 두 갈래 머리에 실계좌 경고 유지 |
| T-MUO-04 | Denial of Service | nft 별도 테이블의 forward policy drop 이 호스트 전체 forward 를 죽임 | mitigate | policy 는 `accept`, 차단은 wg0 매칭 **명시 drop 규칙**으로만. 계획 Task 1(a)5 에 근거 명시 |
| T-MUO-05 | Denial of Service | docker 재시작으로 DOCKER-USER 규칙 소실 → 터널이 조용히 죽음 | mitigate | `After=docker.service` 드롭인으로 부팅 순서 고정 + README §막힐 때 에 `systemctl restart wg-quick@wg0` 복구 경로 |
| T-MUO-06 | Denial of Service | 기본 경로·tun0 라우트 탈취 | mitigate | wg0 에 `Table`·기본 경로 설정을 넣지 않고 마스커레이드만 한다. 런북 ③ 에서 `ip route show default` 가 `ens4` 인지 확인하고 아니면 중단 |
| T-MUO-07 | Information Disclosure | 서버 개인키 유출 | mitigate | VM 에서 `wg genkey` 로 생성해 `/etc/wireguard/` 0600 에만 존재. 저장소·문서·계획·SUMMARY 에 값 0건. wg0.conf 에도 넣지 않는다(PostUp 이 파일에서 주입) |
| T-MUO-08 | Information Disclosure | 개인 파일(KB VPN 파라미터·인증서 핀)의 우발 커밋 | mitigate | `.gitignore` 에 `scripts/install-vpn-menubar.sh` 등재 + Task 2 는 커밋 없음 + 게이트 `git status --porcelain` 빈 출력 확인 |
| T-MUO-09 | Tampering | 방화벽 4규칙 전환으로 배포 게이트가 조용히 깨짐 | mitigate | `deploy-relay.sh`·`smoke-relay.sh` 기대 문자열을 같은 커밋에서 갱신하고, 런북 순서를 「방화벽 먼저 → 배포」로 고정 |
| T-MUO-10 | Repudiation | 피어 주소 중복으로 인한 오라우팅 | mitigate | `wg-peer-add` 가 공개키·주소 중복을 거부하고 이름·날짜 주석을 남긴다 |
| T-MUO-SC | Tampering | 패키지 설치 | mitigate | 신규 패키지는 Debian 12 공식 저장소의 `wireguard`·`nftables` 둘뿐(커널 내장 모듈). npm/pip/cargo 설치 0건, 저장소 밖 다운로드 0건 → 공급망 체크포인트 불요 |
</threat_model>

<verification>
```bash
bash -n infra/relay/startup.sh scripts/setup-relay-iam.sh 2>/dev/null; \
for f in infra/relay/startup.sh scripts/setup-relay-iam.sh scripts/deploy-relay.sh scripts/smoke-relay.sh scripts/install-vpn-menubar.sh; do bash -n "$f" || echo "SYNTAX FAIL: $f"; done

# 방화벽 4규칙이 게이트 3곳에서 일치하는가
grep -c 'relay-allow-wireguard' scripts/setup-relay-iam.sh scripts/deploy-relay.sh scripts/smoke-relay.sh

# 비밀 값이 저장소로 새지 않았는가 (base64 44자 키 형태)
grep -rEc '[A-Za-z0-9+/]{43}=' infra/relay/wireguard/client.conf.template infra/relay/README.md infra/relay/startup.sh

# 개인 파일이 커밋 대상에서 빠졌는가
git check-ignore -v scripts/install-vpn-menubar.sh
git log --oneline -3 --name-only | grep -c 'install-vpn-menubar'   # 0 이어야 한다
```
</verification>

<success_criteria>
- `bash -n` 이 수정한 5개 셸 스크립트 전부에서 통과하고, 추출한 `main.swift` 가 `swiftc -parse` 를 통과한다.
- startup.sh 섹션 8 이 멱등이다: 서버 개인키는 없을 때만 생성, `peers.conf` 는 없을 때만 빈 파일, wg0.conf·nft·헬퍼는 매 부팅 재작성.
- nft 규칙이 전부 인터페이스 **이름** 기준이고 forward policy 가 accept 이며, DOCKER-USER 삽입/삭제가 PostUp/PostDown 짝으로 있다.
- 방화벽 4규칙이 setup-relay-iam.sh(생성 + 가드) · deploy-relay.sh · smoke-relay.sh 세 곳에서 일치한다.
- 메뉴바 앱에서 gcloud·IAP·ssh 포워딩·lo0 별칭·sudoers ifconfig·2222·`Match exec` 식별자가 0건이고, `scutil --nc` 제어와 상호배제 가드가 있다. 교보 모드 diff 0.
- `scripts/install-vpn-menubar.sh` 가 커밋되지 않았고 `.gitignore` 로 무시된다.
- README 만 읽고 피어 발급 → 프로필 import → 검증 → 막힐 때까지 갈 수 있다.
- 커밋 2건(feat / docs), 각각 명시한 경로만 포함, 한글 메시지, `feat(quick-260909-muo):` / `docs(quick-260909-muo):` 형식.
- SUMMARY 에 적용 런북(명령 그대로)과 미검증 표가 있다. **VM·GCP 에 아무것도 반영하지 않았다.**
</success_criteria>

<output>
Create `.planning/quick/260909-muo-radar-gw-wireguard-dma-wireguard/260909-muo-SUMMARY.md` when done
</output>
