---
phase: quick-260925-o1s
plan: 01
subsystem: relay-ops
tags: [relay, alerting, gcp-monitoring, deploy-script, docs]
status: complete
requires: []
provides:
  - "ops/alert-relay-down.yaml documentation 9,039 바이트 (GCP 상한 10,240 아래)"
  - "scripts/deploy-relay.sh --alert-only (알림 정책만 갱신)"
  - "docs/relay-operations.md 「관찰자 기록 연결 (Phase 19)」 → 「상태별 대응 (알림 8번 상세)」"
affects: [scripts/deploy-relay.sh, ops/alert-relay-down.yaml, docs/relay-operations.md]
tech-stack:
  added: []
  patterns: ["알림 정책 update-or-create 를 함수 apply_alert_policy 한 벌로 — 전체 배포와 --alert-only 공용"]
key-files:
  created:
    - .planning/quick/260925-o1s-relay-alert-doc-size/260925-o1s-verify.sh
  modified:
    - scripts/deploy-relay.sh
    - ops/alert-relay-down.yaml
    - docs/relay-operations.md
decisions:
  - "알림 문서 8번은 4줄 요약 + 운영 문서 링크만. 상세는 docs/relay-operations.md 「상태별 대응 (알림 8번 상세)」"
  - "--alert-only 분기는 SUPABASE_URL 가드 · IAP SSH(DMA_HOST 조회)보다 앞. 채널 미설정이면 (전체 경로와 달리) 실패"
  - "알림 문서 크기 규칙: 9,500 바이트 이하 유지 (GCP 상한 10,240)"
metrics:
  completed: 2026-09-25
  duration: "약 6분 (17:28~17:34 KST)"
actuals:
  tokens: 8350
  tasks: 3
  commits: 0
plan_head_before: 1978d9b
---

# Quick 260925-o1s: relay 알림 문서 크기 축소 + deploy-relay.sh --alert-only Summary

relay 알림 정책 `gh-radar-relay-down` 의 documentation 을 10,834 → 9,039 바이트로 줄여(8번 상세를 운영 문서로 이관) GCP 상한 10,240 초과로 인한 `deploy-relay.sh` 마지막 단계 exit 1 을 없애고, relay 재배포 없이 정책만 갱신하는 `--alert-only` 를 추가해 라이브 정책에 적용했다 — 조건·임계·채널은 적용 전과 동일함을 describe 비교로 확인.

## 크기 측정

- **방법:** GCP 가 받는 문자열 그대로 — `ruby -ryaml -e 'print YAML.load_file(ARGV[0])["documentation"]["content"].bytesize' ops/alert-relay-down.yaml` (YAML 파싱 후 documentation.content 의 UTF-8 바이트).
- **변경 전 (기준 커밋 1978d9b):** 10,834 바이트 (19-12 GCP 오류 값과 일치)
- **변경 후:** **9,039 바이트** (계획 모의 교체 실측과 동일, 상한 여유 1,201 · 규칙 9,500 대비 여유 461)
- **교차 확인:** stub S2 가 포착한 resolved.yaml 문서도 9,039 바이트.
- **라이브:** 적용 전 7,782 바이트(8번 없는 옛 판, 19-12 갱신 실패로 유지되던 것) → 적용 후 9,039 바이트.

## 한 일

### Task 1 — `deploy-relay.sh --alert-only` (tracer)
- 인자 `--alert-only) MODE=alert-only`, usage 문구 `[--rollback <tag> | --alert-only]`, 헤더 사용법 주석 3줄.
- `ALERT_FILE` 대입을 Section 2 상수(`ALERT_POLICY=` 아래)로 옮겨 1회만 둠.
- Section 6 의 알림 블록을 **그대로** 함수 `apply_alert_policy()` 로 추출(`CHANNEL_RESOURCE`·`RESOLVED_YAML`·`EXISTING_POLICY` 는 `local` 선언 후 기존과 같은 대입 — pipefail 동작 불변). Section 6 은 호출 한 줄.
- `--alert-only` 분기: `RELAY_SA=` 뒤·`SHA=` 앞. `ALERT_FILE` 부재 → 「저장소 루트에서 실행하세요」 exit 1, `NOTIFICATION_CHANNEL_ID` 비었으면 exit 1, 아니면 `apply_alert_policy` 후 exit 0. SUPABASE_URL 가드·IAP SSH 보다 앞이라 둘 다 요구/실행하지 않음. gcloud 가드(Section 1)는 그대로 통과.
- `apply_alert_policy` 출현 3회(정의 1 + 호출 2), `ALERT_FILE=` 대입 1회.

### Task 2 — 알림 문서 8번 → 운영 문서
- `ops/alert-relay-down.yaml` 8번(기준판 75~94행, 20줄)을 확정 문안 A 4줄로 교체. 범위 좁히기 표(journal 3행) · healthz `curl` · 1~7번 · 검증 줄 · 임계값과 오탐 · 싱가포르 AND · 설계 메모 · `mimeType` 이하는 손대지 않음.
- `docs/relay-operations.md` 「관찰자 기록 연결 (Phase 19)」의 `- **알림.**` 불릿을 확정 문안 B 로 교체(알림 불릿 개정 + 「알림 문서는 요약만 둔다」 + 「상태별 대응 (알림 8번 상세)」).
- 옛 8번 사실 대조: 주문 기록 유일 경로(절 머리 18행), 장중·휴장일 제외, 아침 확인, rejected 즉시/180초/≈3분+5분, 로그 tail -50, `[JOURNAL]`/`[journal]`, 재시작 전 재시도 없음(위 「로그인 거부」), 해시 대조, 관찰자 로그인(5) 구버전·30초·상한 없음, vpn:false 우선, lagSeq, db_error SQL 2개, 유실 없음·같은 배치 재적용, seqRegressions 비-503(위 「seq 역행 신호」에 epoch/head/마지막 seq 유지까지 이미 있음) — 누락 없음, 보탠 문장 없음.

### Task 3 — 라이브 적용
- 정책 이름: `gcloud alpha monitoring policies list --filter='displayName=gh-radar-relay-down'` → 정확히 1줄 `projects/gh-radar/alertPolicies/7995724305267722560` (`infra/relay/README.md` 254행과 일치).
- gcloud: 활성 config `gh-radar` · 계정 `gh-radar-deployer@gh-radar.iam.gserviceaccount.com` · 키 파일 존재.
- before 스냅샷 → `PRECHECK PASS` (조건 2개 · combiner AND · enabled true · 채널 `projects/gh-radar/notificationChannels/14409521670382124894` · autoClose 1800s 일치, 라이브 전용 키 없음). precheck 음성 대조(임계 0.8 로 조작한 사본) → `PRECHECK STOP` exit 1 확인.
- 실행: `env -u SUPABASE_URL GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=14409521670382124894 GOOGLE_APPLICATION_CREDENTIALS=… CLOUDSDK_CORE_PROJECT=gh-radar bash scripts/deploy-relay.sh --alert-only` 1회:
  ```
  ✓ guard: config=gh-radar project=gh-radar
  ▶ updating alert policy: gh-radar-relay-down ...
  ✓ Alert policy ready: gh-radar-relay-down
    (--alert-only: relay 컨테이너 · uptime check 는 건드리지 않았습니다)
  exit=0
  ```
- after 스냅샷: mutationRecord 2026-09-25T08:33:27Z (deployer SA). `LIVE PASS before_doc=7782 after_doc=9039` — 투영(displayName · combiner · enabled · notificationChannels · alertStrategy · severity · userLabels · conditions(name 제외)) before/after 동일, 라이브 문서 = 로컬 content 바이트 동일, 「상태별 대응」 포함, 이전과 다름. 두 조건 임계 모두 0.9 유지.
- 스냅샷은 scratchpad(`/private/tmp/claude-501/-Users-alex-repos-gh-radar/8c092d3a-7c5e-4ca4-942f-5cbc57d8934d/scratchpad/o1s-{before,after}.json`)에만 있음 — 커밋 대상 아님.

## 검증 결과

| 검사 | 결과 |
|---|---|
| `bash -n scripts/deploy-relay.sh` | 통과 (Task 1 · Task 3 마지막) |
| `verify.sh stub` | `STUB PASS` — S1 전체 경로: 기준판(1978d9b)과 gcloud/docker 호출 27건 · stdout+stderr · resolved.yaml 동일, uptime update 가 policies update 보다 앞 / S2 `--alert-only`(SUPABASE_URL unset): 호출 4건(가드 2 + list + update), compute ssh·instances·secrets·firewall·uptime·docker 0, 채널 치환 확인, S1 resolved 와 동일 / S2b 정책 없음 → create / S3 채널 미설정 → exit 1, 정책 호출 0 / S4 `--bogus` → exit 1 + usage(`--alert-only` 포함) / S5 기본 모드 SUPABASE_URL 미설정 → exit 1, compute ssh 0 |
| stub 음성 대조 | `BASE_REF=4225a6f`(관찰자 비밀 추가 전)로 돌리면 S1 이 호출 로그 차이로 실패 — 하네스가 회귀를 잡는다 |
| `verify.sh size` | `SIZE PASS bytes=9039 (base=10834 lines8=4)` — 문서 밖 구조 동등, `mimeType` 이하 바이트 동일, 필수/금지 문자열, 운영 문서 고정 문자열 13개, 헤딩 1회 |
| `verify.sh precheck` | `PRECHECK PASS` |
| `verify.sh live-diff` | `LIVE PASS before_doc=7782 after_doc=9039` |
| 커밋 | 0 (`git log -1` = 1978d9b 그대로) |

## Deviations from Plan

- 검증 스크립트의 4개 하위명령(stub · size · precheck · live-diff)을 Task 1 시점에 한 번에 작성했다(계획은 태스크별로 채움). 각 하위명령은 해당 태스크에서 처음 실행해 판정했으므로 결과에는 차이가 없다.
- 계약에 없던 보강 2건(모두 검증 강화): precheck 가 조건 **개수**도 비교(라이브에만 있는 조건이 update 로 사라지는 경우를 잡기 위함), stub 은 하위 프로세스 env 에서 `CLOUDSDK_CORE_PROJECT`·`GOOGLE_APPLICATION_CREDENTIALS` 도 제거하고 `TMPDIR` 을 작업 디렉터리로 격리.

그 밖에는 계획대로 실행. relay·server·webapp 배포 0, push 0, 커밋 0, STATE.md · ROADMAP.md · Phase 19 산출물 변경 0. 무관한 작업 트리 변경(`.planning/state.json` · `.planning/milestone.lock` · `.planning/sketches/`)은 건드리지 않음.

## 제안 커밋 메시지 (오케스트레이터가 사용자 확인 후 커밋)

```
fix(relay): 알림 정책 documentation 10,834→9,039 바이트로 축소(8번 상세를 운영 문서로) · deploy-relay.sh --alert-only 추가 · 라이브 정책 갱신

- ops/alert-relay-down.yaml: 8번(관찰자 기록 연결 이상)을 4줄 요약 + 운영 문서 링크로 교체. GCP 상한 10,240 초과로 deploy-relay.sh 가 알림 단계에서 exit 1 로 끝나던 문제 해소. 조건·임계(0.9 · 싱가포르 AND)·채널 불변
- docs/relay-operations.md: 「관찰자 기록 연결 (Phase 19)」에 알림 문서 크기 규칙(≤ 9,500) · --alert-only 사용법 · 「상태별 대응 (알림 8번 상세)」 이관
- scripts/deploy-relay.sh: 알림 정책 단계를 apply_alert_policy 로 추출(전체 배포와 공용), --alert-only 는 SUPABASE_URL·IAP SSH 없이 정책만 갱신
- 라이브 정책 projects/gh-radar/alertPolicies/7995724305267722560 문서 갱신(7,782→9,039), 적용 전/후 describe 비교로 문서 외 필드 불변 확인
- quick 260925-o1s 검증 하네스(stub · size · precheck · live-diff) 추가
```

## Self-Check: PASSED

- FOUND: scripts/deploy-relay.sh (수정) · ops/alert-relay-down.yaml (수정) · docs/relay-operations.md (수정) · .planning/quick/260925-o1s-relay-alert-doc-size/260925-o1s-verify.sh (생성, 실행 권한)
- 커밋: 의도적으로 0 (사용자 규칙 — 오케스트레이터가 확인 후 커밋)
