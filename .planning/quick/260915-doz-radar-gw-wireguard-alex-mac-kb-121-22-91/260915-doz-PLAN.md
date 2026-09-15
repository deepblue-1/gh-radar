---
phase: quick-260915-doz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - infra/relay/startup.sh
  - infra/relay/README.md
  - docs/dma-tunnel-guide.md
  - scripts/setup-relay-iam.sh
autonomous: true
quick_id: 260915-doz
requirements: [DOZ-01, DOZ-02, DOZ-03]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "DOZ-01: radar-gw 가 부팅해 wg0 이 올라오면 alex-mac 피어(10.20.0.2)는 KB 121(10.41.1.121)의 tcp 22·9100 에 닿는다 — startup.sh 섹션 8 이 nft inet wgfwd forward 체인과 iptables DOCKER-USER 두 층 모두에 규칙을 만든다 (docker 가 filter/FORWARD 정책을 DROP 으로 두므로 한 층만으로는 통하지 않는다)"
    - "DOZ-01: 다른 피어(junysim-win1..4, 10.20.0.3~.6)는 121 에 닿지 않는다 — startup.sh 에서 10.41.1.121 을 담은 비주석 줄은 전부 출발지 10.20.0.2 로 묶여 있고, 그 밖의 wg0 출입은 기존 ④ drop 이 막는다"
    - "DOZ-01: 기존 120 규칙(nft 1줄 · iptables 3줄)과 MSS 클램프 · 응답(established) · masquerade · 개인키 · peers.conf · 드롭인 · sysctl · wg-peer-add 는 바뀌지 않는다"
    - "DOZ-02: radar-gw 인스턴스 메타데이터 startup-script 가 커밋된 infra/relay/startup.sh 와 끝 개행 차이 외에 같다"
    - "DOZ-02: 라이브 radar-gw 의 wgfwd forward 체인과 DOCKER-USER 가 파일이 만드는 규칙과 의미상 같다 (121 규칙이 층마다 정확히 1개, nft 에서 120 규칙 뒤·established 앞, forward 규칙 수 동일). 이 작업은 VM 을 재부팅하지 않고 wg-quick@wg0 을 재시작하지 않으며 라이브 규칙을 바꾸지 않는다"
    - "DOZ-02: 10.20.0.2/32 를 가진 피어는 정확히 하나(peers.conf 라벨 alex-mac)이고 모든 피어의 AllowedIPs 가 /32 다 — 출발지 기반 허용이 그 피어 키에 결속된다"
    - "DOZ-03: 허용 범위를 서술하는 문장 7곳(startup.sh 주석 2 · README 3 · 가이드 표 1 · setup-relay-iam.sh 주석 1)이 모두 같은 줄에 121 예외를 적는다. 다른 피어로 넓히는 표현은 없고, README 에 install-vpn-menubar.sh 재실행 시 121/32 가 사라진다는 주의가 1줄 있다"
  artifacts:
    - path: infra/relay/startup.sh
      provides: "섹션 8 — WGFWD_NFT_EOF 에 121 규칙 1줄, WG0_CONF_EOF 에 PostUp -D/-I · PostDown -D 3줄, 섹션 머리·② 주석 갱신"
      contains: "ip saddr 10.20.0.2 ip daddr 10.41.1.121"
    - path: infra/relay/README.md
      provides: "§운영 방화벽 인용문 · §A 허용 범위 문단 · 검증 명령(ACCEPT 세 줄) · 설치 스크립트 재실행 주의 · 자동 업데이트 절 문장"
      contains: "10.41.1.121"
    - path: docs/dma-tunnel-guide.md
      provides: "§0 표 '닿는 곳' 행"
      contains: "10.41.1.121"
    - path: scripts/setup-relay-iam.sh
      provides: "(d) WireGuard 방화벽 주석의 허용 범위"
      contains: "10.41.1.121"
  key_links:
    - from: "infra/relay/startup.sh (WGFWD_NFT_EOF heredoc)"
      to: "radar-gw /etc/wireguard/wgfwd.nft"
      via: "매 부팅 재작성 → wg0.conf PostUp `nft -f /etc/wireguard/wgfwd.nft`"
    - from: "infra/relay/startup.sh (WG0_CONF_EOF heredoc)"
      to: "radar-gw iptables DOCKER-USER 체인"
      via: "wg-quick@wg0 PostUp iptables -D/-I 멱등 쌍 (10-after-docker.conf 드롭인으로 dockerd 뒤 기동)"
    - from: "radar-gw 메타데이터 startup-script"
      to: "infra/relay/startup.sh"
      via: "gcloud compute instances add-metadata --metadata-from-file=startup-script=infra/relay/startup.sh (setup-relay-iam.sh VM_METADATA_FILES 와 같은 원천)"
    - from: "nft `ip saddr 10.20.0.2` / iptables `-s 10.20.0.2`"
      to: "peers.conf `AllowedIPs = 10.20.0.2/32` (alex-mac)"
      via: "WireGuard cryptokey routing — 그 피어 키로 들어온 패킷만 이 출발지 주소를 가질 수 있다"
---

<objective>
radar-gw(GCE, gh-radar / asia-northeast3-a)의 WireGuard 서버에서 **alex-mac 피어(10.20.0.2) 한 대만** KB 121(10.41.1.121)의 tcp 22·9100 에 **영구히** 닿게 한다.

사용자가 오늘(2026-09-15) 같은 규칙을 VM 에 **런타임으로만** 적용해 두었다. 이 규칙은 재부팅이나 wg-quick 재시작 때 사라진다. 이 작업은 두 가지를 한다.
(1) 부팅마다 wgfwd.nft·wg0.conf 를 다시 쓰는 `infra/relay/startup.sh` 섹션 8 이 같은 규칙을 만들게 한다.
(2) VM 메타데이터 startup-script 에 그 파일을 반영한다.
그다음 라이브 규칙이 파일과 같은지 **읽기만 해서** 확인하고, 허용 범위를 적은 문서를 정확히 고친다.

Purpose: 재부팅 뒤에도 alex-mac 이 121 에 SSH·DMA 로 닿게 한다. 다른 피어(junysim-win1..4)는 종전대로 120 에만 닿는다.
Output: startup.sh 섹션 8 규칙·주석, 갱신된 VM 메타데이터, 문서 3파일, 커밋 2개(push 없음), SUMMARY.

범위 밖 (손대지 않는다):
- Mac 쪽 `/opt/homebrew/etc/wireguard/KB-DMA.conf` — 사용자가 이미 `AllowedIPs = 10.41.1.120/32, 10.41.1.121/32` 로 고쳤다.
- 다른 피어의 클라이언트 프로필, `infra/relay/wireguard/client.conf.template`, 가이드의 Windows 예시(`AllowedIPs = 10.41.1.120/32`).
- IAP 폴백 `scripts/dma-tunnel.sh`·`.ps1`, 소비자 설정(`[DMA] Host=10.41.1.120`, relay `DMA_HOST`), `scripts/install-vpn-menubar.sh` 본체.
- VM 재부팅, `wg-quick@wg0` 재시작, 라이브 nft/iptables 변경. 라이브 규칙은 이미 있으므로 런타임 적용은 필요 없다.
- `.planning/STATE.md` 편집.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@infra/relay/startup.sh
@infra/relay/README.md
@docs/dma-tunnel-guide.md
@scripts/setup-relay-iam.sh

<interfaces>
플래너가 2026-09-15 에 실측한 현재 앵커다. 줄 번호는 근사치이니 문자열로 찾는다.

startup.sh 섹션 8 머리 주석 (약 413-414):
    #    개발기(Mac/Windows)가 외부 CLI·IAP·포트 포워딩 없이 wg0 를 통해
    #    10.41.1.120 의 {9100, 22} 에만 닿게 한다. 인증은 피어 공개키다.

WGFWD_NFT_EOF heredoc 의 ②~③ (약 488-492, 들여쓰기 4칸):
    # ② 허용은 게이트웨이 한 대의 두 포트뿐이다.
    iifname "wg0" oifname "tun0" ip daddr 10.41.1.120 tcp dport { 9100, 22 } accept

    # ③ 그 응답만 돌아온다.
    iifname "tun0" oifname "wg0" ct state established,related accept

WG0_CONF_EOF heredoc 의 iptables 줄 (약 523-530, 들여쓰기 없음):
    PostUp = iptables -D DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT 2>/dev/null || true
    PostUp = iptables -I DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT
    PostUp = iptables -D DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
    PostUp = iptables -I DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    PostDown = iptables -D DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT 2>/dev/null || true
    PostDown = iptables -D DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
    PostDown = nft delete table inet wgfwd || true

wg-peer-add 의 peers.conf 기록 형식 (약 619-624): 피어마다 `# <이름>  (추가 YYYY-MM-DD)` / `[Peer]` / `PublicKey = …` / `AllowedIPs = 10.20.0.N/32` 네 줄이다. 같은 주소가 이미 있으면 거부한다.

사용자가 라이브로 넣은 규칙 (파일이 같은 것을 만들어야 한다):
    nft (inet wgfwd, chain forward, 120 규칙 바로 뒤·established 앞):
      iifname "wg0" oifname "tun0" ip saddr 10.20.0.2 ip daddr 10.41.1.121 tcp dport { 22, 9100 } accept
    iptables -S DOCKER-USER 표기:
      -A DOCKER-USER -s 10.20.0.2/32 -d 10.41.1.121/32 -i wg0 -o tun0 -p tcp -m multiport --dports 9100,22 -j ACCEPT

nft 는 집합 원소를 정렬해 출력한다. 파일에 `{ 9100, 22 }` 로 쓰면 120 줄 표기와 같아지고, 라이브의 `{ 22, 9100 }` 와 같은 집합이다.

허용 범위를 적은 문서 문장 (게이트 정규식 사전 실측, 매치 5줄):
    docs/dma-tunnel-guide.md:26   | 닿는 곳 | `10.41.1.120` 의 **9100·22** 두 포트뿐. …
    infra/relay/README.md:41      > 좁힌다(게이트웨이 한 대의 9100·22 만 — §DMA 터널).
    infra/relay/README.md:330     피어가 닿을 수 있는 곳은 **`10.41.1.120` 의 `9100`·`22` 두 포트뿐**이고, 그 외 `wg0` 출입은
    infra/relay/README.md:834     규칙상 120 의 9100·22 에만 닿는다. 반면 `dma.jx1.io` 는 …
    scripts/setup-relay-iam.sh:298  #     (10.41.1.120 의 9100·22 만 — infra/relay/startup.sh 섹션 8).
README 부가: 331 `클라이언트 \`AllowedIPs\` 도 \`/32\` 하나라 …`, 517 `sudo iptables -S DOCKER-USER            # ACCEPT` 뒤에 개수 표기가 붙는다.
네 파일 모두 편집 전 `121` 등장 횟수는 0 이다.

`scripts/install-vpn-menubar.sh` 약 345줄은 재실행할 때마다 `$(brew --prefix)/etc/wireguard/KB-DMA.conf` 를 `AllowedIPs = <게이트웨이>/32` 한 줄로 **통째로 다시 쓴다**. README 주의 문구의 근거다.

VM 조작 좌표: `--zone=asia-northeast3-a --project=gh-radar`. SSH 는 `gcloud compute ssh radar-gw … --tunnel-through-iap`. gcloud 는 가끔 일시적 ConnectionError 로 죽는다 — 1회 재시도는 괜찮다.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): alex-mac→121 한 경로 — startup.sh 두 층 규칙 → VM nft 문법 확인 → 커밋 → 메타데이터 반영 → 라이브 일치 확인</name>
  <files>infra/relay/startup.sh</files>
  <precondition>gcloud 가 인증돼 있고 radar-gw 를 조회할 수 있다 (`gcloud compute instances describe radar-gw --zone=asia-northeast3-a --project=gh-radar --format='value(status)'` 가 RUNNING).</precondition>
  <read_first>infra/relay/startup.sh 섹션 8 (약 411-560) 과 wg-peer-add (약 600-625)</read_first>
  <action>
DOZ-01 과 DOZ-02 를 한 경로로 끝까지 잇는다. 모든 명령은 **이 작업을 커밋할 트리의 루트**에서 돌린다. worktree 라면 그 worktree 의 절대경로를 쓴다. 메인 체크아웃의 파일에는 이 커밋이 아직 없을 수 있다. 셸이 zsh 라면 게이트 명령은 bash 로 돌린다 — 스크래치패드에 스크립트로 Write 한 뒤 `bash <절대경로>` 로 실행해도 된다. 아래에서 SCRATCH 는 세션 스크래치패드 절대경로다.

(1) nft 규칙 — WGFWD_NFT_EOF heredoc 안의 120 규칙 줄(`iifname "wg0" oifname "tun0" ip daddr 10.41.1.120 tcp dport { 9100, 22 } accept`) **바로 다음 줄**에 같은 4칸 들여쓰기로 한 줄을 넣는다: `iifname "wg0" oifname "tun0" ip saddr 10.20.0.2 ip daddr 10.41.1.121 tcp dport { 9100, 22 } accept`. ③ 주석과 established 규칙보다 앞, ④ drop 보다 앞이어야 한다.
그 위 ② 주석 한 줄은 이 뜻으로 바꾼다: 허용은 게이트웨이 120 의 두 포트 + alex-mac(10.20.0.2) 전용 121 의 두 포트뿐 — 121 은 ip saddr 로 한 피어에만 연다(다른 피어는 ④ 에서 drop). `두 포트뿐` 과 `121` 은 **같은 줄**에 둔다(범위 문구 게이트).
주석에 규칙 문자열을 그대로 복사하지 않는다. 개수 게이트가 정확히 1을 본다.

(2) iptables 규칙 — WG0_CONF_EOF heredoc 에서 120 의 `PostUp = iptables -I DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 …` 줄 바로 다음, conntrack `-D` 줄 앞에 세 줄을 이 순서로 넣는다. 들여쓰기는 없다.
  a. 주석 `# alex-mac(10.20.0.2) 전용 — 10.41.1.121 의 9100·22 (quick-260915-doz)`
  b. `PostUp = iptables -D DOCKER-USER -i wg0 -o tun0 -s 10.20.0.2 -d 10.41.1.121 -p tcp -m multiport --dports 9100,22 -j ACCEPT 2>/dev/null || true`
  c. `PostUp = iptables -I DOCKER-USER -i wg0 -o tun0 -s 10.20.0.2 -d 10.41.1.121 -p tcp -m multiport --dports 9100,22 -j ACCEPT`
그리고 120 의 `PostDown = iptables -D … -d 10.41.1.120 …` 줄 바로 다음, `PostDown = nft delete table inet wgfwd || true` 앞에 한 줄을 넣는다: `PostDown = iptables -D DOCKER-USER -i wg0 -o tun0 -s 10.20.0.2 -d 10.41.1.121 -p tcp -m multiport --dports 9100,22 -j ACCEPT 2>/dev/null || true`.
120 과 같은 -D→-I 멱등 쌍이라 wg-quick 재기동 때도 중복이 쌓이지 않는다. 옵션 순서와 `--dports 9100,22` 는 위 문자열을 그대로 쓴다. 게이트가 고정 문자열로 센다.

(3) 섹션 8 머리 주석(약 413-414)을 고친다.
- `에만 닿` 이 들어간 줄에 121 예외를 같이 적는다. 예: `10.41.1.120 의 {9100, 22} 에만 닿게 한다(예외: alex-mac 10.20.0.2 만 10.41.1.121 의 {9100, 22} 도).`
- 다음 줄들에 결속 근거를 적는다. 인증은 피어 공개키다. 121 예외는 출발지 10.20.0.2 로 묶인다. wg-peer-add 가 피어마다 /32 를 배정하고 중복을 거부하므로, 그 출발지는 alex-mac 키로 온 패킷만 가진다(quick-260915-doz).
- 섹션 8 의 나머지(8.1~8.8, 경고 주석, MSS·masquerade, 개인키, peers.conf 시드, 드롭인, sysctl, wg-peer-add)와 섹션 1~7 은 바꾸지 않는다.

(4) 로컬 게이트 — 아래 `<verify>` 명령이 `T1_LOCAL_OK` 를 내야 한다. 게이트가 확인하는 것:
- bash 문법
- 121 nft 규칙 1줄 · 121 iptables 3줄
- 120 nft 1줄 · 120 iptables 3줄 불변
- 121 을 담은 비주석 줄은 전부 10.20.0.2 로 묶임
- nft 순서 120 → 121 → established → drop
- wg0.conf 순서 120 -I → 121 -I → conntrack -I, 121 PostDown → nft delete
- startup.sh 범위 문구 줄에는 121 이 같이 있음

(5) VM nft 문법 확인 — 읽기 전용이고 check 모드라 커밋하지 않는다.
- `awk '/<<.WGFWD_NFT_EOF.$/{f=1;next} /^WGFWD_NFT_EOF$/{f=0} f' infra/relay/startup.sh` 결과를 SCRATCH/wgfwd.nft 에 저장한다.
- `gcloud compute ssh radar-gw --zone=asia-northeast3-a --project=gh-radar --tunnel-through-iap --command='sudo nft -c -f /dev/stdin && echo NFT_CHECK_OK'` 에 그 파일을 표준입력으로 넘긴다.
- `NFT_CHECK_OK` 가 나와야 한다. 실패하면 문법을 고치고 (4)부터 다시 한다. 고칠 수 없으면 커밋하지 말고 멈춘 뒤 오류 원문을 보고한다.
- 이 명령이 권한 분류기에 막히면 우회하지 않는다. 명령을 SUMMARY 「사용자 조치」에 적고 (6) 커밋만 진행한다. (7)~(9) 메타데이터 반영과 라이브 확인도 사용자 조치로 넘긴다. 문법 확인 없이 부팅 스크립트를 반영하지 않기 위해서다 — PostUp 의 `nft -f` 가 실패하면 wg0 전체가 못 뜬다.

(6) 커밋 — `git add infra/relay/startup.sh` 로 경로를 지정해 스테이징한다(`git add -A` 금지). `git diff --cached --stat` 이 이 파일 하나인지 본다.
- 메시지는 `feat(quick-260915-doz): radar-gw WireGuard 에서 alex-mac(10.20.0.2)만 KB 121 의 22·9100 에 닿게 startup.sh 섹션 8 규칙 추가` 다.
- 본문은 한글 불릿 2~3줄로 쓴다: nft·DOCKER-USER 두 층, 출발지 결속, 120 불변.
- **Co-Authored-By 트레일러를 절대 넣지 않는다. push 하지 않는다** — 로컬 master 에 다른 세션의 미푸시 커밋이 있다.

(7) 메타데이터 반영 — 먼저 두 가지를 확인한다.
- `git diff --quiet HEAD -- infra/relay/startup.sh`
- `git show HEAD:infra/relay/startup.sh | grep -c 'ip daddr 10.41.1.121'` 가 1
그다음 `gcloud compute instances add-metadata radar-gw --zone=asia-northeast3-a --project=gh-radar --metadata-from-file=startup-script=infra/relay/startup.sh` 를 실행한다.
- 이 키만 바꾸는 add-metadata 만 쓴다. `--metadata` 로 다른 키를 함께 넘기지 않는다. 재부팅·reset·stop 은 하지 않는다. 메타데이터를 바꿔도 부팅 스크립트는 다시 돌지 않으므로 라이브 wg0 에는 영향이 없다.
- 일시적 ConnectionError 는 1회 재시도한다.
- 권한 분류기에 막히면 **멈추고** 정확한 명령을 SUMMARY 「사용자 조치」에 적는다. 우회는 시도하지 않는다.

(8) 메타데이터 되읽기 — `gcloud compute instances describe radar-gw --zone=asia-northeast3-a --project=gh-radar --format='value(metadata.items.startup-script)'` 를 SCRATCH/meta-startup.sh 에 저장한다. 끝 개행을 무시하고 파일과 비교해 `META_MATCH` 를 얻는다. 판정 명령은 `<acceptance_criteria>` 에 있다.

(9) 라이브 읽기 전용 확인 — SCRATCH/live-check.sh 를 Write 한다. 읽기 명령만 담는다: 구분 마커 echo, `nft list chain inet wgfwd forward`, `iptables -S DOCKER-USER`, 공개키를 앞 6자로 자른 allowed-ips, peers.conf 에서 10.20.0.2 피어의 라벨 줄(PublicKey 줄 제외), `ip route show default`.
- 줄 순서는 다음과 같다:
  - `echo ---NFT---`
  - `nft list chain inet wgfwd forward`
  - `echo ---IPT---`
  - `iptables -S DOCKER-USER`
  - `echo ---ALLOWED---`
  - `wg show wg0 allowed-ips | awk '{k=$1; $1=""; print substr(k,1,6) "…" $0}'`
  - `echo ---LABEL---`
  - `grep -B3 '^AllowedIPs = 10\.20\.0\.2/32$' /etc/wireguard/peers.conf | grep -v '^PublicKey'`
  - `echo ---ROUTE---`
  - `ip route show default`
- 실행: `gcloud compute ssh radar-gw --zone=asia-northeast3-a --project=gh-radar --tunnel-through-iap --command='sudo bash -s'` 에 그 스크립트를 표준입력으로 넘기고 출력을 SCRATCH/live.txt 에 저장한다.
- `<acceptance_criteria>` 의 라이브 판정을 모두 돌린다.
- 불일치가 나와도 **라이브를 고치지 않는다**(`nft -f`, iptables -I/-D, wg-quick 재시작, 재부팅 금지). 불일치 원문을 SUMMARY 에 적고 사용자 판단으로 넘긴다. junysim 피어 4대와 라이브 relay 가 wg0 에 의존한다.
- SUMMARY 에는 공개키 전체나 `wg show` 원문을 붙이지 않는다. 잘린 6자 표기만 쓴다.
  </action>
  <verify>
    <automated>bash -n infra/relay/startup.sh && awk -v s='iifname "wg0" oifname "tun0" ip saddr 10.20.0.2 ip daddr 10.41.1.121 tcp dport { 9100, 22 } accept' 'index($0,s){n++} END{exit n!=1}' infra/relay/startup.sh && awk -v s='-i wg0 -o tun0 -s 10.20.0.2 -d 10.41.1.121 -p tcp -m multiport --dports 9100,22 -j ACCEPT' 'index($0,s){n++} END{exit n!=3}' infra/relay/startup.sh && awk -v s='iifname "wg0" oifname "tun0" ip daddr 10.41.1.120 tcp dport { 9100, 22 } accept' 'index($0,s){n++} END{exit n!=1}' infra/relay/startup.sh && awk -v s='-i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT' 'index($0,s){n++} END{exit n!=3}' infra/relay/startup.sh && [ "$(awk '!/^[[:space:]]*#/ && /10\.41\.1\.121/ && !/10\.20\.0\.2[[:space:]]/' infra/relay/startup.sh | wc -l)" -eq 0 ] && awk '/ip daddr 10\.41\.1\.120 tcp dport/{a=NR} /ip saddr 10\.20\.0\.2 ip daddr 10\.41\.1\.121 tcp dport/{b=NR} /ct state established,related accept/{c=NR} /iifname "wg0" drop/{d=NR} END{exit !(a>0 && b>a && c>b && d>c)}' infra/relay/startup.sh && awk '/^PostUp = iptables -I DOCKER-USER -i wg0 -o tun0 -d 10\.41\.1\.120/{a=NR} /^PostUp = iptables -I DOCKER-USER -i wg0 -o tun0 -s 10\.20\.0\.2 -d 10\.41\.1\.121/{b=NR} /^PostUp = iptables -I DOCKER-USER -i tun0 -o wg0/{c=NR} /^PostDown = iptables -D DOCKER-USER -i wg0 -o tun0 -s 10\.20\.0\.2 -d 10\.41\.1\.121/{p=NR} /^PostDown = nft delete table inet wgfwd/{q=NR} END{exit !(a>0 && b>a && c>b && p>0 && q>p)}' infra/relay/startup.sh && [ -z "$(grep -nE '에만 닿|두 포트뿐' infra/relay/startup.sh | grep -v '121')" ] && echo T1_LOCAL_OK</automated>
  </verify>
  <acceptance_criteria>
    - 로컬: 위 verify 가 `T1_LOCAL_OK` 를 낸다.
    - nft 문법: VM check 모드가 `NFT_CHECK_OK` 를 낸다.
    - 커밋: `git log -1 --format=%B` 에 `Co-Authored-By` 가 없고, `git show --stat HEAD` 의 변경 파일이 `infra/relay/startup.sh` 하나다.
    - 메타데이터: `[ "$(cat infra/relay/startup.sh)" = "$(cat SCRATCH/meta-startup.sh)" ] && echo META_MATCH` 가 `META_MATCH` 를 낸다. `$(…)` 는 끝 개행을 양쪽에서 떼므로 끝 개행 차이는 무시된다. 이 판정은 bash 로 돌린다.
    - 라이브 nft 121 규칙 정확히 1개: `awk '/---IPT---/{exit} /iifname "wg0" oifname "tun0" ip saddr 10\.20\.0\.2 ip daddr 10\.41\.1\.121 tcp dport \{ (22, 9100|9100, 22) \} accept/{n++} END{exit n!=1}' SCRATCH/live.txt` 가 종료코드 0.
    - 라이브 nft 순서: `awk '/---IPT---/{exit} /ip daddr 10\.41\.1\.120 tcp dport/{a=NR} /ip saddr 10\.20\.0\.2 ip daddr 10\.41\.1\.121 tcp dport/{b=NR} /ct state established,related accept/{c=NR} /iifname "wg0" drop/{d=NR} END{exit !(a>0 && b>a && c>b && d>c)}' SCRATCH/live.txt` 가 종료코드 0.
    - forward 규칙 수가 파일과 라이브에서 같고 둘 다 7이다(편집 전 파일은 6). 판정: 아래 두 명령 출력이 모두 `7`.
      - 파일 쪽: `awk '/chain forward/{f=1;next} f && /^[[:space:]]*}/{exit} f && !/^[[:space:]]*(#|$)/ && !/type filter hook/{n++} END{print n+0}' SCRATCH/wgfwd.nft`
      - 라이브 쪽: `awk '/chain forward/{f=1;next} f && /^[[:space:]]*}/{exit} f && !/^[[:space:]]*$/ && !/type filter hook/{n++} END{print n+0}' SCRATCH/live.txt`
    - 라이브 DOCKER-USER: 아래 세 문자열이 각각 정확히 1줄씩 있다. 판정은 문자열마다 `awk -v s='(아래 문자열)' '$0==s{n++} END{exit n!=1}' SCRATCH/live.txt` 가 종료코드 0.
      - `-A DOCKER-USER -s 10.20.0.2/32 -d 10.41.1.121/32 -i wg0 -o tun0 -p tcp -m multiport --dports 9100,22 -j ACCEPT`
      - `-A DOCKER-USER -d 10.41.1.120/32 -i wg0 -o tun0 -p tcp -m multiport --dports 9100,22 -j ACCEPT`
      - `-A DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT`
    - 피어 결속:
      - `awk '/---ALLOWED---/{f=1;next} /---LABEL---/{f=0} f && /10\.20\.0\.2\/32/{n++} END{exit n!=1}' SCRATCH/live.txt` 가 종료코드 0 (10.20.0.2/32 를 가진 피어는 하나뿐).
      - `[ -z "$(awk '/---ALLOWED---/{f=1;next} /---LABEL---/{f=0} f' SCRATCH/live.txt | grep -oE '[0-9.]+/[0-9]+' | grep -v '/32$')" ]` 가 참 (모든 피어 AllowedIPs 가 /32).
      - LABEL 구간에 `# alex-mac` 이 있다.
    - 기본 경로: ROUTE 구간에 `dev ens4` 가 있다(tun0 면 즉시 보고).
    - VM 재부팅·wg-quick 재시작·라이브 규칙 변경 명령을 하나도 실행하지 않았다.
    - gcloud 가 막힌 단계가 있으면 SUMMARY 「사용자 조치」에 그 정확한 명령과 이후 판정 명령이 순서대로 적혀 있다.
  </acceptance_criteria>
  <reversibility rating="reversible">메타데이터는 `git show HEAD~1:infra/relay/startup.sh` 로 되돌려 같은 add-metadata 로 복원한다. 라이브는 건드리지 않는다.</reversibility>
  <done>startup.sh 가 부팅마다 alex-mac 전용 121 규칙을 두 층에 만든다. VM 메타데이터가 그 커밋과 같고(META_MATCH), 라이브 규칙이 파일과 의미상 같으며, 10.20.0.2 가 alex-mac 한 피어의 /32 에만 결속됨이 확인됐다. gcloud 가 막혔다면 그 단계는 명령이 적힌 사용자 조치로 남아 있다.</done>
</task>

<task type="auto">
  <name>Task 2: 허용 범위 문서 5곳에 alex-mac 전용 121 예외 반영 + 설치 스크립트 재실행 주의</name>
  <files>infra/relay/README.md, docs/dma-tunnel-guide.md, scripts/setup-relay-iam.sh</files>
  <read_first>infra/relay/README.md 36-44 · 318-335 · 509-520 · 830-836, docs/dma-tunnel-guide.md 19-28, scripts/setup-relay-iam.sh 292-306</read_first>
  <action>
DOZ-03. 허용 범위를 적은 문장만 **최소로** 고친다. 모든 범위 문장은 121 예외를 **같은 줄**에 담는다(아래 게이트). 예외는 alex-mac 한 피어로만 서술한다. 다른 피어나 "개발기 전부" 로 넓히는 표현은 쓰지 않는다. 문서 표기 관례(백틱 주소, `9100·22` 가운뎃점)는 주변 문장을 따른다.

(1) infra/relay/README.md 약 41줄 인용문 — `(게이트웨이 한 대의 9100·22 만 — §DMA 터널)` 을 이 뜻으로 바꾼다: 게이트웨이 120 의 9100·22 만, 예외로 alex-mac 피어만 121 의 9100·22 도 — §DMA 터널.

(2) README §A 문단(약 330-331)을 고친다.
- 330 줄은 `두 포트뿐` 표현을 유지하되, 같은 줄에 예외를 괄호로 덧붙인다. 예외 내용: alex-mac `10.20.0.2` 만 `10.41.1.121` 의 `9100`·`22` 도 — nft·`DOCKER-USER` 두 층 모두 출발지로 묶는다, quick-260915-doz.
- 331 줄의 "클라이언트 `AllowedIPs` 도 `/32` 하나라" 는 이 뜻으로 고친다: 게이트웨이 `/32` 만 담아(alex-mac 은 `10.41.1.121/32` 를 하나 더) 기본 경로를 뺏지 않는다.
- 문단 끝에 **한 줄**을 덧붙인다: alex-mac 의 `$(brew --prefix)/etc/wireguard/KB-DMA.conf` 에 더한 `10.41.1.121/32` 는 `scripts/install-vpn-menubar.sh` 를 다시 돌리면 사라진다 — 그 스크립트가 `AllowedIPs` 를 게이트웨이 `/32` 하나로 다시 쓰므로, 재실행 뒤 손으로 다시 더한다. `install-vpn-menubar.sh` 와 `121` 은 같은 줄에 둔다.

(3) README 검증 명령 블록(약 517) — `sudo iptables -S DOCKER-USER` 뒤 주석의 ACCEPT 개수를 셋으로 고친다: `# ACCEPT 세 줄이 있어야 한다 (120 · alex-mac 전용 121 · 응답)`. 516 줄 `forward 4규칙` 은 ①~④ 묶음 수이므로 그대로 둔다.

(4) README 자동 업데이트 절(약 834) — `규칙상 120 의 9100·22 에만 닿는다.` 를 `규칙상 120 의 9100·22 에만 닿는다(alex-mac 만 121 의 같은 두 포트 예외).` 로 고친다. 줄이 너무 길어지면 뒤의 "반면 …" 절을 다음 줄로 넘기되, 범위 문구와 121 은 같은 줄에 둔다. 이 문단의 논지(업데이트는 게이트웨이가 아니라 dma.jx1.io 에 둔다)는 바꾸지 않는다.

(5) docs/dma-tunnel-guide.md §0 표 26줄 `닿는 곳` 행 — `두 포트뿐` 뒤에 괄호로 예외를 넣는다: alex-mac `10.20.0.2` 만 `10.41.1.121` 의 9100·22 도 — 프로필 `AllowedIPs` 에 `10.41.1.121/32` 를 더해야 한다. 행의 나머지(다른 주소·포트는 VM 이 막는다 / 인터넷·사내 자원 그대로)는 유지한다. 가이드의 Windows 예시(`AllowedIPs = 10.41.1.120/32`)와 절차는 바꾸지 않는다 — Windows 피어는 120 전용 그대로다.

(6) scripts/setup-relay-iam.sh 약 298 주석 — `(10.41.1.120 의 9100·22 만 — infra/relay/startup.sh 섹션 8).` 을 이 뜻으로 바꾼다: 10.41.1.120 의 9100·22 만, alex-mac(10.20.0.2) 전용으로 10.41.1.121 의 9100·22 도 — infra/relay/startup.sh 섹션 8. 코드 줄은 건드리지 않는다.

손대지 않는 120 언급: 소비자 설정·relay DMA_HOST·dma-tunnel.sh/.ps1(IAP 폴백)·install-vpn-menubar.sh 본체·client.conf.template·가이드 도달성 확인 명령·README 실서버 라이브 상태 표. 이것들은 허용 범위 서술이 아니거나 120 전용이 맞다.

커밋 — 세 경로만 지정해 스테이징한다(`git add infra/relay/README.md docs/dma-tunnel-guide.md scripts/setup-relay-iam.sh`, `git add -A` 금지). `git diff --cached --stat` 이 이 세 파일인지 본다. 메시지는 `docs(quick-260915-doz): WireGuard 허용 범위 문서에 alex-mac 전용 KB 121(22·9100) 예외 반영` 이다. **Co-Authored-By 없음, push 없음.**
  </action>
  <verify>
    <automated>bash -n scripts/setup-relay-iam.sh && [ -z "$(grep -nE '9100·22 (만|에만)|두 포트뿐|한 대의 9100·22' infra/relay/README.md docs/dma-tunnel-guide.md scripts/setup-relay-iam.sh | grep -v '121')" ] && [ "$(grep -c '121' infra/relay/README.md)" -ge 5 ] && [ "$(grep -c '10\.41\.1\.121' docs/dma-tunnel-guide.md)" -ge 1 ] && [ "$(grep -c '10\.41\.1\.121' scripts/setup-relay-iam.sh)" -ge 1 ] && awk 'index($0,"ACCEPT 세 줄"){n++} END{exit n!=1}' infra/relay/README.md && grep -qE 'install-vpn-menubar\.sh.*121|121.*install-vpn-menubar\.sh' infra/relay/README.md && grep -q 'AllowedIPs = 10.41.1.120/32' docs/dma-tunnel-guide.md && echo T2_OK</automated>
  </verify>
  <acceptance_criteria>
    - verify 가 `T2_OK` 를 낸다.
    - 편집 전 게이트 정규식에 걸리던 5줄이 모두 같은 줄에 121 을 담는다.
    - `git show --stat HEAD` 의 변경 파일이 세 문서 경로뿐이고, 커밋 메시지에 `Co-Authored-By` 가 없다.
    - `grep -rn 'junysim' infra/relay/README.md docs/dma-tunnel-guide.md` 결과에 121 허용을 시사하는 새 줄이 없다(다른 피어로 넓히지 않았다).
  </acceptance_criteria>
  <done>허용 범위를 말하는 모든 문서 문장이 "120 의 22·9100 + alex-mac 전용 121 의 22·9100" 로 정확하고, 설치 스크립트 재실행 함정이 README 에 1줄로 남았으며, 커밋 1개가 로컬에만 있다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 개발기 피어 → radar-gw wg0 | WireGuard 피어 공개키로 인증된 트래픽이 VM forward 로 들어온다. 피어별 출발지 주소는 서버 측 AllowedIPs(/32)로 결속된다 |
| radar-gw tun0 → KB 사내망(10.41.1.120/121) | VM 이 masquerade 해 KB VPN 세션으로 내보낸다. 121 은 실운영 DMA 서버다(22 = SSH, 9100 = DMA) |
| 저장소 startup.sh → VM 메타데이터 startup-script | 부팅 때 root 로 실행되는 스크립트의 원천 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-doz-01 | Elevation of Privilege | wgfwd.nft / DOCKER-USER 121 규칙 | high | mitigate | 두 층 모두 출발지 10.20.0.2 로 제한한다. Task 1 게이트: startup.sh 에서 10.41.1.121 을 담은 비주석 줄 중 10.20.0.2 가 없는 줄 = 0. 나머지 wg0 출입은 기존 ④ 명시 drop 이 막는다 |
| T-doz-02 | Spoofing | 다른 피어가 10.20.0.2 를 출발지로 위조 | high | mitigate | WireGuard cryptokey routing 은 피어 AllowedIPs 밖의 출발지 패킷을 버린다. wg-peer-add 가 /32 배정·중복 주소를 거부한다. Task 1 라이브 확인: 10.20.0.2/32 는 정확히 1피어(라벨 alex-mac), 모든 피어 AllowedIPs 가 /32 |
| T-doz-03 | Denial of Service | 부팅 시 wg0.conf PostUp `nft -f` | medium | mitigate | 메타데이터 반영 전에 추출한 wgfwd.nft 를 VM 에서 `nft -c`(check 모드)로 검증한다. 검증을 못 하면 반영하지 않고 사용자 조치로 넘긴다. 실패 시 wg0 전체(junysim 4대 포함)가 못 뜨기 때문이다 |
| T-doz-04 | Denial of Service | 라이브 wg0 / relay | medium | mitigate | 재부팅·wg-quick 재시작·라이브 nft/iptables 변경을 계획에서 금지한다. 라이브 확인은 읽기 명령만 담은 스크립트로 한다. 메타데이터 add-metadata 는 부팅 스크립트를 재실행하지 않는다 |
| T-doz-05 | Tampering | VM 메타데이터 ↔ 저장소 드리프트 | low | mitigate | 커밋 뒤 트리 깨끗함을 선확인하고 add-metadata 를 실행한다. 되읽기로 META_MATCH 를 확인한다(끝 개행만 무시) |
| T-doz-06 | Information Disclosure | `wg show` 공개키 · peers.conf | low | mitigate | allowed-ips 는 공개키 앞 6자로 잘라 출력한다. peers.conf 는 PublicKey 줄을 빼고 본다. SUMMARY 에 전체 키·원문 금지 |
| T-doz-07 | Elevation of Privilege | alex-mac → 121 의 SSH(22)·DMA(9100) | medium | accept | 사용자가 명시 요청한 alex-mac 한 대만의 통로다. 121 쪽 인증(SSH 키·DMA 로그인)이 그대로 적용되고 트래픽은 VM tun0 주소로 masquerade 된다. 다른 피어는 120 전용을 유지한다 |
| T-doz-08 | Repudiation / 설정 소실 | Mac `KB-DMA.conf` AllowedIPs | low | mitigate | 저장소 밖이라 수정하지 않는다. install-vpn-menubar.sh 재실행 시 121/32 가 사라진다는 주의를 README 에 1줄 남기고, 스크립트 개선 여부는 SUMMARY 에 후속 제안으로만 적는다 |
</threat_model>

<verification>
- Task 1 로컬 게이트 `T1_LOCAL_OK` · VM `NFT_CHECK_OK` · `META_MATCH` · 라이브 판정 전 항목 통과. 막힌 gcloud 단계는 명령이 적힌 사용자 조치로 남는다.
- Task 2 게이트 `T2_OK`.
- `git log --oneline origin/master..master` 에 이 작업 커밋 2개가 기존 미푸시 커밋 위에 쌓였고 push 하지 않았다.
- `git status --short` 에 이 작업이 만든 미커밋 변경이 없다. 다른 세션의 작업물은 건드리지 않는다.
- `.planning/STATE.md` 를 편집하지 않았다.
<!-- planner-discipline-allow: 두 포트뿐 -->
<!-- planner-discipline-allow: 에만 닿 -->
</verification>

<success_criteria>
- 재부팅 뒤에도 alex-mac(10.20.0.2)은 10.41.1.121 의 tcp 22·9100 에 닿고, 다른 피어는 닿지 않는다. startup.sh 가 두 층 규칙을 만들고 메타데이터가 그 파일과 같다.
- 지금 라이브 규칙이 파일이 만드는 규칙과 의미상 같다. 이 작업은 라이브 wg0 에 어떤 중단도 일으키지 않았다.
- 허용 범위 문서 전부가 alex-mac 전용 121 예외를 정확히 적는다.
</success_criteria>

<output>
`.planning/quick/260915-doz-radar-gw-wireguard-alex-mac-kb-121-22-91/260915-doz-SUMMARY.md` 를 만든다. 담을 것:
- 커밋 해시 2개와 각 변경 파일
- `NFT_CHECK_OK` · `META_MATCH` · 라이브 판정 결과. 피어 표기는 공개키 앞 6자만 쓴다
- 「사용자 조치」 — gcloud 가 막혀 넘긴 단계가 있으면 정확한 명령과 이후 판정 명령을 순서대로 적는다
- 「후속 제안(범위 밖)」 — `scripts/install-vpn-menubar.sh` 재실행이 `KB-DMA.conf` 의 `AllowedIPs` 를 게이트웨이 /32 하나로 덮어써 alex-mac 의 121/32 가 사라지는 문제. 설치 스크립트가 기존 추가 AllowedIPs 를 보존하게 할지는 사용자 결정

STATE.md 는 편집하지 않는다(오케스트레이터 몫).
</output>
