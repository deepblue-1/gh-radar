---
phase: quick-261006-pdw
plan: 01
subsystem: infra/relay
tags: [relay, logging, cloud-logging, ops-agent, radar-gw]
status: complete
requires: []
provides:
  - "infra/relay/ops-agent.yaml — Ops Agent 설정 정본 (receiver relay_docker)"
  - "startup.sh §10 install_ops_agent — 메타데이터 키 ops-agent-config 기반 멱등 설치·배치"
  - "deploy-relay.sh 컨테이너 교체 kill → 3초 → rm -f"
affects: [radar-gw VM (적용 대기), Cloud Logging logName relay_docker, KYOBO 알림 문서]
tech-stack:
  added: ["Google Cloud Ops Agent major 2 (VM — 적용 대기)"]
  patterns: ["저장소 정본 → 인스턴스 메타데이터 키 → startup.sh 멱등 배치", "json-file 유지 + 에이전트 tail (드라이버 교체 아님)"]
key-files:
  created:
    - infra/relay/ops-agent.yaml
  modified:
    - infra/relay/startup.sh
    - scripts/setup-relay-iam.sh
    - scripts/deploy-relay.sh
    - infra/relay/README.md
    - relay/README.md
    - docs/relay-operations.md
    - ops/alert-kyobo-observer-down.yaml
decisions:
  - "relay 로그 Cloud Logging 전송은 Ops Agent(files receiver)로 docker json-file 을 tail — gcplogs 드라이버 기각(Cloud Logging 미도달 시 컨테이너 시작 실패 → 자동 재시작이 재시도 안 함 · 줄 전체가 문자열 하나로 가서 severity 소실)"
  - "json-file 유지 — sudo docker logs 불변"
  - "재배포 교체 kill → 3초 → rm -f — 옛 컨테이너 마지막 줄까지 수집"
  - "로깅·메트릭 default_pipeline 끔 — syslog(wg-probe) · 호스트 메트릭 미전송"
  - "설정은 메타데이터 키 ops-agent-config 로 전달, 키 없으면 §10 이 설치·설정 모두 건너뜀(롤백 = 키 삭제)"
metrics:
  duration: "약 20분"
  completed: 2026-10-06
actuals:
  tokens: 8100
  tasks: 3
  commits: 2
plan_head_before: c15c72fc49ada9d1a823350d8e58e5ccc1ed4be9
plan_head_after: f5100e4cbacc268b219ee9cfc53a7a5c1ae4dd68
---

# Quick 261006-pdw: relay 로그 Cloud Logging 전송 Summary

**relay 컨테이너의 docker json-file 을 VM Ops Agent 가 tail 해 Cloud Logging `projects/gh-radar/logs/relay_docker`(30일)로 보내는 저장소 쪽 결선 완료 — `docker logs` 불변, 재배포는 kill → 3초 → rm. VM 적용·실측은 20:00 KST 이후 메인 세션 대기.**

## 커밋

| Task | 커밋 | 내용 | 파일 |
|------|------|------|------|
| 1 (트레이서) | `8f885608` | feat — Ops Agent 설정 · startup §10 · 메타데이터 키 · 재배포 kill→3초→rm | `infra/relay/ops-agent.yaml`(신규) · `infra/relay/startup.sh` · `scripts/setup-relay-iam.sh` · `scripts/deploy-relay.sh` |
| 2 | `f5100e4c` | docs — 조회법 · 결정 기록 · 적용/롤백 런북 | `infra/relay/README.md` · `relay/README.md` · `docs/relay-operations.md` · `ops/alert-kyobo-observer-down.yaml` |
| 3 | (커밋 없음) | 이 SUMMARY — 20:00 KST 이후 적용 런북을 대기 항목으로 기록 | 이 파일 |

두 커밋 모두 한국어 메시지 · `Co-Authored-By` 없음 · 푸시 없음. Task 1·2 `<automated>` 게이트는 최종 상태에서 재실행해 둘 다 `ALL OK`.

## 무엇을 했나

- **`infra/relay/ops-agent.yaml`** — PLAN `<config_spec>` 과 키·값 동일. receiver `relay_docker`(files · `/var/lib/docker/containers/*/*-json.log` · `record_log_file_path` · `wildcard_refresh_interval: 5s`) → `docker_json`(parse_json · time_key/time_format) → `relay_json`(parse_json `jsonPayload.log`) → `relay_severity`(modify_fields `jsonPayload.severity` → `severity`). 로깅·메트릭 `default_pipeline` 은 `receivers: []`. 한국어 주석 ①~⑨(목적·전달 경로·receiver id=logName·5s/경로 라벨 이유·처리 3단·time_format 실측 대기와 대체안·비JSON 줄·기본 파이프라인 끈 이유·디스크 버퍼 장애 격리).
- **`startup.sh` §10 `install_ops_agent`** — 순수 추가(삭제 0). ① 메타데이터 `ops-agent-config` 없으면 WARN 후 설치·설정 모두 건너뜀(이미 설치돼 있어도 손대지 않음) ② 미설치면 `add-google-cloud-ops-agent-repo.sh --also-install --version='2.*.*'`(curl `--max-time 60`, mktemp -d 정리) ③ `cmp -s` 로 내용이 다를 때만 `install -m 0644` + `systemctl restart google-cloud-ops-agent` ④ fluent-bit 하위 유닛 active 확인. 모든 단계 실패는 WARN + `return 1`, 호출은 `install_ops_agent || true` — 부팅을 실패시키지 않음. caddy·wg-probe·openconnect·securwayssl·wg-quick·docker 유닛과 daemon.json 무접촉(게이트 확인).
- **`setup-relay-iam.sh`** — `ops-agent-config=${RELAY_ASSET_DIR}/ops-agent.yaml` 메타데이터 키 1줄 + 주석 3줄, 자산 확인 루프에 `ops-agent.yaml` 추가 · 「VM 자산 9종 확인」. IAM 역할 루프 무변경(`roles/logging.logWriter` 이미 있음).
- **`deploy-relay.sh`** — 원격 본문 컨테이너 교체: `docker inspect` 로 존재하면 `docker kill … || true` → `sleep 3`, 그 뒤 기존 `docker rm -f` 줄 바이트 그대로. `docker run` 인자 불변, 위 주석 블록에 json-file 유지·gcplogs 기각 이유 3줄. 원격 본문은 base64 로 전달되므로 주석의 백틱·따옴표 문제 없음(확인).
- **문서** — infra/relay/README.md 다섯 곳(로그 행 · 메모리 예산 Ops Agent 행 「실측 대기」 + 합계 「Ops Agent 제외」 + 「2026-10-06 Ops Agent 도입」 결정 문단(gcplogs 기각 2이유) · 파일 맵 `ops-agent.yaml` 행 + 패키지 설치 조건 주석 · 새 절 「relay 로그 — Cloud Logging (Ops Agent)」(구조·조회 7개·적용 런북·끄기/롤백) · 장중 금지 이유 6번). relay/README.md §컨테이너 1줄, docs/relay-operations.md 49행, KYOBO 알림 문서 §로그(Cloud Logging 조회 + 「VM 현재 컨테이너」 docker logs 병기, 3,621 B ≤ 9,500).

## 선택한 방식과 이유 (L-01)

**Ops Agent(files receiver)로 json-file 을 tail — docker `gcplogs` 드라이버는 쓰지 않는다.**
1. gcplogs 는 컨테이너 시작 시 Cloud Logging 핑이 실패하면 **컨테이너 시작 자체가 실패**하고, moby 자동 재시작은 시작 실패를 재시도하지 않는다 → GCP 서울 엣지 주기 끊김과 relay 크래시가 겹치면 relay 영구 정지(부팅 때도 동일). 로그 수집 장애가 호가·주문 경로 정지로 번진다.
2. gcplogs 는 줄 전체를 `jsonPayload.message` 문자열로 보내 severity·insertId·serviceContext 가 사라진다(전부 DEFAULT). GCE 에선 gcp-meta-name 도 무시.
3. Ops Agent 는 fluent-bit tail(DB 오프셋·디스크 버퍼)이라 Cloud Logging 이 끊겨도 relay 수명과 무관하고, json-file 이 그대로라 `docker logs` 불변.

## 보존·볼륨

- **보존:** `_Default` 버킷 30일(별도 버킷·싱크 없음).
- **볼륨 추정:** ≤ 하루 20 MB → 월 ≲ 1 GiB — 프로젝트 무료 할당 50 GiB/월 안. syslog·호스트 메트릭은 기본 파이프라인을 꺼서 보내지 않는다.

## severity 매핑 계획

relay 는 stdout 에 GCP 구조화 JSON(`severity`·`message`·`serviceContext`·`timestamp` …)을 찍는다.
`docker_json` 이 docker 래퍼(`log`·`stream`·`time`)를 펼치고 → `relay_json` 이 `jsonPayload.log` 를 펼쳐 relay 필드를 `jsonPayload.*` 로 만들고 →
`relay_severity` 가 `jsonPayload.severity`(INFO·WARNING·ERROR …)를 LogEntry `severity` 로 **move** 한다. Ops Agent 는 맨 `severity` 키를 자동 승격하지 않으므로(자동 키는 `logging.googleapis.com/severity`) 이 단계가 없으면 전부 DEFAULT 다.
비JSON 줄(크래시 스택 stderr)은 `jsonPayload.log` 원문 + `jsonPayload.stream` 으로 남고 DEFAULT — 조회 ⑦ 로 찾는다. 실제 매핑은 런북 ⑤ 에서 실측.

## 비밀 스캔 결과

- 이 작업 diff(`c15c72fc..HEAD`, 8파일) 추가 줄에 키·토큰·비밀 패턴(AKIA·AIza·sk-·PEM 헤더·`password=`·`secret=`·`token=`·`api_key=`·JWT `eyJ`) **0건**. 문서 예시는 `<sha>`·`<컨테이너 ID 앞 12자>`·`<채널 ID>` 자리표시자만 쓴다.
- relay 소스에서 비밀 env(`SECRET`·`SERVICE_ROLE`·`CRED_KEY`·password·token)를 logger 로 찍는 호출 **0건**(grep, 테스트 제외) — Cloud Logging 으로 비밀이 새로 나갈 경로는 확인되지 않음. 단 비밀이 섞인 로그 줄이 생기면 이제 30일 남으므로, 이후 relay 로깅 변경 시 같은 점검을 유지할 것.

## 결정 이력

- **L-01** Ops Agent(files receiver) 2안 채택, gcplogs 1안 기각(위 3이유).
- **L-02** json-file 유지 — daemon.json(§3)·`docker run` 3옵션 무변경.
- **L-03** 재배포 교체 `docker kill` → `sleep 3` → `docker rm -f`(SIGKILL 동일 의미 · 수동 정지라 restart=always 미부활 · 첫 배포 안전).
- **L-04** 설정은 `<config_spec>` 그대로(receiver id `relay_docker` = logName 접미사).
- **L-05** startup.sh 멱등 §10 + 메타데이터 키 `ops-agent-config` · major 2 고정 설치 · 내용 변경 시에만 재기동 · 실패해도 부팅 계속.
- **L-06** 문서 범위 4파일, relay 소스 무변경.
- **L-07** 실행기는 VM·메타데이터·배포 무접촉 — 적용은 20:00 KST 이후 메인 세션.
- **P-1** setup-relay-iam.sh 메타데이터 목록에 키 1줄(IAM 루프 무변경) — VM 재생성·전체 자산 갱신에서 설정이 빠지지 않게.
- **P-2** KYOBO 알림 문서 §로그 교체 — **다음 `deploy-relay.sh` 실행(런북 ⑥) 때 정책 갱신으로 GCP 에 반영**된다(그 전까지 GCP 의 알림 문서는 옛 문장). `ops/alert-relay-down.yaml` 은 바이트 예산 때문에 무변경.

## 하지 않은 것

- VM 접촉 0(ssh 없음) · 인스턴스 메타데이터 변경 0 · 배포 0(`deploy-relay.sh`·`smoke-relay.sh` 미실행) · 푸시 0.
- relay 소스(`relay/src`) 무변경 · `ops/alert-relay-down.yaml` 무변경.
- Ops Agent 설정의 로컬 실검증 불가 — 엔진이 Linux 전용이라 YAML 구조 게이트(ruby)로 대신했다.

## 실측 대기 항목

- `time_format` 의 `%z` 가 docker `Z` 를 받는지(실패 신호: logging-module.log `invalid time format` 또는 timestamp 어긋남 → `time_key`·`time_format` 두 줄 함께 제거).
- 에이전트 메모리(하위 유닛 3종 `MemoryCurrent` 합 → README 메모리 행 「실측 대기」 갱신).
- 새 컨테이너 파일 발견 지연(5s 와일드카드 갱신 기대 ~10초 내).
- 옛 컨테이너 마지막 줄 보존(kill → 3초 → rm).
- README 조회 예시 7개의 형식 문자열(`timestamp.date(tz=Asia/Seoul)` 등) 실제 동작.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 문서 정확성] README 결정 문단의 존재하지 않는 절 참조 수정**
- **Found during:** Task 2
- **Issue:** 결정 문단 초안에 `§GCP 서울 엣지` 라는 README 에 없는 절 포인터를 썼다.
- **Fix:** 실제 절 `§외부 경로 단절 판정 — netcut` 으로 바꿨다.
- **Files modified:** infra/relay/README.md
- **Commit:** f5100e4c

그 밖에는 계획대로 실행. (KYOBO 문서의 Cloud Logging 조회는 플랜 지정 명령 그대로이며, deploy-relay.sh 의 치환은 `${NOTIFICATION_CHANNEL_ID}`·`${UPTIME_CHECK_ID}` 토큰만 sed 하므로 추가 문구와 충돌 없음을 확인.)

## 대기 — 20:00 KST 이후 메인 세션 적용·검증

상태: 대기(pending) — 실행기 미실행

**메인 세션 전용.** 저장소 루트(`/Users/alex/repos/gh-radar`)에서 실행.

**전제.** 평일이면 20:00 KST 이후(장 08:00~20:00, NXT 포함). master · Task 1·2 커밋(`8f885608` · `f5100e4c`)이 HEAD 에 있음. 동시 세션 확인 —
`git log origin/master..HEAD --oneline -- relay/ scripts/deploy-relay.sh` 에 남의 미배포 relay 변경이 섞였으면 ⑥ 은 내 커밋 worktree 에서 배포한다.

```bash
# ⓪ 기준선 (읽기만)
TZ=Asia/Seoul date '+%F %H:%M'          # 20:00 이후인가
git status -sb | head -1
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  sudo docker inspect -f "{{.Id}} {{.State.StartedAt}}" gh-radar-relay
  systemctl show -p Id -p ActiveEnterTimestamp caddy openconnect@kb securwayssl wg-quick@wg0 wg-probe docker
  free -m'

# ① 메타데이터 — 설정 + 새 startup.sh
gcloud compute instances add-metadata radar-gw --zone=asia-northeast3-a --project=gh-radar \
  --metadata-from-file=ops-agent-config=infra/relay/ops-agent.yaml,startup-script=infra/relay/startup.sh

# ② startup.sh 재적용 (장 마감 후에만) — 출력에서 「▶ Ops Agent」 이후 ✓/WARN 확인
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo google_metadata_script_runner startup'

# ③ 에이전트 상태·메모리 + 기존 서비스 재기동 0건 (⓪ 과 대조: relay StartedAt · ActiveEnterTimestamp 불변)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  dpkg-query -W google-cloud-ops-agent
  systemctl is-active google-cloud-ops-agent-fluent-bit google-cloud-ops-agent-opentelemetry-collector google-cloud-ops-agent-diagnostics
  systemctl show -p Id -p MemoryCurrent google-cloud-ops-agent-fluent-bit google-cloud-ops-agent-opentelemetry-collector google-cloud-ops-agent-diagnostics
  free -m
  sudo docker inspect -f "{{.Id}} {{.State.StartedAt}}" gh-radar-relay
  systemctl show -p Id -p ActiveEnterTimestamp caddy openconnect@kb securwayssl wg-quick@wg0 wg-probe docker'

# ④ 생성된 fluent-bit 설정 + 에이전트 로그
#    기대: relay_docker 입력 Path=/var/lib/docker/containers/*/*-json.log · Refresh_Interval 5 · Read_from_Head True
#          /var/log/syslog 입력 0건 · logging-module.log 에 error / invalid time format / skip(긴 줄) 없음
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  sudo grep -n -A12 "relay_docker" /run/google-cloud-ops-agent-fluent-bit/fluent_bit_main.conf | head -40
  sudo grep -c "/var/log/syslog" /run/google-cloud-ops-agent-fluent-bit/fluent_bit_main.conf || true
  sudo grep -iE "error|invalid time format|skip" /var/log/google-cloud-ops-agent/subagents/logging-module.log | tail -20 || true'

# ⑤ Cloud Logging 수신 — severity 가 INFO/WARNING(≠ DEFAULT) · jsonPayload.message 가 "[" 로 시작 ·
#    jsonPayload.serviceContext.version = 현재 relay sha · labels."agent.googleapis.com/log_file_path" 존재 ·
#    timestamp 가 docker 시각과 ms 단위로 일치 (VM: sudo docker logs --timestamps --tail 3 gh-radar-relay)
gcloud logging read 'logName="projects/gh-radar/logs/relay_docker"' --project=gh-radar --freshness=10m --limit=3 --format=json
#    syslog 미전송 확인 (창은 ② 이후 시각으로 잡는다 — 설치 직후 수 초 기본 설정 구간은 허용)
gcloud logging read 'logName="projects/gh-radar/logs/syslog"' --project=gh-radar --freshness=5m --limit=1
#    infra/relay/README.md §relay 로그 — Cloud Logging 의 조회 예시 7개를 그대로 한 번씩 실행해 형식 문자열이 동작하는지 확인

# ⑥ 재배포로 경합 완화 실증 — 옛 컨테이너 ID 앞 12자와 마지막 3줄을 먼저 적어 둔다
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='
  sudo docker inspect -f "{{.Id}}" gh-radar-relay; sudo docker logs --tail 3 gh-radar-relay 2>&1'
GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh   # 지난 relay 배포와 같은 env
gcloud logging read 'logName="projects/gh-radar/logs/relay_docker" AND labels."agent.googleapis.com/log_file_path":"<옛 ID 앞 12자>"' \
  --project=gh-radar --freshness=30m --limit=5 --format='value(timestamp,jsonPayload.message)'
#    기대: 맨 위(최신) 줄들이 kill 직전 적어 둔 3줄과 같다 · 새 컨테이너 줄(새 version)이 ~10초 안에 보인다
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo docker logs --tail 5 gh-radar-relay 2>&1'     # docker logs 불변
bash scripts/smoke-relay.sh                                       # PASS (INV-9 SKIP 은 정상)
#    deploy 출력에서 KYOBO 알림 정책 갱신(P-2 문서 반영) 확인

# ⑦ 마무리 — infra/relay/README.md 메모리 행 「실측 대기」 를 ③ MemoryCurrent 합으로, 로그 행 확인 시각의 「(적용 대기)」 를 지우고 커밋.
#    배포가 끝난 뒤에만 push (relay 먼저 · push 나중). SUMMARY 대기 절을 「완료」 로 닫는다.
```

**실패 분기.**
- ⑤ severity 가 DEFAULT → ④ 생성 설정에 relay_severity(modify_fields) 가 들어갔는지 확인. 줄이 안 오면 ④ logging-module.log 의 권한·경로 오류부터.
- ④ 에 `invalid time format` 이 있거나 ⑤ timestamp 가 docker 시각과 어긋남 → `infra/relay/ops-agent.yaml` 의 `docker_json` 에서 `time_key`·`time_format`
  두 줄을 함께 지우고(Task 1 YAML 게이트의 docker_json 기대값도 같이 고친다) 커밋 → ①② 반복.
- ③ 에이전트 합계 메모리가 300 MB 를 넘거나 `available` 이 1000 MB 밑 → 아래 롤백 후 원인 기록.
- ⑥ 옛 컨테이너 마지막 줄이 빠짐 → deploy-relay.sh 의 대기 3초를 늘리는 대신 원인(파일 발견·읽기 지연)을 logging-module.log 로 먼저 본다.

**롤백 (relay 무영향).**
```bash
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo systemctl disable --now google-cloud-ops-agent'
gcloud compute instances remove-metadata radar-gw --zone=asia-northeast3-a --project=gh-radar --keys=ops-agent-config
```
키가 없으면 startup.sh §10 이 설치·설정을 건너뛰므로 재부팅해도 다시 켜지지 않는다. deploy-relay.sh 의 kill → 3초 → rm 은 남겨도 무해하다.

## Self-Check: PASSED

- FOUND: infra/relay/ops-agent.yaml · infra/relay/startup.sh(§10) · scripts/setup-relay-iam.sh · scripts/deploy-relay.sh · 문서 4파일
- FOUND: 8f885608 · f5100e4c (HEAD 조상)
- Task 1·2 `<automated>` 게이트 최종 상태 재통과(`TASK1 ALL OK` · `TASK2 ALL OK`)
