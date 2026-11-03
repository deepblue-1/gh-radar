---
phase: 37
review: 37-REVIEW.md
titles: json
findings:
  - id: CR-30
    severity: critical
    disposition: fixed
    title: "레코드 0건 closed 키 하나가 그날 승격 전체를 실패시킨다 (tickgw export ↔ promote 계약 불일치)"
  - id: CR-31
    severity: critical
    disposition: fixed
    title: "20:00 원본 압축(`compressed_files_skipped`)을 무시해 잘린 하루를 「완결 · closed」 로 승격한다"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "요청 변환 하루 상한이 「행 수」를 세서, 같은 키를 다시 깨우는 Job 실행이 상한에 잡히지 않음"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "여러 사용자가 합쳐 쓰는 요청을 첫 요청자가 취소하면 다른 사용자 화면에는 「실패」로 보임"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "빅텍 하루 선택 골든은 `.pnl.json` 존재만 보고 켜지는데, 생성기는 크기 초과 `.ticks.zst` 를 「커밋하지 말라」고만 함"
  - id: WR-30
    severity: warning
    disposition: fixed
    title: "승격 경로에 격자 크기 상한(`GRID_MAX_BYTES`)이 없다 → 대형 종목은 매일 두 번 실패 · 알림"
  - id: WR-31
    severity: warning
    disposition: fixed
    title: "tickgw 256MB 컨테이너에서 전체 버퍼 복사가 겹쳐 OOM → 그날 캐시(승격 입력) 소실"
  - id: WR-32
    severity: warning
    disposition: fixed
    title: "당일 첫 응답(08:00~지금 하루치)에 크기 상한이 없어 server 를 통째로 버퍼링해 통과한다"
  - id: WR-33
    severity: warning
    disposition: fixed
    title: "활성 키 합이 캐시 상한을 넘으면 LRU 가 폴링 중인 키를 지우고, 그 키를 08:00 부터 다시 받는 고리에 빠진다"
  - id: WR-34
    severity: warning
    disposition: fixed
    title: "tickgw 배포 시각 가드가 20:00~21:00 승격 창을 보호하지 않고, 실패 시 되돌릴 컨테이너도 없다"
  - id: WR-35
    severity: warning
    disposition: fixed
    title: "선택 env `TICKGW_URL` 을 빠뜨린 재배포가 운영 중인 당일 경로를 조용히 끄거나 승격 Job 을 옛 이미지에 묶어 둔다"
  - id: WR-36
    severity: warning
    disposition: fixed
    title: "nightly 에서 키 하나만 실패해도(또는 원본 하나가 깨져도) 그 날짜 전량(≈9GB Archive)을 하루 두 번 · 최대 10일 다시 읽는다"
  - id: WR-60
    severity: warning
    disposition: fixed
    title: "재생 중 URL 스로틀 쓰기가 진행 중인 `router.push` 를 버린다 — 「목록으로」·날짜·거래소·종목 이동이 사라짐"
  - id: WR-61
    severity: warning
    disposition: fixed
    title: "대기 중인 URL 쓰기 타이머가 옛 세션을 붙잡는다 — 당일 증분 직후 BigInt TypeError 또는 틀린 `t`"
  - id: WR-62
    severity: warning
    disposition: fixed
    title: "당일 zstd 해제·세션 재생성 예외를 잡지 않는다 — 하루치는 영원히 「받는 중」, 증분은 조각을 조용히 건너뜀"
  - id: WR-63
    severity: warning
    disposition: fixed
    title: "`X-Tick-Complete=false`(알려진 끊김)를 화면 어디에도 보이지 않는다"
  - id: WR-64
    severity: warning
    disposition: fixed
    title: "`tickLiveMetaOf` 가 `X-Tick-Offset-End` 없음을 0 으로 받는다 — 다음 증분이 하루치 전체를 다시 이어붙인다"
  - id: WR-65
    severity: warning
    disposition: fixed
    title: "URL `t` 가 ms 로 잘려 딥링크·새로고침이 같은 틱으로 돌아오지 않는다 — 버스트 조각 안에서 특히"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "`hits15(pct, px, chg)` 와 `DayRateTracker.add(pct, chg, px)` 의 숫자 인자 순서가 반대"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "레코드 인덱스 · 거래소순 · 뒤집힘 · 호가 재구성이 「한 파일 = 한 ISIN」을 전제하는데, 이 전제를 검사하거나 적어 두지 않음"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`PcapNsReader` 의 `nonUdp` · `badFrame` 분기가 테스트로 잠기지 않음"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "`a3ColumnsOf` 가 필드 오프셋은 레이아웃에서 찾지만 길이는 숫자로 박아 둠"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "`num()` · `str()` 변환 도우미가 다섯 모듈에 복사돼 있고, `decodeAny` 가 `layoutOf` 를 다시 구현함"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "`tick_grid_upsert` 는 한 배치 안에 같은 (date, exchange, isin) 가 두 번 오면 배치 전체가 실패함"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "오라클 `scoped_frames` 가 빈 범위에 `None` 을 넣는데, `cmd_pnl` · `cmd_g4cut` 은 바로 튜플로 풂"
  - id: IN-08
    severity: info
    disposition: fixed
    title: "생성기 머리의 「.ticks.zst 하나라도 1.5MB 초과면 종료 1」이 decode · launch 에만 적용됨"
  - id: IN-30
    severity: info
    disposition: fixed
    title: "`runIndexer` 의 상한 초과 경로가 0 으로 채운 버퍼를 만들고, 종료코드 삼항식은 죽은 코드다"
  - id: IN-31
    severity: info
    disposition: fixed
    title: "요청 변환 트리거 타임아웃(10초) 뒤 되돌림이 이미 시작된 실행과 중복 실행을 낳을 수 있다"
  - id: IN-32
    severity: info
    disposition: fixed
    title: "통독 중 잘린 꼬리 파일 수(`truncatedFiles`)가 어디에도 보고되지 않는다"
  - id: IN-33
    severity: info
    disposition: fixed
    title: "배포 스크립트가 HEAD SHA 로 태그하지만 작업 트리를 빌드하고, IAP 실패를 「tickpull 미설치」 로 잘못 알린다"
  - id: IN-34
    severity: info
    disposition: fixed
    title: "`openTick` 이 RPC 응답 필드 일부를 모양 검사 없이 단언 캐스트한다"
  - id: IN-60
    severity: info
    disposition: fixed
    title: "「오늘」이 마운트 때 한 번만 정해져서 20:00·자정을 넘기면 목록과 열기가 엇갈린다"
  - id: IN-61
    severity: info
    disposition: fixed
    title: "공급 배지가 자료 출처가 아니라 날짜로 정해진다"
  - id: IN-62
    severity: info
    disposition: fixed
    title: "격자 서명 URL fetch 에 시간 상한·취소가 없다"
  - id: IN-63
    severity: info
    disposition: fixed
    title: "증분·own 재조회마다 전문 목록이 커서 행으로 강제 가운데 스크롤된다"
  - id: IN-64
    severity: info
    disposition: fixed
    title: "409(epoch 교체)로 하루치를 다시 받는 동안 「최신 받기」 버튼이 눌리지만 아무 일도 하지 않는다"
open: 0
total: 36
recorded: 2026-11-03T21:26:41.866Z
---

# Phase 37: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-30 | critical | fixed | 37-REVIEW-FIX.md |
| CR-31 | critical | fixed | 37-REVIEW-FIX.md |
| WR-01 | warning | fixed | 37-REVIEW-FIX.md |
| WR-02 | warning | fixed | 37-REVIEW-FIX.md |
| WR-03 | warning | fixed | 37-REVIEW-FIX.md |
| WR-30 | warning | fixed | 37-REVIEW-FIX.md |
| WR-31 | warning | fixed | 37-REVIEW-FIX.md |
| WR-32 | warning | fixed | 37-REVIEW-FIX.md |
| WR-33 | warning | fixed | 37-REVIEW-FIX.md |
| WR-34 | warning | fixed | 37-REVIEW-FIX.md |
| WR-35 | warning | fixed | 37-REVIEW-FIX.md |
| WR-36 | warning | fixed | 37-REVIEW-FIX.md |
| WR-60 | warning | fixed | 37-REVIEW-FIX.md |
| WR-61 | warning | fixed | 37-REVIEW-FIX.md |
| WR-62 | warning | fixed | 37-REVIEW-FIX.md |
| WR-63 | warning | fixed | 37-REVIEW-FIX.md |
| WR-64 | warning | fixed | 37-REVIEW-FIX.md |
| WR-65 | warning | fixed | 37-REVIEW-FIX.md |
| IN-01 | info | fixed | 37-REVIEW-FIX.md |
| IN-02 | info | fixed | 37-REVIEW-FIX.md |
| IN-03 | info | fixed | 37-REVIEW-FIX.md |
| IN-04 | info | fixed | 37-REVIEW-FIX.md |
| IN-05 | info | fixed | 37-REVIEW-FIX.md |
| IN-06 | info | fixed | 37-REVIEW-FIX.md |
| IN-07 | info | fixed | 37-REVIEW-FIX.md |
| IN-08 | info | fixed | 37-REVIEW-FIX.md |
| IN-30 | info | fixed | 37-REVIEW-FIX.md |
| IN-31 | info | fixed | 37-REVIEW-FIX.md |
| IN-32 | info | fixed | 37-REVIEW-FIX.md |
| IN-33 | info | fixed | 37-REVIEW-FIX.md |
| IN-34 | info | fixed | 37-REVIEW-FIX.md |
| IN-60 | info | fixed | 37-REVIEW-FIX.md |
| IN-61 | info | fixed | 37-REVIEW-FIX.md |
| IN-62 | info | fixed | 37-REVIEW-FIX.md |
| IN-63 | info | fixed | 37-REVIEW-FIX.md |
| IN-64 | info | fixed | 37-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
