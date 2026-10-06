---
phase: quick-261006-pdw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — 트레이서: 설정 → 메타데이터 키 → startup 설치 → 재배포 경합 완화 (한 경로 결선)
  - infra/relay/ops-agent.yaml
  - infra/relay/startup.sh
  - scripts/setup-relay-iam.sh
  - scripts/deploy-relay.sh
  # Task 2 — 문서: 결정 기록 · 조회법 · 적용 런북
  - infra/relay/README.md
  - relay/README.md
  - docs/relay-operations.md
  - ops/alert-kyobo-observer-down.yaml
  # Task 3 — 20:00 KST 이후 적용·검증 런북을 SUMMARY 대기 항목으로 기록 (VM 무접촉)
  - .planning/quick/261006-pdw-relay-cloud-logging/261006-pdw-SUMMARY.md
autonomous: true
requirements: [PDW-SHIP, PDW-PERSIST, PDW-REDEPLOY, PDW-DOCS, PDW-APPLY]

estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "relay 컨테이너가 재배포(docker rm)로 지워지거나 json-file 이 로테이션돼도, 그 컨테이너가 남긴 로그 줄은 Cloud Logging logName projects/gh-radar/logs/relay_docker 에서 30일(_Default 버킷) 조회된다 (L-01 · 적용 후 런북 ⑤⑥ 으로 실증)"
    - "`sudo docker logs gh-radar-relay` 는 지금과 똑같이 동작한다 — 로그 드라이버는 json-file 그대로다 (L-02)"
    - "Cloud Logging 의 relay 줄은 severity(INFO·WARNING…)·jsonPayload.message·jsonPayload.serviceContext.version 으로 필터된다 — 줄 전체가 문자열 하나로 뭉개지지 않는다 (L-04)"
    - "Cloud Logging·Google 엣지가 끊겨도 relay 기동·자동 재시작은 영향받지 않는다 — 로그 전송이 컨테이너 수명과 결합되지 않는다 (L-01)"
    - "재배포 때 옛 컨테이너의 마지막 줄까지 Cloud Logging 에 실린다 — 교체가 kill → 3초 → rm 순서다 (L-03)"
    - "VM 재부팅·재생성 뒤에도 에이전트와 설정이 startup.sh §10 + 메타데이터 키 ops-agent-config 로 복원된다 (L-05)"
    - "syslog(wg-probe journald 출력 포함)와 호스트 메트릭은 Cloud Logging/Monitoring 으로 나가지 않는다 (L-04)"
  artifacts:
    - path: infra/relay/ops-agent.yaml
      provides: "Ops Agent 설정 정본 — receiver relay_docker · parse_json 2단 · severity 승격 · 기본 파이프라인 2종 끔"
    - path: infra/relay/startup.sh
      provides: "§10 install_ops_agent — 미설치 시 major 2 설치 · 설정 내용 변경 시에만 에이전트 재기동 · 실패해도 부팅 계속"
    - path: scripts/setup-relay-iam.sh
      provides: "메타데이터 키 ops-agent-config 전송 + 자산 존재 확인 9종"
    - path: scripts/deploy-relay.sh
      provides: "원격 교체 단계 kill → sleep 3 → rm -f (첫 배포 안전)"
    - path: infra/relay/README.md
      provides: "§relay 로그 — Cloud Logging 조회법·적용 런북 · §메모리 예산 결정 문단 · 파일 맵 행"
  key_links:
    - from: scripts/setup-relay-iam.sh
      to: infra/relay/startup.sh
      via: "메타데이터 키 이름 ops-agent-config — 양쪽 문자열이 정확히 같아야 재부팅 시 설정이 배치된다"
      pattern: "ops-agent-config"
    - from: infra/relay/ops-agent.yaml
      to: "VM /var/lib/docker/containers/<id>/<id>-json.log"
      via: "files receiver include_paths 와일드카드 + wildcard_refresh_interval 5s 로 새 컨테이너 파일 발견"
      pattern: "/var/lib/docker/containers/\\*/\\*-json.log"
    - from: scripts/deploy-relay.sh
      to: "Ops Agent fluent-bit tail"
      via: "docker kill 후 3초 대기 → 옛 파일 끝까지 읽힌 뒤 rm -f 가 파일을 지운다"
      pattern: "docker kill \"\\$CONTAINER\""
    - from: infra/relay/README.md
      to: infra/relay/ops-agent.yaml
      via: "조회 예시의 logName 접미사 relay_docker = receiver id"
      pattern: "logs/relay_docker"
---

<objective>
relay 컨테이너 로그를 Cloud Logging 으로 보내, 재배포(`docker rm -f`)·json-file 로테이션과 무관하게 최소 30일 조회되게 한다.
`sudo docker logs gh-radar-relay` 는 그대로 유지한다.

Purpose: 2026-10-06 장중 재배포 2회로 08:00~14:48 KST relay 로그가 컨테이너와 함께 사라졌다. json-file 은 컨테이너 삭제와 함께
지워지므로 사건 사후 분석(저널 끊김·KYOBO 거부·주문 경로)이 재배포 한 번에 증거를 잃는다.

Output: `infra/relay/ops-agent.yaml`(신규) · `startup.sh` §10 · 메타데이터 키 · 재배포 교체 순서 · 문서 4곳 ·
SUMMARY 의 「20:00 KST 이후 적용·검증」 대기 런북. **실행기는 VM 을 건드리지 않는다**(L-07).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@infra/relay/startup.sh
@scripts/deploy-relay.sh

# 큰 파일은 범위만 읽는다 (read_first 참조)
# scripts/setup-relay-iam.sh 120-145 · 335-350 · 168 (IAM — 무변경 확인용)
# infra/relay/README.md 104-120 · 827-870 · 1761-1865
# relay/README.md 149-165 · docs/relay-operations.md 40-55 · ops/alert-kyobo-observer-down.yaml 25-45
</context>

<locked_decisions>
오케스트레이터가 2026-10-06 18:20 KST 실측·소스 확인 후 고정한 결정. 재검토하지 않는다. 태스크는 아래 ID 로 추적한다.

- **L-01 — 2안: Ops Agent(files receiver)가 docker json-file 을 tail 한다. gcplogs 드라이버(1안)는 쓰지 않는다.**
  근거 ① gcplogs `New()` 가 Cloud Logging 핑 실패 시 에러 → 컨테이너 시작 실패. moby `handleContainerExit` 는 자동 재시작의
  `containerStart` 가 실패하면 컨테이너를 정지 상태로 두고 재시도하지 않는다 → 서울 엣지 주기 끊김과 relay 크래시가 겹치면
  relay 가 영구 정지. 부팅 때도 같다. ② gcplogs 는 줄 전체를 `jsonPayload.message` 문자열로 보내 severity·insertId·serviceContext 가
  사라진다(전부 DEFAULT). ③ GCE 에서는 gcp-meta-name 도 무시된다.
- **L-02 — json-file 유지.** `/etc/docker/daemon.json`(startup.sh §3)과 `docker run` 의 `--log-driver=json-file` 3옵션은 바꾸지 않는다.
- **L-03 — 재배포 교체 순서: `docker kill` → `sleep 3` → `docker rm -f`.** kill 기본 신호는 rm -f 와 같은 SIGKILL 이라 relay 종료
  의미가 불변이다. moby kill.go 가 HasBeenManuallyStopped 를 세우므로 `restart=always` 가 되살리지 않는다. 컨테이너가 없을 때(첫 배포)
  안전해야 한다(`|| true` 패턴 유지). SIGTERM 전환(우아한 종료)은 범위 밖이다.
- **L-04 — 설정 설계는 아래 `<config_spec>` 그대로.** receiver id `relay_docker`(= logName 접미사) · 와일드카드 갱신 5s ·
  파일 경로 라벨 · parse_json 2단(docker 줄 → relay JSON) · `jsonPayload.severity` → `severity` 이동 · 로깅/메트릭 default_pipeline 을
  `receivers: []` 로 끈다(syslog 에 실리는 wg-probe 출력 · 호스트 메트릭 비용·메모리).
- **L-05 — 설치 지속성은 기존 인프라 패턴.** startup.sh 에 멱등 섹션을 더하고, 설정은 새 인스턴스 메타데이터 키 `ops-agent-config` 로
  전달한다. 공식 `add-google-cloud-ops-agent-repo.sh --also-install` 로 major 2 고정 설치. 설정 내용이 바뀐 경우에만 에이전트 재기동.
  설치·재기동이 실패해도 나머지 부팅을 실패시키지 않는다(WARN 후 계속). caddy·wg-probe·openconnect·securwayssl 무접촉.
- **L-06 — 문서 범위.** infra/relay/README.md(로그 행 · 메모리 예산 행+결정 문단 · 파일 맵 · 조회 소절) · relay/README.md §컨테이너 1줄 ·
  docs/relay-operations.md 49행. relay 소스(logger) 는 고치지 않는다.
- **L-07 — 실행기는 VM 에 ssh 하지 않고, 메타데이터를 쓰지 않고, 배포하지 않는다.** 18시대 KST 는 장중(~20:00)이다. VM 적용·relay
  재배포·실측은 20:00 KST 이후 **메인 세션**이 `<deferred_apply_runbook>` 으로 한다. 실행기는 그 런북을 SUMMARY 에 대기 항목으로 옮긴다.
- IAM·스코프 변경 없음 — VM SA `gh-radar-relay-sa` 에 `roles/logging.logWriter` 가 이미 있다(setup-relay-iam.sh 168행), 스코프 cloud-platform.

**플래너 재량 (근거 기록):**
- **P-1 — setup-relay-iam.sh 메타데이터 목록에 키 1줄 추가.** "setup-relay-iam.sh 무변경" 은 IAM 에 대한 판단이며, 메타데이터 키는
  wg-probe 와 같은 규율(「키 이름이 어긋나면 재부팅 시 자산 부재 — 양쪽을 함께 고칠 것」)상 여기에 실려야 VM 재생성·전체 자산 갱신에서
  설정이 빠지지 않는다. IAM 루프(168행)는 한 글자도 바꾸지 않는다.
- **P-2 — ops/alert-kyobo-observer-down.yaml §로그 문장 교체.** 같은 「Cloud Logging 부재」 단정이 알림 문서에도 있어, 두면 사실과 어긋난다.
  반영은 다음 `deploy-relay.sh` 실행(런북 ⑥)에서 정책 갱신으로 함께 된다. `ops/alert-relay-down.yaml` 은 바이트 예산(9,500) 때문에
  손대지 않는다 — 그 문서의 `docker logs` 명령은 여전히 유효하다.
</locked_decisions>

<config_spec>
`infra/relay/ops-agent.yaml` 의 **기계적 구조**(키·값이 이와 정확히 같아야 Task 1 게이트가 통과한다). 주석은 Task 1 action 이 요구하는 내용을
한국어로 덧붙인다 — 아래 블록은 구조만이다.

```yaml
logging:
  receivers:
    relay_docker:
      type: files
      include_paths:
        - /var/lib/docker/containers/*/*-json.log
      record_log_file_path: true
      wildcard_refresh_interval: 5s
  processors:
    docker_json:
      type: parse_json
      time_key: time
      time_format: "%Y-%m-%dT%H:%M:%S.%L%z"
    relay_json:
      type: parse_json
      field: jsonPayload.log
    relay_severity:
      type: modify_fields
      fields:
        severity:
          move_from: jsonPayload.severity
  service:
    pipelines:
      default_pipeline:
        receivers: []
      relay:
        receivers: [relay_docker]
        processors: [docker_json, relay_json, relay_severity]
metrics:
  service:
    pipelines:
      default_pipeline:
        receivers: []
```

근거 메모(실행기 참고, 파일에 옮길 필요는 없음):
- docker json-file 한 줄 = `{"log":"<relay JSON>\n","stream":"stdout","time":"2026-10-06T09:17:00.123456789Z"}`.
  files receiver 는 줄을 `jsonPayload.message` 에 담는다 → `docker_json`(기본 field = jsonPayload.message)이 log·stream·time 으로 펼치고
  `time` 을 LogEntry timestamp 로 쓴 뒤 지운다 → `relay_json` 이 `jsonPayload.log` 를 펼친다(원 필드 삭제, relay 의 `message` 가
  `jsonPayload.message` 가 된다) → `relay_severity` 가 맨 `severity` 를 LogEntry severity 로 옮긴다(Ops Agent 는 맨 `severity` 를 자동 승격하지
  않는다 — 자동 승격 키는 `logging.googleapis.com/severity`).
- `field` 는 Ops Agent 소스상 LogEntry 경로이며 기본값이 `jsonPayload.message` 다(맨 이름 `log` 도 legacy 로 `jsonPayload.log` 가 되지만 명시형을 쓴다).
- relay 의 `timestamp` {seconds,nanos} 객체는 jsonPayload 에 남거나 출력 플러그인이 timestamp 로 승격한다 — 어느 쪽이든 docker `time` 과 ms 단위로 같다.
- `time_format` 의 `%z` 가 docker 의 `Z` 를 받는지는 **적용 후 실측 대기**다. 실패 신호: logging-module.log 의 `invalid time format`
  또는 timestamp 가 docker 시각과 어긋남. 대체안: `docker_json` 에서 `time_key`·`time_format` 두 줄을 함께 지운다(두 키는 서로 required_with).
- 비JSON 줄(예: 크래시 스택 stderr)은 `relay_json` 파싱이 실패해 `jsonPayload.log` 원문 + `jsonPayload.stream` 으로 남고 severity 는 DEFAULT 다.
- files receiver 는 fluent-bit tail(Read_from_Head · DB 오프셋 · Rotate_Wait 30 · 디스크 버퍼)이다 — Cloud Logging 이 끊겨도 디스크에
  쌓았다가 보낸다. relay 프로세스와 결합이 없다(L-01 의 핵심).
- logName 은 `projects/gh-radar/logs/relay_docker`, resource 는 `gce_instance`. 경로 라벨 키는 `agent.googleapis.com/log_file_path`.
</config_spec>

<interfaces>
실행기가 저장소를 뒤지지 않도록 손댈 지점의 현재 모양을 적는다(줄 번호는 c15c72fc 기준).

infra/relay/startup.sh
- 28행 `set -euo pipefail`. 33행 `log() { echo "[relay-startup] $*"; }`.
- 36-38행 `md_attr <attr>` — 메타데이터 속성을 stdout 으로, 없으면 비0.
- 41-52행 `install_asset <attr> <dest> <mode>` — 읽고 바로 install(덮어씀). **§10 은 이것을 쓰지 않는다**: 쓰기 전에 기존 파일과 cmp 해야
  하고, 키가 없을 때는 설치 자체를 건너뛰어야 하기 때문이다(기본 설정 = syslog 전송).
- 93-102행 §3 daemon.json(json-file 10m×3) — 무변경(L-02).
- 727-753행 §9 `install_wg_probe` — 함수 + `install_wg_probe || true` 호출, 실패마다 `log "WARN: …"; return 1`. §10 이 따를 형식이다.
- 755-757행 마지막 두 줄 `log "═══ startup.sh 완료 ═══"` · `log "다음: …"`. §10 은 753행(`install_wg_probe || true`)과 755행 사이에 들어간다.

scripts/deploy-relay.sh (원격 본문은 `cat <<'REMOTE_BODY_EOF'` 인용 heredoc 이라 `$CONTAINER` 는 원격에서 전개된다)
- 691행 `# ── 컨테이너 교체 ─…` · 692행 `docker rm -f "$CONTAINER" >/dev/null 2>&1 || true`
- 704-715행 `docker run -d … --log-driver=json-file --log-opt max-size=10m --log-opt max-file=3 …` — 인자 무변경.
- rollback 모드도 같은 REMOTE_BODY 를 쓴다(따로 고칠 곳 없음).

scripts/setup-relay-iam.sh
- 131-141행 `VM_METADATA_FILES="${VM_METADATA_FILES},<key>=${RELAY_ASSET_DIR}/<file>"` 누적. 137-139행이 wg-probe 키 주석 형식.
- 342-349행 `for ASSET in startup.sh … wg-probe.py wg-probe.service; do` 존재 확인 + `echo "✓ VM 자산 8종 확인 (startup-script 포함)"`.
- 168행 `for ROLE in roles/artifactregistry.reader roles/logging.logWriter roles/monitoring.metricWriter; do` — 무변경.

Ops Agent 설치 스크립트(2026-10-06 내려받아 확인): `https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh`,
플래그 `--also-install`, `--version=2.*.*`(major 2 저장소 추가 + 그 범위 최신 설치). 설정 파일 `/etc/google-cloud-ops-agent/config.yaml`,
재기동 `systemctl restart google-cloud-ops-agent`, 하위 유닛 `google-cloud-ops-agent-fluent-bit` · `google-cloud-ops-agent-opentelemetry-collector` ·
`google-cloud-ops-agent-diagnostics`, 생성 설정 `/run/google-cloud-ops-agent-fluent-bit/fluent_bit_main.conf`,
에이전트 로그 `/var/log/google-cloud-ops-agent/subagents/logging-module.log`.
</interfaces>

<tasks>

<task type="tracer">
  <name>Task 1 (트레이서): Ops Agent 설정 → 메타데이터 키 → startup §10 설치 → 재배포 kill·3초·rm — 한 경로 결선</name>
  <files>infra/relay/ops-agent.yaml, infra/relay/startup.sh, scripts/setup-relay-iam.sh, scripts/deploy-relay.sh</files>
  <read_first>
    - infra/relay/startup.sh 1-52 · 91-102 · 706-757 (헤더 규율 · helper · §3 · §9 형식)
    - scripts/deploy-relay.sh 600-720 (원격 본문 · 컨테이너 교체 · docker run)
    - scripts/setup-relay-iam.sh 120-145 · 160-170 · 335-350
    - 이 PLAN 의 `<locked_decisions>` · `<config_spec>` · `<interfaces>`
  </read_first>
  <action>
이 경로가 저장소 쪽 결선의 전부다: 설정 파일(정본) → setup-relay-iam.sh 가 메타데이터로 싣고 → startup.sh §10 이 VM 에 설치·배치하고 →
deploy-relay.sh 가 재배포 때 옛 로그를 끝까지 읽히고 지운다. 진짜 종단 검증(Cloud Logging 수신)은 L-07 에 따라 20:00 이후 런북 몫이며,
이 태스크의 검증은 세 층의 키·경로·순서가 서로 맞는지의 정적 결선 검사다.

(A) `infra/relay/ops-agent.yaml` 신규 (L-04). 구조는 `<config_spec>` 블록과 키·값·순서가 정확히 같게 쓴다. 파일 머리와 각 블록에 한국어
주석을 단다 — ① 목적: 재배포·로테이션과 무관한 30일 보존(2026-10-06 장중 재배포 2회로 08:00~14:48 KST 로그 소실이 계기) ② 전달 경로:
저장소 정본 → 메타데이터 키 `ops-agent-config` → startup.sh §10 → `/etc/google-cloud-ops-agent/config.yaml` (VM 에서 직접 고치지 말 것)
③ receiver id 가 곧 logName(`projects/gh-radar/logs/relay_docker`)이므로 이름을 바꾸면 문서·알림 조회가 전부 깨진다 ④ 5s 갱신 이유(재배포 후
새 컨테이너 파일을 빨리 발견) · 경로 라벨 이유(컨테이너 구분) ⑤ 처리 3단의 의미와 severity 를 옮기는 이유(맨 severity 는 자동 승격되지 않음)
⑥ time_format 은 적용 후 실측 대기이며 대체안(time_key·time_format 두 줄 함께 제거) ⑦ 비JSON 줄은 jsonPayload.log 원문으로 남는다
⑧ 로깅 default_pipeline 을 끈 이유(syslog 에 실리는 wg-probe journald 출력이 매초 전송되는 것 방지) · 메트릭 default_pipeline 을 끈 이유
(로그 전용 범위 — 메모리·비용 최소) ⑨ 디스크 버퍼라 Cloud Logging 장애가 relay 에 번지지 않는다 · gcplogs 를 안 쓰는 이유는 README §메모리 예산.
YAML 안 주석은 `#` 로만 쓴다(값 문자열 안에 넣지 않는다).

(B) `infra/relay/startup.sh` 에 §10 을 **순수 추가**한다 (L-05). 위치는 `install_wg_probe || true` 줄과 `log "═══ startup.sh 완료 ═══"` 줄 사이.
기존 줄은 한 줄도 지우거나 고치지 않는다(헤더 주석 포함 — diff 삭제 0 이 게이트다). 섹션 머리 주석은 §9 처럼 가로줄로 감싸고 첫 제목 줄은
반드시 `# 10. Ops Agent` 로 시작한다(게이트가 이 문자열로 영역을 자른다). 머리 주석 내용: 왜(10-06 로그 소실) · 무엇(json-file tail → relay_docker,
`docker logs` 불변) · 왜 드라이버가 아닌가(한 줄 + README §메모리 예산 포인터) · 이 섹션이 하지 않는 것(caddy·wg-probe·openconnect·securwayssl·
wg-quick·docker 유닛과 daemon.json 을 건드리지 않는다 — 에이전트 재기동은 relay 컨테이너와 무관하다) · 실패해도 부팅을 실패시키지 않는다 ·
장중 재적용 금지는 README §장 마감 후 재부팅 생존 반영 런북과 같다.
함수 `install_ops_agent` 를 만들고 `install_ops_agent || true` 로 부른다. `|| true` 문맥에서는 함수 안의 errexit 가 꺼지므로 **단계마다 실패를
명시적으로 검사**해 `log "WARN: …"` 후 `return 1` 한다. 순서:
  1. 임시 파일에 `md_attr ops-agent-config` 결과를 받는다. 실패하거나 빈 파일이면 WARN("메타데이터 키 없음 — 설치·설정을 건너뛴다,
     setup-relay-iam.sh 또는 add-metadata 필요") 후 return 1. **이때는 설치도 하지 않는다**(기본 설정은 syslog 를 보낸다). 이미 설치돼 있어도
     손대지 않는다(롤백 상태 보존).
  2. `dpkg-query -W -f='${Status}' google-cloud-ops-agent` 결과에 `install ok installed` 가 없으면 설치한다: `mktemp -d` 디렉터리에
     `curl -sSfL --max-time 60` 으로 설치 스크립트를 받고, `bash <그 파일> --also-install --version='2.*.*'` 를 실행한다(버전 인자는 반드시
     작은따옴표로 감싸 glob 전개를 막는다). 다운로드·설치 실패는 WARN 후 return 1. 임시 디렉터리는 성공·실패 모두 지운다.
     설치 직후 패키지가 기본 설정으로 잠깐 기동하는 것은 허용한다 — 바로 다음 단계가 설정을 덮고 재기동한다.
  3. `/etc/google-cloud-ops-agent` 디렉터리를 보장하고, 임시 파일과 `/etc/google-cloud-ops-agent/config.yaml` 을 `cmp -s` 한다. 다를 때만
     `install -m 0644 -o root -g root` 로 덮고 `systemctl restart google-cloud-ops-agent` 한다(실패 시 WARN + `journalctl -u 'google-cloud-ops-agent*'`
     안내). 같으면 「설정 동일 — 재기동하지 않는다」 로그. 임시 파일은 지운다.
  4. `systemctl is-active --quiet google-cloud-ops-agent-fluent-bit` 이면 ✓ 로그(「relay 로그 → Cloud Logging relay_docker」), 아니면 WARN.
섹션 시작에 `log "▶ Ops Agent (relay 로그 → Cloud Logging) 배치..."` 를 둔다.

(C) `scripts/setup-relay-iam.sh` — 메타데이터 키 1줄과 자산 확인만 바꾼다 (P-1). wg-probe 키 두 줄 바로 뒤에 주석 2~3줄(quick-261006-pdw ·
startup.sh §10 이 이 키를 읽는다 · 키 이름이 어긋나면 재부팅 때 에이전트 설정이 조용히 빠진다 — 양쪽을 함께 고칠 것)과
`VM_METADATA_FILES="${VM_METADATA_FILES},ops-agent-config=${RELAY_ASSET_DIR}/ops-agent.yaml"` 를 더한다. 자산 존재 확인 루프 목록에
`ops-agent.yaml` 을 더하고 확인 메시지를 「VM 자산 9종 확인」 으로 바꾼다. IAM 역할 루프(168행)와 그 밖은 건드리지 않는다.

(D) `scripts/deploy-relay.sh` — 원격 본문의 컨테이너 교체를 kill → 3초 → rm 으로 바꾼다 (L-03). **순수 추가**로 한다: 기존 `docker rm -f` 줄은
바이트 그대로 두고, 그 바로 앞에 「컨테이너가 존재하면(`docker inspect "$CONTAINER" >/dev/null 2>&1`) `docker kill "$CONTAINER" >/dev/null 2>&1 || true`
후 `sleep 3`」 블록을 넣는다. 첫 배포(컨테이너 없음)는 대기 없이 지나간다. 블록 위 주석: rm -f 는 json 로그 파일을 즉시 지우므로 Ops Agent 가
옛 파일 끝을 읽을 시간을 준다 · kill 기본 신호는 rm -f 와 같은 SIGKILL 이라 relay 종료 의미 불변 · kill 은 수동 정지로 표시돼 restart=always 가
되살리지 않는다 · 대가는 교체 중단 +3초. 그리고 `docker run` 위 기존 주석 블록 끝에 「로그 드라이버는 json-file 유지 — `docker logs` 와 Ops Agent tail
의 공통 원천. gcplogs 는 Cloud Logging 장애가 컨테이너 기동 실패로 번져 쓰지 않는다(infra/relay/README.md §메모리 예산)」 주석 줄을 더한다.
`docker run` 인자는 바꾸지 않는다.

커밋 (경로 지정 스테이징 — `git add -A`/`git add .` 금지, 동시 세션이 있으니 커밋 직전 `git status -sb` 로 남의 변경이 섞이지 않았는지 본다):
4개 파일만, 메시지 한국어 · `Co-Authored-By` 줄 없음 · 푸시하지 않는다.
제목 예: `feat(quick-261006-pdw): relay 로그 Cloud Logging 전송 — Ops Agent 설정 · startup §10 · 재배포 kill→3초→rm`
  </action>
  <verify>
    <automated>
set -e
bash -n infra/relay/startup.sh && bash -n scripts/deploy-relay.sh && bash -n scripts/setup-relay-iam.sh && echo "bash -n OK"
ruby -ryaml -e '
c = YAML.load_file("infra/relay/ops-agent.yaml")
l = c.fetch("logging"); r = l.fetch("receivers").fetch("relay_docker")
abort "receiver type" unless r["type"] == "files"
abort "include_paths" unless r["include_paths"] == ["/var/lib/docker/containers/*/*-json.log"]
abort "record_log_file_path" unless r["record_log_file_path"] == true
abort "wildcard_refresh_interval" unless r["wildcard_refresh_interval"] == "5s"
pr = l.fetch("processors")
abort "docker_json" unless pr["docker_json"] == {"type"=>"parse_json","time_key"=>"time","time_format"=>"%Y-%m-%dT%H:%M:%S.%L%z"}
abort "relay_json" unless pr["relay_json"] == {"type"=>"parse_json","field"=>"jsonPayload.log"}
abort "relay_severity" unless pr["relay_severity"] == {"type"=>"modify_fields","fields"=>{"severity"=>{"move_from"=>"jsonPayload.severity"}}}
pl = l.fetch("service").fetch("pipelines")
abort "logging default_pipeline" unless pl["default_pipeline"] == {"receivers"=>[]}
abort "relay pipeline" unless pl["relay"] == {"receivers"=>["relay_docker"],"processors"=>["docker_json","relay_json","relay_severity"]}
abort "pipelines count" unless pl.keys.sort == ["default_pipeline","relay"]
abort "metrics default_pipeline" unless c.dig("metrics","service","pipelines","default_pipeline") == {"receivers"=>[]}
puts "ops-agent.yaml OK"'
grep -Eq 'md_attr "?ops-agent-config"?' infra/relay/startup.sh
grep -qF 'ops-agent-config=${RELAY_ASSET_DIR}/ops-agent.yaml' scripts/setup-relay-iam.sh
sed -n '/for ASSET in/,/; do/p' scripts/setup-relay-iam.sh | grep -q 'ops-agent.yaml'
grep -qF 'for ROLE in roles/artifactregistry.reader roles/logging.logWriter roles/monitoring.metricWriter; do' scripts/setup-relay-iam.sh
echo "metadata key wiring OK"
grep -Eq -- "--version=['\"]?2\.\*\.\*" infra/relay/startup.sh
grep -qF 'add-google-cloud-ops-agent-repo.sh' infra/relay/startup.sh
grep -qF 'install_ops_agent || true' infra/relay/startup.sh
REG=$(awk '/^# 10\. Ops Agent/,/startup\.sh 완료/' infra/relay/startup.sh)
test "$(printf '%s\n' "$REG" | grep -c .)" -ge 20
test -z "$(printf '%s\n' "$REG" | grep -v '^[[:space:]]*#' | grep -E 'systemctl[^#]*(caddy|wg-probe|openconnect|securwayssl|wg-quick|docker)' || true)"
grep -qF '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' infra/relay/startup.sh
echo "startup §10 OK"
K=$(grep -n 'docker kill "\$CONTAINER"' scripts/deploy-relay.sh | head -1 | cut -d: -f1)
R=$(grep -n 'docker rm -f "\$CONTAINER"' scripts/deploy-relay.sh | head -1 | cut -d: -f1)
test -n "$K" && test -n "$R" && test "$K" -lt "$R"
test "$(awk -v k="$K" -v r="$R" 'NR>k && NR<r && /sleep 3/' scripts/deploy-relay.sh | grep -c .)" -ge 1
test "$(grep -c 'docker rm -f "\$CONTAINER" >/dev/null 2>&1 || true' scripts/deploy-relay.sh)" = 1
test "$(grep -c -- '--log-driver=json-file' scripts/deploy-relay.sh)" = 1
echo "redeploy order OK"
NS_STARTUP=$(git diff --numstat c15c72fc -- infra/relay/startup.sh)
NS_DEPLOY=$(git diff --numstat c15c72fc -- scripts/deploy-relay.sh)
NS_IAM=$(git diff --numstat c15c72fc -- scripts/setup-relay-iam.sh)
test "$(printf '%s\n' "$NS_STARTUP" | awk '{print $2}')" = 0
test "$(printf '%s\n' "$NS_DEPLOY" | awk '{print $2}')" = 0
test "$(printf '%s\n' "$NS_IAM" | awk '{print $2}')" -le 2
git diff --quiet c15c72fc -- relay/src
echo "TASK1 ALL OK"
    </automated>
    <human-check>없음 — 전부 기계 게이트다. 실제 수신(Cloud Logging)·에이전트 메모리·time_format 실측은 L-07 에 따라 `<deferred_apply_runbook>` ③~⑥ 에서 메인 세션이 한다.</human-check>
  </verify>
  <done>ops-agent.yaml 이 config_spec 과 구조가 같고, startup.sh 는 §10 만 순수 추가(삭제 0)되어 메타데이터 키 `ops-agent-config` 를 읽고 major 2 고정 설치·cmp 후에만 재기동하며 다른 유닛을 건드리지 않는다. setup-relay-iam.sh 가 같은 키로 파일을 싣고 9종을 확인하며 IAM 루프는 그대로다. deploy-relay.sh 는 kill → sleep 3 → 기존 rm -f 순서이고 docker run 인자는 불변이다. bash -n 3종 통과, 커밋 1개(4파일, 한국어, Co-Authored-By 없음), 푸시 0.</done>
</task>

<task type="auto">
  <name>Task 2: 문서 — 2026-10-06 결정 기록 · Cloud Logging 조회법 · 적용 런북 (README · relay README · 운영 문서 · KYOBO 알림 문서)</name>
  <files>infra/relay/README.md, relay/README.md, docs/relay-operations.md, ops/alert-kyobo-observer-down.yaml</files>
  <read_first>
    - infra/relay/README.md 104-120 (relay 컨테이너 표의 로그 행) · 827-870 (장 마감 후 재적용 런북 · 장중 금지 이유 목록) · 1759-1865 (자산 갱신 절차 · 메모리 예산 · 파일 맵)
    - relay/README.md 149-165 · docs/relay-operations.md 40-55 · ops/alert-kyobo-observer-down.yaml 1-60
    - Task 1 결과물 infra/relay/ops-agent.yaml (receiver id · 라벨 키 · 처리 단계 이름을 문서와 일치시킨다)
  </read_first>
  <action>
L-06 범위의 문서를 Task 1 결과와 일치시킨다. 모든 조회 예시는 `--project=gh-radar` 를 붙이고, logName 은
`projects/gh-radar/logs/relay_docker` 로 정확히 쓴다. 시각은 VM·docker 가 UTC 임을 의식해 KST 오프셋(`+09:00`)을 명시한다.
`docker logs` 예시는 지우지 않는다 — 실시간·현재 컨테이너용으로 계속 유효하다.

(1) infra/relay/README.md — 다섯 곳.
  a. §relay 컨테이너(15-08 배포) 표의 「로그」 행: 값 끝의 괄호 안 미설치 메모를 지우고 「2026-10-06 부터 VM Ops Agent 가 같은 파일을 tail 해
     Cloud Logging `relay_docker` 로 보낸다(30일) — §relay 로그 — Cloud Logging」 으로 바꾸며, 확인 시각 칸은 `2026-09-06 · 2026-10-06(적용 대기)` 로 쓴다.
  b. §메모리 예산 표에 행 `Ops Agent (fluent-bit · otelcol · diagnostics)` | `실측 대기 — 20:00 KST 이후 설치 시 MemoryCurrent 로 기입 (설계 추정 +150–250 MB)` 를
     wg-probe 행 아래에 더하고, 합계 행에는 「Ops Agent 제외」 를 덧붙인다. 표 바로 아래의 기존 미설치 결정 문단(두 줄)을 **날짜 박은 결정 문단**으로
     교체한다: 제목 굵게 「2026-10-06 Ops Agent 도입」 · 계기(그날 장중 재배포 2회로 08:00~14:48 KST relay 로그 소실 — json-file 은 컨테이너와 함께 지워진다) ·
     Phase 15 의 거절 근거였던 메모리는 e2-small 전환(여유 1350–1640 MB)으로 해소 · 왜 gcplogs 드라이버가 아닌가 두 이유(L-01 ①②를 운영자 말로:
     Cloud Logging 에 닿지 못하면 컨테이너 시작이 실패하고 자동 재시작은 시작 실패를 재시도하지 않아 엣지 끊김과 크래시가 겹치면 relay 가 영구 정지 /
     줄 전체가 문자열 하나로 가서 severity·insertId·serviceContext 소실) · json-file 과 uptime check 는 그대로 유지. 「gcplogs」 라는 단어를 문단에 쓴다.
  c. §파일 맵 표: `wg-probe.service` 행 아래에 `ops-agent.yaml` | `/etc/google-cloud-ops-agent/config.yaml` (메타데이터 `ops-agent-config`) | `0644` 행을 더한다.
     패키지 자체(`google-cloud-ops-agent`, major 2)는 startup.sh §10 이 없을 때만 설치한다는 한 줄을 표 아래 주석 블록에 덧붙인다.
  d. 새 절 `## relay 로그 — Cloud Logging (Ops Agent)` 를 `## 자산 갱신 절차` 바로 앞(앞의 `---` 구분선 다음)에 둔다. 소절:
     - **구조** — relay stdout(GCP 구조화 JSON) → docker json-file(`docker logs` 원천) → Ops Agent tail → Cloud Logging `relay_docker`(resource `gce_instance`).
       재배포 교체가 kill → 3초 → rm 인 이유 한 문단. 보존 `_Default` 30일 · 볼륨 추정 ≤ 하루 20 MB → 월 ≲1 GiB(무료 50 GiB).
     - **조회** — `gcloud logging read` 예시 7개: ① 최근 30분 전체(`--freshness=30m --order=asc` + KST 표기 `--format='value(timestamp.date(tz=Asia/Seoul),severity,jsonPayload.message)'`)
       ② `severity>=WARNING` 최근 1일 ③ 텍스트 `jsonPayload.message:"[JOURNAL]"`(`:` 는 대소문자 무시라 `[journal]` 도 잡힌다 — 구분하려면 `=~ "\\[JOURNAL\\]"`)
       ④ KST 시각 창 `timestamp>="2026-10-06T08:00:00+09:00" AND timestamp<"2026-10-06T09:00:00+09:00"` ⑤ 특정 배포·과거 컨테이너 —
       `jsonPayload.serviceContext.version="<sha>"` 또는 `labels."agent.googleapis.com/log_file_path":"<컨테이너 ID 앞 12자>"`, 그리고 경로 목록 뽑기
       (`--format='value(labels."agent.googleapis.com/log_file_path")' | sort | uniq -c`) ⑥ KYOBO 관찰자 `jsonPayload.gateway="KYOBO"`
       ⑦ 비JSON 줄(크래시 스택 등) `jsonPayload.log:*` 또는 `jsonPayload.stream="stderr"`. `--format=json` 으로 전체 필드를 보는 팁 한 줄.
       실시간·현재 컨테이너는 기존대로 `sudo docker logs -f --since 10m gh-radar-relay`. 형식 문자열은 적용 직후 런북에서 실행 확인한다는 메모.
     - **적용·갱신 런북** — 저장소 루트에서 ① `gcloud compute instances add-metadata radar-gw --zone=asia-northeast3-a --project=gh-radar --metadata-from-file=ops-agent-config=infra/relay/ops-agent.yaml,startup-script=infra/relay/startup.sh`
       (메타데이터만 — 장중 안전. `setup-relay-iam.sh` 전체 재실행도 같은 키를 싣는다) ② 장 마감(20:00 KST) 이후에만 기존과 같은
       `gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command='sudo google_metadata_script_runner startup'`
       ③ 확인(읽기만): 하위 유닛 3종 `systemctl is-active` · `systemctl show -p MemoryCurrent` · `/run/google-cloud-ops-agent-fluent-bit/fluent_bit_main.conf` 에
       relay_docker 입력이 있고 `/var/log/syslog` 입력이 없음 · logging-module.log 에 오류 없음 · 위 조회 ① 에 줄이 나오고 severity 가 DEFAULT 가 아님.
       ops-agent.yaml 만 바꾼 경우에도 ①② 가 같다(§10 이 내용이 다를 때만 에이전트를 재기동하며 relay 컨테이너는 건드리지 않는다).
     - **끄기·롤백** — `sudo systemctl disable --now google-cloud-ops-agent` + `gcloud compute instances remove-metadata radar-gw --zone=asia-northeast3-a --keys=ops-agent-config`
       (키가 없으면 §10 이 설치·설정을 건너뛰므로 재부팅해도 다시 켜지지 않는다). relay 는 영향 없음. 재배포의 kill→3초→rm 은 그대로 둬도 무해.
  e. §장 마감 후 재부팅 생존 반영 런북의 「② 가 장중 금지인 이유」 번호 목록 끝에 한 항목 추가: §10 Ops Agent — 미설치면 apt 저장소 추가·설치(첫 회만),
     설정이 바뀌었으면 에이전트 재기동(relay 컨테이너 무관). 기존 항목은 고치지 않는다.

(2) relay/README.md §컨테이너 bullet 목록에 한 줄: 로그는 stdout GCP 구조화 JSON → VM 에서 `sudo docker logs gh-radar-relay`(현재 컨테이너) +
    Cloud Logging `relay_docker`(30일, 재배포 후에도 유지) — 조회법은 infra/relay/README.md §relay 로그 — Cloud Logging.

(3) docs/relay-operations.md 49행 — Cloud Logging 부재를 단정한 기존 문장을 바꾼다: relay 로그는 Cloud Logging `relay_docker` 에 30일 남는다(재배포에도 유지) —
    `gcloud logging read 'logName="projects/gh-radar/logs/relay_docker" AND jsonPayload.message:"[JOURNAL]"' --project=gh-radar --freshness=1h --format='value(timestamp,jsonPayload.message)'`
    (`:` 는 대소문자 무시라 `[journal]` 도 함께 잡힌다) · VM 에서 실시간은 기존 `sudo docker logs …` 명령을 그대로 남긴다. 그 다음 줄의 `[JOURNAL]`/`[journal]` 설명은 유지.

(4) ops/alert-kyobo-observer-down.yaml §로그 (P-2) — Cloud Logging 부재를 단정한 문장을 「relay 로그는 Cloud Logging `relay_docker` 에 30일 남는다」 와
    `gcloud logging read 'logName="projects/gh-radar/logs/relay_docker" AND jsonPayload.gateway="KYOBO"' --project=gh-radar --freshness=30m --format='value(timestamp,severity,jsonPayload.message)'`
    코드 블록으로 바꾸고, 기존 `docker logs` 코드 블록은 「VM 현재 컨테이너」 라는 짧은 설명과 함께 남긴다. YAML 블록 스칼라 들여쓰기를 기존과 맞춘다.
    documentation content 는 9,500 바이트 이하를 지킨다(GCP 상한 10,240). 이 문서는 다음 deploy-relay.sh 실행 때 정책 갱신으로 반영된다는 점을 SUMMARY 에 적는다.

커밋: 4개 파일만 경로 지정 스테이징, 한국어 메시지, `Co-Authored-By` 없음, 푸시하지 않는다.
제목 예: `docs(quick-261006-pdw): relay 로그 Cloud Logging 조회·결정 기록 — README·운영 문서·KYOBO 알림 문서`
  </action>
  <verify>
    <automated>
set -e
test -z "$(grep -n 'Cloud Logging 에 없' docs/relay-operations.md ops/alert-kyobo-observer-down.yaml infra/relay/README.md relay/README.md || true)"
test -z "$(grep -n -E 'Ops Agent 는 설치하지 않는다|Ops Agent 미설치' infra/relay/README.md || true)"
test "$(grep -c 'projects/gh-radar/logs/relay_docker' infra/relay/README.md)" -ge 4
grep -q '^## relay 로그 — Cloud Logging (Ops Agent)' infra/relay/README.md
awk '/^## relay 로그 — Cloud Logging/{a=NR} /^## 자산 갱신 절차/{b=NR} END{exit !(a>0 && b>a)}' infra/relay/README.md
grep -qF 'ops-agent-config=infra/relay/ops-agent.yaml,startup-script=infra/relay/startup.sh' infra/relay/README.md
grep -qF 'remove-metadata radar-gw' infra/relay/README.md
grep -qF '/etc/google-cloud-ops-agent/config.yaml' infra/relay/README.md
grep -q '| `ops-agent.yaml`' infra/relay/README.md
grep -q 'gcplogs' infra/relay/README.md
grep -q '실측 대기' infra/relay/README.md
grep -qF 'agent.googleapis.com/log_file_path' infra/relay/README.md
grep -qF 'jsonPayload.gateway="KYOBO"' infra/relay/README.md
grep -qF '+09:00' infra/relay/README.md
grep -q 'docker logs' infra/relay/README.md
for f in relay/README.md docs/relay-operations.md ops/alert-kyobo-observer-down.yaml; do grep -q 'relay_docker' "$f" || { echo "relay_docker 누락: $f"; exit 1; }; grep -q 'docker logs' "$f" || { echo "docker logs 누락: $f"; exit 1; }; done
ruby -ryaml -e 'n=YAML.load_file("ops/alert-kyobo-observer-down.yaml")["documentation"]["content"].bytesize; abort("kyobo doc #{n}B > 9500") if n>9500; puts "kyobo doc #{n}B"'
git diff --quiet c15c72fc -- ops/alert-relay-down.yaml relay/src
echo "TASK2 ALL OK"
    </automated>
    <human-check>사용자가 infra/relay/README.md 새 절만 읽고 ① 지난 재배포 이전 시각의 relay 로그를 찾는 법 ② 끄는 법 ③ 왜 드라이버가 아닌 에이전트인지를 알 수 있는지 확인한다. 조회 예시 형식 문자열의 실제 동작은 런북 ⑤ 에서 확인된다.</human-check>
  </verify>
  <done>README 다섯 곳(로그 행 · 메모리 행+결정 문단 · 파일 맵 · 새 절 · 장중 금지 이유 항목)이 갱신되고 미설치·부재 단정 문장이 0건이다. relay/README·운영 문서·KYOBO 알림 문서가 Cloud Logging 조회와 docker logs 를 함께 안내하며, KYOBO 문서는 9,500 바이트 이하다. alert-relay-down.yaml 과 relay 소스는 불변. 커밋 1개(4파일, 한국어, Co-Authored-By 없음), 푸시 0.</done>
</task>

<task type="auto">
  <name>Task 3: 20:00 KST 이후 적용·검증 런북을 SUMMARY 대기 항목으로 기록 — 실행기는 VM 무접촉 (L-07)</name>
  <files>.planning/quick/261006-pdw-relay-cloud-logging/261006-pdw-SUMMARY.md</files>
  <read_first>
    - 이 PLAN 의 `<deferred_apply_runbook>` 전체
    - Task 1·2 의 커밋 해시 (`git log c15c72fc..HEAD --grep='quick-261006-pdw' --oneline`)
  </read_first>
  <action>
**이 태스크에서 실행기는 `gcloud compute ssh` · `add-metadata` · `remove-metadata` · `deploy-relay.sh` · `smoke-relay.sh` 를 하나도 실행하지 않는다.**
런북은 메인 세션이 20:00 KST 이후에 돈다(L-07 · 사용자 메모리 「서브에이전트 배포는 분류기 차단 — executor 는 커밋까지만」).

1. Task 1·2 의 `<automated>` 블록을 그대로 다시 실행해 최종 상태에서 둘 다 통과함을 확인한다(뒤 편집이 앞 게이트를 무효로 만들지 않았는지).
2. SUMMARY 를 쓴다(템플릿 형식). 담을 것: ① 커밋 2개 해시와 파일 ② 결정 이력 — L-01~L-07 요약과 플래너 재량 P-1(setup-relay-iam.sh 메타데이터 키) ·
   P-2(KYOBO 알림 문서 — 다음 deploy-relay.sh 에서 정책 갱신으로 반영) ③ 하지 않은 것 — VM 접촉 0 · 메타데이터 변경 0 · 배포 0 · 푸시 0 ·
   relay 소스 무변경 · alert-relay-down.yaml 무변경 · Ops Agent 설정의 로컬 실검증 불가(엔진은 Linux 전용 — YAML 구조 게이트로 대신)
   ④ 실측 대기 항목 — time_format(`%z` ↔ docker `Z`) · 에이전트 메모리 · 새 컨테이너 파일 발견 지연 · 옛 컨테이너 마지막 줄 보존 · 조회 예시 형식 문자열.
3. SUMMARY 에 제목 `## 대기 — 20:00 KST 이후 메인 세션 적용·검증` 절을 만들고 이 PLAN 의 `<deferred_apply_runbook>` 내용(전제 · ⓪~⑧ · 실패 분기 · 롤백)을
   명령까지 **그대로** 옮긴다. 절 첫 줄에 「상태: 대기(pending) — 실행기 미실행」 을 쓴다.
4. SUMMARY 는 커밋하지 않는다(PLAN·SUMMARY·STATE 커밋은 오케스트레이터 몫). 푸시하지 않는다.
  </action>
  <verify>
    <automated>
set -e
F=.planning/quick/261006-pdw-relay-cloud-logging/261006-pdw-SUMMARY.md
test -f "$F"
grep -qF '## 대기 — 20:00 KST 이후 메인 세션 적용·검증' "$F"
grep -qF '대기(pending)' "$F"
for k in 'add-metadata radar-gw' 'google_metadata_script_runner startup' 'fluent_bit_main.conf' 'logging-module.log' 'logs/relay_docker' 'agent.googleapis.com/log_file_path' 'deploy-relay.sh' 'smoke-relay.sh' 'remove-metadata' 'MemoryCurrent' 'invalid time format'; do grep -qF "$k" "$F" || { echo "SUMMARY 누락: $k"; exit 1; }; done
HASHES=$(git log c15c72fc..HEAD --grep='quick-261006-pdw' --format=%h)
BODIES=$(git log c15c72fc..HEAD --grep='quick-261006-pdw' --format=%B)
SB=$(git status -sb)
test "$(printf '%s\n' "$HASHES" | grep -c .)" -ge 2
test -z "$(printf '%s\n' "$BODIES" | grep -i 'co-authored-by' || true)"
printf '%s\n' "$SB" | head -1
echo "TASK3 ALL OK"
    </automated>
    <human-check>`git status -sb` 첫 줄로 푸시가 없었음(ahead 수만 늘었음)을 확인한다. 런북 실행 결과(③ 메모리 · ⑤ 수신 · ⑥ 옛 컨테이너 줄 보존 · smoke PASS)는 메인 세션이 20:00 KST 이후 확인하고 README 메모리 행 「실측 대기」 를 실측값으로 바꾼다.</human-check>
  </verify>
  <done>Task 1·2 게이트가 최종 상태에서 재통과하고, SUMMARY 에 결정 이력 · 하지 않은 것 · 실측 대기 항목과 「대기 — 20:00 KST 이후 메인 세션 적용·검증」 런북 전문이 있다. 이 작업 커밋 2개 모두 Co-Authored-By 없음, VM·메타데이터·배포·푸시 0.</done>
</task>

</tasks>

<deferred_apply_runbook>
**메인 세션 전용 — 실행기는 SUMMARY 로 옮기기만 한다.** 저장소 루트(`/Users/alex/repos/gh-radar`)에서 실행.

**전제.** 평일이면 20:00 KST 이후(장 08:00~20:00, NXT 포함). master · Task 1·2 커밋이 HEAD 에 있음. 동시 세션 확인 —
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
</deferred_apply_runbook>

<verification>
- Task 1·2·3 의 `<automated>` 블록이 최종 상태에서 모두 `… ALL OK` 로 끝난다.
- `git log c15c72fc..HEAD --grep='quick-261006-pdw' --stat` 에 커밋 2개, 파일 8개(ops-agent.yaml · startup.sh · setup-relay-iam.sh · deploy-relay.sh · README 3 · KYOBO 알림 문서)만 보인다.
- VM·메타데이터·Cloud 리소스 변경 0, 푸시 0 — 종단 실증은 `<deferred_apply_runbook>` 로 이관(SUMMARY 대기 절).
</verification>

<success_criteria>
- 저장소 쪽 결선 완료: 설정 정본 → 메타데이터 키 → startup §10 → 재배포 kill·3초·rm 이 키 이름·경로·순서까지 서로 맞는다(정적 게이트).
- 문서가 결정(2026-10-06 · gcplogs 기각 근거)과 조회법(logName `relay_docker`, KST 창, 컨테이너·배포별 필터)과 적용·롤백 런북을 담는다.
- `docker logs` 경로는 코드·문서 양쪽에서 그대로다.
- 20:00 KST 이후 메인 세션이 SUMMARY 대기 런북만으로 적용·실증·롤백을 할 수 있다.
</success_criteria>

<output>
`.planning/quick/261006-pdw-relay-cloud-logging/261006-pdw-SUMMARY.md` 를 쓴다(커밋은 오케스트레이터). 「대기 — 20:00 KST 이후 메인 세션 적용·검증」 절 포함.
</output>
