---
phase: quick-261007-b9o
plan: 01
subsystem: infra/relay/secuway (교보 SecuwaySSL 상시 터널, radar-gw)
tags: [kyobo, secuwayssl, vpn, watchdog, systemd, keepalive]
status: complete
requires: []
provides:
  - "secuway-watchdog: 4회 디바운스 탐침 · 60초 유예 · keepalive ICMP 약 295 KB/회차 · failed 시간당 1회 회수 (inactive 무접촉)"
  - "secuway-connect: Error: fail-fast · 벤더 inactive 줄 best-effort 기록"
  - "securwayssl.service: RestartSec=10 · StartLimitBurst=8/600s · ExecStopPost 가 cred + err 표식 정리"
  - "로컬 드라이런 테스트 2개 (tests/watchdog.test.sh · tests/connect.test.sh)"
affects: [relay KYOBO 관찰자 가용성, 21:00 limitup-pull 운반 경로]
tech-stack:
  added: []
  patterns: ["bash source 가드(BASH_SOURCE[0] == $0) + 함수 분리로 스텁 드라이런", "/run 스탬프 시간당 1회 회수 (kbvpn-watchdog 선례)"]
key-files:
  created:
    - infra/relay/secuway/tests/watchdog.test.sh
    - infra/relay/secuway/tests/connect.test.sh
  modified:
    - infra/relay/secuway/secuway-watchdog
    - infra/relay/secuway/secuway-connect
    - infra/relay/secuway/securwayssl.service
    - infra/relay/README.md
decisions:
  - "워치독은 4회 탐침(5초 간격·3초 타임아웃)이 전부 실패 + 결정 시 active + active 60초 경과일 때만 재시작"
  - "모든 클라이언트 Error: 를 분류 없이 exit 1 — 반복 상한은 StartLimit 8/600 + 워치독 시간당 회수 이중 상한"
  - "inactive(사람 stop)는 워치독이 절대 켜지 않는다 — 데스크톱 상호배제"
  - "active 경과 시간은 ActiveEnterTimestampMonotonic + /proc/uptime 우선, 실패 시 date -d 폴백"
metrics:
  duration: "약 7분 (08:25~08:32 KST)"
  completed: 2026-10-07
actuals:
  tokens: 11350
  tasks: 3
  commits: 3
plan_head_before: 923eec8f44a86653a3f87638f53f6664a3080d4f
plan_head_after: 570118f935c820e57f53e2d171888728e238de11
---

# Quick 261007-b9o: 교보 SecuwaySSL 워치독 디바운스 · fail-fast · keepalive 볼륨 Summary

단일 탐침 오탐 재시작을 4회 디바운스 + 60초 유예로 막고, 클라이언트 `Error:` 에서 1초 안에 실패해 systemd 가 10초 뒤 재시도하게 하며, 매 워치독 회차가 tun1 에 ICMP 약 295 KB 를 흘려 벤더 OpenVPN `--inactive <초> <바이트>` 하한을 채운다 — 저장소 변경만, VM 무접촉.

## 커밋

| Task | 커밋 | 파일 |
|------|------|------|
| 1 (트레이서) 워치독 | `a99a5f32` | `infra/relay/secuway/secuway-watchdog` · `infra/relay/secuway/tests/watchdog.test.sh` |
| 2 connect + 유닛 | `f3e9d44b` | `infra/relay/secuway/secuway-connect` · `infra/relay/secuway/securwayssl.service` · `infra/relay/secuway/tests/connect.test.sh` |
| 3 README | `570118f9` | `infra/relay/README.md` |

세 커밋 모두 한국어 메시지, `Co-Authored-By` 없음, 푸시 0.

## 결정 이력

**잠금 결정 (오케스트레이터, 재검토 안 함)**
- **L-01 디바운스** — 단일 탐침 → 즉시 재시작 제거. 4회 전부 실패 시에만 재시작, 실패 탐침·결정 모두 `secuway-watchdog` 태그 로그.
- **L-02 connect fail-fast** — `Error:` 줄에서 30초 대기 없이 즉시 실패. 자격증명은 CRED 파일 → stdin 만.
- **L-03 재시도** — RestartSec 10(하한), StartLimit 으로 무한 반복 방지, 영구 failed 는 워치독이 회수.
- **L-04 keepalive 볼륨** — 터널로 .119 에 큰 ICMP, 상수는 스크립트 맨 위.
- **L-05 inactive 기록** — conf 에서 inactive 줄만, best-effort.
- **L-06 배포 분리** — 워치독 핫 교체(장중 가능), connect·유닛은 20:00 KST 이후. 실행기 배포 금지.
- **L-07 문서** — README §교보 SecuwaySSL VPN 반영.

**플래너 재량 (그대로 구현)**
- **P-1** `PROBE_TRIES=4` · `PROBE_GAP_SEC=5` · `PROBE_TIMEOUT_SEC=3` (폭 15~27초).
- **P-2** `GRACE_SEC=60` — 로그인 중 세션을 죽이지 않는다. 경과 시간 파싱 실패는 아주 큰 값(재시작 막지 않음).
- **P-3** failed 회수 시간당 1회(`/run/secuway-watchdog.last-recover`), inactive · activating 무접촉.
- **P-4** 오류 분류 없음 — 모든 `Error:` 가 exit 1.
- **P-5** `StartLimitBurst=8` / 600초 (옛 세션 약 60초 보유 동안 약 6회 시작 필요).
- **P-6** `KEEPALIVE_SIZE=1200` · `COUNT=120` · `INTERVAL=0.2` · `DEADLINE=40` → 회차당 약 295 KB. 응답 절반 미만이면 진단 로그 1줄.
- **P-7** 상수 맨 위 · 함수 분리 · `BASH_SOURCE` main 가드(`main` 은 return, 가드가 exit).
- **P-8** 로그 문자열 영어, 주석 한국어.

## 검증 결과 (최종 상태에서 재실행)

```
$ bash infra/relay/secuway/tests/watchdog.test.sh
WATCHDOG TESTS ALL OK
$ bash infra/relay/secuway/tests/connect.test.sh      # 약 11.5초
CONNECT TESTS ALL OK
TASK1 ALL OK
TASK2 ALL OK
TASK3 ALL OK
```

변이(mutation) 확인 — 테스트가 실제로 잡는지:
- `GRACE_SEC=10` → `FAIL: c5-grace — restart: expected 0, got 1`
- `PROBE_TRIES=1` → `FAIL: c2-blip — probe: expected 2, got 1`
- connect fail-fast 제거 → `FAIL: A-already-logged-in — took 33s (> 5s)`
- inactive 정규식을 비숫자 패턴으로 바꿈 → `FAIL: C-up-capture` (키 센티널이 새는 경로를 테스트가 차단)

## Deviations from Plan

**1. [Rule 2 - 견고성] `active_age_sec` 가 monotonic 을 우선 사용**
- **발견:** Task 1
- **문제:** P-2 는 `ActiveEnterTimestamp` 를 `date -d` 로 변환하라 했지만, systemd 는 로컬 타임존 약어(예 `KST`)를 붙여 출력하고 GNU date 는 모든 약어를 해석하지 못한다. 해석 실패는 「아주 큰 값」 이라 유예가 조용히 꺼진다.
- **조치:** `ActiveEnterTimestampMonotonic`(부팅 후 µs) 과 `/proc/uptime` 차이를 먼저 쓰고, 안 되면 계획대로 `date -d` 로 폴백, 그것도 안 되면 큰 값. 결정 흐름·상수는 그대로.
- **커밋:** `a99a5f32`

**2. [경미] keepalive 요약 정규식이 `packets received`(BSD) 도 허용** — iputils `N received` 와 함께. 동작 동일.

그 외 계획대로 실행.

## 하지 않은 것

- VM 접촉 0 (`gcloud compute ssh/scp` · install.sh · systemctl 실행 0) · 배포 0 · 푸시 0.
- `install.sh` · `secuway-fetch-secret` · `securwayssl-watchdog.{service,timer}` 무변경 (`git diff --quiet 923eec8f` 통과).
- `ops/alert-kyobo-observer-down.yaml` 무변경.
- Linux 전용 부분(`timeout` · `date -d` · `/proc/uptime` · iputils `ping` · systemd)은 로컬 스텁으로 대신했다 — 실제 동작은 대기 런북 ②⑤ 에서 실증한다.

## 실측 대기

- 벤더 inactive 바이트 하한 `B` (창 `S`초) — 2단계 ⑤ 통제 재접속의 `vendor openvpn option: inactive <S> <B>` 줄로 얻어 README 「실측 대기」 자리에 적는다.
- keepalive 실제 tun1 증가량 — 1단계 ② (기대 tx·rx 각 ≥ 140000).
- 밤샘 4시간 무종료 — 3단계 ⑦.

## 배포 시 참고 (실행기 관찰)

- `install.sh` 의 `install -m 0755` 는 대상 파일을 unlink 후 새로 만든다(GNU coreutils) — 실행 중인 옛 `secuway-connect` bash 는 옛 inode 를 계속 읽으므로 교체 중 스크립트 깨짐 위험은 없다. 새 connect 는 다음 (재)접속부터 적용된다.
- 새 connect 는 클라이언트·sslvpn stdout 을 리더(프로세스 치환)로 거친다. 리더가 같은 cgroup 이라 stop/restart 시 함께 정리된다.

## 대기 — 메인 세션 배포·검증

상태: **1·2단계 완료(2026-10-07, 메인 세션)** · 3단계 대기(pending)

- 1단계 결과: ⓪ VM 3파일 해시 = 923eec8f(드리프트 없음) · ① 백업 `/var/backups/secuway-261007/secuway-watchdog` 후 설치(sha256 a04bb8ced445a57e… = 저장소) · ② 수동 1회 실행 24초, tun1 delta tx=148176 rx=147869(≥140000 충족), Result=success, NRestarts=1·ActiveEnterTimestamp 23:03:12Z 불변(재시작 없음), 저널 무기록(정상), healthz KYOBO119 live.
- **2단계 완료(2026-10-07 20:07~20:12 KST, 메인 세션):** ⓪ VM 6파일 해시 = 923eec8f(워치독은 1단계 a04bb8ce…) 드리프트 없음 · 장중(08:03~20:07) securwayssl 재시작 0회(NRestarts=1 그대로, ActiveEnter 23:03:12Z) — 1단계 디바운스가 09:03 등 슬롯을 넘김. ③ 백업 `/var/backups/secuway-261007/{secuway-connect cfe1aba4…, securwayssl.service cf2ad296…}` 후 install.sh(daemon-reload·enable 만) → 설치 해시 connect 3ae3d939… · unit 980071c0… (= 저장소). ④ RestartUSec=10s · StartLimitBurst=8 · StartLimitIntervalUSec=10min · ExecStopPost 에 secuway-connect.err, 재시작 없음. ⑤ 통제된 재시작 11:11:32Z → 11:11:34Z 「이미 로그인한 사용자입니다」 → **fail-fast** → RestartSec 10s 뒤 재시도 → 11:11:48Z tunnel up · .119:22 open **18초**(이전 동일 상황 75초) · relay KYOBO119 관찰자 20:11:50 KST 재로그인 · healthz live(lastSeq 474 불변).
  - 주의: 스트림으로 `tar | gcloud compute ssh` 하던 런북 ③ 은 IAP 경유에서 stdin 이 안 넘어가 원격 tar 가 멈췄다(`gzip: unexpected end of file`, set -e 로 아무것도 안 바뀐 채 종료). **tgz 를 `gcloud compute scp` 로 올린 뒤 원격에서 풀어 install.sh** 로 대신했다 — 런북 갱신 대상.
- **inactive 값: 미확보** — `inactive line not captured (best-effort)`. ⑥-b(client.log grep)에도 값은 없고 `Inactivity timeout` 이력만 있다. 따라서 KEEPALIVE 조정 공식(3×B÷(S÷180))은 지금 판정 불가. 현 keepalive 는 회당 tx·rx 각 ≈148 KB(1단계 실측) → 4시간 창 ≈80회 × ≈296 KB ≈ 23.7 MB(양방향 합). 실효 판정은 **3단계(10/8 08:00 전 — 밤새 `Inactivity timeout` 없음·ActiveEnterTimestamp 11:11:45Z 불변)** 로 한다. 캡처 실패 원인(conf 수명이 폴링 간격보다 짧은지 등)은 후속 과제.
- 남은 것: 3단계(다음 날 08:00 전 밤샘 무종료 확인) · inactive 캡처 개선(선택).

` 전체 · Task 1·2 커밋 해시(`git log 923eec8f..HEAD --oneline -- infra/relay`)
  </read_first>
  <action>
L-06 · L-07 을 구현한다. **이 태스크에서도 `gcloud compute ssh/scp` · install.sh · systemctl 을 하나도 실행하지 않는다.**

(A) `infra/relay/README.md` §교보 SecuwaySSL VPN 안:
  1. 「systemd 구성」 목록의 secuway-connect · secuway-watchdog 두 항목을 새 동작 한 줄씩으로 바꾼다(connect: cred stdin 주입 + `Error:` fail-fast + inactive 줄 기록 / watchdog: 3분 주기 디바운스 탐침 + keepalive 볼륨 + failed 회수).
  2. 「프로세스 모델」 단락의 「약 4시간 `--inactive` 만료」 를 원인이 드러나게 고치고 새 절을 가리킨다.
  3. 상호배제 절 바로 뒤에 새 절 `### 워치독 · 재접속 동작 (quick-261007-b9o)` 를 더한다. 첫 줄에 「반영 상태: 적용 대기 — 워치독은 핫 교체, connect·유닛은 20:00 KST 이후(SUMMARY 대기 런북)」 표시를 둔다.
     담을 것 — 각 항목에 상수 이름과 값을 함께 적는다:
     ① 디바운스: `PROBE_TRIES` 4 · `PROBE_GAP_SEC` 5 · `PROBE_TIMEOUT_SEC` 3 (폭 15~27초), `GRACE_SEC` 60 유예, 탐침 실패·결정 로그, 2026-10-07 08:02 KST 사례 1~2줄.
     ② fail-fast 와 재시도: `Error:` 줄(예 「이미 로그인한 사용자입니다」)에서 즉시 종료 → `RestartSec=10`(하한 10초 이유) → `StartLimitBurst=8` / 600초 → 소진 시 failed → 워치독 시간당 1회 `reset-failed` + `start`.
        KB 와 같은 이중 상한이되 **inactive(사람이 stop)는 회수하지 않는다**는 차이와 이유(데스크톱 상호배제). 수동 즉시 회수 명령(`sudo systemctl reset-failed securwayssl.service` 후 `start`)은 원인 확인 뒤에만.
     ③ 4시간 주기 끊김의 원인: 벤더 런처가 쓰는 conf 의 `inactive %d %d` = OpenVPN `--inactive <초> <바이트>` — 창 안 tun 트래픽이 바이트 미만이면 종료. 10-06 18:39:54Z · 22:40:29Z 사례,
        장중엔 볼륨이 커서 유지(22시간 세션 사례). conf 는 sslvpn 기동 뒤 삭제되고 PUSH_REPLY 에는 inactive 가 없다.
     ④ keepalive 볼륨 표: `KEEPALIVE_SIZE` 1200 · `KEEPALIVE_COUNT` 120 · `KEEPALIVE_INTERVAL` 0.2 → 회차당 약 295 KB · 4시간 약 23.6 MB · 송신 월 약 2 GB, 조정 공식 「회차당 바이트 ≥ 3 × B ÷ (S ÷ 180)」.
        실측 바이트 하한 행은 값 자리에 「실측 대기」 라고 적는다(배포 뒤 secuway-connect 가 남기는 `vendor openvpn option: inactive` 줄로 채운다).
     ⑤ 조회: `journalctl -t secuway-watchdog --since '-1d'` · `journalctl -u securwayssl.service | grep -E 'vendor openvpn option|failing fast|not captured'` ·
        `systemctl show -p NRestarts -p ActiveEnterTimestamp securwayssl.service` · tun1 바이트 카운터(`/sys/class/net/tun1/statistics/{tx,rx}_bytes`).
     ⑥ 배포 규칙: 워치독 단독 교체는 장중 가능(핫 — 다음 타이머 회차부터) · connect·유닛은 평일 20:00 KST 이후, 21:00~21:20 limitup-pull 운반 창 피함 · install.sh 는 파일 교체 + daemon-reload + enable 만 하고 재시작하지 않는다.
  4. 「조작」 코드 블록에 `journalctl -t secuway-watchdog --since '-1d'` 한 줄을 더하고, 재설치 tar 명령 앞에 `COPYFILE_DISABLE=1` 을 붙인다(macOS tar 의 `._*` 부속 파일 방지 — 동작은 동일).
  관찰자 절 3곳(1241 · 1353 · 1407 근처의 「4시간 … 재로그인」)은 문장을 지우지 말고 「(원인: inactive 바이트 하한 — keepalive 볼륨으로 대응 중, §교보 SecuwaySSL VPN → 워치독 · 재접속 동작)」 식 괄호 포인터만 덧붙인다.
  ops/alert-kyobo-observer-down.yaml 은 배포되는 정책 문서라 이 작업에서 바꾸지 않는다.
  커밋 (경로 지정 · 직전 `git status -sb`): README 1개 파일만. 한국어, `Co-Authored-By` 없음, 푸시 0. 제목 예: `docs(quick-261007-b9o): 교보 SecuwaySSL 워치독 디바운스 · fail-fast · 4시간 끊김 원인 문서화`

(B) SUMMARY 를 템플릿 형식으로 쓴다. 담을 것: ① 커밋 3개 해시와 파일 ② 결정 이력 — L-01~L-07 요약과 P-1~P-8 ③ 하지 않은 것 — VM 접촉 0 · 배포 0 · 푸시 0 · install.sh/fetch-secret/타이머 유닛 무변경 ·
ops 알림 문서 무변경 · Linux 전용 부분(`timeout` · `date -d` · `/proc` · iputils ping · systemd)은 로컬 스텁으로 대신함 ④ 실측 대기 — inactive 바이트 하한 값 · keepalive 실제 tun1 증가량 · 밤샘 4시간 무종료.
이어서 제목 `## 대기 — 메인 세션 배포·검증` 절을 만들고 첫 줄에 「상태: 대기(pending) — 실행기 미실행」 을 쓴 뒤, 이 PLAN 의 `<deferred_deploy_runbook>` 내용(전제 · 1~3단계 명령 · 실패 분기 · 롤백)을 명령까지 **그대로** 옮긴다.
마지막으로 Task 1·2 의 `<automated>` 블록을 다시 실행해 최종 상태에서도 통과함을 확인한다. SUMMARY 는 커밋하지 않는다(PLAN·SUMMARY·STATE 커밋은 오케스트레이터 몫).
  </action>
  <verify>
    <automated>
set -e
SEC=$(awk '/^## 교보 SecuwaySSL VPN/{f=1;print;next} f&&/^## /{exit} f' infra/relay/README.md)
for k in '### 워치독 · 재접속 동작 (quick-261007-b9o)' '적용 대기' 'PROBE_TRIES' 'GRACE_SEC' 'RestartSec=10' 'StartLimitBurst=8' 'reset-failed' 'inactive %d %d' 'KEEPALIVE_COUNT' '295' '실측 대기' 'vendor openvpn option' 'journalctl -t secuway-watchdog' '이미 로그인' '20:00' '21:00' 'COPYFILE_DISABLE=1'; do printf '%s\n' "$SEC" | grep -qF -- "$k" || { echo "README 누락: $k"; exit 1; }; done
test "$(grep -c '워치독 · 재접속 동작' infra/relay/README.md)" -ge 4
F=.planning/quick/261007-b9o-secuwayssl-vpn-watchdog-4/261007-b9o-SUMMARY.md
test -f "$F"
grep -qF '## 대기 — 메인 세션 배포·검증' "$F"
grep -qF '대기(pending)' "$F"
for k in 'gcloud compute scp --tunnel-through-iap --zone=asia-northeast3-a' 'systemctl start securwayssl-watchdog.service' 'tx_bytes' 'install.sh' 'RestartUSec' 'vendor openvpn option' 'Inactivity timeout' '/var/backups/secuway-261007' '21:00' 'git show 923eec8f'; do grep -qF -- "$k" "$F" || { echo "SUMMARY 누락: $k"; exit 1; }; done
bash infra/relay/secuway/tests/watchdog.test.sh | tail -1 | grep -qx 'WATCHDOG TESTS ALL OK'
bash infra/relay/secuway/tests/connect.test.sh | tail -1 | grep -qx 'CONNECT TESTS ALL OK'
HASHES=$(git log 923eec8f..HEAD --grep='quick-261007-b9o' --format=%h -- infra/relay)
BODIES=$(git log 923eec8f..HEAD --grep='quick-261007-b9o' --format=%B -- infra/relay)
test "$(printf '%s\n' "$HASHES" | grep -c .)" -ge 3
test -z "$(printf '%s\n' "$BODIES" | grep -i 'co-authored-by' || true)"
SB=$(git status -sb)
printf '%s\n' "$SB" | head -1
echo "TASK3 ALL OK"
    </automated>
    <human-check>`git status -sb` 첫 줄로 푸시가 없었음(ahead 만 늘었음)을 확인한다. 실제 배포·tun1 증가량·inactive 값·밤샘 무종료 확인은 메인 세션이 SUMMARY 대기 런북으로 한다.</human-check>
  </verify>
  <done>README §교보 SecuwaySSL VPN 에 새 절(디바운스 · fail-fast · 재시도 이중 상한 · inactive 바이트 원인 · keepalive 볼륨과 조정 공식 · 조회 · 배포 규칙)이 있고 관찰자 절 3곳이 그 절을 가리킨다. SUMMARY 에 결정 이력 · 하지 않은 것 · 실측 대기 · 「대기 — 메인 세션 배포·검증」 런북 전문이 있다. 두 테스트 재통과, 이 작업 커밋 3개 모두 Co-Authored-By 없음, VM·배포·푸시 0.</done>
</task>

</tasks>

<deferred_deploy_runbook>
**메인 세션 전용 — 실행기는 SUMMARY 로 옮기기만 한다.** 저장소 루트(`/Users/alex/repos/gh-radar`)에서, 사용자 승인 뒤 실행한다.

**전제.** master · Task 1~3 커밋이 HEAD 에 있음. 동시 세션 확인 `git status -sb`. 장 시간 08:00~20:00 KST(NXT 포함). 1단계는 장중 가능, 2단계는 평일 20:00 이후(21:00~21:20 limitup-pull 운반 창 회피).

```bash
# ── 1단계 · 워치독 핫 교체 (장중 가능 — 터널 재시작 없음) ─────────────
# ⓪ 기준선 + 드리프트 확인 (읽기) — VM 의 현재 파일이 저장소 변경 전(923eec8f)과 같아야 한다
for f in secuway-watchdog secuway-connect securwayssl.service; do git show 923eec8f:infra/relay/secuway/$f | shasum -a 256; done
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  sha256sum /usr/local/sbin/secuway-watchdog /usr/local/sbin/secuway-connect /etc/systemd/system/securwayssl.service
  systemctl show -p ActiveState -p SubState -p NRestarts -p ActiveEnterTimestamp -p RestartUSec -p StartLimitBurst securwayssl.service
  systemctl list-timers securwayssl-watchdog.timer --no-pager'
#    해시가 다르면 누군가 VM 에서 직접 고친 것이다 — 멈추고 차이를 먼저 본다.

# ① 백업 + 교체
gcloud compute scp --tunnel-through-iap --zone=asia-northeast3-a \
  infra/relay/secuway/secuway-watchdog radar-gw:/tmp/secuway-watchdog
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  set -e
  bash -n /tmp/secuway-watchdog
  sudo install -d -m 0700 /var/backups/secuway-261007
  sudo cp -p /usr/local/sbin/secuway-watchdog /var/backups/secuway-261007/secuway-watchdog
  sudo install -m 0755 /tmp/secuway-watchdog /usr/local/sbin/secuway-watchdog
  rm -f /tmp/secuway-watchdog'

# ② 즉시 1회 실행으로 확인 — 정상 터널이면 탐침 성공 → keepalive 만, 재시작 없음 (약 25초)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  S=/sys/class/net/tun1/statistics; T0=$(cat $S/tx_bytes); R0=$(cat $S/rx_bytes)
  sudo systemctl start securwayssl-watchdog.service
  echo "tun1 delta tx=$(( $(cat $S/tx_bytes) - T0 )) rx=$(( $(cat $S/rx_bytes) - R0 ))"
  systemctl show -p Result -p ExecMainStatus securwayssl-watchdog.service
  systemctl show -p NRestarts -p ActiveEnterTimestamp securwayssl.service
  journalctl -t secuway-watchdog --since -10min --no-pager'
#    기대: tx·rx 각각 ≥ 140000 · Result=success · ExecMainStatus=0 · NRestarts/ActiveEnterTimestamp 가 ⓪ 과 같음 ·
#          저널은 비었거나 probe 실패/회복 줄만 (「restarting securwayssl」 이 보이면 실패 분기)
curl -s https://dma.jx1.io/healthz | jq '.journalGateways | with_entries(select(.key|startswith("KYOBO")))'

# ── 2단계 · connect + 유닛 (평일 20:00 KST 이후, 21:00~21:20 피함) ─────
TZ=Asia/Seoul date '+%F %H:%M'
# ③ 설치 — install.sh 는 파일 교체 + daemon-reload + enable 만 한다 (재시작 없음)
COPYFILE_DISABLE=1 tar czf - -C infra/relay/secuway . | gcloud compute ssh radar-gw --tunnel-through-iap \
  --zone=asia-northeast3-a --command='set -e
  rm -rf /tmp/sd && mkdir -p /tmp/sd && tar xzf - -C /tmp/sd
  sudo install -d -m 0700 /var/backups/secuway-261007
  sudo cp -p /usr/local/sbin/secuway-connect /etc/systemd/system/securwayssl.service /var/backups/secuway-261007/
  sudo /tmp/sd/install.sh'

# ④ 로드된 값 확인 (읽기) — 기대: RestartUSec=10s · StartLimitBurst=8 · StartLimitIntervalUSec=10min ·
#    ExecStopPost 에 secuway-connect.err · NRestarts/ActiveEnterTimestamp 불변 (재시작 없었음)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  systemctl show -p RestartUSec -p StartLimitBurst -p StartLimitIntervalUSec -p ExecStopPost -p NRestarts -p ActiveEnterTimestamp securwayssl.service'

# ⑤ 통제된 재접속 1회 (권장 · 20:05~20:50 또는 21:30 이후) — 새 connect 로 로그인해 inactive 값을 기록하고 fail-fast 경로를 실증한다.
#    keepalive 로 자연 재접속이 드물어지므로 inactive 값을 얻는 사실상 유일한 기회다.
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  sudo systemctl restart securwayssl.service; sleep 90
  journalctl -u securwayssl.service --since -3min --no-pager | grep -E "vendor openvpn option|not captured|failing fast|Error|tunnel up|did not come up"
  systemctl show -p ActiveState -p NRestarts securwayssl.service
  timeout 3 bash -c "</dev/tcp/10.16.207.119/22" && echo "10.16.207.119:22 open"'
#    기대: 「vendor openvpn option: inactive <S> <B>」 1줄(또는 not captured → ⑥-b) · tunnel up · .119:22 open.
#          「이미 로그인」 → failing fast → 약 10초 뒤 재시도가 보이면 그것도 정상 (StartLimit 8/10분 안)
curl -s https://dma.jx1.io/healthz | jq '.journalGateways | with_entries(select(.key|startswith("KYOBO")))'   # 다시 live

# ⑥ 기록 — <B> 를 README §교보 SecuwaySSL VPN 「실측 대기」 자리에 적는다. 필요한 회차당 바이트 = 3 × B ÷ (S ÷ 180).
#    현재 약 295 KB 보다 크면 KEEPALIVE_COUNT 를 올려 커밋 후 1단계 ①② 로 다시 핫 교체한다.
#    ⑥-b not captured 면 읽기로 대신 찾는다:
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  sudo find /opt/SecurwaySSL -name "client.log*" -exec grep -aHiE "inactiv" {} + | tail -10'

# ── 3단계 · 다음 날 아침 (08:00 KST 전, 읽기만) ─────────────────────
# ⑦ 4시간 종료 소멸 확인 — 기대: ActiveEnterTimestamp 가 ⑤ 이후 그대로(밤새 4시간 넘게 유지) ·
#    새 Inactivity timeout 없음 · 워치독 저널에 restarting 없음
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  systemctl show -p NRestarts -p ActiveEnterTimestamp securwayssl.service
  journalctl -t secuway-watchdog --since -14h --no-pager | tail -30
  sudo find /opt/SecurwaySSL -name "client.log*" -exec grep -aH "Inactivity timeout" {} + | tail -5'

# ⑧ 마무리 — README 새 절의 「적용 대기」 표시를 지우고 커밋. push 는 이 배포가 끝난 뒤에만(push = webapp 배포 · relay 먼저 · push 나중).
#    SUMMARY 대기 절을 「완료」 로 닫는다.
```

**실패 분기.**
- ② 에 「restarting securwayssl」 이 있거나 NRestarts 가 늘었다 → 아래 롤백(워치독만) 후 `journalctl -t secuway-watchdog` 의 probe 줄로 원인 확인.
- ② tun1 증가가 140000 미만이거나 「keepalive ping R/120 replies」 이상 로그 → `command -v ping` · `ping -c 3 10.16.207.119` 로 ICMP 가능 여부 확인. ICMP 가 막혔으면 keepalive 방식을 바꿔야 하므로 사용자에게 보고(이 작업 범위 밖).
- ⑤ 뒤 유닛이 failed(start-limit) → `journalctl -u securwayssl.service -n 80 --no-pager` 로 원인 확인. 원인을 안 뒤에만 `sudo systemctl reset-failed securwayssl.service && sudo systemctl start securwayssl.service`. 그렇지 않으면 워치독이 시간당 1회 회수한다.
- ⑤ 90초 뒤에도 터널이 없다 → 아래 롤백(connect + 유닛) 후 `sudo systemctl restart securwayssl.service` (20:00 이후이므로 허용).

**롤백.**
```bash
# 워치독만 (장중 가능)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo install -m 0755 /var/backups/secuway-261007/secuway-watchdog /usr/local/sbin/secuway-watchdog'
# connect + 유닛 (20:00 이후)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  sudo install -m 0755 /var/backups/secuway-261007/secuway-connect /usr/local/sbin/secuway-connect &&
  sudo install -m 0644 /var/backups/secuway-261007/securwayssl.service /etc/systemd/system/securwayssl.service &&
  sudo systemctl daemon-reload'
```

## Self-Check: PASSED
