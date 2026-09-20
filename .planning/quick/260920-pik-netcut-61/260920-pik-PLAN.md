---
phase: quick-260920-pik
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - infra/relay/netcut-probe.sh
  - infra/relay/netcut-daily.sh
  - infra/relay/netcut-daily.service
  - infra/relay/netcut-daily.timer
  - infra/relay/README.md
  - .planning/quick/260920-pik-netcut-61/260920-pik-SUMMARY.md
autonomous: true
requirements: [QUICK-260920-PIK]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "저장소의 netcut 자산 4종이 VM 배치본과 sha256 으로 동일하다 (기계 게이트가 판정한다)"
    - "README 만 읽은 사람이 VM 에 올라가 netcut 로그를 스스로 조회하고 어느 층이 끊겼는지 귀속할 수 있다"
    - "2026-09-17~18 「61분 주기 국내 방향 단절」의 측정된 사실·무혐의 근거·판정이 저장소에 남아 있다"
    - "netcut 이 VM 재생성 시 사라진다는 한계와 되돌리는 절차가 문서에 있다"
    - "wg-probe 의 임계값 표·판정표가 복사되지 않았다 — 상호 참조만 있다"
  artifacts:
    - infra/relay/netcut-probe.sh
    - infra/relay/netcut-daily.sh
    - infra/relay/netcut-daily.service
    - infra/relay/netcut-daily.timer
    - "infra/relay/README.md §외부 경로 단절 판정 — netcut"
  key_links:
    - "netcut-daily.timer → netcut-daily.service → /usr/local/sbin/netcut-daily → /usr/local/sbin/netcut-probe-260917"
    - "README §파일 맵 4행 ↔ 실제 VM 배치 경로 (메타데이터 미등록이라는 예외 표기 포함)"
    - "README §현재 운영 상태 표의 netcut-daily.timer 행 ↔ 새 절"
    - "README §터널 정지 판정 절차 — wg-probe §판정 ↔ 새 절 (표 복사 아닌 포인터 한 줄)"
---

<objective>
2026-09-17~18 에 관측된 「61분 주기 국내 방향 단절」을 잰 netcut 측정기를 **저장소 자산으로 박제**하고,
그 사건의 측정된 사실과 판정을 `infra/relay/README.md` 에 기록한다.

Purpose: 지금 이 측정기는 VM 에만 있다. VM 이 재생성되면 측정기도, 무엇을 어떻게 읽는지도 함께
사라진다. 사건이 재발했을 때 「그때 무엇을 쟀고 어떻게 판정했는가」를 다시 발명하지 않게 한다.
Output: 자산 4종 + README 새 절 1개 + 기존 표 2개에 행 추가 + 상호참조 1줄. 코드 동작 변경 0.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@infra/relay/README.md
</context>

<source_bytes>

**이 절의 네 블록이 자산 파일의 정본 바이트다.** VM 배치본을 그대로 옮긴 것이며,
한 글자도 고치지 않는다. 주석의 오탈자·전각 기호·문장 부호도 그대로다.
sha256 이 맞지 않으면 내용을 손보는 것이 아니라 **줄바꿈 처리만** 조정한다(아래 Task 1 참조).

> **계획 단계에서 이미 실측했다 (2026-09-20).** 이 PLAN 의 4중 백틱 펜스 안쪽을 그대로 뽑아
> `shasum -a 256` 을 돌린 결과 **네 값이 모두 VM 배치본 sha 와 일치**했다(블록 B 는 사용자가 준
> 접두 `40688e0e` 와 일치). 즉 **펜스 안쪽을 그대로, 마지막 줄 뒤 개행 1개로 끝나게 쓰면 맞는다** —
> 줄바꿈을 두고 시행착오할 필요가 없다. 어긋난다면 옮겨 쓰는 과정에서 무언가 변형된 것이다.

#### A. `infra/relay/netcut-probe.sh` — sha256 `76e24b9e652c779ed9ae71bb670687696c0e2387172870aaa9baa9f08c101d4a`

VM 배치 경로: `/usr/local/sbin/netcut-probe-260917`

````
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
````

#### B. `infra/relay/netcut-daily.sh` — sha256 앞자리 `40688e0e`

VM 배치 경로: `/usr/local/sbin/netcut-daily`

> **권위 있는 값은 접두 8자리 `40688e0e` 뿐이다**(사용자가 준 것이 그만큼이다). 아래 블록의 바이트로
> 계산한 전체 값은 `40688e0e7b332005d6f123b4a8d3b01eae2c49601ba53f02d674dcf7cfaec327` 이며,
> 이것은 VM 대조값이 아니라 **이 PLAN 의 사본을 정확히 옮겼는지 보는 복사 충실도 값**이다.
> 게이트는 둘 다 건다 — 접두가 어긋나면 VM 과 다른 것이고, 전체가 어긋나면 옮겨 쓰다 틀린 것이다.

````
#!/bin/bash
# 평일 08:00~20:00 KST 연속 측정 (1초 주기). 2026-09-17~18 의 61분 주기 단절 재발 감시용.
# 저장소 원본: infra/relay/netcut-probe.sh · 문서: infra/relay/README.md
set -u
exec /usr/local/sbin/netcut-probe-260917 "/var/tmp/netcut-$(TZ=Asia/Seoul date +%y%m%d)" 43200
````

#### C. `infra/relay/netcut-daily.service` — sha256 `3e6dccf7032f858f80b54bbfb0754b1c8e11fada190ddc969b8654f689962517`

VM 배치 경로: `/etc/systemd/system/netcut-daily.service`

````
[Unit]
Description=netcut 측정 — 평일 08:00~20:00 KST 외부 경로 단절 감시 (읽기/핑 전용)

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/netcut-daily
ExecStartPre=/bin/bash -c 'find /var/tmp -maxdepth 1 -name "netcut-*" -type d -mtime +14 -exec rm -rf {} +'
TimeoutStartSec=13h
Nice=10
````

#### D. `infra/relay/netcut-daily.timer` — sha256 `812829f52cb0517756cbe5311c62d6d8a8cde891008191b6836587dde5866c45`

VM 배치 경로: `/etc/systemd/system/netcut-daily.timer`

````
[Unit]
Description=netcut 측정 매 평일 08:00 KST 기동

[Timer]
OnCalendar=Mon-Fri 08:00 Asia/Seoul
AccuracySec=1s
Persistent=false

[Install]
WantedBy=timers.target
````

</source_bytes>

<incident_facts>

**README 의 사건 절은 아래 사실만으로 쓴다. 여기 없는 수치·시각·원인을 지어내지 않는다.**
「추정」을 사실처럼 쓰지 않고, 재지 못한 것은 재지 못했다고 적는다.

**발단·주기**
- 첫 회차 2026-09-17 14:08:03 KST. 이후 **61분 간격**(관측 오차 −1초~+4초)으로 반복.
- 9/17: 14:08 · 15:09 · 16:10 · 17:11 · 18:12 · 19:13
- 9/18: 10:04 · 11:05 · 12:06 · 14:08 · 15:09 · 17:11
- 9/17 20:14 · 9/18 13:07 · 9/18 16:10 회차는 **감지 기준(3초) 미달 또는 미발생**.

**증상**
- 회차별 길이 **2~15초**. 끊기는 대상이 회차마다 바뀜(KT 단독 / LG U+ 단독 / 둘 다).
- 회복 직후 밀린 응답이 한꺼번에 도착 — 최대 **7,146ms(KT)** · **6,147ms(KB)**.

**같은 순간 정상이었던 것 (= 판정의 근거)**
- 매 회차 Google `8.8.8.8` 과 GCP 메타데이터 서버(HTTP) 무응답 **0**.
- 9/18 측정분만 해도 8.8.8.8 **17,976회 중 무응답 0**.

**동반 현상**
- relay↔KB(DMA) 세션 **3회 ECONNRESET** → 1~2초 만에 재접속 (9/17 15:09 · 16:10 회차. 9/18 은 0회).
  나머지 회차는 세션 유지.
- WireGuard 피어가 회차당 **2~3대 동시 `rx_stall`** (wg-probe 기록).

**wg0·WireGuard 무혐의**
- WireGuard 를 타지 않는 경로 — KT·LG U+ 로의 ICMP, openconnect `tun0` 경유 KB 핑,
  relay 의 DMA TCP 세션 — 도 **같은 초에 함께** 끊겼다.

**VM 무혐의**
- ens4 rx/tx err·drop **0** · wg0 drop **0** · CPU steal 변화 없음 · 커널 메시지 **0** ·
  openconnect 재접속 **0회** · GCE 라이브 마이그레이션·호스트 이벤트 로그 **0건** · 메타데이터 서버 응답 정상.

**호스트 원인 배제 (실험)**
- 2026-09-17 21:57 KST 에 **stop → start**(물리 호스트 이동을 노린 정지 후 시작. 재부팅 아님).
  외부 접속 불가 약 3분 · 부팅 ID 변경 · **MAC·내부 IP·외부 IP 모두 불변**.
- 그럼에도 9/18 에 같은 61분 주기로 재발했고 **분·초 위치까지 유지** → 호스트/VM 원인 배제.

**소멸**
- 9/18 17:11 회차가 마지막. 9/19 는 개별 피어 1건(주기성 없음, 국내 핑 정상). 9/20 **0건**.

**판정**
- **GCP 서울 리전 ↔ 국내 ISP(KT·LG U+) 피어링/전달 구간.**
  Google 망 내부(8.8.8.8)와 호스트 내부(메타데이터)는 같은 순간 정상이었기 때문이다.

**증거 위치 (VM)**
- `/var/tmp/netcut-260917-1711` · `-1812` · `-1913` · `-2014` — 9/17 회차별 12분 측정
- `/var/tmp/netcut-260918-am` — 9/18 08:00~13:00 연속
- 이후 `/var/tmp/netcut-<YYMMDD>` — 평일 08:00~20:00 자동

**운영 한계**
- `netcut-daily.timer` 는 `systemctl enable` 되어 **재부팅은 생존**하지만 메타데이터
  startup-script(§9)에는 **미등록**이라 **VM 재생성 시 사라진다.** wg-probe 와 달리
  `setup-relay-iam.sh` 메타데이터 키가 없다.

**네트워크 등급 (별건)**
- 현재 **Premium**. 서울→한국 인터넷 송신 **$0.19/GiB**(월 1TiB 까지),
  Standard 는 월 **200GiB 무료 후 $0.085/GiB**.
- **단절 회피 효과는 미검증**이며 **비용 관점의 별건**으로 남긴다.
- Standard 전환은 **외부 IP 재발급**이 필요하고 MAC·내부 IP 는 불변이다.

</incident_facts>

<tasks>

<task type="tracer">
  <name>Task 1: netcut 자산 4종을 저장소에 박제하고 sha256 으로 동일성을 증명한다</name>
  <files>infra/relay/netcut-probe.sh, infra/relay/netcut-daily.sh, infra/relay/netcut-daily.service, infra/relay/netcut-daily.timer</files>
  <read_first>이 PLAN 의 `<source_bytes>` 절 A·B·C·D 블록</read_first>
  <action>
먼저 A(`netcut-probe.sh`) **하나만** 쓰고 「쓰기 → shasum 대조 → bash -n」 파이프라인이 실제로
통과하는지 확인한 뒤 나머지 3종으로 확장한다. 가장 길고 줄바꿈 사고가 날 가능성이 가장 큰 파일에서
먼저 실패를 보는 것이 목적이다.

Write 도구로 쓴다(heredoc 금지). `<source_bytes>` 의 4중 백틱 펜스 **안쪽 내용만** 파일에 담는다 —
펜스 줄 자체와 헤더 문장은 파일에 들어가지 않는다. 각 파일은 마지막 줄 뒤 개행 1개로 끝낸다.

sha256 이 어긋나면 **내용을 고쳐서 맞추지 않는다.** 허용된 조정은 딱 셋이다:
① 파일 끝 개행 유무 ② CRLF 가 섞였는지(있으면 LF 로) ③ 줄 끝 공백이 붙었는지.
셋을 다 해봐도 어긋나면 **작업을 멈추고 보고한다.** 선택적 복구 경로로, gcloud 인증이 살아 있다면
VM 원본을 읽기 전용으로 내려받아 대조·교체할 수 있다 —
`gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='sudo cat <경로>'`
(읽기뿐이며 VM 상태를 바꾸지 않는다). 그 경로를 썼다면 SUMMARY 에 그 사실을 적는다.

파일 모드는 저장소 선례를 따른다 — 셸 2종은 실행 가능(`chmod 755`, `kbvpn-*.sh` 와 같은 100755),
`.service`·`.timer` 2종은 100644(`wg-probe.service` 와 같다). 모드는 sha256 에 영향을 주지 않는다.

`netcut-probe.sh` 는 저장소에 `10.41.1.120` 리터럴을 한 번 들여온다(`tun0` 경유 ICMP 대상).
이것은 바이트 동일성이 강제하는 것이고 **DMA 로그인·주문 경로가 아니라 도달성 측정**이다 —
D-27 의 「접속 경로 0건」 계약은 유지된다. 이 사실을 SUMMARY 에 한 줄로 남긴다.
  </action>
  <verify>
    <automated>
cd /Users/alex/repos/gh-radar
printf '%s  %s\n' \
  76e24b9e652c779ed9ae71bb670687696c0e2387172870aaa9baa9f08c101d4a infra/relay/netcut-probe.sh \
  3e6dccf7032f858f80b54bbfb0754b1c8e11fada190ddc969b8654f689962517 infra/relay/netcut-daily.service \
  812829f52cb0517756cbe5311c62d6d8a8cde891008191b6836587dde5866c45 infra/relay/netcut-daily.timer \
  | shasum -a 256 -c -
test "$(shasum -a 256 infra/relay/netcut-daily.sh | cut -c1-8)" = "40688e0e" && echo "netcut-daily.sh: OK (VM prefix)"
printf '%s  %s\n' 40688e0e7b332005d6f123b4a8d3b01eae2c49601ba53f02d674dcf7cfaec327 infra/relay/netcut-daily.sh | shasum -a 256 -c -
bash -n infra/relay/netcut-probe.sh && bash -n infra/relay/netcut-daily.sh && echo "bash -n: OK"
test "$(grep -c '10\.41\.1\.120' infra/relay/netcut-probe.sh)" = "1" && echo "gateway literal: 1 (ICMP target)"
    </automated>
    <human-check>없음 — 전부 기계 게이트다. macOS 로컬에는 systemd 가 없으므로 `systemd-analyze verify` 는 돌리지 않는다(유닛 2종의 검증은 sha 동일성으로 대신한다 — VM 에서 이미 가동 중인 바이트이기 때문이다).</human-check>
  </verify>
  <done>4개 파일이 존재하고 `shasum -a 256 -c` 가 3건 OK, `netcut-daily.sh` 접두 일치, `bash -n` 2종 exit 0. sha 를 맞추려고 내용을 고친 흔적이 없다.</done>
</task>

<task type="auto">
  <name>Task 2: README 에 「외부 경로 단절 판정 — netcut」 절을 신설하고 기존 두 표에 행을 더한다</name>
  <files>infra/relay/README.md</files>
  <read_first>infra/relay/README.md §현재 운영 상태 · §터널 정지 판정 절차 — wg-probe · §파일 맵 / 이 PLAN 의 `<incident_facts>`</read_first>
  <action>
편집은 **네 곳**이다. 전부 순수 추가이며, 기존 줄을 지우거나 고쳐 쓰지 않는다.

**(1) 새 절 `## 외부 경로 단절 판정 — netcut`.** 위치는 §터널 정지 판정 절차 — wg-probe 가 끝나는
지점, 즉 `## 적용 런북 — WireGuard 최초 반영` 바로 앞의 구분선 앞이다. 두 측정기 절이 붙어 있게 한다.
소절 5개로 쓴다:

- **왜 있는가 / 무엇을 재는가** — 5축을 그대로 설명한다. ① 호스트 내부(메타데이터 서버, ICMP 가 아니라
  HTTP 인 이유는 긴 연속 핑을 메타데이터 서버가 막기 때문) ② Google 망 `8.8.8.8` ③ 국내 ISP
  KT `168.126.63.1` · LG U+ `164.124.101.2` ④ `tun0` 경유 KB 게이트웨이 ⑤ 초당 ens4 카운터·CPU steal.
  **읽기·핑만 한다**는 점과, **netcut 은 판정하지 않는다**는 점을 분명히 쓴다 — wg-probe 와 달리
  임계값도 에피소드 판정도 없고 raw 로그만 남긴다. 사건 기록의 「3초」는 스크립트의 임계값이 아니라
  사후 분석에 쓴 기준이다.
- **어떻게 도는가** — `netcut-daily.timer`(`OnCalendar=Mon-Fri 08:00 Asia/Seoul` · `AccuracySec=1s` ·
  `Persistent=false`) → `netcut-daily.service`(oneshot · `TimeoutStartSec=13h` · `Nice=10`) →
  `/usr/local/sbin/netcut-daily` → `netcut-probe-260917 /var/tmp/netcut-<YYMMDD> 43200`.
  `ExecStartPre` 가 14일 지난 `/var/tmp/netcut-*` 디렉터리를 지운다(= 보존 14일). 수동 1회 실행은
  `systemctl start netcut-daily.service` 이며 그날치가 이미 돌고 있으면 중복 측정이 된다는 점을 적는다.
- **조회·분석법** — VM 에서 읽기만 하는 명령 묶음. 로그 5종과 각 로그의 시각 표기가 **다르다**는 점을
  먼저 못박는다: `ping-*.log` 는 `ping -D` 의 epoch(대괄호), `http-metadata.log`·`counters.log` 는
  `HH:MM:SS.mmm` 만이고 **날짜는 디렉터리 이름에 있다**. 시계 규약(VM 은 UTC)은 §터널 정지 판정 절차의
  §조회 를 가리키고 여기 다시 설명하지 않는다. 명령은 최소 다음을 담되 **끊긴 구간 검출 awk 는 정확히
  한 줄만** 두고 4개 로그에 `for` 로 돌린다(같은 식을 네 번 적지 않는다):
  · 끊긴 구간 = 응답 줄(`bytes from`) 사이 간격이 3초를 넘는 지점 — `awk -F'[][]'` 로 대괄호 안 epoch 을
    뽑아 직전 값과의 차를 낸다. **이 awk 는 README 안에서 물리적으로 한 줄이어야 한다**(줄 이음 금지) —
    아래 게이트가 원문에서 그 한 줄을 뽑아 그대로 실행해 보기 때문이다. 계획 단계에서
    `awk -F'[][]' '/bytes from/{t=$2+0; if(p>0 && t-p>3) printf "  %.3f  gap %.1fs\n", p, t-p; p=t}' "$D/$f.log"`
    형태로 추출·실행이 성립함을 실측했다(합성 로그에서 `101.000  gap 9.0s` 1건 검출)
  · 대조군 무응답 수 = `ping-google.log` 의 `no answer yet` 줄 수, `http-metadata.log` 의 비 200 줄
  · 회복 직후 밀린 응답 = `time=` 값 상위
  · `counters.log` 의 해당 창 전후 — 패킷이 NIC 를 나갔는지, steal 이 움직였는지
  · epoch → 사람 시각 변환(VM 은 Debian 이므로 `date -d @…`, KST 는 `TZ=Asia/Seoul`)
- **2026-09-17~18 「61분 주기 국내 방향 단절」** — `<incident_facts>` 의 사실만으로 쓴다. 회차 목록은
  날짜 2행짜리 작은 표로 묶어도 되고, 그 밖의 수치는 산문으로 쓴다. **판정과 그 근거(같은 순간
  8.8.8.8·메타데이터가 정상이었다)** 를 가장 눈에 띄게 둔다. wg0 무혐의·VM 무혐의·호스트 원인 배제
  실험(stop→start)·소멸·증거 위치를 빠뜨리지 않는다.
- **운영 한계** — ⓐ 메타데이터 미등록이라 **VM 재생성 시 사라진다**(재부팅은 생존). wg-probe 와 다른
  점을 명시한다. ⓑ 되돌리는 배치 절차(자산 4종을 `gcloud compute scp` 로 올려 `install -m 0700` /
  `install -m 0644` 후 `systemctl daemon-reload` + `systemctl enable --now netcut-daily.timer`).
  ⓒ **VM 실측 권한을 확인하지 않았다 — 이 배치 명령의 모드가 정본이다.** ⓓ **§메모리 예산 표에 행을
  두지 않았다 — RSS 실측이 없기 때문이다.** 다음 VM 접속 때 `MemoryCurrent` 로 재어 채울 것.
  ⓔ 네트워크 등급은 **비용 관점의 별건**이다(Premium 현재값 · Standard 요금 · **단절 회피 효과 미검증** ·
  전환 시 외부 IP 재발급 필요, MAC·내부 IP 불변).

**(2) §현재 운영 상태 표에 `netcut-daily.timer` 행을 더한다 — 더하기로 결정했다.** 그 표가 운영 유닛의
정본이고 `wg-probe` 도 거기 있다. 거기 없는 상시 유닛은 없는 것으로 읽힌다. 값 칸에는 `enabled` ·
예약(`Mon-Fri 08:00 KST`) · 새 절 참조 · **메타데이터 미등록이라 VM 재생성 시 소멸**을 적고, 확인 방법
칸에는 `systemctl is-enabled netcut-daily.timer` 와 `systemctl list-timers 'netcut-*' --all` 을 둔다.
**설치 날짜를 지어내지 않는다** — 자산이 언제 올라갔는지는 주어진 사실에 없다. 시점 근거는 새 절이 진다.

**(3) §파일 맵 표에 4행을 더한다.** 저장소 파일 ↔ VM 경로 ↔ 권한:
`netcut-probe.sh` → `/usr/local/sbin/netcut-probe-260917` (0700) ·
`netcut-daily.sh` → `/usr/local/sbin/netcut-daily` (0700) ·
`netcut-daily.service` → `/etc/systemd/system/netcut-daily.service` (0644) ·
`netcut-daily.timer` → `/etc/systemd/system/netcut-daily.timer` (0644).
표 아래 주석 블록에 **예외 4** 를 잇는다: 이 4종만 `startup.sh` 가 배치하지 **않는다**(메타데이터 키가
없다). 표의 다른 모든 행과 다르다는 사실을, 그 사실이 오해를 낳는 바로 그 자리에 둔다.

**(4) §터널 정지 판정 절차 — wg-probe 의 §판정 끝에 상호참조 한 줄.** `### 장 마감 후 재부팅 생존 반영
런북` 바로 앞에 인용 블록 한 덩어리를 넣는다: 국내 방향 단절은 netcut 이 따로 재며, 판정표에서
「GCP 서울↔국내 ISP 경로」 귀속이 의심되면 같은 시각 창의 netcut 로그를 함께 보라는 포인터. 그리고
2026-09-17~18 사건이 그 귀속을 독립 측정으로 확인한 첫 사례라는 한 문장.

**복사 금지 — 이것이 이 작업의 실패 모드다.** wg-probe 의 §임계값 표·§판정 표·§3자 대조 표를 새 절에
옮겨 적지 않는다. 필요하면 「§터널 정지 판정 절차 — wg-probe 의 §판정 을 보라」로 가리킨다
(CLAUDE.md §Conventions: 표가 둘이 되면 갈라진다). 시계 규약(UTC)도 같은 이유로 가리킨다.
비밀 값·피어 공개키·피어 엔드포인트 주소는 새 절에 **한 글자도 넣지 않는다.**
  </action>
  <verify>
    <automated>
cd /Users/alex/repos/gh-radar
test "$(grep -c '^## 외부 경로 단절 판정 — netcut' infra/relay/README.md)" = "1" && echo "section: 1"
test "$(grep -c 'wg-probe.py 헤더 주석 §임계값 표' infra/relay/README.md)" = "1" && echo "threshold canon: still 1"
NUMSTAT=$(git diff --numstat -- infra/relay/README.md) || { echo "git diff failed"; exit 1; }
test -n "$NUMSTAT" || { echo "README unchanged — 편집이 반영되지 않았다"; exit 1; }
test "$(printf '%s\n' "$NUMSTAT" | cut -f2)" = "0" && echo "deletions: 0 (pure insertion)"
grep -q 'netcut-daily.timer' infra/relay/README.md && grep -q '/usr/local/sbin/netcut-probe-260917' infra/relay/README.md && echo "rows: present"
test "$(grep -cE '[A-Za-z0-9+/]{43}=' infra/relay/README.md)" = "0" && echo "no base64 key-shaped strings"
# 문서의 끊긴-구간 awk 를 원문에서 뽑아 합성 로그에 돌린다 (손으로 옮겨 적은 스니펫이 아니다)
G="${TMPDIR:-/tmp}/netcut-gate"; mkdir -p "$G"; D="$G"; f=fix
printf '[100.000] 64 bytes from 168.126.63.1: icmp_seq=1 ttl=57 time=2.1 ms\n[101.000] 64 bytes from 168.126.63.1: icmp_seq=2 ttl=57 time=2.2 ms\n[110.000] 64 bytes from 168.126.63.1: icmp_seq=11 ttl=57 time=7146 ms\n' > "$G/fix.log"
LINE=$(grep -F "awk -F'[][]'" infra/relay/README.md | head -1 | sed 's/^[[:space:]]*//')
test -n "$LINE" && OUT=$(eval "$LINE") && printf '%s\n' "$OUT" | grep -q '9.0' && test "$(printf '%s\n' "$OUT" | grep -c .)" = "1" && echo "gap awk: 1 episode detected"
    </automated>
    <human-check>사용자가 새 절을 읽고 ① 사건 판정과 근거 ② VM 재생성 시 소멸한다는 한계 ③ 되돌리는 절차 세 가지를 문서만으로 알 수 있는지 확인한다.</human-check>
  </verify>
  <done>새 절이 1개 존재하고, 운영 상태 표·파일 맵에 netcut 행이 있으며, wg-probe 절에는 포인터 한 줄만 늘었다. README diff 의 삭제 줄이 0 이고, 임계값 정본 문장은 여전히 1건이며, 문서의 awk 한 줄이 합성 로그에서 실제로 1건을 잡는다.</done>
</task>

<task type="auto">
  <name>Task 3: 전량 게이트 재확인 후 원자 커밋 (푸시하지 않는다)</name>
  <files>.planning/quick/260920-pik-netcut-61/260920-pik-SUMMARY.md</files>
  <action>
Task 1·2 의 게이트를 **한 번에 다시** 돌려 최종 상태에서 통과함을 확인한다(중간 편집이 앞선 통과를
무효로 만들지 않았는지 보는 것이 목적이다).

SUMMARY 를 쓴다. 담을 것: ① sha 대조 실측 결과(4건, VM 원본을 내려받았다면 그 사실도) ② README 편집
네 곳과 **§현재 운영 상태 표에 행을 더하기로 한 결정과 그 이유** ③ 복사하지 않고 가리킨 곳 목록
④ `netcut-probe.sh` 가 저장소에 들여온 `10.41.1.120` 리터럴 1건의 성격(ICMP 도달성 측정 · D-27 접속
경로 아님) ⑤ **하지 않은 것** — `systemd-analyze verify` 미실행(로컬 systemd 없음) · 메모리 예산 표
미갱신(RSS 미실측) · VM 상태 변경 0(읽기 외 gcloud 호출 없음) · 푸시 미실행.

변경 전체를 **한 커밋**으로 만든다. 대상은 자산 4종 + `infra/relay/README.md` + 이 quick 디렉터리의
PLAN·SUMMARY 다. **경로를 명시해 스테이징한다 — `git add -A`/`git add .` 를 쓰지 않는다.**
작업 트리에는 이 작업과 무관한 미추적 파일(`.planning/milestone.lock` 등 오케스트레이터 소유)이
있을 수 있고, 싹쓸이 스테이징은 그것까지 커밋에 끌고 들어간다. 커밋 메시지는 한글 한 줄:
`docs(quick-260920-pik): netcut 측정기 4종 박제 + 61분 주기 국내 단절 사건 기록`
**`Co-Authored-By` 를 넣지 않는다**(사용자 전역 규칙). **푸시하지 않는다** — 사용자 확인 후
오케스트레이터가 처리한다. `.planning/STATE.md` 와 `ROADMAP.md` 는 건드리지 않는다(오케스트레이터 몫).
  </action>
  <verify>
    <automated>
cd /Users/alex/repos/gh-radar
printf '%s  %s\n' \
  76e24b9e652c779ed9ae71bb670687696c0e2387172870aaa9baa9f08c101d4a infra/relay/netcut-probe.sh \
  3e6dccf7032f858f80b54bbfb0754b1c8e11fada190ddc969b8654f689962517 infra/relay/netcut-daily.service \
  812829f52cb0517756cbe5311c62d6d8a8cde891008191b6836587dde5866c45 infra/relay/netcut-daily.timer \
  | shasum -a 256 -c -
bash -n infra/relay/netcut-probe.sh && bash -n infra/relay/netcut-daily.sh && echo "bash -n: OK"
# 이 작업이 만진 경로만 본다 — 무관한 미추적 파일(.planning/milestone.lock 등)로 오판하지 않는다
PORC=$(git status --porcelain -- infra/relay .planning/quick/260920-pik-netcut-61) || { echo "git status failed"; exit 1; }
test -z "$PORC" && echo "scope clean (남은 변경 0)"
MSG=$(git log -1 --format=%B) || { echo "git log failed"; exit 1; }
printf '%s\n' "$MSG" | grep -q 'quick-260920-pik' && echo "commit subject: OK"
test "$(printf '%s\n' "$MSG" | grep -c 'Co-Authored-By')" = "0" && echo "no co-author line"
CFILES=$(git show --pretty=format: --name-only HEAD) || { echo "git show failed"; exit 1; }
test "$(printf '%s\n' "$CFILES" | grep -c '^infra/relay/netcut')" = "4" && echo "assets in commit: 4"
printf '%s\n' "$CFILES" | grep -qx 'infra/relay/README.md' && echo "README in commit"
test "$(printf '%s\n' "$CFILES" | grep -c 'milestone.lock')" = "0" && echo "무관 파일 미포함"
git log --oneline -1
SB=$(git status -sb) || { echo "git status -sb failed"; exit 1; }
printf '%s\n' "$SB" | head -1
    </automated>
    <human-check>`git status -sb` 첫 줄로 원격이 움직이지 않았음(푸시 안 함)을 눈으로 확인한다.</human-check>
  </verify>
  <done>게이트 전량 통과, 이 작업 경로에 남은 변경 0, 커밋 1개(자산 4 + README + PLAN + SUMMARY 만), `Co-Authored-By` 0줄, 푸시 0회.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 저장소 → VM (root) | 이 자산 4종은 VM 에서 root 로 실행되고 유닛으로 등록된다. 저장소 바이트가 곧 실행 바이트다 |
| 저장소 → 공개 문서 | README 는 인프라 세부를 담는다. 비밀 값·피어 식별자가 들어가면 되돌릴 수 없다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-PIK-01 | Tampering | `infra/relay/netcut-*` 4종 | high | mitigate | 저장소 바이트가 VM 배치본과 다르면 다음 재배치가 **다른 코드**를 root 로 심는다. Task 1 의 `shasum -a 256 -c` 3건 + 접두 1건이 기계 게이트다. 어긋나면 내용 수정이 아니라 **중단**한다 |
| T-PIK-02 | Information Disclosure | `infra/relay/README.md` 새 절 | medium | mitigate | 새 절에 계정·비밀 값·WireGuard 공개키/PSK·피어 엔드포인트 주소를 넣지 않는다. 기록하는 주소는 공개 DNS 2곳·`8.8.8.8`·`169.254.169.254`·이미 문서 전반에 있는 `10.41.1.120` 뿐. 게이트: base64 44자 패턴 0건 |
| T-PIK-03 | Elevation of Privilege | `netcut-probe.sh` 의 `10.41.1.120` | low | accept | ICMP 도달성 측정일 뿐 DMA 로그인·주문 프레임을 보내지 않는다. D-27 의 「접속 경로 0건」 계약 유지. 바이트 동일성이 강제하므로 제거 불가 — 성격을 SUMMARY·문서에 명시하는 것으로 수용 |
| T-PIK-04 | Denial of Service | 새 절의 재배치 런북 | low | mitigate | 측정기는 읽기·핑 전용이라 데이터패스를 건드리지 않는다. 다만 수동 실행이 그날치와 **중복 측정**이 된다는 경고를 런북에 함께 적는다. `startup.sh` 전체 재적용(장중 금지)을 요구하지 않는 절차다 |
| T-PIK-SC | Tampering | 패키지 설치 | — | n/a | npm/pip/cargo 설치 **0건** — 패키지 정당성 게이트 비해당 |
</threat_model>

<verification>
1. `shasum -a 256 -c` — 3건 OK + `netcut-daily.sh` 접두 `40688e0e` 일치
2. `bash -n` 2종 exit 0 (systemd 유닛은 로컬 검증 불가 — sha 동일성으로 대신)
3. README diff 삭제 줄 **0** — 순수 추가이며 기존 표를 고쳐 쓰지 않았다
4. 임계값 정본 문장 `wg-probe.py 헤더 주석 §임계값 표` 여전히 **1건** — 표를 복사하지 않았다
5. 문서의 끊긴-구간 awk 를 README 원문에서 뽑아 합성 로그에 돌려 1건 검출
6. base64 44자 패턴 0건 — 공개키·PSK 유출 없음
7. 커밋 1개 · 이 작업 경로에 남은 변경 0 · 무관 파일 미포함 · `Co-Authored-By` 0줄 · 푸시 0회
</verification>

<success_criteria>
- netcut 자산 4종이 VM 배치본과 sha256 동일하게 저장소에 있다
- README 만 읽고 netcut 로그를 조회·귀속할 수 있고, 2026-09-17~18 사건의 판정과 근거가 남아 있다
- VM 재생성 시 소멸한다는 한계와 되돌리는 절차가 문서에 있다
- wg-probe 의 표가 복사되지 않았다 — 포인터 한 줄만 늘었다
- 코드 동작 변경 0 · VM 상태 변경 0 · 푸시 0
</success_criteria>

<output>
`.planning/quick/260920-pik-netcut-61/260920-pik-SUMMARY.md` 를 작성하고 전체를 한 커밋으로 남긴다.
`.planning/STATE.md` · `ROADMAP.md` 갱신과 푸시는 오케스트레이터 몫이다.
</output>
