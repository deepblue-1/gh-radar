---
phase: quick-260929-sar
plan: 01
subsystem: relay-ops-monitoring
tags: [relay, kyobo, uptime-check, alert-policy, cloud-monitoring, deploy-relay]
status: complete
requires: [quick-260929-c8e (journalGateways.KYOBO.alerting)]
provides:
  - "gh-radar-kyobo-observer-healthz JSONPath uptime check 동기화 (deploy-relay.sh sync_kyobo_monitoring)"
  - "gh-radar-kyobo-observer-down 알림 정책 (ops/alert-kyobo-observer-down.yaml)"
  - "KB relay-down 정책 check_id 한정"
affects: [scripts/deploy-relay.sh, ops/alert-relay-down.yaml, scripts/smoke-relay.sh, infra/relay/README.md, docs/relay-operations.md]
tech-stack:
  added: []
  patterns: ["uptime JSONPath content matcher", "배포 시 ${UPTIME_CHECK_ID} 치환 + 잔여 토큰 적용 거부", "라이브 healthz 키 유무를 정본으로 한 생성·삭제 동기화"]
key-files:
  created: [ops/alert-kyobo-observer-down.yaml]
  modified: [ops/alert-relay-down.yaml, scripts/deploy-relay.sh, scripts/smoke-relay.sh, infra/relay/README.md, docs/relay-operations.md]
decisions:
  - "KB relay-down 정책 두 조건에 metric.label.check_id 한정 추가 — check_passed resource 라벨이 host 뿐이라 같은 host 의 KYOBO 체크 실패가 섞이는 것을 막는다(의미 · documentation 9,039 B 불변)"
  - "KYOBO 정책은 120s 창 · 300s 지속 · 6지점 평균 AND 싱가포르 <0.9 — relay 180초 유예 위에 5분 지속을 더한다"
  - "KYOBO 체크 생성은 같은 실행에서 KB 정책 적용(KB_POLICY_APPLIED=1) 뒤에만 — --rollback 은 생성 보류, 갱신·삭제만"
metrics:
  duration: "~5분 (2026-09-29T11:59:55Z → 12:04:55Z, 실행자 Task 1)"
  completed: 2026-09-29
plan_head_before: 8fdd492a37575792c3f548a714950b1a2ce7c73e
actuals:
  tokens: 9200
  tasks: 1
  commits: 2
---

# Quick 260929-sar Plan 01: KYOBO 관찰자 끊김 알림 Summary

공개 `/healthz` 의 `journalGateways.KYOBO.alerting` 을 JSONPath exact-match `false` 로 보는 별도 uptime check 와 별도 알림 정책(6지점 평균 AND 싱가포르 · 120s 창 · 300s 지속)을 `deploy-relay.sh` 가 라이브 healthz 키 유무에 맞춰 만들고·갱신하고·지우게 했다. 같은 host 오염을 막기 위해 KB relay-down 정책을 KB 체크 check_id 로 한정했다.

## Task 1 (gsd-executor) — 완료

### RED → GREEN

| 모드 | 편집 전 (RED) | 편집 후 (GREEN) |
|------|---------------|-----------------|
| ops | PASS 2 · FAIL 7 | PASS 9 · FAIL 0 |
| static | PASS 7 · FAIL 16 | PASS 23 · FAIL 0 |
| commit | PASS 3 · FAIL 1 | PASS 4 · FAIL 0 |
| all | 24 FAIL (계획 시점 실측과 같다) | PASS 36 · FAIL 0 · ALL PASS |

- `bash -n scripts/deploy-relay.sh` · `bash -n scripts/smoke-relay.sh` 통과.
- 문서 크기(ruby): `[9039, 3350]` — KB 9,039 B 그대로, KYOBO 3,350 B (≤ 9,500).
- 추가 확인(하네스 밖, 스텁만 사용 · 실제 GCP/네트워크 호출 없음):
  - 하네스 사본(scratch)으로 9케이스 stdout 을 눈으로 확인 — 순서 `KB 정책 update → KYOBO 체크 create → KYOBO 정책 create`, O4 는 `정책 삭제 → 체크 삭제`, O6/O7 은 `⚠ KYOBO 감시: healthz 판정 불가 (…) — 기존 상태 유지`, O8 은 `ERROR: KB 알림 정책 미적용 — KYOBO 감시 동기화 중단`.
  - 함수만 떼어 rollback 의미(KB_POLICY_APPLIED=0) 확인 — 키 있음·체크 없음 → 「생성 보류」 · create 0회, 체크 있음 → update 경로, 채널 없음 → 「체크만 — 정책 건너뜀」.
  - smoke 참고 블록을 스텁으로 4경우(있음/일치 · 없음/일치 · 있음·자원 없음/불일치 · 판정 불가/불일치) 확인.
  - `gcloud monitoring uptime create|update|delete --help`(읽기 전용)로 플래그 이름과 CHECK_ID 에 full resource name 허용을 확인.

### 커밋

| 해시 | 메시지 | 파일 |
|------|--------|------|
| 8c785483 | feat(quick-260929-sar): KYOBO 관찰자 끊김 알림 — JSONPath uptime check · 정책 생성·삭제 동기화, KB 정책 check_id 한정 | ops/alert-relay-down.yaml · ops/alert-kyobo-observer-down.yaml · scripts/deploy-relay.sh · scripts/smoke-relay.sh |
| 0dbfc860 | docs(quick-260929-sar): README KYOBO 끊김 알림 절 · relay-operations --alert-only 설명 | infra/relay/README.md · docs/relay-operations.md |

push 하지 않았다. Co-Authored-By 없음. SUMMARY · PLAN · verify.sh · STATE 는 커밋하지 않았다.

### 무엇을 했나

- **ops/alert-relay-down.yaml**: 두 조건의 `resource.label.host` 줄 다음에 `AND metric.label.check_id = "${UPTIME_CHECK_ID}"` 를 넣었다. 이유는 `conditions:` 위 YAML 주석 4줄로 적었다(block scalar 밖이라 필터 문자열에 섞이지 않는다). documentation · 임계값 · 창 · combiner · 채널은 그대로다(하네스 S2).
- **ops/alert-kyobo-observer-down.yaml (신규)**: 계획 B 그대로다. documentation 에는 상태별 대응 표, 첫 명령, 로그 명령, relay-down 우선, 2xx·5xx 이유, 관리 주체를 넣었다. `${` 토큰은 필터 2곳과 채널 1곳뿐이다.
- **scripts/deploy-relay.sh**:
  - `uptime_check_name`: 절대 실패하지 않는다.
  - `apply_policy_file`: 반환 0 적용 · 1 거부 · 2 gcloud 실패. 치환 잔여 `${` 가 있으면 거부한다.
  - `apply_alert_policy`: 헬퍼에 위임한다. KB 체크 ID 해석에 실패하면 ⚠ 를 남기고, gcloud 실패는 종전처럼 exit 1 이다.
  - `sync_kyobo_monitoring`: 비치명이고 exit 가 없다.
  - 호출 3곳(`--alert-only` · rollback 종료 블록 · Section 6)과 최종 요약 줄 · 사용법 주석을 넣었다.
- **scripts/smoke-relay.sh**: 이름 상수 2개와 「참고 — KYOBO 관찰자 감시 (검증 항목 아님)」 블록을 더했다. check/skip 을 부르지 않는다. INV-8 은 글자 그대로다.
- **infra/relay/README.md**: 「한계」 문장을 바꾸고 `#### KYOBO 끊김 알림 (quick-260929-sar)` 절을 새로 넣었다(교보 터널 주의 앞). `#### 끄기 · 롤백` 끝에 새 줄 1개를 더했고, 기존 항목 · 신원 규칙 · 롤아웃 순서는 무변경이다.
- **docs/relay-operations.md**: `--alert-only` 괄호 문구 한 줄만 바꿨다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 표시 결함] `--alert-only` 실패 문구 중복 「실패: 실패:」**
- **Found during:** Task 1 (하네스 O9 stdout 확인)
- **Issue:** 결과 문자열이 이미 「실패: …」 로 시작한다. 그래서 `✗ KYOBO 감시 실패: <결과>` 가 「✗ KYOBO 감시 실패: 실패: KYOBO 체크 생성」 으로 찍혔다.
- **Fix:** 출력 때 접두어를 벗겼다(`${KYOBO_MONITOR_RESULT#실패: }`). 이제 「✗ KYOBO 감시 실패: KYOBO 체크 생성」 이다. 하네스 O9 단언(「KYOBO 감시 실패」 포함)은 그대로 PASS 다.
- **Files modified:** scripts/deploy-relay.sh
- **Commit:** 8c785483

### 설계 메모 (계획 범위 안의 선택)

- rollback 종료 블록 주석에 한 줄을 적었다. 방금 뜬 컨테이너의 healthz 가 아직 안 올라왔으면 판정 불가로 손대지 않으니, 그때는 `--alert-only` 로 맞춘다. 롤백 VM 기동 확인 뒤라 대개 판정 가능하다.
- smoke 참고 줄에서 healthz 「판정 불가」 는 「⚠ 불일치」 로 찍힌다. 계획의 「그 밖은 불일치」 를 따랐다.

## Known Stubs

없음.

## Threat Flags

없음. 새 표면은 계획의 threat_model(T-sar-01~08) 안이다.

## Task 2 (main-session) — 완료 (2026-09-29 21:06~21:21 KST)

| 단계 | KST 시각 | 결과 |
|------|----------|------|
| (0) 기준선 | 21:06:18 (T0 12:06:18Z) | 전제 3종 충족(커밋 2건 · 하네스 all 36/36 · deploy-relay.sh·ops porcelain 0). healthz KYOBO 객체 있음(live · alerting false). KB 정책 스냅샷 확보 — 필터에 check_id 없음. uptime 체크는 KB 1개 |
| (a) --alert-only 반영 | 21:06:32 | `✓ Alert policy ready: gh-radar-relay-down` → KYOBO 체크 create → KYOBO 정책 create → `✓ KYOBO 감시: 켜짐`. 컨테이너 무변경 |
| (b) KB 의미 불변 | 21:06:55 | KB 정책 두 조건에 `metric.label.check_id = "gh-radar-relay-healthz-WsIStDFOShs"` 2줄. 그 줄을 뺀 나머지(임계값 · duration · aggregations · combiner · 채널 · enabled · documentation)는 jq diff 로 before 와 동일. KB 체크 조회 정확히 1줄 |
| (c) KYOBO 자원 모양 | 21:06:55 | 체크: 매처 1개 MATCHES_JSON_PATH `$.journalGateways.KYOBO.alerting` EXACT_MATCH `false` · 2XX/5XX · 60s/10s · SSL 검증 · dma.jx1.io/healthz. 정책: enabled · AND · 조건 2개(6지점 평균 · 싱가포르) 둘 다 KYOBO check_id · 300s · <0.9 · 채널 14409521670382124894 |
| (d) 멱등 재실행 | 21:07:11 | KB 정책 update → KYOBO 체크 **update** → KYOBO 정책 update. 체크 1 · 매처 1 · 정책 1 |
| (e) 6지점 양성 | 21:09:43 / 21:20 | 21:09 에 5지점 true(usa-iowa 첫 실행 전), 21:20 재확인 6지점 전부 true. healthz alerting false → JSONPath 불리언 exact-match 가정 실측 확인 |
| (f) 임시 음성 시험 · 정리 | 21:10:10 → 21:19:18 → 21:20:20 | `gh-radar-kyobo-observer-negtest`(content `true`, 항상 실패) + 채널 없는 임시 정책 생성. Alerts API 에서 negtest incident OPEN 12:19:18Z — **체크 생성 후 9분 08초**. 같은 창에서 T0 이후 `gh-radar-relay-down` · `gh-radar-kyobo-observer-down` 알림 **0건**(KB 격리 실측). 임시 정책 → 임시 체크 삭제, 잔여 0(uptime 체크는 KB · KYOBO 2개) |
| (g) smoke | 21:20~21:21 | INV-8 PASS · 전체 PASS 12 · FAIL 0 · SKIP 1. 참고 블록: 키 있음 · 체크 있음 · 정책 있음 · KB check_id 한정 예 · 판정 일치 |

- KYOBO 체크 ID: `gh-radar-kyobo-observer-healthz-eZ8wCmJC4bs`
- KYOBO 정책 name: `projects/gh-radar/alertPolicies/12965074953265754022` (gh-radar-kyobo-observer-down)
- 음성 incident 발화 소요: 9분 08초(체크 생성 12:10:10Z → OPEN 12:19:18Z). 실제 KYOBO 끊김이면 relay 유예 180초가 더해져 약 12분 뒤 메일
- smoke 수치: PASS 12 · FAIL 0 · SKIP 1
- 계획 `<verify>` 자동 판정: PASS
- 메인 세션 편차: 음성 정책 파일 생성 시 제 검사식이 문서 본문의 `NOTIFICATION_CHANNEL_ID` 글자에 걸려 1회 재생성(채널 키 블록 부재만 확인하도록 수정). 자원 영향 없음
- 저장소 변경은 Task 1 커밋 2건뿐이다. 다음 전체 relay 배포는 Section 6 에서 같은 규칙(KB check_id 한정 → KYOBO 동기화)을 다시 적용한다.

## Self-Check: PASSED

- FOUND: ops/alert-kyobo-observer-down.yaml
- FOUND: 8c785483 (feat) · 0dbfc860 (docs)
- 하네스 all: PASS 36 · FAIL 0
