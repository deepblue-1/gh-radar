---
phase: quick-260909-muo
plan: 01
subsystem: infra/relay · 개발기 터널
tags: [wireguard, relay, firewall, macos-menubar, dma]
requires: [RELAY-03]
provides: ["radar-gw wg0 서버 자산", "방화벽 4규칙 게이트 동기화", "WireGuard 클라이언트 템플릿", "메뉴바 앱 v3.5"]
affects: [infra/relay, scripts]
key-files:
  created:
    - infra/relay/wireguard/client.conf.template
  modified:
    - infra/relay/startup.sh
    - scripts/setup-relay-iam.sh
    - scripts/deploy-relay.sh
    - scripts/smoke-relay.sh
    - infra/relay/README.md
    - .gitignore
    - scripts/install-vpn-menubar.sh   # git 미추적 유지 — 커밋 0건
metrics:
  tasks: 3
  commits: 2
  files_changed: 7
  completed: 2026-09-09
---

# quick-260909-muo: radar-gw WireGuard 직결 Summary

radar-gw 에 WireGuard 서버(wg0 · UDP 51820)를 올려 개발기가 외부 CLI·IAP·포트 포워딩 없이
`10.41.1.120:9100` 에 직결하게 하고, macOS 메뉴바 앱의 DMA 터널을 `scutil --nc` 프로필 제어로 교체했다.
**VM·GCP 에는 아무것도 반영하지 않았다** — 적용은 아래 런북으로 사용자 확인 후 오케스트레이터가 한다.

---

## 무엇이 바뀌었나 (파일별)

### `infra/relay/startup.sh` (+244줄, 섹션 8 신설)

섹션 1~7 은 **한 줄도 건드리지 않았다.** 완료 로그 앞에 섹션 8 을 통째로 덧붙였다.

| 항목 | 내용 | 멱등성 |
|------|------|--------|
| 패키지 | `wireguard` · `nftables` (Debian 12 공식 저장소, 커널 내장 모듈 — DKMS·외부 다운로드 0건) | apt no-op |
| `/etc/wireguard/wg0.key` | **없을 때만 1회 생성** (`umask 077` 서브셸 · 0600). 있으면 「기존 키 유지」 로그만 | ⚠️ 의도적 비재작성 |
| `/etc/wireguard/peers.conf` | 없을 때만 헤더 주석 빈 파일. 있으면 손대지 않는다 (사람이 관리) | ⚠️ 의도적 비재작성 |
| `/etc/wireguard/wgfwd.nft` | 매 부팅 재작성. `table … / delete table …` 관용구로 재적용도 멱등 | 재작성 |
| `/etc/wireguard/wg0.conf` | 매 부팅 재작성. **개인키를 넣지 않는다** — PostUp 이 0600 키 파일에서 주입 | 재작성 |
| `wg-quick@wg0.service.d/10-after-docker.conf` | `After=/Wants=docker.service` | 재작성 |
| `/etc/sysctl.d/99-wireguard.conf` | `net.ipv4.ip_forward=1` + `sysctl --system` | 재작성 |
| `/usr/local/sbin/wg-peer-add` | 0700 헬퍼 | 재작성 |

**nft 규칙 (실제 생성될 내용, 주석 제외 — 추출해 확인함):**

```
table inet wgfwd
delete table inet wgfwd
table inet wgfwd {
  chain forward {
    type filter hook forward priority filter + 10; policy accept;
    iifname "wg0" oifname "tun0" tcp flags syn tcp option maxseg size set rt mtu
    iifname "tun0" oifname "wg0" tcp flags syn tcp option maxseg size set rt mtu
    iifname "wg0" oifname "tun0" ip daddr 10.41.1.120 tcp dport { 9100, 22 } accept
    iifname "tun0" oifname "wg0" ct state established,related accept
    iifname "wg0" drop
    oifname "wg0" drop
  }
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    oifname "tun0" ip saddr 10.20.0.0/24 masquerade
  }
}
```

- **forward policy 를 drop 으로 두지 않았다.** 별도 테이블의 drop 정책은 docker 를 포함한
  호스트 전체 forward 를 죽인다(T-MUO-04). 「나머지 차단」은 마지막 두 줄의 **명시 drop** 이다.
- **전부 `iifname`/`oifname`(이름) 기준.** `^\s*(iif|oif) ` 실측 **0건** — openconnect 재접속으로
  tun0 가 재생성돼도 인덱스에 묶이지 않는다.
- **DOCKER-USER 우회.** docker.io 가 `filter/FORWARD` 를 DROP 으로 두므로 별도 nft 테이블의
  accept 로는 부족하다. PostUp 이 `-D`(중복 제거) → `-I`(삽입) 순으로 두 줄, PostDown 이 같은 두 줄을 `-D`.
- `wg-peer-add` 는 공개키 형식(base64 44자)·주소 범위(`10.20.0.2~254`, 서버 `.1` 금지)를 검증하고,
  **같은 공개키 또는 같은 주소가 이미 있으면 거부**한다(중복 IP 는 오류 없이 라우팅만 조용히 망가진다).
  공개키 전체를 화면에 출력하지 않는다.

### `infra/relay/wireguard/client.conf.template` (신규 35줄)

플레이스홀더만. `PrivateKey = <CLIENT_PRIVATE_KEY>` · `PublicKey = <SERVER_PUBLIC_KEY>` ·
`Endpoint = dma.jx1.io:51820` · `AllowedIPs = 10.41.1.120/32` · `PersistentKeepalive = 25`.
상단 주석에 `KB DMA.conf` 저장 규칙(파일명 = 터널 이름)과 「앱의 빈 터널 만들기로 키를 만들고
공개키만 전달한다 / 이 파일에 실키를 쓰지 않는다」를 박았다. **base64 키 형태 실측 0건.**

### `scripts/setup-relay-iam.sh` (+30/-3)

5.4 절에 (d) `relay-allow-wireguard` (`udp:51820` ← `0.0.0.0/0`, `--target-tags="$NETWORK_TAG"`) 를
기존과 같은 idempotent 패턴으로 추가. 출발지 미제한 근거(개발기 공인 IP 유동 · 실제 인증은 피어
공개키 · 키 없는 UDP 는 silent drop)를 주석에 남겼다. VM 생성 전 가드 루프에도 규칙명을 추가했고,
헤더 D-09 문구와 5.4 제목·가드 로그의 「3규칙」을 4규칙으로 정정했다.

### `scripts/deploy-relay.sh` (+10/-1) · `scripts/smoke-relay.sh` (+8/-1)

기대 문자열을 `"relay-allow-https relay-allow-iap-ssh relay-allow-internal-order relay-allow-wireguard "`
로 갱신(두 파일 **바이트 동일**, 정렬 순서 `sort` 로 실측 확인). 두 파일 주석에
**「적용 순서 = 방화벽 먼저 → 배포」** 와 「규칙 생성 전에는 이 게이트가 FAIL 하는 것이 정상」을 적었다.
`deploy-relay.sh` 는 불일치 시 `exit 1` 이라 배포가 통째로 막힌다.

### `.gitignore` (+3)

```
# 개인 파일 — KB VPN 접속 파라미터·계정·인증서 핀이 하드코딩돼 있다. 커밋 금지.
scripts/install-vpn-menubar.sh
```

### `scripts/install-vpn-menubar.sh` — **커밋 0건 (git 미추적 유지)**

1390줄 → 1166줄 (**-224줄**). KB VPN 접속 파라미터(서버·계정·authgroup·인증서 핀)와 교보 코드는
**한 글자도 바꾸지 않았고 이 문서에도 옮겨 적지 않았다.**

- **bash:** 헤더 v3.5 + 변경점 블록(v3.4·v3.3·v3.2 는 「폐기 — 더 이상 사실이 아니다」 표시로 이력 보존) /
  128행 `(v3.2)` → `(v3.5)` / 외부 CLI 탐색 블록 삭제 → `WG_APP` 존재 + 프로필 등록 여부를
  `c_ok`/`c_warn` 으로 보고(없어도 설치 계속) / sudoers 에서 터널용 항목 삭제(VPN 직결 두 스크립트만) /
  §4-b 를 **구 `~/.ssh/config` 블록 제거 전용**으로 대체(새 블록 미생성) / uninstall 에서 잔여 프로세스·별칭
  정리 삭제 + 「WireGuard 프로필은 건드리지 않았다」 안내 / `Config.swift` 를 `tunnelName`·`wgApp`·`wgPrefix` 로 교체 /
  말미 안내를 글리프 4종·프로필 등록 3줄·`ssh <user>@<host>` 로 갱신.
- **Swift:** `tunnelAliasPresent()` → `wgTunnelIP()`(utun + `10.20.0.` 접두) / `TunnelState` 를
  `off·up·connecting` 3종으로 / `TunnelController` 를 **프로세스를 소유하지 않는 컨트롤러**로 재작성
  (`scutilStatus()`·`profileRegistered()`·`state()`·`preflight()` 4종·`start`·`stop`) /
  `refresh()`·`toggleTunnel()`·`sshCommand()` 정리 / `applicationWillTerminate` 에서 터널 종료 제거(이유 주석 첨부).
- **유지:** `inet4Addresses()`·`kbVPNIP()`·`kyoboIP()`·`reachable()`(nc -z, connect 후 즉시 close, D-27 주석 그대로)·
  `/healthz` `"vpn":true` 판정과 **`-f` 미사용 이유 주석**·글리프 렌더·**상호배제 가드 3곳**(실측 확인).
- **설정값 변수는 `TUNNEL_NAME="KB DMA"` 한 곳에서만 정의** — 앱이 공백 포함 이름을 거부하면 여기와 `.conf` 파일명만 고치면 된다.

### `infra/relay/README.md` (+173/-24)

방화벽 4규칙 표 + 출발지 미제한 근거 / 날짜 붙은 스냅샷 3행은 **값을 고치지 않고** `*(당시 — 현재는 4규칙, §구성 개요)*` 만 덧붙임 /
§DMA 터널을 **A. WireGuard 직결(기본) / B. IAP 터널(폴백)** 두 갈래로 재편(폴백 절의 사용법·선행 점검 P1~P8·종료 코드·el9 실측 근거는 삭제 없이 이전) /
D-27 실계좌 경고를 두 갈래 **모두**의 머리에 유지 / §검증 명령 · §막힐 때(10행) · §파일 맵(wireguard 자산 8종 + 재작성 예외 2종) · §적용 런북 신설.

---

## 검증 결과 (실측)

| 검사 | 명령 | 결과 |
|------|------|------|
| 셸 문법 5종 | `bash -n` × 5 | **전부 OK** (startup / setup-relay-iam / deploy-relay / smoke-relay / install-vpn-menubar) |
| Swift 파싱 | `swiftc -parse` (추출한 main.swift 774줄) | **PASS** |
| Swift **타입검사** | `swiftc -typecheck Config.swift main.swift` (계획 요구를 넘어선 추가 검증) | **PASS** |
| Task 1 게이트 | 계획의 `<automated>` 전체 | **GATE-OK** |
| Task 2 게이트 | 계획의 `<automated>` 전체 | **GATE-OK** |
| Task 3 게이트 | 계획의 `<automated>` 전체 | **GATE-OK** |
| 방화벽 규칙명 일치 | `grep -c relay-allow-wireguard` | setup **5** · deploy **1** · smoke **1** |
| 기대 문자열 동일성 | `deploy:158` vs `smoke:591` | **바이트 동일** |
| 정렬 순서 | `printf … \| sort` | `https iap-ssh internal-order wireguard` — 기대와 일치 |
| nft 인덱스 매칭 0건 | `grep -cE '^[[:space:]]*(iif\|oif) '` | **0** |
| DOCKER-USER 짝 | `grep -c DOCKER-USER` startup.sh | **10줄** (PostUp -D/-I 4 · PostDown -D 2 · 주석) |
| 개인키 1회 생성 | `grep -c 'wg genkey'` | **1** |
| base64 키 유출 | `grep -rEc '[A-Za-z0-9+/]{43}='` | template **0** · README **0** · startup.sh **0** |
| 제거된 식별자 | `gcloud`·`GCLOUD`·`ifconfig`·`killOrphans`·`killTree`·`leftover`·`2222`·`tunnel-through-iap`·`Match host/exec`·`sshForward*`·`reconnecting`·`shutdownSync` in 메뉴바 | **전부 0건** |
| `scutil` 제어 | `grep -c scutil` 메뉴바 | **17** |
| `TUNNEL_NAME` 단일 정의 | `grep -c 'TUNNEL_NAME='` | **1** |
| 상호배제 가드 | grep 실측 | **3곳 유지** (VPN 잠금 / 터널 잠금 / 토글 거부 알림) |
| 개인 파일 미추적 | `git check-ignore -v` | `.gitignore:49` 로 무시 |
| 개인 파일 커밋 이력 | `git log --all --name-only \| grep -c install-vpn-menubar` | **0** |
| 파일 삭제 | `git diff --diff-filter=D` 두 커밋 | **0건** |
| 최종 working tree | `git status --porcelain` | `.planning/` 만 (소스 clean) |

---

## 미검증 (정직 기록)

이 plan 은 **VM·GCP 에 아무것도 반영하지 않았다.** 아래는 전부 열린 항목이다.

| # | 미검증 항목 | 왜 못 했나 | 누가 · 언제 |
|---|-------------|-----------|------------|
| 1 | `relay-allow-wireguard` 방화벽 규칙 실제 생성 | 실계좌 경로 · 사용자 확인 필요 | 오케스트레이터 · 런북 ① |
| 2 | `startup.sh` 섹션 8 의 VM 실반영 | 위와 동일 | 오케스트레이터 · 런북 ② |
| 3 | `wg-quick@wg0` 기동 · `wg show` 핸드셰이크 | VM 미반영 | 오케스트레이터 · 런북 ③ |
| 4 | `nft list table inet wgfwd` 실측 (문법 포함) | 개발기에 `nft` 가 없어 **정적 검증 불가** — 문법 오류가 있으면 런북 ③ 에서 처음 드러난다 | 오케스트레이터 · 런북 ③ |
| 5 | `iptables -S DOCKER-USER` 두 줄 삽입 실측 | VM 미반영 | 오케스트레이터 · 런북 ③ |
| 6 | 클라이언트 end-to-end (`nc -z 10.41.1.120 9100`) | 피어 미등록 | 사용자 · 런북 ④ 이후 |
| 7 | 메뉴바 앱 v3.5 **런타임** (`scutil` 제어·상태 판정·preflight 4종) | 설치·컴파일을 실행하지 않았다. 검증은 `bash -n` + `swiftc -typecheck` 까지 | 사용자 · 앱 재설치 시 |
| 8 | macOS WireGuard 앱이 **공백 포함 이름 `KB DMA`** 를 수용하는지 | 앱 미보유 상태에서 확인 불가 | 사용자 · 프로필 import 시 |
| 9 | `deploy-relay.sh` / `smoke-relay.sh` INV-2 통과 | ① 전에는 **FAIL 이 정상**이다 | 오케스트레이터 · 런북 ① 직후 |
| 10 | GCE `canIpForward=False` 상태에서 wg0↔tun0 중계가 실제로 통과하는지 | 계획의 근거(tun0 출발지는 VM 자신)는 논증이고 실측이 아니다 | 오케스트레이터 · 런북 ③~④ |

> **⑧ 회피책:** 앱이 공백 이름을 거부하면 `scripts/install-vpn-menubar.sh` 의 `TUNNEL_NAME` **한 줄**과
> `.conf` 파일명만 `KB-DMA` 로 바꾸면 된다. 이름은 그 한 곳에서만 정의되도록 만들어 뒀다.

---

## 적용 런북 (사용자 확인 후 오케스트레이터가 실행)

순서 고정. **① 을 건너뛰면 이후 배포·스모크가 방화벽 불일치로 막힌다.**

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

**단계 사이 게이트**

1. ① 직후 — `bash scripts/smoke-relay.sh` 의 **INV-2 가 PASS 로 뒤집히는지** 확인한다. ① 전에는 FAIL 이 정상이다.
2. ③ 에서 `ip route show default` 가 **`dev ens4` 가 아니면 즉시 중단**하고 README §VPN 조작 의
   복구 절차(라우팅 안전장치 · 직렬 콘솔)로 간다. 기본 경로를 잃으면 IAP SSH 도 막힌다.
3. ③ 의 `sudo wg show wg0 public-key` 출력은 **클라이언트 프로필에 넣을 값**이다.
   사용자에게 직접 전달하고 문서·로그·대화에 남기지 않는다.
4. ② 를 돌릴 때 `wg0` 이 **이미 떠 있었다면** `startup.sh` 는 재기동하지 않는다(기존 세션 끊김 방지).
   설정 재작성분 반영이 필요하면 `sudo systemctl restart wg-quick@wg0` 를 따로 실행한다.
5. ④ 이후 — 클라이언트가 `KB DMA.conf` 를 import 하고 `nc -z 10.41.1.120 9100` 으로 도달성만 확인한다(D-27).

---

## 계획과의 차이 (deviation)

| # | 무엇 | 왜 |
|---|------|-----|
| 1 | nft 파일 맨 위에 `table inet wgfwd` / `delete table inet wgfwd` 관용구를 추가 (계획에 없던 2줄) | 계획대로면 `nft -f` 재실행 시 규칙이 **중복 누적**된다. PostDown 이 지운다지만 `systemctl restart` 실패·수동 재적용 경로에서 남는다. Rule 1(버그) 범위의 인라인 수정 |
| 2 | `wg-peer-add` 에 이름 형식 검증(`^[A-Za-z0-9._-]{1,32}$`) 추가 | 계획은 공개키·주소만 검증하게 했다. 이름이 그대로 `peers.conf` 주석에 append 되므로 개행·`[Peer]` 주입이 가능했다. Rule 2(입력 검증) |
| 3 | 섹션 8 마지막에 `wg0` 기동 여부를 미리 읽어 **「이미 기동 중이면 restart 가 필요하다」 로그**를 분기 출력 | 계획은 `enable --now` 만 지시했는데, 그러면 재적용 시 wg0.conf·nft 재작성분이 조용히 반영되지 않는다. 동작을 바꾸지 않고(자동 restart 금지 — 세션 끊김) **사실을 말하게만** 했다. README·런북 ④ 에도 같은 내용을 적었다 |
| 4 | `setup-relay-iam.sh` 헤더 D-09 문구를 「공인 인바운드는 443 만」 → 「tcp:443 + udp:51820 둘」로 정정 | 계획은 「3규칙 → 4규칙」 숫자만 고치라고 했으나, 그 옆 문장이 그대로면 문서가 거짓이 된다 |
| 5 | 메뉴바 앱에서 `logHandle()`·`processRunning` 등 호출부가 사라진 private 멤버를 함께 제거 | 계획 목록에 없었지만 유일한 호출부(`launch()`)를 지우면 죽은 코드가 된다 |
| 6 | 계획이 지시한 `swiftc -parse` 에 더해 `swiftc -typecheck` 를 Config.swift 스텁과 함께 실행 | `-parse` 는 `Optional<TunnelState> == .off` 같은 타입 오류를 못 잡는다. 더 강한 검증을 붙였고 PASS |

**Rule 4(구조 변경) 해당 없음. 인증 게이트 발생 0건. 패키지 설치 0건.**

---

## 커밋

| 해시 | 메시지 | 경로 |
|------|--------|------|
| `7d8482f` | `feat(quick-260909-muo): radar-gw 에 WireGuard 서버를 올린다` | startup.sh · client.conf.template · setup-relay-iam.sh · deploy-relay.sh · smoke-relay.sh · .gitignore (**6개**) |
| `78605a8` | `docs(quick-260909-muo): WireGuard 직결 운영 문서와 적용 런북` | infra/relay/README.md (**1개**) |

`scripts/install-vpn-menubar.sh` 는 **두 커밋 어디에도 없다** (`git log --all --name-only | grep -c` = 0).

> 두 커밋 사이에 다른 세션의 `97d6e0e docs(16): … 코드 리뷰` 가 끼어들었다(`.planning/` 문서 1파일).
> 이 plan 의 파일과 겹치지 않으며 손대지 않았다.
>
> **push 는 하지 않았다.** 저장소 규칙상 커밋과 push 를 함께 하지만, `.planning/` 문서 커밋이
> 오케스트레이터 소관이라 한 번에 올리도록 남겨 뒀다.

## Threat Flags

없음 — 새로 여는 표면(공인 UDP 51820 · wg0→tun0 포워딩)은 전부 계획의 `<threat_model>`
(T-MUO-01 ~ T-MUO-10, T-MUO-SC)에 이미 등록돼 있고 그 disposition 대로 구현했다.

## Known Stubs

없음. 다만 **VM 반영 전까지 이 코드는 저장소 안에서만 참이다** — 위 §미검증 표가 그 경계다.

## Self-Check: PASSED

- 생성/수정 파일 8종 전부 디스크에 존재
- 커밋 `7d8482f` · `78605a8` 둘 다 `git log --all` 에 존재
- SUMMARY 내 비밀값 패턴(base64 44자 · VPN 호스트/계정/authgroup/인증서 핀) **0건**
- `scripts/install-vpn-menubar.sh` 미추적 유지, 커밋 이력 0건

---

## 적용 결과 (오케스트레이터 실측 · 2026-09-09 07:58Z, 사용자 확인 후)

### 로컬 사전 dry-run (Debian 12 컨테이너, 실커널, `--cap-add NET_ADMIN`)

startup.sh 가 생성하는 `wgfwd.nft` · `wg0.conf` · `wg-peer-add` 를 그대로 추출해 실행했다.

| 항목 | 결과 |
|------|------|
| `nft -f` 1회 · 2회(멱등) | OK · OK, 체인 2개 |
| `wg-quick up wg0` (PostUp 9줄 전부) | 성공 — 개인키 주입 · peers.conf addconf · nft 로드 · DOCKER-USER 2줄 삽입 |
| `wg-peer-add` 정상 / 주소 중복 / 이름 주입(`x\n[Peer]`) | 등록·즉시 반영 / rc=1 거부 / rc=1 거부 |
| `wg-quick down wg0` | DOCKER-USER 2줄 제거 · `inet wgfwd` 테이블 삭제 확인 |

### GCP · VM 반영

| 단계 | 결과 |
|------|------|
| ① `setup-relay-iam.sh` | `relay-allow-wireguard`(udp:51820, 0.0.0.0/0, tag radar-gw) 생성. VM 메타데이터 갱신. 기존 자산 전부 "exists (reused)" |
| ② `google_metadata_script_runner startup` | wireguard·wireguard-tools 설치, 서버 개인키 생성(0600), peers.conf(빈), wgfwd.nft, wg0.conf, wg-peer-add, after-docker 드롭인, `wg-quick@wg0` 기동 |
| ③ 상태 | `wg-quick@wg0` active+enabled · UDP 51820 리슨 · `ip_forward=1` · `inet wgfwd` 규칙 8줄 · DOCKER-USER 2줄 · 라우트 `10.20.0.0/24 dev wg0` |
| ③ 안전장치 | **기본 경로 `dev ens4` 유지** · `openconnect@kb` active 유지 · tun0 라우트(10.41.0.0/16) 그대로 · relay 컨테이너 재시작 없음 · 메모리 available 545MB |
| ④ `smoke-relay.sh` | **INV-2 방화벽 4규칙 PASS** · INV-4 PASS · 11 PASS / 1 FAIL / 1 SKIP |

### VM 안 netns 로 wg 클라이언트를 흉내 낸 end-to-end (TCP connect 만, D-27)

임시 피어를 `wg set` 으로만 붙였다 떼어 peers.conf 에는 흔적이 없다(피어 0 확인).

| 대상 | 결과 |
|------|------|
| `10.41.1.120:22` via wg0→tun0 | **succeeded** — forward 허용·masquerade·DOCKER-USER 통과가 실증됨 |
| `10.41.1.120:443` via wg0 | timeout — **차단 설계대로** |
| `10.41.1.120:9100` via wg0 | 1회 timeout. 같은 시각 VM 호스트에서 tun0 직접 `nc -z 10.41.1.120 9100` 은 **succeeded**. 22 와 동일 규칙(`dport { 9100, 22 }`)이라 규칙 문제는 아니며, 핸드셰이크 완료(`latest handshake: 3 seconds ago`)가 22 테스트 시점이었던 것으로 보아 **첫 시도가 핸드셰이크 전에 소진된 하네스 타이밍**으로 추정. 재시도 명령은 권한 분류기에 막혀 미실행 — 실제 클라이언트 접속 시 확정 |

### 미검증 표 갱신

| # | 항목 | 상태 |
|---|------|------|
| 1~5, 9, 10 | 방화벽·startup 반영·wg0 기동·nft·DOCKER-USER·INV-2·forward 통과 | **실측 완료** (22 경로) |
| 6 | 클라이언트 end-to-end `nc -z 10.41.1.120 9100` | 남음 — 피어 등록 후 사용자 |
| 7 | 메뉴바 v3.5 런타임 | 남음 — 사용자 재설치 시 |
| 8 | macOS 앱의 `KB DMA` 이름 수용 | 남음 — 개발기에 WireGuard.app 미설치 |

### 부수 발견 (이 작업 범위 밖 · 미수정)

`/healthz` 가 `degraded` · `dma:false` · `everReadyCount:0` 이고 INV-5a 가 FAIL 이다. relay 컨테이너(`c8aa7ae`, 07:12Z 기동, 다른 세션 배포)의 **`DMA_HOST=127.0.0.1`** 이라 `ECONNREFUSED 127.0.0.1:9100` 을 30초마다 반복 중(attempt 98+). WireGuard 반영(07:58Z) 이전부터의 상태이며 이 plan 의 규칙은 docker→tun0 경로를 건드리지 않는다. README §현재 운영 상태의 실 게이트웨이(`10.41.1.120`) 배포 기본값 회귀로 보인다.
