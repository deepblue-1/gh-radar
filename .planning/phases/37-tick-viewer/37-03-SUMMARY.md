---
phase: 37-tick-viewer
plan: 03
subsystem: shared-ticks-judgement
status: complete
tags: [ticks, classify_orders, nxt-runs, team-pnl, golden, tickana, oracle, g4, roundHalfEven]

requires:
  - phase: 37-02
    provides: "framing(iterRecords) · decodeAny · readTicksZst · readTickJson · oracle.py/gen-fixtures.sh 부명령 꼴 · cut1300-krx/nxt.ticks.zst"
  - phase: gh-trade tickana
    provides: "teamflow.classify_orders · prepare_frame · team_pnl · teamflow_accum.load_day_a3 · nxt_runs · nxt_fixture(파이썬 정본)"
provides:
  - "packages/shared/src/ticks/orders-krx.ts — TeamScope · A3Trade · a3TradeOf · scopeTrades · cmpTimeNullsLast · ORDER_KIND · OrderKind · KrxOrder · isTeamKind · classifyKrxOrders"
  - "packages/shared/src/ticks/orders-nxt.ts — NxtRow · nxtRowOf · NxtTagged · tagNxtRuns · NxtRunStat · nxtRunStats · NxtSummary · nxtSummaryOf · NxtTeamOrder · classifyNxtTeamOrders"
  - "packages/shared/src/ticks/team-pnl.ts — TeamPnl · TeamFill · roundHalfEven · teamFillsOf · teamPnlOf · PnlPrefix · buildPnlPrefix · fillsUpTo · pnlAt"
  - "오라클 부명령 orders · runs · window · pnl(--bigtech) · g4cut + gen-fixtures.sh 같은 이름 부명령"
  - "픽스처 cut1300-krx.orders.json · cut1300-runs.json · cut1300-nxt.window.json · chunil-1014-a3.ticks.zst · chunil-1014.pnl.json · bigtech-1022-g4.ticks.zst · bigtech-1022-g4.golden.json"
  - "테스트 헬퍼 readA3Trades(tick-digest.ts)"
affects: [37-13, 37-14, 37-16]

actuals:
  tokens: 271794      # chars/4 over 텍스트 diff 전체(생성 JSON 포함 1,087,177자) · 손으로 쓴 코드 · 테스트 · README 만은 90,219자 ≈ 22,555
  tasks: 3
  commits: 5          # MEASURED: git rev-list --count 056a0da2..e8307865 (SUMMARY 커밋 제외)
plan_head_before: 056a0da278b230e9c7942cebd5f546168b004a48
plan_head_after: e8307865408950f92acacb12729ec4fc0bfeacbf

tech-stack:
  added: []
  patterns:
    - "판정 · 손익 함수는 계산 범위(TeamScope)를 인자로 — 범위 선택 · 순서는 scopeTrades 한 곳, classifyKrxOrders 는 정렬하지 않는다"
    - "오라클 pnl · g4cut: 그 ISIN A3 만 추출 → 이더넷/IPv4/UDP 로 다시 감싼 합성 pcap → convert_file — TS 가 읽는 바이트와 같은 입력으로 파이썬 정본을 돌린다"
    - "손익 접두 상태 배열(Float64Array n+1) + 시각 이진 탐색 — 선택 틱까지 손익 O(log n)"
    - "행 배열 골든 JSON 은 행마다 한 줄(키 정렬 · indent 1)"

key-files:
  created:
    - packages/shared/src/ticks/orders-krx.ts
    - packages/shared/src/ticks/orders-nxt.ts
    - packages/shared/src/ticks/team-pnl.ts
    - packages/shared/src/__tests__/ticks-orders-krx.golden.test.ts
    - packages/shared/src/__tests__/ticks-orders-nxt.golden.test.ts
    - packages/shared/src/__tests__/ticks-pnl.golden.test.ts
    - packages/shared/src/__fixtures__/ticks/cut1300-krx.orders.json
    - packages/shared/src/__fixtures__/ticks/cut1300-runs.json
    - packages/shared/src/__fixtures__/ticks/cut1300-nxt.window.json
    - packages/shared/src/__fixtures__/ticks/chunil-1014-a3.ticks.zst
    - packages/shared/src/__fixtures__/ticks/chunil-1014.pnl.json
    - packages/shared/src/__fixtures__/ticks/bigtech-1022-g4.ticks.zst
    - packages/shared/src/__fixtures__/ticks/bigtech-1022-g4.golden.json
  modified:
    - packages/shared/src/ticks/index.ts
    - packages/shared/src/__tests__/helpers/tick-digest.ts
    - packages/shared/src/__fixtures__/ticks/README.md
    - scripts/tick-oracle/oracle.py
    - scripts/tick-oracle/gen-fixtures.sh

key-decisions:
  - "accum 범위 정렬 키는 파이썬 그대로 (isin, trade_time_ns NULLS LAST, msg_seq) — 플랜 문구 「(tNs, seq)」 에 isin 을 앞에 둔 것은 한 종목 안에서 결과가 같고 파이썬 SQL 과 글자가 같다. 두 범위 모두 exchange='KRX' 조건 포함"
  - "NXT 정렬은 (isin, seq, A3 먼저, 입력 순서) — 파이썬 load_g1 이 A3 표 뒤에 B6 를 이어 안정 정렬하는 것과 같은 결과"
  - "NxtTeamOrder.tNs 는 bigint | null — 체결 시각을 못 읽은 조각을 감추지 않는다(파이썬은 그 경우 예외)"
  - "선택 틱 → 팀 체결 수는 fillsUpTo(prefix, tNs) 이진 탐색으로 노출(플랜 색인 밖 추가) — pnlAt 의 k 를 화면이 바로 얻게"
  - "빅텍 10/22 하루 골든(선택)은 돌리지 않았다 — G4 조각 골든이 accum 경로를 커밋 골든으로 덮고, 나머지 3.2GB GCS 꺼내기 비용을 아꼈다"

patterns-established:
  - "오라클 추출형 부명령: extract_isin_a3 → write_synthetic_pcap → convert_file → read_krx_a3(scope) — 37-05 model 이 재사용할 수 있다"

requirements-completed: [D-10, D-12, D-13, D-20]

coverage:
  - id: D1
    description: "KRX classifyKrxOrders 가 컷 13시 KRX G1 에서 tickana classify_orders 와 조각마다 [seq, oid, kind, team] 일치(주문 2,687 · 팀 126) · 셔플 입력 불변"
    requirement: D-20
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-orders-krx.golden.test.ts"
        status: pass
  - id: D2
    description: "NXT 런 규칙 오라클 일치 — NXT 179/65 · KRX 182/70 요약과 런별 통계 · 단독 창 13:30~13:40 팀 13건 · 매수 82,023,350 · 매도 49,348,980"
    requirement: D-13
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-orders-nxt.golden.test.ts"
        status: pass
  - id: D3
    description: "천일 10/14 teamflow · accum 두 범위 teamPnlOf = export payload.pnl 13키 · roundHalfEven · 접두 배열 = 앞 k 체결 재계산 · 범위 차 합성"
    requirement: D-10
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-pnl.golden.test.ts"
        status: pass
  - id: D4
    description: "빅텍 10/22 15~17시 G4 조각 — accum(뷰어 기본) · teamflow 두 범위 주문별 행 · team_pnl 13키 커밋 골든(skip 없음)"
    requirement: D-20
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-pnl.golden.test.ts"
        status: pass
  - id: D5
    description: "우리 체결 미제외(D-12) — A3 만으로 계산한 값이 export payload.pnl 과 같다"
    requirement: D-12
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-pnl.golden.test.ts"
        status: pass

duration: 18min
completed: 2026-11-02
---

# Phase 37 Plan 03: 버스트 · 팀 판정 · 팀 손익 shared 순수 함수 Summary

**tickana `classify_orders` · NXT 런(`tag_runs` · `classify_nxt_team_orders`) · `team_pnl` 평균단가법을 범위 인자(teamflow G1 / accum G1+G4)를 받는 TS 순수 함수로 옮기고, 컷 13시 · 천일 10/14 export · 빅텍 10/22 G4 조각 오라클과 주문 · 런 · 원 단위로 일치시켰다.**

## Performance

- **Duration:** 약 18분
- **Started:** 2026-11-02T10:19Z
- **Completed:** 2026-11-02T10:37Z
- **Tasks:** 3/3
- **Files modified:** 18(생성 13 · 수정 5)

## Accomplishments

- **트레이서(Task 1):** 컷 13시 KRX 원본 바이트 → `decodeAny` → `a3TradeOf` → `scopeTrades("teamflow")` → `classifyKrxOrders` 가 파이썬 `prepare_frame` 의 주문별 행 3,089개와 모두 같다. 트레이서 게이트(`<verify>` 재실행) 통과 뒤 넓혔다.
- **NXT 런(Task 2):** `tagNxtRuns` · `nxtRunStats` · `nxtSummaryOf` 가 KRX · NXT 두 컷의 요약 숫자와 **런마다** 14열(n · bs · nbs · npx · maxsame · multi_px · zz · seq 양끝 · last_px · 닫는 B6 · 늦은 조각 · all_late)이 같다. 단독 창 13건도 주문마다 같다.
- **손익(Task 3):** `teamPnlOf` 가 천일 10/14 export `payload.pnl` 13키와 두 범위 모두 같고, `buildPnlPrefix` 의 접두 상태가 임의 k 에서 「앞 k 체결로 다시 계산한 값」과 같다. 빅텍 G4 조각이 뷰어 기본 범위(accum)를 커밋 골든으로 덮는다.

## 오라클 출력 원문

```
[oracle] orders krx-1300.pcap.zst {"orders": 2687, "kinds": {"일반": 2561, "0/0 단독": 55, "자전거래방지": 70, "0/0 스윕 끝": 1}, "team_orders": 126, "base": 8200, "upper": 10660, "rows": 3089, "isins": ["KR7101360006"]}
[oracle] runs == krx: isin=1 A3=3089 B6=8901 runs>=2=182 smp=70 closing_b6_ok=2687/2687 inverted=84/182 all_late=1 zz_orders=2696 run_orders=2687
[oracle] runs == nxt: isin=1 A3=3219 B6=8255 runs>=2=179 smp=65 closing_b6_ok=2833/2833 inverted=90/179 all_late=38 zz_orders=3219 run_orders=2833
[oracle] window nxt-1300.pcap.zst 13:30:00~13:40:00 {"team_orders": 13, "buy_qty": 7901, "buy_krw": 82023350, "sell_qty": 4632, "sell_krw": 49348980}
[oracle] g4cut KR7065450009 20261022 ['1500', '1600', '1700'] frames=5409520 a3=17100 g4=13792 accum={"orders": 15832, "kinds": {"일반": 15666, "자전거래방지": 132, "0/0 단독": 33, "단일가": 1}, "team_orders": 165, "rows": 17016, "last_px": 3845} teamflow={"orders": 2958, "kinds": {"일반": 2898, "자전거래방지": 38, "0/0 단독": 21, "단일가": 1}, "team_orders": 59, "rows": 3224, "last_px": 3750} pnl_accum.buy_val=644424210 pnl_teamflow.buy_val=375435520 bigtech-1022-g4.ticks.zst=346375B
[oracle] pnl KR7000650002 20261014 files=8 frames=49883674 a3=10168 g4=0 teamflow={"buy_val": 2700694800, "buy_qty": 12573, "sell_val": 2763228250, "sell_qty": 12790, "realized_val": 28621939, "realized_qty": 9167, "unrealized_val": 3160411, "total_val": 31782350, "ret": 0.011768212387419711, "end_qty": 3406, "end_cost_val": 759783589, "unknown_sell_qty": 3623, "unknown_sell_val": 793695100} accum_buy_val=2700694800 chunil-1014-a3.ticks.zst=195423B
```

- `pnl` 은 추출한 A3 로 파이썬 `team_pnl` 을 두 범위에서 다시 계산해 export `team_flow` · `accum_flow` 의 `payload.pnl` · `last_px` 와 대조한다 — 두 범위 모두 일치(불일치면 종료 1). 원천(로컬 원본 08~15시)이 export 와 같은 입력이라는 확인이다.
- RESEARCH 골든 3 · 1 의 수치와 모두 같다(Pitfall 1 — 옛 §5-1 예시 3,401주는 쓰지 않았다 · `"end_qty": 3401` 0건).

## G4 조각 골든(필수 — SC 4 accum 범위)

- **GCS 크기(받기 전 `gcloud storage du` 실측):** `20261022-1500` 212,358,419B · `1600` 94,934,883B · `1700` 85,724,009B = **393,017,311B(≈ 0.39GB)**. 하루 전체 `gs://gh-trade-tick-archive/raw/krx/20261022/` = 3,578,935,444B.
- **비용:** Archive 꺼내기 ≈ $0.05/GB + 인터넷 송신 → **≈ $0.07 일회**(플랜 추정 $0.2 이하). deployer SA 읽기만 · 원본은 `~/ticks/oracle/20261022/krx/` 에 두고 커밋하지 않았다.
- **G4 체결 수:** 13,792(범위 안 A3 17,100 중 accum 17,016 · teamflow 3,224).
- **두 범위 buy_val:** accum 644,424,210 · teamflow 375,435,520(차 268,988,690 — G4 팀 체결이 들어간다). G1 → G4 경계에서 새 주문이 시작됨을 테스트가 확인한다.
- `pnl_accum`: 실현 10,513,433 · 미실현 −5,098 · 합계 10,508,335 · 끝 잔량 33,413 · ret 0.016306549066491465 / `pnl_teamflow`: 실현 486,674 · 미실현 1,514,151 · 합계 2,000,825 · 끝 잔량 62,653.

## 빅텍 하루 골든

**빅텍 하루 골든 미실행(G4 조각 골든은 통과).** 선택 항목이다. 나머지 9시간(≈ 3.2GB) 꺼내기 비용(≈ $0.5)을 들이지 않았다. `ticks-pnl.golden.test.ts` 의 해당 블록은 `bigtech-1022.pnl.json` 이 없어 `describe.skipIf` 로 2건 skip 한다. 돌리려면 README 의 GCS 받기 뒤 `bash scripts/tick-oracle/gen-fixtures.sh pnl --bigtech`.

## 픽스처 크기

| 파일 | 바이트 |
|------|-------:|
| `cut1300-krx.orders.json` | 86,729 |
| `cut1300-runs.json` | 285,976 |
| `cut1300-nxt.window.json` | 1,558 |
| `chunil-1014-a3.ticks.zst` | 195,423 |
| `chunil-1014.pnl.json` | 1,276 |
| `bigtech-1022-g4.ticks.zst` | 346,375 |
| `bigtech-1022-g4.golden.json` | 590,341 |

`.ticks.zst` 는 모두 1.5MB 상한 안이다.

## Task Commits

1. **Task 1 (tracer): KRX 주문 묶기 · 팀 판정** — `71ed0b64` (feat)
2. **Task 2: NXT 런** — RED `3b7f2160` (test) → GREEN `6ab815d0` (feat)
3. **Task 3: 평균단가법 손익** — RED `58cc77d5` (test) → GREEN `e8307865` (feat)

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 2 | `3b7f2160` | `6ab815d0` | 없음 | 통과 |
| 3 | `58cc77d5` | `e8307865` | 없음 | 통과 |

- **Task 2 RED:** 시그니처 뼈대(빈 결과)에서 `vitest --reporter=junit` → exit 1 · 14 테스트 중 12 실패. 대상 「NXT 런 합성 케이스 > 한 가격 2조각 이상(SMP) 연속매매 런은 팀 — 값 = 조각 합 · 시각 · 가격 = 마지막 조각」. `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK**(`target_test_failed`).
  - **semanticAssessment:** 대상 테스트가 실행됐고 `expected +0 to be 1`(AssertionError — 팀 주문 1건 기대, 뼈대가 빈 배열)로 실패했다. 로드 · 문법 · 픽스처 오류가 아니다. 통과한 2건은 골든 JSON 자체를 보는 단언이다.
- **Task 3 RED:** 뼈대에서 exit 1 · 29 테스트 중 18 실패 · 2 skip(선택 빅텍 하루). 대상 「roundHalfEven — 파이썬 round(은행가 반올림) > roundHalfEven(2.5) = 2」 → **RED_EVIDENCE_OK**.
  - **semanticAssessment:** 대상이 실행됐고 `expected 2.5 to be 2`(뼈대가 입력을 그대로 반환)로 실패했다. 계획된 반올림 단언이다.
- 증거 파일(junit XML · 레코드 JSON)은 커밋하지 않았다(37-02 선례).
- Task 1 은 `type="tracer"`(tdd 아님) — 구현 · 골든을 한 커밋으로 냈고 트레이서 게이트로 verify 를 다시 돌렸다.

## Verification

- 플랜 Task 3 `<verify>` 그대로: `pnpm --filter @gh-radar/shared build && … run typecheck && … vitest run ticks-pnl · ticks-orders-krx · ticks-orders-nxt --maxWorkers=2` → exit 0 · **3 파일 47 통과 · 2 skip(빅텍 하루) · 실패 0**.
- shared 전체 `vitest run --maxWorkers=2` → 33 파일 1,000 통과 · 2 skip.
- 하류 `pnpm --filter @gh-radar/webapp run typecheck`(+ e2e) · `pnpm --filter @gh-radar/relay run typecheck` 통과(배럴 export 충돌 없음).
- 결정성: `gen-fixtures.sh orders · runs · g4cut · pnl` 재실행 뒤 `git status --porcelain packages/shared/src/__fixtures__/ticks` 빈 출력.
- 수락 기준 grep: `"realized_val": 28621939` · `"total_val": 31782350` · `"end_qty": 3406` 있음 · `"end_qty": 3401` 0 · `runs>=2=179 smp=65` · `runs>=2=182 smp=70` · 창 82023350 · 49348980 · `git ls-files --error-unmatch` G4 두 파일 exit 0 · 주석 뺀 `skipIf` 1.
- pgTAP 대상 없음(DB 변경 없음).

## Decisions Made

frontmatter `key-decisions` 참고. 요점: 범위 정렬은 파이썬 SQL 글자 그대로(isin 포함 · exchange='KRX') · NXT 동률 순서는 A3 먼저 · `NxtTeamOrder.tNs` 는 null 허용 · 선택 틱용 `fillsUpTo` 추가 · 빅텍 하루 골든 미실행.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 차단] 오라클 pnl · g4cut 은 합성 pcap 경유로 파이썬 정본을 돌린다**
- **Found during:** Task 3
- **Issue:** 플랜은 「시간 파일을 convert_file 로 parquet → duckdb」 를 적었지만, 천일 하루(08~15시 ≈ 3.4GB · 4,988만 프레임)를 통째로 변환하면 수 GB parquet 와 긴 시간이 든다. 또 TS 가 읽는 바이트(그 ISIN A3 만)와 파이썬 입력이 같다는 보장이 약해진다.
- **Fix:** 그 ISIN A3 만 레코드 프레이밍으로 추출 → 같은 레코드를 이더넷/IPv4/UDP 로 감싼 합성 pcap → `convert_file` → 플랜과 같은 duckdb 조건 · 정렬. 천일은 export `payload.pnl` 두 범위와 재계산이 일치해 추출이 완전함을 확인했다(50초).
- **Files modified:** `scripts/tick-oracle/oracle.py`
- **Commit:** `58cc77d5`

**2. [Rule 2 - 정확성] 오라클이 정렬 키 동률을 거부한다**
- **Issue:** duckdb `ORDER BY` 는 안정 정렬이 아니라 (isin, msg_seq) · (isin, t, msg_seq) 동률이 있으면 행 순서가 비결정적이다 → 골든이 흔들린다.
- **Fix:** `read_krx_a3` 가 동률 행 수를 세고 `orders` · `pnl` · `g4cut` 은 동률이 있으면 종료 1. 이번 세 원천 모두 동률 0.
- **Commit:** `71ed0b64` · `58cc77d5`

**3. [추가] 테스트 헬퍼 `readA3Trades`(tick-digest.ts)** — 세 골든 테스트가 같은 「픽스처 → A3Trade」 경로를 쓴다. 플랜 files 밖이지만 37-02 헬퍼 파일에 함수 하나를 더했다. `commit 71ed0b64`.

**4. [추가] `nxtRowOf` · `NxtTagged` · `NxtSummary` · `isTeamKind` · `cmpTimeNullsLast` · `fillsUpTo` export** — 플랜 색인의 함수들이 쓰는 입력 변환 · 반환 모양 · 시각 탐색을 이름으로 노출했다. 화면 플랜(37-13 · 37-14)이 그대로 쓴다.

**5. [작은 시그니처 조정] `NxtTeamOrder.tNs: bigint | null`** — 플랜 `bigint`. 체결 시각을 못 읽은 조각을 숨기지 않으려고 null 을 허용했다(컷 골든에는 null 없음).

---

**Total deviations:** 자동 수정 2건(Rule 2 1 · Rule 3 1) + 보강 2 + 시그니처 조정 1. 범위 확대 없음.

## Known Gaps (스텁 아님)

- 빅텍 10/22 하루 골든(선택)은 미실행 — 위 절. G4 조각 골든이 accum 경로를 덮는다.
- 당일 스트림 끝의 열린 주문 「진행 중」 표식(Pitfall 9)은 화면 플랜 몫이다. 이 플랜 함수는 전체 자료 기준 최종 분류를 낸다.
- 스텁 · TODO · placeholder 없음. RED 뼈대는 각 GREEN 커밋에서 구현으로 바뀌었다.

## Threat Flags

없음 — 네트워크 · 인증 · 스키마 표면이 없다(순수 함수 + 로컬 생성 스크립트). GCS 는 deployer SA 읽기만 썼다.

## Next Phase Readiness

- 37-13 · 37-14(화면): `scopeTrades(trades, scope)` 로 범위를 한 상수로 주입하고 `classifyKrxOrders` · `teamFillsOf` · `buildPnlPrefix` → 선택 틱 `fillsUpTo` + `pnlAt` 으로 KPI 를 낸다. NXT 는 `nxtRowOf` → `tagNxtRuns` → `classifyNxtTeamOrders`.
- 37-16 Task 1: `bigtech-1022-g4.ticks.zst` · `bigtech-1022-g4.golden.json` 이 커밋돼 있다.
- 37-05(model): 오라클 `extract_isin_a3` · `write_synthetic_pcap` · `read_krx_a3` 를 재사용할 수 있다.

## Self-Check: PASSED

- 생성 파일 13개 · 수정 파일 5개 존재 확인 · 커밋 `71ed0b64` · `3b7f2160` · `6ab815d0` · `58cc77d5` · `e8307865` 가 HEAD 조상.
