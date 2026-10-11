---
phase: quick-260929-sar
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/deploy-relay.sh
  - ops/alert-relay-down.yaml
  - ops/alert-kyobo-observer-down.yaml
  - scripts/smoke-relay.sh
  - infra/relay/README.md
  - docs/relay-operations.md
autonomous: false
requirements: [SAR-ALERT, SAR-OPS, SAR-LIVE]

estimate:
  tokens: 75000
  raw_tokens: 75000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "공개 /healthz 본문에 journalGateways.KYOBO 키가 있으면, deploy-relay.sh 가 uptime check gh-radar-kyobo-observer-healthz 를 만들거나 갱신한다. 이 체크는 https 443 /healthz · 1분 주기 · timeout 10 · validate-ssl · 상태 2xx,5xx 수용 · JSONPath $.journalGateways.KYOBO.alerting exact-match false 다. 알림 정책 gh-radar-kyobo-observer-down 도 만들거나 갱신한다. 정책은 ops/alert-kyobo-observer-down.yaml 이고 두 조건 모두 KYOBO 체크의 check_id 로 한정된다 (SAR-ALERT · SAR-OPS)"
    - "본문에 키가 없으면(KYOBO 꺼짐 · 롤백으로 옛 이미지) KYOBO 정책을 먼저, 체크를 다음에 --quiet 로 지운다. 키가 없을 때는 절대 만들지 않는다. healthz 판정 불가(무응답 · 502 · 비JSON)면 KYOBO 감시에 손대지 않고 ⚠ 한 줄만 남긴다 (SAR-OPS)"
    - "KB 알림 gh-radar-relay-down 의 의미는 바뀌지 않는다. 두 조건 필터에 metric.label.check_id = KB 체크 ID 한 줄만 더해, 같은 host(dma.jx1.io)의 KYOBO 체크 실패가 KB 평균·싱가포르 조건에 섞이지 않게 한다. 임계값 · 창 · combiner · 채널 · documentation(9,039 B)은 BASE 와 같다. KB 정책 적용(check_id 치환 성공)이 같은 실행에서 KYOBO 체크 생성보다 반드시 먼저다 (SAR-ALERT)"
    - "치환 토큰(${UPTIME_CHECK_ID} · ${NOTIFICATION_CHANNEL_ID})이 하나라도 남거나 체크 ID 를 못 구하면 그 정책은 적용하지 않는다. 필터가 아무것도 못 잡는 조용히 죽은 KB 알림을 만들지 않기 위해서다. --alert-only 에서 KB 정책을 적용하지 못하면 비0 으로 끝나고, KYOBO 체크도 만들지 않는다 (SAR-OPS)"
    - "KYOBO 감시 동기화는 전체 배포(Section 6)에서 비치명이다. 실패해도 최종 요약까지 가고, 요약에 「KYOBO 감시: <결과>」 한 줄이 찍힌다. --alert-only 에서는 실패하면 「KYOBO 감시 실패」를 출력하고 비0 으로 끝난다. --rollback 도 같은 동기화를 한다. 단 rollback 은 KB 정책을 적용하지 않으므로 생성은 보류하고 갱신·삭제만 한다 (SAR-OPS)"
    - "4시간 주기 교보 재로그인(수십 초)은 relay journalAlerting 의 180초 유예 안이라 alerting 이 켜지지 않는다. 그래서 울리지 않는다. 장중에 끊김이 180초를 넘으면 alerting=true 가 되고, 체크 실패가 5분 넘게 이어져야(120초 창 · duration 300s · 6지점 평균 <0.9 AND 싱가포르 <0.9) 메일이 간다. 끊긴 뒤 알림까지 약 8분 이상 걸린다. 장 밖에서는 alerting 이 항상 false 다 (SAR-ALERT)"
    - "relay 소스 · 503 판정식 · KB uptime check 설정 · supabase · webapp 은 바뀌지 않는다. smoke-relay.sh 에는 판정 항목을 더하지 않는다. 「참고 — KYOBO 관찰자 감시」 정보 줄만 더하므로 PASS/FAIL/SKIP 계수가 그대로다 (SAR-OPS)"
    - "[메인 세션] 컨테이너 무변경 --alert-only 로 반영하면: KB 정책 두 조건에 check_id 가 박힌다. KYOBO 체크 1개(콘텐츠 매처 1개)와 정책 1개가 생긴다. 두 번째 실행은 update 경로를 탄다. 6지점 check_passed 가 true 다. 임시 음성 체크(content true)와 채널 없는 임시 정책으로 incident OPEN 을 Alerts API 로 확인한다. 그동안 gh-radar-relay-down · gh-radar-kyobo-observer-down 알림은 0건이다. 임시 자원은 삭제되고 smoke 는 FAIL 0 이다 (SAR-LIVE)"
  artifacts:
    - path: "ops/alert-kyobo-observer-down.yaml"
      provides: "KYOBO 관찰자 알림 정책 — 2조건 AND(6지점 평균 · apac-singapore) · check_id 한정 · 120s 창 · 300s 지속 · 운영 문서(≤ 9,500 B)"
      contains: "gh-radar-kyobo-observer-down"
    - path: "ops/alert-relay-down.yaml"
      provides: "KB 정책 필터 두 곳에 metric.label.check_id 한정(의미 불변 · documentation 불변)"
      contains: "metric.label.check_id = \"${UPTIME_CHECK_ID}\""
    - path: "scripts/deploy-relay.sh"
      provides: "uptime_check_name · apply_policy_file · apply_alert_policy(KB check_id 치환) · sync_kyobo_monitoring(키 있음/없음/판정 불가) · --alert-only / --rollback / Section 6 호출 · 요약 줄"
      contains: "sync_kyobo_monitoring"
    - path: "scripts/smoke-relay.sh"
      provides: "참고 — KYOBO 관찰자 감시 정보 줄(비판정)"
      contains: "참고 — KYOBO 관찰자 감시"
    - path: "infra/relay/README.md"
      provides: "#### KYOBO 끊김 알림 절(구성 · 타임라인 · 2xx+5xx 이유 · KB check_id 한정 이유 · 생성·삭제 규칙 · 비용 · 확인 명령) + 끄기·롤백 한 줄"
      contains: "#### KYOBO 끊김 알림"
    - path: "docs/relay-operations.md"
      provides: "--alert-only 설명에 KYOBO 감시 동기화 명시"
      contains: "KYOBO"
    - path: ".planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh"
      provides: "계획 시점 작성·접지 게이트(ops 9 · static 23 · commit 4). 미편집 트리 24 FAIL · 모의 구현 ALL PASS · 변이 4종(KB 한정 누락 · curl -f · 순서 뒤집기 · delete 대상 변수) 검출 확인. 실행자는 수정하지 않는다"
      contains: "mode_ops"
  key_links:
    - from: "공개 https://dma.jx1.io/healthz 본문 journalGateways.KYOBO (키 유무)"
      to: "sync_kyobo_monitoring 판정(present / absent / unknown)"
      via: "curl -s (-f 금지 — 장중 KB 503 본문에도 키가 실린다) → python3 json"
    - from: "apply_alert_policy (KB) 성공 → KB_POLICY_APPLIED=1"
      to: "KYOBO 체크 create 허용"
      via: "같은 실행 안의 순서 게이트. check_passed 의 resource 라벨이 host 뿐이라 KB 정책이 host 로만 거르면 새 체크가 KB 알림을 오염시킨다"
    - from: "KYOBO uptime check 이름 → ID(${name##*/})"
      to: "ops/alert-kyobo-observer-down.yaml 의 ${UPTIME_CHECK_ID}"
      via: "apply_policy_file 치환 · 잔여 치환 토큰 있으면 적용 거부"
    - from: "relay journalAlerting (장중 · rejected 즉시 · 비-live 180초)"
      to: "uptime JSONPath 매처 실패 → 정책 120s 창 · 300s 지속 → 운영 메일"
      via: "relay 는 무변경. 알림 층이 5분 지속을 더한다"
---

<objective>
교보(KYOBO) 관찰자가 장중에 끊기면 운영 메일이 오게 한다. relay 는 이미 `/healthz` 본문 `journalGateways.KYOBO.alerting` 을 계산한다(quick-260929-c8e, 503 판정 밖). 이 값을 **JSONPath 콘텐츠 매처로 보는 별도 uptime check** 와 **별도 알림 정책**으로 바꾼다. `deploy-relay.sh` 는 라이브 healthz 에 KYOBO 키가 있으면 그 둘을 만들고, 없으면 지운다. README 의 「알림 경로 없음」 한계 문장은 새 절로 바꾼다.

Purpose: c8e 가 남긴 운영 공백(README 1104행 「한계」)을 닫는다. relay 소스 · 503 판정식 · KB 알림 의미는 바꾸지 않는다.

Output: Task 1(gsd-executor · tracer)은 yaml 2종, deploy-relay.sh, smoke 참고 줄, README, relay-operations 한 줄을 맡고 커밋까지 한다. Task 2(**메인 세션 전용**)는 컨테이너 무변경 `--alert-only` 반영 → 라이브 양성 검증 → 임시 음성 시험 → 정리 → smoke 다.

Tracer: Task 1 은 한 경로를 끝까지 잇는다. 경로는 healthz 키 판정 → KB 정책 check_id 한정 → KYOBO 체크 생성 → KYOBO 정책 생성(check_id 치환)이다. 실제 `deploy-relay.sh --alert-only` 를 가짜 gcloud · curl 로 돌리는 하네스(ops O1)로 증명한다. 라이브 GCP 끝단은 Task 2 가 닫는다.

**계획 시점에 확인한 사실 (2026-09-29 20:3x KST, 읽기 전용 조회):**
- `journalAlerting`(relay/src/journal/status.ts:50)은 장중 창에서만 true 가 될 수 있다. 창은 KST 평일 · KRX 휴장일 아님 · 08:00 ≤ t < 20:00(trading-window.ts)이다. `rejected` 는 즉시 true, `live`·`disabled` 는 false 다. 그 밖의 상태(connecting · logging_in · replaying · db_error …)는 `disconnectedSec` ≥ 180 이면 true 다. 이탈 시각은 비-live 상태끼리 옮겨 다녀도 이어지고, live 로 돌아와야만 초기화된다. 한계: `KRX_HOLIDAYS` seed 는 2026-12-31 까지다. 그 뒤로는 휴장일을 평일로 봐서 알림이 과민해진다(놓치지는 않는다).
- gcloud SDK 558.0.0: `gcloud monitoring uptime create --help` 에 `--matcher-content` · `--matcher-type=matches-json-path|not-matches-json-path|…` · `--json-path` · `--json-path-matcher-type=exact-match|regex-match` · `--status-classes=[2xx,5xx,…]` · `--period=1|5|10|15` · `--regions`(최소 3)가 있다. `update` 도 같은 매처 플래그를 받고, 상태 클래스는 `--set-status-classes` 다. `gcloud monitoring uptime delete CHECK_ID` 와 `gcloud alpha monitoring policies delete POLICY` 가 있다. REST 우회는 필요 없다.
- REST 참조(projects.uptimeCheckConfigs): EXACT_MATCH 는 「content at jsonPath 가 content 문자열과 정확히 같으면 성공」이다. **contentMatchers 는 첫 항목만 쓴다.** JSON 불리언 비교 방식은 문서에 없다. 그래서 Task 2 의 양성(false → 통과) · 음성(true → 실패) 쌍이 실측 근거다.
- 메트릭 `monitoring.googleapis.com/uptime_check/check_passed` 의 라벨은 `check_id · checker_location · checker_project_id · checker_network · checker_zone · checked_resource_id` 다. resource `uptime_url` 의 라벨은 `host · project_id` 뿐이다. 라이브 KB 체크는 `projects/gh-radar/uptimeCheckConfigs/gh-radar-relay-healthz-WsIStDFOShs` 이고, 6지점(usa-virginia · usa-oregon · usa-iowa · eur-belgium · apac-singapore · sa-brazil-sao_paulo)에서 돈다. **라이브 KB 정책 필터는 `resource.label.host = "dma.jx1.io"` 로만 거른다. check_id 한정이 없다.** 그래서 같은 host 에 두 번째 체크를 만들면 그 실패가 KB relay-down 평균(REDUCE_MEAN) · 싱가포르 조건에 그대로 섞인다. 이 quick 의 선결 조건이다.
- 가격(cloud.google.com/stackdriver/pricing 실측): uptime check 실행은 프로젝트당 월 100만 회까지 무료이고, 넘으면 $0.30/1,000 이다. 체크 2개 × 6지점 × 분당 1회 = 월 51.8만~53.6만 회로 무료 안이다. 알림 정책 과금(조건당 $0.35/월)은 2027-09-01 이전에는 시작하지 않는다.
- Alerts API `GET https://monitoring.googleapis.com/v3/projects/gh-radar/alerts` 를 읽을 수 있다(state · policy.displayName · openTime). 채널 14409521670382124894 는 email(`gh-radar ops email`) · enabled 다.
- 라이브 relay 4c143596 `/healthz`: 200, `journalGateways.KYOBO` = {state live, headSeq 0, alerting false, …}.

**계획 시점 설계 판단 (근거는 각 태스크 action):**
- **알림 층에 5분 지속을 더한다.** 120초 창 · ALIGN_FRACTION_TRUE · duration 300s 로 두고, 6지점 평균 <0.9 AND 싱가포르 <0.9 로 KB 와 같은 모양이다. relay 유예 180초만으로도 수십 초짜리 재로그인은 걸러진다. 그래도 재연결이 몇 분 걸리는 드문 경우나 짧은 데스크톱 SecuwaySSL 사용에는 울리지 않게 한다. 관찰자 전용 게이트웨이라 KB 보다 한 단계 느슨해도 된다. 싱가포르 AND 는 2026-09-17 해외 경로 오탐(ops/alert-relay-down.yaml 문서)을 같은 방식으로 거른다.
- **상태 클래스는 2xx,5xx 를 받는다.** KB 기록 끊김으로 장중 503 이 나도 본문은 JSON 이고 `journalGateways` 가 실린다(order-api.ts 333-345). 2xx 만 받으면 KB 문제가 KYOBO 알림으로 번진다. relay · Caddy 가 죽으면(502 빈 본문 · 무응답) 이 체크도 실패해서 relay-down 과 함께 울릴 수 있다. 문서에 「relay-down 이 먼저」 라고 적는다.
- **KB 정책은 check_id 로 한정한다.** 의미를 바꾸는 게 아니라 원래 의미(자기 체크만)를 지키는 것이다. check_id 는 GCP 가 붙이는 ID 라, 채널 ID 와 같은 방식으로 배포 때 치환한다(`${UPTIME_CHECK_ID}`).
- **생성·삭제의 정본은 라이브 healthz 본문의 키 유무다.** env 추정(DMA_KYOBO_HOST)은 쓰지 않는다. VM 쪽 비밀 fetch 가 실패하면 호스트가 있어도 KYOBO 없이 뜨기 때문이다(deploy-relay.sh 461-468). 키가 없는데 JSONPath 체크가 있으면 영구 실패하므로, 없으면 만들지 않고 이미 있으면 지운다.
- **컨테이너 무변경 반영 경로는 `--alert-only` 확장이다.** 새 모드를 만들지 않는다. 「알림 정책만」 이던 계약을 「KB 알림 정책 + KYOBO 감시 동기화(KB uptime check · 컨테이너 무변경)」 로 넓히고 안내 문구와 relay-operations 한 줄을 고친다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260929-c8e-relay-kyobo-observer/260929-c8e-SUMMARY.md
@scripts/deploy-relay.sh
@ops/alert-relay-down.yaml
@scripts/smoke-relay.sh
@.planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh

주요 위치 (계획 시점 HEAD 6fbcea79):
- deploy-relay.sh: 22-24행 `--alert-only` 사용법 주석, 96-106행 Section 2 이름 상수(`UPTIME_CHECK` · `ALERT_POLICY` · `ALERT_FILE` · `HEALTH_HOST`), 108-142행 `apply_alert_policy`(채널 정규화 · sed 치환 · update-or-create), 144-158행 `--alert-only` 분기(SUPABASE_URL 가드 · IAP SSH 보다 앞), 264-276행 첫 rollback 분기(TARGET_IMAGE), 567-572행 VM 배포 뒤 rollback 종료 블록(`✅ Rolled back` · `exit 0`), 574-606행 Section 6(KB uptime update-or-create → `apply_alert_policy`), 608-637행 최종 요약(KYOBO 줄 628-634).
- ops/alert-relay-down.yaml: 조건 두 개의 필터 끝줄이 133행 · 153행 `AND resource.label.host = "dma.jx1.io"` 다(두 번째는 154행 checker_location 이 뒤따른다). 167행이 `"${NOTIFICATION_CHANNEL_ID}"` 다. documentation content 는 9,039 B 다(GCP 상한 10,240 · 프로젝트 기준 ≤ 9,500 — docs/relay-operations.md 48-51행).
- smoke-relay.sh: 34-35행 `UPTIME_CHECK` · `ALERT_POLICY`, 653-663행 INV-8(바꾸지 않는다), 715-720행 「참고 — 컨테이너 상태 (검증 항목 아님)」 블록, 722행 마지막 `summary`. 머리가 `set -uo pipefail`(-e 없음)이다.
- infra/relay/README.md: 1068행 `### 다중 게이트웨이 관찰자`, 1093-1110행 `#### /healthz 필드`(1104행이 옛 「한계」 문장 + 확인 명령 2개), 1139-1144행 `#### 교보 터널 주의`, 1146-1151행 `#### 끄기 · 롤백`.
- docs/relay-operations.md 52-53행: `--alert-only` 설명(「빌드·VM 배포·uptime check 를 건너뛴다」).
- 하네스: `bash .planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh ops|static|commit|all`. ops 는 저장소 루트에서 `deploy-relay.sh --alert-only` 를 가짜 gcloud · curl 로 9케이스(O1-O9) 돌린다. 실제 GCP 는 호출하지 않는다. 가짜 gcloud 가 받는 명령은 `config configurations list` · `config get-value project` · `monitoring uptime list-configs|create|update|delete` · `alpha monitoring policies list|create|update|delete` 뿐이다. 그 밖(예: describe)은 UNEXPECTED 로 FAIL 이다. 가짜 curl 은 `/healthz` 가 들어간 인자만 받고 본문을 stdout 으로 준다. `-f`/`--fail` 이 있고 상태가 ≥ 400 이면 22 로 죽는다.
- 손대지 않는다: relay/ · packages/ · supabase/ · webapp/ · infra/relay/startup.sh · Caddyfile · KB uptime check 의 create/update 플래그 · Section 3 치명 비밀 4종 루프 · resolve_kyobo_host · read_live_env · smoke INV-1~10 판정 · ROADMAP · .planning/state.json.
- 병행 quick 260929-sas(게이트웨이별 가시성)와의 순서 · README 경계: **sar 가 먼저 실행된다.** sar 는 README 에서 /healthz 필드의 「한계」 문장 교체, 새 `#### KYOBO 끊김 알림` 절, `#### 끄기 · 롤백` 에 **새 항목 한 줄 추가**만 한다. 그 절의 기존 항목 · 「신원 규칙」 · 「롤아웃 순서」 절은 고치지 않는다. sas 는 편집 직전에 README 를 다시 읽고, 「신원 규칙」 · 연결 추가·제거 절 · 롤아웃 문구 · 끄기 기존 항목만 고친다. sar 의 알림 문단과 deploy-relay.sh 는 건드리지 않는다(sas 계획 105 · 197 · 223행).
</context>

<tasks>

<task type="tracer">
  <name>Task 1: KYOBO 관찰자 감시 동기화 — KB 정책 check_id 한정 → KYOBO JSONPath 체크 + 정책 생성·삭제 (deploy-relay.sh · yaml 2종 · smoke 참고 줄 · README · relay-operations)</name>
  <files>ops/alert-relay-down.yaml, ops/alert-kyobo-observer-down.yaml, scripts/deploy-relay.sh, scripts/smoke-relay.sh, infra/relay/README.md, docs/relay-operations.md</files>
  <read_first>scripts/deploy-relay.sh (1-175 · 560-637), ops/alert-relay-down.yaml, scripts/smoke-relay.sh (1-80 · 640-722), infra/relay/README.md (1068-1157), docs/relay-operations.md (38-56), .planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh (전체 — 단언이 곧 계약이다)</read_first>
  <behavior>
    - O1 키 있음 · 감시 없음: KB 정책 update 파일의 두 조건에 `metric.label.check_id = "gh-radar-relay-healthz-WsIStDFOShs"` 가 있고 채널이 치환되며 치환 토큰 잔여가 0 이다. 그 뒤 KYOBO 체크 create 가 정확한 플래그로 나가고, 그 뒤 KYOBO 정책 create 가 나간다(check_id 2곳 · 채널 · 잔여 0). KB 체크 create/update/delete 는 0 이다.
    - O2 장중 KB 503 본문(키 있음): 여전히 KYOBO 생성. O3 이미 있음: update 경로(`--set-status-classes=2xx,5xx` · 매처 플래그) + 정책 update, 생성 0.
    - O4 키 없음 · 있음: 정책 delete → 체크 delete 순서, 둘 다 `--quiet`, KB 자원 삭제 0. O5 키 없음 · 없음: KYOBO 호출 0.
    - O6/O7 판정 불가(502 빈 본문 · curl 실패): KYOBO 변경 0, 「KYOBO 감시 … 유지」 경고, 종료 0.
    - O8 KB 체크 ID 없음: KB 정책 적용 0 · KYOBO 생성 0 · 비0 종료. O9 KYOBO 체크 create 실패: 「KYOBO 감시 실패」 출력 · 비0 · KYOBO 정책 생성 0.
  </behavior>
  <action>
먼저 하네스를 돌려 RED 를 본다. `ops` · `static` 이 FAIL 이어야 한다(계획 시점 실측: 24 FAIL). 하네스는 수정하지 않는다. 하네스 자체의 결함이 의심되면 멈추고, 재현 명령과 함께 SUMMARY 에 적는다.

**A. ops/alert-relay-down.yaml — KB 정책 check_id 한정 (T-sar-01).** 두 조건의 필터에서 `AND resource.label.host = "dma.jx1.io"` 줄 바로 다음에 새 줄 `AND metric.label.check_id = "${UPTIME_CHECK_ID}"` 를 넣는다(들여쓰기는 주변 필터 줄과 같다. 두 번째 조건은 그 뒤에 checker_location 줄이 온다). 이유는 **YAML 주석**(`#`)으로만 적는다. 「2026-09-29 quick-260929-sar — 같은 host 에 KYOBO 관찰자 체크가 생겼다. check_passed 의 resource 라벨은 host 뿐이라 host 로만 거르면 KYOBO 실패가 KB 평균·싱가포르 조건에 섞인다. check_id 로 이 정책의 원래 의미(KB 체크만)를 지킨다. 값은 deploy-relay.sh 가 KB 체크 ID 로 치환한다.」 **documentation content 는 한 글자도 바꾸지 않는다.** 9,039 B 이고 상한 규칙은 ≤ 9,500 이다. 임계값 · 창 · combiner · 채널 · alertStrategy 도 그대로 둔다. 하네스 S2 가 이 줄만 빼고 BASE 와 같은지 본다.

**B. ops/alert-kyobo-observer-down.yaml (신규).** KB yaml 과 같은 골격이다.
- displayName `gh-radar-kyobo-observer-down`.
- conditions 2개, combiner AND. ① 6지점 평균: 필터 4줄 = `metric.type = "monitoring.googleapis.com/uptime_check/check_passed"` · `AND resource.type = "uptime_url"` · `AND resource.label.host = "dma.jx1.io"` · `AND metric.label.check_id = "${UPTIME_CHECK_ID}"`. ② 같은 4줄 + `AND metric.label.checker_location = "apac-singapore"`.
- 두 조건 모두 comparison COMPARISON_LT · thresholdValue 0.9 · duration 300s · aggregations 1개(alignmentPeriod 120s · perSeriesAligner ALIGN_FRACTION_TRUE · crossSeriesReducer REDUCE_MEAN · groupByFields [resource.label.host]).
- enabled true, notificationChannels 는 `"${NOTIFICATION_CHANNEL_ID}"` 하나, alertStrategy.autoClose 1800s.
- 창과 지속 값을 고른 근거는 YAML 주석으로 적는다. relay 180초 유예 뒤에 5분 지속이 쌓이고, 4시간 재로그인 · 짧은 데스크톱 사용은 거르고, 싱가포르 AND 는 09-17 해외 경로 오탐 대책이다.
- documentation(text/markdown · 한국어 · **≤ 9,500 B, 목표 4,000 B 안팎**)에는 이것들을 담는다.
  - 무엇이 울렸나: `/healthz` 본문 `journalGateways.KYOBO.alerting` 이 true 다. 장중 rejected 는 즉시, 비-live 는 180초 뒤다.
  - 영향: 교보 계좌 주문 기록만 DB 에 안 들어온다. KB 호가·주문·기록은 영향이 없다.
  - 첫 명령: `curl -s https://dma.jx1.io/healthz | jq '.journalGateways.KYOBO'`.
  - 상태별 대응 표. rejected → 관찰자 비밀 불일치(Secret `gh-radar-dma-observer-secret-kyobo` ↔ kyobo127 `config/observer.toml`, 해시 12자 대조 뒤 relay 재시작). connecting/logging_in → 교보 터널 `securwayssl.service` · 데스크톱 SecuwaySSL 동시접속 · kyobo127 게이트웨이. db_error → Supabase 적용 RPC. 키 없음 → KYOBO 가 꺼졌는데 체크가 남은 상태다. `deploy-relay.sh --alert-only` 가 지운다.
  - 로그 명령: docker logs 에서 `"gateway":"KYOBO"` 를 grep 한다.
  - relay-down 이 함께 울렸으면 그쪽이 먼저다. relay·Caddy 가 죽으면 이 체크도 실패한다.
  - 2xx,5xx 를 받는 이유.
  - 이 체크·정책은 deploy-relay.sh 가 관리한다. 수동으로 만들거나 지우지 않는다.
  - 상세는 infra/relay/README.md §KYOBO 끊김 알림 을 가리킨다.
- documentation 에는 `${` 문자열이 없어야 한다(치환 토큰은 필터 · 채널 두 곳뿐 — 하네스 S3b). 교보 실주소 · 비밀 값도 넣지 않는다.

**C. scripts/deploy-relay.sh.** 기존 스타일을 따른다. 한국어 주석, `flag=value` 형식, 비밀을 출력하지 않는다.
1. 머리 사용법 주석(22-24행)의 `--alert-only` 설명을 「KB 알림 정책 + KYOBO 감시 동기화 — 빌드 · VM 배포 · KB uptime check · 컨테이너는 건드리지 않음」 으로 고친다. KYOBO 감시 규칙(라이브 healthz 키 유무로 생성·삭제) 한 단락도 더한다.
2. Section 2 상수(106행 뒤): `KYOBO_UPTIME_CHECK=gh-radar-kyobo-observer-healthz` · `KYOBO_ALERT_POLICY=gh-radar-kyobo-observer-down` · `KYOBO_ALERT_FILE="ops/alert-kyobo-observer-down.yaml"` · `KYOBO_JSON_PATH` 는 작은따옴표로 `$.journalGateways.KYOBO.alerting` · 상태 전역 `KB_POLICY_APPLIED=0` · `KYOBO_MONITOR_RESULT` 초깃값(예: 「미실행」). 이름 둘은 KB 이름(`gh-radar-relay-healthz` · `gh-radar-relay-down`)을 부분 문자열로 품지 않도록 이렇게 정했다. gcloud 필터 · smoke INV-8 의 「정확히 1건」 보호다.
3. `uptime_check_name <displayName>` 헬퍼를 더한다. `gcloud monitoring uptime list-configs --filter="displayName=$1" --format='value(name)'` 의 첫 줄을 돌려준다. 실패해도 빈 문자열을 주고 절대 실패하지 않는다(`|| true`). 체크 ID 는 호출부가 `${name##*/}` 로 얻는다.
4. 정책 적용 헬퍼 `apply_policy_file <displayName> <yaml> <checkId>` 를 더한다. 기존 `apply_alert_policy` 본문을 일반화한다.
   - 전제(파일 존재 · `NOTIFICATION_CHANNEL_ID` · checkId 비어 있지 않음)가 하나라도 안 맞으면 gcloud 를 부르지 않고 1 을 돌려준다.
   - 채널 정규화는 지금과 같다(`projects/*` 가 아니면 full resource name).
   - `sed` 로 `${NOTIFICATION_CHANNEL_ID}` 와 `${UPTIME_CHECK_ID}` 를 둘 다 치환한 임시 파일을 만든다.
   - **임시 파일에 `${` 가 하나라도 남으면 지우고 1 을 돌려준다(T-sar-06).**
   - displayName 으로 `gcloud alpha monitoring policies list` 해서 있으면 update, 없으면 create 한다.
   - gcloud 가 실패하면 2 를, 성공하면 0 을 돌려준다.
   - 호출부는 `if` · `case $?` 문맥에서 부른다. ⚠ bash 는 if 조건 문맥 안의 함수에서 `set -e` 를 멈춘다. 그래서 헬퍼 안의 모든 gcloud 호출은 반환값을 명시적으로 검사한다(`|| { rm -f …; return 2; }`).
5. `apply_alert_policy`(KB)는 이름과 호출부를 유지하고 본문만 헬퍼 위임으로 바꾼다.
   - 채널 미설정 경고 2줄은 지금 그대로 두고, 이때는 KB_POLICY_APPLIED 를 세우지 않는다.
   - `uptime_check_name "$UPTIME_CHECK"` 로 KB 체크 ID 를 구한다. 비어 있으면 ⚠ 「KB uptime check ID 해석 실패 — 알림 정책 단계 건너뜀(기존 정책 유지)」 을 남긴다.
   - 헬퍼가 0 이면 `KB_POLICY_APPLIED=1` 로 세우고, 기존 「✓ Alert policy ready」 줄을 찍는다.
   - 헬퍼가 1 이면(치환 거부) ⚠ 한 줄을 남긴다.
   - 헬퍼가 2 면(gcloud 실패) **종전처럼 치명**으로 둔다. ERROR 한 줄 뒤 exit 1 이다. 종전에는 set -e 로 죽었으니 동작이 같고, relay-operations 48-49행(문서 크기 초과 시 exit 1) 서술도 그대로 참이다.
   - 이 함수는 그 밖의 경우 항상 0 으로 끝난다.
6. `sync_kyobo_monitoring` 을 더한다. **비치명이다. 본문에 exit 가 없고 항상 return 0 이며 결과는 `KYOBO_MONITOR_RESULT` 로 남긴다.** 평문 호출이라 set -e 가 살아 있다. 실패할 수 있는 모든 명령에 `|| true` 또는 `|| { KYOBO_MONITOR_RESULT="실패: …"; return 0; }` 를 붙인다.
   - (a) 본문 읽기: `curl -s --max-time 10 "https://${HEALTH_HOST}/healthz"` 의 stdout 만 쓴다. **`-f` · `-o` · `-w` 금지.** 장중 KB 503 본문에도 키가 있다(하네스 O2).
   - (b) 판정: python3 json 으로 한다. 최상위 객체에 `journalGateways` 객체가 있고 그 안에 `KYOBO` 객체가 있으면 present, 유효한 JSON 객체인데 그게 없으면 absent, 그 밖(빈 본문 · 비JSON · curl 실패)은 unknown 이다.
   - (c) 기존 자원은 목록 조회로 찾는다. 변수 이름은 반드시 `KYOBO_UPTIME_NAME`(= `uptime_check_name "$KYOBO_UPTIME_CHECK"`)과 `KYOBO_POLICY_NAME`(= displayName `$KYOBO_ALERT_POLICY` 로 `gcloud alpha monitoring policies list` 한 첫 줄)이다. 하네스 S4f 가 delete 대상이 `KYOBO_` 변수인지 본다.
   - (d) unknown: 변경 없이 stderr 에 `⚠ KYOBO 감시: healthz 판정 불가 (<사유>) — 기존 상태 유지` 를 남기고, 결과는 「판정 불가 — 기존 상태 유지」 다.
   - (e) absent: 정책이 있으면 `gcloud alpha monitoring policies delete "$KYOBO_POLICY_NAME" --quiet` 를 먼저, 체크가 있으면 `gcloud monitoring uptime delete "$KYOBO_UPTIME_NAME" --quiet` 를 다음에 부른다. 결과는 「없음 — KYOBO 꺼짐(감시 삭제)」 또는 「없음」 이다.
   - (f) present · 체크 없음: `KB_POLICY_APPLIED` 가 1 이 아니면 만들지 않는다. ⚠ 「KB 정책 check_id 한정이 이번 실행에서 확인되지 않아 KYOBO 체크 생성을 보류」 를 남기고, 결과는 「생성 보류」 다(T-sar-01). 1 이면 create 한다. 플래그는 `gcloud monitoring uptime create "$KYOBO_UPTIME_CHECK"` 에 `--resource-type=uptime-url` · `--resource-labels="host=${HEALTH_HOST},project_id=${EXPECTED_PROJECT}"` · `--protocol=https` · `--port=443` · `--path=/healthz` · `--period=1` · `--timeout=10` · `--validate-ssl=true` · `--status-classes=2xx,5xx` · `--matcher-type=matches-json-path` · `--json-path="$KYOBO_JSON_PATH"` · `--json-path-matcher-type=exact-match` · `--matcher-content=false` 다. 만든 뒤 이름을 다시 조회한다.
   - (g) present · 체크 있음: `gcloud monitoring uptime update "$KYOBO_UPTIME_NAME"` 에 `--period=1 --timeout=10 --validate-ssl=true --set-status-classes=2xx,5xx` + 매처 4플래그(같은 값)를 준다.
   - (h) 정책: 채널이 없으면 결과는 「체크만 — 정책 건너뜀(NOTIFICATION_CHANNEL_ID 미설정)」 이다. 있으면 `apply_policy_file "$KYOBO_ALERT_POLICY" "$KYOBO_ALERT_FILE" "${KYOBO_UPTIME_NAME##*/}"` 를 부른다. 0 이면 「켜짐 (체크 <ID> · 정책 gh-radar-kyobo-observer-down)」, 아니면 「실패: 정책 적용」 이다.
   - gcloud 는 list-configs · create · update · delete(uptime)와 list · create · update · delete(alpha policies)만 쓴다. describe 는 쓰지 않는다.
7. 호출 3곳.
   - (i) `--alert-only` 분기: `apply_alert_policy` 뒤 `KB_POLICY_APPLIED` 가 1 이 아니면 ERROR 「KB 알림 정책 미적용 — KYOBO 감시 동기화 중단」 뒤 exit 1 이다. 1 이면 `sync_kyobo_monitoring` 을 부른다. 결과가 「실패」로 시작하면 stderr 에 `✗ KYOBO 감시 실패: <결과>` 뒤 exit 1, 아니면 `✓ KYOBO 감시: <결과>` 다. 마지막 안내 줄은 `(--alert-only: relay 컨테이너 · KB uptime check 는 건드리지 않았습니다 — KYOBO 감시는 healthz 실측에 맞춰 동기화)` 로 바꾼다.
   - (ii) VM 배포 뒤 rollback 종료 블록(`✅ Rolled back` 이 있는 `if [[ "$MODE" == rollback ]]; then … fi`): `sync_kyobo_monitoring` 과 `KYOBO 감시: <결과>` 한 줄을 `exit 0` 앞에 둔다. 롤백으로 옛 이미지가 뜨면 키가 사라진다. 그때 남은 체크가 영구 실패로 메일을 보내지 않게 하는 것이다(T-sar-04).
   - (iii) Section 6: `apply_alert_policy` 바로 다음 줄에 `sync_kyobo_monitoring` 을 둔다. 최종 요약의 KYOBO 줄 다음에 `echo "   KYOBO 감시: $KYOBO_MONITOR_RESULT"` 를 넣는다.
   - Section 6 머리 주석에 KYOBO 감시 한 줄을 더한다.
8. 그대로 둔다: KB uptime check create/update 플래그 · Section 3 치명 비밀 루프 · KYOBO 비밀 사전 점검 · Section 5 · resolve_kyobo_host · read_live_env · `set -euo pipefail`.

**D. scripts/smoke-relay.sh — 비판정 참고 줄.** 34-35행 뒤에 `KYOBO_UPTIME_CHECK=gh-radar-kyobo-observer-healthz` · `KYOBO_ALERT_POLICY=gh-radar-kyobo-observer-down` 를 더한다. 마지막 `summary` 앞, 「참고 — 컨테이너 상태」 블록 옆에 `참고 — KYOBO 관찰자 감시 (검증 항목 아님):` 블록을 둔다. 찍는 것:
- healthz KYOBO 키: 있음/없음/판정 불가(`curl -s --max-time 10` + python3).
- KYOBO uptime check: 있음/없음.
- KYOBO 정책: 있음/없음.
- KB 정책 check_id 한정: 예/아니오. `gcloud alpha monitoring policies list --filter="displayName=$ALERT_POLICY" --format=json` 결과에 `metric.label.check_id` 가 두 번 이상 나오는지로 본다.
- 판정: 키 있음 ↔ 체크·정책 있음, 또는 키 없음 ↔ 둘 다 없음이면 「일치」, 아니면 「⚠ 불일치 — `deploy-relay.sh --alert-only` 로 동기화」 다.
`check`/`skip` 을 부르지 않고 PASS/FAIL/SKIP 계수를 건드리지 않는다. 모든 명령에 `|| true` 를 붙인다. INV-8 블록은 글자 그대로 둔다(하네스 S5d).

**E. infra/relay/README.md.**
- (1) `#### /healthz 필드` 의 1104행 「**한계:** …」 문장을 이렇게 바꾼다: 「장중 KYOBO 끊김은 아래 §KYOBO 끊김 알림 의 uptime check · 정책이 메일로 알린다. 확인은 두 명령으로 한다.」 뒤의 두 명령 코드 블록은 그대로 둔다.
- (2) `#### 교보 터널 주의` 앞에 `#### KYOBO 끊김 알림 (quick-260929-sar)` 절을 새로 둔다. 담을 것:
  - 구성 표: 체크 `gh-radar-kyobo-observer-healthz`(https 443 `/healthz` · 1분 · timeout 10 · validate-ssl · 상태 2xx,5xx · JSONPath `$.journalGateways.KYOBO.alerting` exact-match `false`)와 정책 `gh-radar-kyobo-observer-down`(`ops/alert-kyobo-observer-down.yaml` · 6지점 평균 <0.9 AND `apac-singapore` <0.9 · 120초 창 · 300초 지속 · KB 와 같은 ops 메일 채널 · autoClose 30분).
  - 타임라인: 장중 끊김 → relay 180초 유예(rejected 는 즉시) → `alerting` true → 체크 실패 5분 지속 → 메일. 합계 약 8분 이상이다. 4시간 재로그인(수십 초)은 유예 안이라 울리지 않는다. 데스크톱 SecuwaySSL 로 VM 터널이 8분 넘게 끊기면 울린다(실제 기록 공백). 장 밖에서는 울리지 않는다. KRX_HOLIDAYS seed 는 2026-12-31 까지라는 한계 한 줄.
  - 2xx,5xx 를 받는 이유와, relay·Caddy 장애 시 relay-down 과 함께 울릴 수 있다는 점.
  - KB 정책 check_id 한정 이유: check_passed resource 라벨은 host 뿐이다. `${UPTIME_CHECK_ID}` 는 배포 때 치환된다. 한 실행 안에서 KB 한정이 먼저, KYOBO 생성이 나중이다.
  - 생성·삭제 규칙: 전체 배포 Section 6 · `--alert-only` · `--rollback` 이 공개 healthz 키 유무로 동기화한다. 판정 불가면 손대지 않는다. 키가 없으면 만들지 않는다. 수동 조작은 금지다.
  - 컨테이너 무변경 반영 명령: `GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh --alert-only`.
  - 비용: 월 약 52만 회 < 무료 100만 회. 알림 정책 과금은 2027-09-01 이후다.
  - 확인 명령: `gcloud monitoring uptime list-configs --filter="displayName=gh-radar-kyobo-observer-healthz"` · `gcloud alpha monitoring policies list --filter="displayName=gh-radar-kyobo-observer-down"` · smoke 의 참고 줄.
  - 교보 실주소는 새로 쓰지 않는다(하네스 S6d).
- (3) `#### 끄기 · 롤백` 에 한 줄을 더한다: 「`DMA_KYOBO_HOST=off` 배포 · 옛 이미지 `--rollback` 은 같은 실행에서 KYOBO 감시(정책 → 체크)도 지운다.」 그 절의 기존 항목은 고치지 않는다. 기존 항목 · 「신원 규칙」 · 「롤아웃 순서」 는 뒤이어 실행될 260929-sas 영역이다(<context> 경계 줄).

**F. docs/relay-operations.md 53행.** 괄호 문구를 「(빌드·VM 배포·KB uptime check 를 건너뛴다 — KYOBO 감시는 healthz 실측에 맞춰 동기화)」 로 바꾼다. 그 밖은 바꾸지 않는다.

**커밋.** 커밋은 둘로 나누고, 메시지는 한글, **Co-Authored-By 없음**, push 없음이다.
- ① `feat(quick-260929-sar): KYOBO 관찰자 끊김 알림 — JSONPath uptime check · 정책 생성·삭제 동기화, KB 정책 check_id 한정` — 파일: ops/alert-relay-down.yaml · ops/alert-kyobo-observer-down.yaml · scripts/deploy-relay.sh · scripts/smoke-relay.sh
- ② `docs(quick-260929-sar): README KYOBO 끊김 알림 절 · relay-operations --alert-only 설명` — 파일: infra/relay/README.md · docs/relay-operations.md

stage 는 **경로를 명시**해서만 한다(`git add -A` · `git add .` 금지). 커밋 직전마다 `git status -sb` 를 확인한다. 다른 세션이 이 브랜치에서 동시에 작업 중이다. `.planning/state.json` · `webapp/**` · `.planning/milestone.lock` 등 이 태스크 밖의 변경은 절대 stage 하지 않는다.
  </action>
  <verify>
    <automated>bash .planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh ops && bash .planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh static && bash .planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh commit && ruby -ryaml -e 'a=YAML.load_file("ops/alert-relay-down.yaml")["documentation"]["content"].bytesize; b=YAML.load_file("ops/alert-kyobo-observer-down.yaml")["documentation"]["content"].bytesize; puts [a,b].inspect; exit((a<=9500 && b<=9500) ? 0 : 1)'</automated>
  </verify>
  <done>하네스 ops 9/9 · static 23/23 · commit 4/4 가 ALL PASS 다. 두 정책 문서가 ≤ 9,500 B 이고 KB 는 9,039 B 그대로다. 커밋 2건(feat · docs)에는 허용 6파일만 들어 있고, 한글 메시지이며 Co-Authored-By 가 없고 push 하지 않았다. SUMMARY 에 RED(편집 전 FAIL 수) → GREEN 결과 · 커밋 해시를 적고, 「Task 2 (main-session) — 대기」 절을 비워 둔다.</done>
</task>

<task type="checkpoint:human-action" gate="blocking-human" executor="main-session">
  <name>Task 2 [executor: main-session — gsd-executor 는 실행 금지, 여기서 멈추고 반환]: 컨테이너 무변경 반영 → 라이브 양성 · 멱등 · 임시 음성 시험 → 정리 → smoke</name>
  <files>(저장소 변경 없음 — .planning/quick/260929-sar-kyobo-observer-alert/260929-sar-SUMMARY.md 에 「Task 2 (main-session)」 절만 채운다)</files>
  <precondition>Task 1 커밋 2건이 HEAD 에 있고, 하네스 all 이 ALL PASS 이고, `git status --porcelain scripts/deploy-relay.sh ops/` 가 비어 있다(저장소 루트 · 다른 세션의 webapp 변경은 --alert-only 와 무관하다). gcloud 는 configuration gh-radar · project gh-radar 로 인증돼 있다.</precondition>
  <action>
(0) 기준선(읽기):
- `curl -s https://dma.jx1.io/healthz | jq '.journalGateways.KYOBO'` 가 객체여야 한다.
- `gcloud alpha monitoring policies describe projects/gh-radar/alertPolicies/7995724305267722560 --format=json > <scratch>/kb-before.json` 로 KB 정책을 떠 둔다.
- `gcloud monitoring uptime list-configs --format='value(name,displayName)'` 에는 KB 체크 1개만 있어야 한다.
- 시각 T0(UTC)를 기록한다.

(a) 반영: 저장소 루트에서 `GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=14409521670382124894 bash scripts/deploy-relay.sh --alert-only` 를 돌린다.
- 기대 출력: `✓ Alert policy ready: gh-radar-relay-down` → `✓ KYOBO 감시: 켜짐 (…)` → 안내 줄. 종료 0.
- 비0 이면 출력을 그대로 보고하고 멈춘다.

(b) KB 의미 불변:
- `describe … --format=json > kb-after.json` 을 뜬다. 두 조건 필터에 `metric.label.check_id = "gh-radar-relay-healthz-WsIStDFOShs"` 가 있어야 한다.
- 필터의 그 줄을 뺀 나머지(임계값 · duration · aggregations · combiner · notificationChannels · enabled · documentation)가 kb-before 와 같아야 한다. jq 로 비교한다.
- `gcloud monitoring uptime list-configs --filter="displayName=gh-radar-relay-healthz" --format='value(name)'` 이 KB 이름 **정확히 1줄** 이어야 한다.
- **(b) 가 실패하면 (f) 음성 시험은 절대 하지 않는다.** 한정되지 않은 KB 정책 옆에 실패 체크를 두면 KB relay-down 이 울린다. KYOBO 정책 → 체크를 즉시 지우고 보고한다.

(c) KYOBO 자원 모양: `gcloud monitoring uptime list-configs --filter="displayName=gh-radar-kyobo-observer-healthz" --format=json` 을 본다.
- `contentMatchers` 가 정확히 1개다: matcher MATCHES_JSON_PATH · jsonPathMatcher {jsonPath `$.journalGateways.KYOBO.alerting`, jsonMatcher EXACT_MATCH} · content `false`.
- acceptedResponseStatusCodes 가 2XX · 5XX 다.
- period 60s · timeout 10s · useSsl · validateSsl · host dma.jx1.io · path /healthz.
- `gcloud alpha monitoring policies list --filter="displayName=gh-radar-kyobo-observer-down" --format=json` 에서 조건 2개의 check_id = 위 체크 ID, 채널 = 14409521670382124894, enabled 여야 한다.

(d) 멱등: (a) 명령을 한 번 더 돌린다.
- 출력이 update 경로여야 한다(생성 없음).
- 체크는 여전히 1개이고 contentMatchers 도 1개여야 한다. 문서상 첫 항목만 쓰이므로 update 가 매처를 덧붙이지 않았는지 본다.
- KYOBO 정책도 1개여야 한다.

(e) 양성(생성 후 3~4분 안에 반드시 확인한다 — 정책 발화까지 약 5분 이상 여유가 있다):
- 토큰은 `gcloud auth print-access-token` 으로 얻는다.
- REST `GET https://monitoring.googleapis.com/v3/projects/gh-radar/timeSeries` 를 부른다. filter 는 `metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.label.check_id="<KYOBO 체크 ID>"`, 창은 최근 5분이다.
- 6지점 시계열이 나오고 최신 값이 모두 true 여야 한다.
- **하나라도 false 인데 healthz 의 alerting 이 false 라면** 불리언 exact-match 의미가 가정과 다른 것이다. 즉시 `gcloud alpha monitoring policies delete <KYOBO 정책> --quiet` → `gcloud monitoring uptime delete <KYOBO 체크> --quiet` 를 하고 「failed: (e) JSONPath 불리언 매칭」 으로 보고한다. 매처를 바꾸는 일(regex 등)은 새 quick 에서 스크립트를 고쳐서 한다. 여기서 즉흥 수정하지 않는다.

(f) 음성 시험 — 임시 자원, **끝나면 반드시 지운다**. 전제는 (b) 통과다.
- ① `gcloud monitoring uptime create gh-radar-kyobo-observer-negtest` 를 (c) 와 같은 플래그로 만들되 `--matcher-content=true` 로 한다. alerting 이 false 인 동안 항상 실패한다. 생성 시각을 기록한다.
- ② 임시 정책 파일을 scratch 에 만든다. ops/alert-kyobo-observer-down.yaml 사본에서 displayName 을 `gh-radar-kyobo-observer-negtest` 로 바꾸고, `${UPTIME_CHECK_ID}` 를 ①의 ID 로 치환하고, **notificationChannels 블록을 지운다**(메일 없음). `gcloud alpha monitoring policies create --policy-from-file=<그 파일>` 로 만든다.
- ③ 60초 간격으로 최대 15분 동안 Alerts API `GET https://monitoring.googleapis.com/v3/projects/gh-radar/alerts?pageSize=50` 를 조회한다. policy.displayName 이 `gh-radar-kyobo-observer-negtest` 이고 state 가 OPEN 인 항목이 나와야 한다. openTime − 체크 생성 시각을 기록한다(예상 약 6~9분).
- ④ 같은 응답에서 openTime ≥ T0 인 `gh-radar-relay-down` · `gh-radar-kyobo-observer-down` 항목이 **0건** 이어야 한다. 이것이 KB 격리의 실측 증명이다.
- ⑤ 정리: 임시 정책 delete → 임시 체크 delete(`--quiet`) → scratch 파일 삭제. `list-configs` 는 KB · KYOBO 2개뿐이어야 하고, 정책 목록에 negtest 가 없어야 한다.
- 15분 안에 OPEN 이 안 나와도 ⑤ 는 반드시 하고, 「미발화」로 보고한다(done 아님).

(g) `bash scripts/smoke-relay.sh`: INV-8 PASS · FAIL 0(SKIP 은 평소처럼 INV-9 · INV-10 계열)이어야 한다. 참고 줄이 「키 있음 · 체크 있음 · 정책 있음 · KB check_id 한정 예 · 일치」 여야 한다.

(h) SUMMARY 「Task 2 (main-session)」 절에 단계별 KST 시각 · 결과 표를 채운다. 체크 ID · 정책 name · 발화 소요 시간 · smoke 수치가 들어간다. push 하지 않는다(이 저장소에서 push 는 곧 webapp 프로덕션 배포다. push 여부는 사용자 결정이다). 다음 전체 relay 배포(Phase 25 relay 배포 대기 중)는 Section 6 에서 KB 정책 한정과 KYOBO 동기화를 같은 규칙으로 다시 적용한다.
  </action>
  <instructions>Task 1 이 저장소에 KYOBO 감시 동기화(deploy-relay.sh)와 정책 2종(yaml)을 넣었다. gsd-executor 는 이 태스크를 실행하지 않는다. gcloud 변경(체크 · 정책 생성·삭제)과 라이브 검증은 메인 세션이 (0) → (h) 순서로 직접 한다. relay 컨테이너 재배포는 필요 없다. 컨테이너 · 사용자 세션에 영향이 없으므로 장 시간과 무관하게 지금 해도 된다. 사용자의 몫은 결과 확인뿐이다. (b) · (e) · (f) 의 멈춤 분기에 걸리면 KYOBO 정책 → 체크 · 임시 자원을 지운 뒤 그 자리에서 보고하고 끝낸다.</instructions>
  <verification>(a) 종료 0 이고 「✓ KYOBO 감시: 켜짐」 이다. (b) KB 정책 두 조건에 KB check_id 가 들어갔고 나머지는 kb-before 와 같으며, KB 체크 조회가 정확히 1줄이다. (c) KYOBO 체크 매처가 1개 · EXACT_MATCH `false` · 2XX/5XX 이고, 정책 조건 2개가 KYOBO check_id 를 가지며 채널이 결선됐다. (d) 재실행이 update 경로이고 자원 수가 불변이다. (e) 6지점 check_passed 가 true 다. (f) negtest incident 가 OPEN 됐고, 같은 창에서 relay-down · kyobo-observer-down 알림이 0건이며, 임시 자원이 0개다. (g) smoke FAIL 0 이고 참고 줄이 「일치」 다.</verification>
  <verify>
    <automated>curl -s https://dma.jx1.io/healthz | jq -e '.journalGateways.KYOBO.alerting == false' && [ "$(gcloud monitoring uptime list-configs --format='value(displayName)' | sort | tr '\n' ' ')" = "gh-radar-kyobo-observer-healthz gh-radar-relay-healthz " ] && [ "$(gcloud alpha monitoring policies list --filter='displayName=gh-radar-relay-down' --format=json | grep -o 'metric.label.check_id = \\"gh-radar-relay-healthz-WsIStDFOShs\\"' | wc -l | tr -d ' ')" -ge 2 ] && [ "$(gcloud alpha monitoring policies list --filter='displayName=gh-radar-kyobo-observer-down' --format='value(name)' | wc -l | tr -d ' ')" = 1 ]</automated>
  </verify>
  <resume-signal>「approved」 + (a)~(g) 결과 요약. 또는 「failed: <단계> — <관측>」(그 경우 KYOBO 정책 · 체크 · 임시 자원을 지운 상태까지 명시)</resume-signal>
  <done>KB 정책 두 조건이 KB check_id 로 한정됐고 나머지는 불변이다. KYOBO 체크 1개(매처 1개 · 2xx,5xx)와 정책 1개(채널 결선)가 있다. 멱등 재실행은 update 경로를 탔다. 6지점 양성이 true 다. 임시 음성 정책 incident 가 OPEN 됐고 발화 소요가 기록됐다. 그동안 KB · 실 KYOBO 알림은 0건이다. 임시 자원 0개, smoke FAIL 0 이다. SUMMARY 에 라이브 결과가 기록됐다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cloud Monitoring 체커(6지점) → 공개 https://dma.jx1.io/healthz | 이미 공개된 엔드포인트다. 새 체크는 같은 본문을 읽기만 한다 |
| deploy-relay.sh(배포자 로컬 gcloud) → Cloud Monitoring 정책 · 체크 | 치환된 yaml 이 알림 판정식이 된다. 잘못 치환되면 알림이 조용히 죽거나 오염된다 |
| KB 알림 정책 ↔ 같은 host 의 다른 uptime 체크 | 메트릭 공유 경계. check_id 로 가르지 않으면 서로의 실패가 섞인다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-sar-01 | Tampering (알림 판정 오염) | ops/alert-relay-down.yaml · KB relay-down | high | mitigate | 두 조건 필터에 `metric.label.check_id = "${UPTIME_CHECK_ID}"` 를 넣고 배포 때 KB 체크 ID 로 치환한다. 같은 실행에서 KB 정책 적용(KB_POLICY_APPLIED=1)이 KYOBO 체크 create 보다 먼저라는 게이트를 둔다(하네스 O1 순서 · O8). 라이브에서는 음성 시험 중 relay-down 알림 0건으로 확인한다(Task 2 f④) |
| T-sar-06 | Denial of Service (조용히 죽은 알림) | apply_policy_file | high | mitigate | 체크 ID 가 비어 있거나 치환 뒤 `${` 가 남으면 적용하지 않는다. KB 는 ⚠ 뒤 기존 정책을 유지하고, --alert-only 는 비0 으로 끝난다(하네스 O1 잔여 0 · O8) |
| T-sar-04 | Denial of Service (영구 실패 체크 → 거짓 메일 반복) | sync_kyobo_monitoring | medium | mitigate | 라이브 healthz 키 유무가 정본이다. absent 면 정책 → 체크 순서로 삭제하고 만들지 않는다. unknown 이면 변경하지 않는다. rollback · off 배포도 같은 실행에서 동기화한다(하네스 O4 · O5 · O6 · O7 · S4d) |
| T-sar-03 | Denial of Service (알림 피로) | ops/alert-kyobo-observer-down.yaml | medium | mitigate | relay 180초 유예 위에 120초 창 · 300초 지속을 둔다. 싱가포르 AND 는 해외 경로 오탐을, 2xx,5xx 수용은 KB 503 전이를 막는다. 4시간 재로그인은 울리지 않는다(README 타임라인) |
| T-sar-05 | Denial of Service (시험 자원 잔존) | Task 2 음성 시험 | low | mitigate | 임시 정책에는 채널이 없다(메일 없음). 발화하든 안 하든 정리는 필수다. 마지막에 목록으로 체크 2개 · negtest 0 을 검증한다(Task 2 verify) |
| T-sar-02 | Information Disclosure | 정책 documentation · README | low | mitigate | 새 문서에 교보 실주소 · 비밀 값 · 계좌를 적지 않는다(하네스 S6d · S3b). healthz 본문은 이미 공개이고 식별자가 없다(c8e T-c8e-05) |
| T-sar-08 | Tampering (병행 편집 덮어쓰기) | infra/relay/README.md ↔ 260929-sas | low | mitigate | 절 단위로 소유를 나눈다. sar 는 「한계」 문장 · KYOBO 끊김 알림 절 · 끄기·롤백 새 줄 한 줄, sas 는 신원 규칙 · 연결 절차 · 롤아웃 문구 · 끄기 기존 항목이다. sar 가 먼저 실행되고, sas 는 편집 직전에 다시 읽는다. 두 quick 모두 경로를 명시해 stage 한다(<context> 경계 줄) |
| T-sar-07 | Denial of Service (비용) | uptime 실행 | low | accept | 체크 2개 × 6지점 × 분당 1 ≈ 월 52만 < 무료 100만/프로젝트(2026-09-29 가격표 실측). 알림 정책 과금은 2027-09-01 이후 조건당 $0.35/월 |
</threat_model>

<source_audit>
| 원천 항목 | 태스크 |
|-----------|--------|
| 설명: /healthz journalGateways.KYOBO.alerting 을 JSONPath 매처로 보는 별도 uptime check | T1 C6(f)(g) · 하네스 O1 · T2 (c)(e) |
| 설명: 별도 알림 정책 | T1 B · T2 (c)(f) |
| 설명: deploy-relay.sh 가 KYOBO 켜짐/꺼짐에 맞춰 생성·삭제 | T1 C6 · C7(i)(ii)(iii) · 하네스 O1-O7 · S4 |
| 설명: README | T1 E · 하네스 S6 |
| 사실: journalAlerting 규칙 확인 · 추가 지속 필요 여부 결정 | objective 「확인한 사실」 1 · 설계 판단 1 · T1 B(120s/300s) · README 타임라인 |
| 사실: gcloud CLI 표면 확인(REST 폴백 여부) | objective 「확인한 사실」 2 — gcloud 558 네이티브 플래그, REST 불필요 |
| 제약: 키 없으면 JSONPath 체크 생성 금지 | T1 C6(b)(e) · 하네스 O4 · O5 · O7 |
| 제약: relay 소스 · 503 판정식 · KB 체크/정책 의미 · supabase · webapp 무변경 | T1 A(주석 + check_id 한 줄만) · 하네스 S2 · C2 |
| 제약: smoke 선택적 비치명 점검 | T1 D · 하네스 S5 |
| 제약: 메인 세션만 gcloud 변경 · 컨테이너 무변경 경로 · 양성 + 안전한 음성 시험 | T2 (a)-(f) |
| 제약: 한글 커밋 · Co-Authored-By 없음 · push 없음 · 경로 명시 stage | T1 커밋 절 · 하네스 C2-C4 |
| 발견: 라이브 KB 정책이 host 로만 걸러 두 번째 체크가 오염시킴 | T1 A · C5 · C6(f) 게이트 · T2 (b) · (f)④ |
</source_audit>

<verification>
- Task 1: 하네스 `all` 이 ALL PASS(ops 9 · static 23 · commit 4)이고 두 정책 문서가 ≤ 9,500 B 다.
- Task 2: 라이브 목록에 체크 2개(KB · KYOBO), KYOBO 정책 1개, KB 정책 check_id 한정이 있고, 음성 시험 incident OPEN · relay-down 0건 · smoke FAIL 0 이다.
- 불변: `git log --grep quick-260929-sar` 커밋이 relay/ · packages/ · supabase/ · webapp/ · .planning/state.json 을 건드리지 않는다(하네스 C2).
</verification>

<success_criteria>
- 장중 KYOBO 관찰자가 180초를 넘겨 끊기고 그 상태가 5분 이어지면 ops 메일이 온다. 경로는 `gh-radar-kyobo-observer-down` 정책이다. 4시간 재로그인과 장 밖 끊김은 울리지 않는다.
- KB relay-down 알림은 전과 같은 조건에서만 울린다(자기 체크로 한정).
- KYOBO 가 꺼지거나 옛 이미지로 롤백되면 다음 deploy-relay 실행이 KYOBO 감시를 지운다. 켜지면 만든다. `--alert-only` 로 컨테이너 없이 맞출 수 있다.
</success_criteria>

<output>
`.planning/quick/260929-sar-kyobo-observer-alert/260929-sar-SUMMARY.md` 를 만든다. Task 1 은 실행자가, Task 2 절은 메인 세션이 채운다.
</output>
