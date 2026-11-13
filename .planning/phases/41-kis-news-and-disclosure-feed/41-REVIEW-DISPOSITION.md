---
phase: 41
review: 41-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "커서가 갱신 시각(`data_tm`)을 써서 수정본이 쪽 끝에 오면 되감기가 조용히 멈추고 틈이 영구히 빈다"
  - id: CR-60
    severity: critical
    disposition: open
    title: "수집 전(`collectedAt: null`) 응답을 기준선으로 잡아, 서버가 첫 종목별 수집을 마치면 3일 치 기존 글이 「새 글」로 강조된다"
  - id: WR-01
    severity: warning
    disposition: open
    title: "「초당 초과 5번 → 60초 전면 정지」가 같은 걸음의 나머지 흐름(F · G · 종목별)에는 걸리지 않는다"
  - id: WR-02
    severity: warning
    disposition: open
    title: "5xx 와 함께 온 모르는 `msg_cd` 는 영구 「transient」 — 한도 소진 신호여도 run 이 멈추지 않는다(운영 기준 ④)"
  - id: WR-03
    severity: warning
    disposition: open
    title: "분류 통계(무효 · 미연결 · 모르는 코드)를 버린다 — 응답 모양이 바뀌거나 종목 정보가 비면 아무 로그 없이 0건 수집"
  - id: WR-04
    severity: warning
    disposition: open
    title: "한도 의심 표시가 있는 날 탐침이 토큰 무효를 「한도 탐침 실패」로 처리 — 강제 재발급 없이 하루 종일 실패를 반복할 수 있다"
  - id: WR-30
    severity: warning
    disposition: open
    title: "시황 제목 규칙이 종목 재료 기사를 지운다 — 「지수가 주어」 · 「두 지수 동시 등장」 규칙의 오탐"
  - id: WR-31
    severity: warning
    disposition: open
    title: "종목 뉴스 목록의 `before` 커서가 한투 ↔ 네이버 짝을 쪽 경계에서 끊는다 — 같은 기사 두 줄 · 링크 유실"
  - id: WR-32
    severity: warning
    disposition: open
    title: "묶음 조회 등록 upsert 의 잠금 순서가 정해지지 않아 동시 등록끼리 교착할 수 있다"
  - id: WR-60
    severity: warning
    disposition: open
    title: "회차 시작마다 진행 중 요청을 끊어서, 묶음 순차 조회가 10초를 넘으면 응답이 영영 반영되지 않는다"
  - id: WR-61
    severity: warning
    disposition: open
    title: "코드 집합이 바뀔 때마다 디바운스 없이 즉시 전량 재조회한다 — 돌파 목록이 자주 바뀌는 장 시작 무렵 요청이 10초 설계보다 늘고 응답이 끊겨 버려진다"
  - id: WR-62
    severity: warning
    disposition: open
    title: "띠 · 상세의 「N건」(서버 `count`)과 펼쳐 보이는 줄 수가 다르다 — `+` 없이 「35건」 이라 쓰고 20줄만 보인다"
  - id: WR-63
    severity: warning
    disposition: open
    title: "e2e 픽스처가 옛 `NewsArticle` 모양이라 새 계약(`kind` · `url: null` · 배지)을 지나가지 않는다 — 작업대 e2e 는 `/api/news/by-stock` 을 모킹하지 않는다"
  - id: IN-01
    severity: info
    disposition: open
    title: "`tokenForced` 가 한 번 서면 실행 끝까지 그대로 — 몇 시간 뒤의 정상적인 토큰 무효 1번에도 종료 1"
  - id: IN-02
    severity: info
    disposition: open
    title: "쪽 상한(`capped`)에 닿으면 `lastSeen` 이 최신으로 건너뛰어 그 아래 틈은 다시 받지 않는다"
  - id: IN-03
    severity: info
    disposition: open
    title: "강제 `KIS_NEWS_MODE=fast` 를 06:00 전이나 주말에 주면 14시간 task-timeout 을 넘기거나 주말 내내 돈다"
  - id: IN-04
    severity: info
    disposition: open
    title: "Supabase 호출에 타임아웃이 없다 — DB 호출이 매달리면 임대 연장이 멈추고, 깨어난 뒤 남의 임대 아래서 한 걸음을 더 돈다"
  - id: IN-05
    severity: info
    disposition: open
    title: "종료 시 사용량 flush 가 실패하면 그 몫은 사라진다(예산 과소 집계)"
  - id: IN-06
    severity: info
    disposition: open
    title: "스모크 INV-4 가 15분 안 다른 실행의 「probe ok」로도 통과한다"
  - id: IN-07
    severity: info
    disposition: open
    title: "`setup-kis-secrets.sh` 의 `file_mode` 가 GNU stat(Linux)에서 항상 틀린 값을 낸다"
  - id: IN-08
    severity: info
    disposition: open
    title: "배포 스크립트가 Secret 이름 변수를 정의해 놓고 `--set-secrets` 에는 리터럴을 쓴다"
  - id: IN-09
    severity: info
    disposition: open
    title: "Generality without instantiation — `pageUntilSeen` 의 `minWrittenAt` 를 운영 코드가 한 번도 넘기지 않는다"
  - id: IN-30
    severity: info
    disposition: open
    title: "`clampInt` 주석과 실제 동작이 다르다 — 비정수 · 숫자 아닌 값은 잘라 맞추지 않고 400"
  - id: IN-31
    severity: info
    disposition: open
    title: "`isRpcResult` 가 두 라우트에 복제돼 있다"
  - id: IN-32
    severity: info
    disposition: open
    title: "`newsTitleKey` 가 가운뎃점 「ㆍ」(아래아)을 글자로 남긴다 — 「기호 차이 무시」(D-12)의 빈틈"
  - id: IN-33
    severity: info
    disposition: open
    title: "`stock_title_needles` 낱말 규칙이 넓은 낱말을 만든다 — 우선주 「LG우」 → `lg`, 첫 낱말 「NHN KCP」 → `nhn`"
  - id: IN-34
    severity: info
    disposition: open
    title: "인증 없는 묶음 조회가 등록 상한(200)을 밀어낼 수 있다"
  - id: IN-35
    severity: info
    disposition: open
    title: "auto_market 2번 규칙이 「<이름>(<코드>) 급등, <재료>」 꼴의 재료 기사까지 숨긴다"
  - id: IN-36
    severity: info
    disposition: open
    title: "server · home-sync 가 6인자 RPC(`p_min_disclosures`)를 전제한다 — DB 먼저 배포 필수"
  - id: IN-60
    severity: info
    disposition: open
    title: "코드가 0개가 되면 effect 가 바로 끝나서 이전 entries · 기준선이 그대로 남는다"
  - id: IN-61
    severity: info
    disposition: open
    title: "영구 실패 · 형식 밖 코드는 「불러오는 중」 / pending 자리에 끝없이 머문다 — 오류와 로딩을 구분할 수 없다"
  - id: IN-62
    severity: info
    disposition: open
    title: "묶음 경계가 사용자별 카드 코드와 공용 돌파 코드를 섞어서, 서버 5초 캐시를 사용자끼리 나눠 쓰지 못한다"
open: 32
total: 32
recorded: 2026-11-13T11:41:12.356Z
---

# Phase 41: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| CR-60 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-30 | warning | open | - |
| WR-31 | warning | open | - |
| WR-32 | warning | open | - |
| WR-60 | warning | open | - |
| WR-61 | warning | open | - |
| WR-62 | warning | open | - |
| WR-63 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| IN-09 | info | open | - |
| IN-30 | info | open | - |
| IN-31 | info | open | - |
| IN-32 | info | open | - |
| IN-33 | info | open | - |
| IN-34 | info | open | - |
| IN-35 | info | open | - |
| IN-36 | info | open | - |
| IN-60 | info | open | - |
| IN-61 | info | open | - |
| IN-62 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
