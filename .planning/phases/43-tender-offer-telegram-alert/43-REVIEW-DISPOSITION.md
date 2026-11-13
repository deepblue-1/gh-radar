---
phase: 43
review: 43-REVIEW.md
titles: json
findings:
  - id: CR-50
    severity: critical
    disposition: open
    title: "실행이 아예 생기지 않으면 아무 알림도 없다 — 스모크는 PAUSED 를 통과로 보고, `--scheduler-paused` 는 돌던 Scheduler 도 멈춘다"
  - id: WR-01
    severity: warning
    disposition: open
    title: "넣기가 계속 실패하면 모든 알림이 소리 없이 멈춘다 — 경고 로그만 남고 장애 판정을 건너뛰며, 한 행이 묶음 전체를 막는다"
  - id: WR-02
    severity: warning
    disposition: open
    title: "「멈췄습니다」 · 「다시 동작」 짝이 깨지는 길 — notice 기록 실패 · 복구 글 실패가 재시도되지 않는다"
  - id: WR-03
    severity: warning
    disposition: open
    title: "HTTP 429 · 403(OpenDART 본문이 없는 응답)을 일시 장애로 분류한다 — 차단 신호에도 5 ~ 10초마다 계속 조회한다"
  - id: WR-04
    severity: warning
    disposition: open
    title: "axios `timeout` 은 「연결된 뒤 응답이 없는 시간」 만 재고, Supabase 호출에는 제한 시간이 없다 — 90초 임대 · 송신 기한 계산의 전제(요청당 최대 10초)가 성립하지 않는다"
  - id: WR-05
    severity: warning
    disposition: open
    title: "멈추는 길(한도 · 예산 소진 · 창 끝)에서 이미 넣은 미송신 건이 버려지고, 다음 날 `expired` 는 info 로만 남는다"
  - id: WR-50
    severity: warning
    disposition: open
    title: "`--scheduler-paused` 생성 경로의 경합 — 만든 직후 멈추기 전에 깨움이 나가면 그날 공시가 「(늦은 알림)」 으로 쏟아진다"
  - id: WR-51
    severity: warning
    disposition: open
    title: "커밋 안 된 작업 트리를 HEAD SHA 로 빌드해 배포한다 — 이미지 태그 · APP_VERSION 이 실제 코드와 다르다"
  - id: WR-52
    severity: warning
    disposition: open
    title: "스모크는 OpenDART 키만 확인한다 — Supabase · 마이그레이션 · 텔레그램이 깨져도 6/6 통과하고, 되돌릴 길도 없다"
  - id: WR-53
    severity: warning
    disposition: open
    title: "알림 정책 update-or-create 가 조회 오류를 「없음」 으로 삼킨다 — 일시 오류 한 번에 정책이 중복으로 생긴다"
  - id: WR-54
    severity: warning
    disposition: open
    title: "survey 의 오늘 사용량 · 한도 의심 확인이 확인 실패 시 그냥 진행하고, 호출 수는 끝에서만 더한다"
  - id: WR-55
    severity: warning
    disposition: open
    title: "로거 가림 테스트가 한 단계 아래까지만 본다 — 진짜 AxiosError 를 그대로 남기면 `err.response.config.params.crtfc_key` 가 출력된다(실측)"
  - id: WR-56
    severity: warning
    disposition: open
    title: "진입점의 예산 · 한도 의심 결선을 어떤 테스트도 확인하지 않는다 — 단언 없는 `usage.add(3)` 과 날짜를 버리는 가짜 DB"
  - id: IN-01
    severity: info
    disposition: open
    title: "다시 연 장애 글의 사유 · 시작 시각이 처음 연 실행의 것과 다르다"
  - id: IN-02
    severity: info
    disposition: open
    title: "CLI 진입점이 예상 밖 예외를 로그 없이 삼킨다"
  - id: IN-03
    severity: info
    disposition: open
    title: "우리 쪽 송신 속도 제한 때문에 밀린 건에도 「(늦은 알림)」 이 붙는다"
  - id: IN-04
    severity: info
    disposition: open
    title: "치명 종료 중 장애 글을 쓰다 임대를 잃으면 error `dart outage open failed` 가 잘못 나간다"
  - id: IN-05
    severity: info
    disposition: open
    title: "빌드 이미지 · pnpm 버전이 고정되지 않았다"
  - id: IN-50
    severity: info
    disposition: open
    title: "가짜 DB 의 `after` 훅 — 주석은 「넣기 · 차례 · 기록 · 장애」 라지만 넣기 · 장애에서는 부르지 않는다"
  - id: IN-51
    severity: info
    disposition: open
    title: "dbContract 「반환 키」 검사가 상태 문자열과 겹치는 키에서는 아무것도 확인하지 못한다"
  - id: IN-52
    severity: info
    disposition: open
    title: "config.test 가 `process.env` 를 일반 객체로 바꿔 끼운다"
  - id: IN-53
    severity: info
    disposition: open
    title: "`file_mode` 의 「Linux(stat -c)」 분기는 동작하지 않는다"
  - id: IN-54
    severity: info
    disposition: open
    title: "CLAUDE.md 「OpenDART 소비처 … 하나」 가 survey 스크립트와 어긋나고, 같은 절의 Naver 불릿은 이제 어느 API 인지 이름이 없다"
  - id: IN-55
    severity: info
    disposition: open
    title: "survey 기간이 days+1 일이다 — 90일이면 OpenDART 검색기간 제한에 걸릴 수 있고, 60쪽에서 잘리면 ⑶ 이 적게 나온다"
  - id: IN-56
    severity: info
    disposition: open
    title: "deploy 임시 YAML 은 실패하면 남고, self-test 의 추적 모드 검사는 `set -o xtrace` 를 못 잡는다"
  - id: IN-57
    severity: info
    disposition: open
    title: "스모크 INV-4 는 15분 안의 이전 probe 로그로도 통과하고, INV-1 은 실패 때 실행 이름을 버린다"
  - id: IN-58
    severity: info
    disposition: open
    title: "SA 없음 힌트가 Scheduler SA 에도 setup-dart-alert-iam.sh 를 안내하지만, 그 스크립트는 Scheduler SA 를 만들지 않는다"
  - id: IN-59
    severity: info
    disposition: open
    title: "Generality without instantiation — `DART_SCHEDULERS` 배열 · 「이름|cron」 파싱 · 반복문이 원소 1개로 고정돼 있다"
open: 28
total: 28
recorded: 2026-11-13T01:26:37.031Z
---

# Phase 43: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-50 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-50 | warning | open | - |
| WR-51 | warning | open | - |
| WR-52 | warning | open | - |
| WR-53 | warning | open | - |
| WR-54 | warning | open | - |
| WR-55 | warning | open | - |
| WR-56 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-50 | info | open | - |
| IN-51 | info | open | - |
| IN-52 | info | open | - |
| IN-53 | info | open | - |
| IN-54 | info | open | - |
| IN-55 | info | open | - |
| IN-56 | info | open | - |
| IN-57 | info | open | - |
| IN-58 | info | open | - |
| IN-59 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
