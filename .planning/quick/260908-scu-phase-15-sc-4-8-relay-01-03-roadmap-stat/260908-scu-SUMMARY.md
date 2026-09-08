---
phase: quick-260908-scu
plan: 01
subsystem: planning-ledger
tags: [phase-15, dma-relay, requirements, roadmap, state, re-adjudication]
requires: [15-LIVE-VERIFICATION.md, infra/relay/README.md, quick-260908-py9, quick-260908-qnf]
provides: ["15-LIVE-VERIFICATION.md §8 재집계", "REQUIREMENTS RELAY-01/02/03 재판정", "ROADMAP Phase 15 20/20 종결", "STATE Phase 15 Production State"]
affects: [.planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/STATE.md]
tech-stack:
  added: []
  patterns: ["append-only 재집계(원 기록 보존 + 포인터 1줄)", "동시 편집 트리에서 파일 단위 add + task 단위 커밋"]
key-files:
  created:
    - .planning/quick/260908-scu-phase-15-sc-4-8-relay-01-03-roadmap-stat/260908-scu-SUMMARY.md
  modified:
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "RELAY-02 는 Complete 로 올리지 않는다 — 취소(C) 왕복과 GET /api/orders 복원 응답에 실측 근거가 없다"
  - "판정을 뒤집으려고 새 주문을 내지 않는다 — dma_orders 는 읽기 카운트로만 판정"
  - "§1~§7 은 2026-09-06 기록으로 보존하고 §8 을 append — 덮어쓰지 않는다"
metrics:
  duration: ~35min
  completed: 2026-09-08
---

# Quick 260908-scu: Phase 15 장부 재집계 Summary

라이브 전환(D-17 철회 · 실 게이트웨이 · 실주문 5건 왕복)을 읽기 전용 실측으로 확인해 Phase 15 장부를 실제 상태와 일치시켰다 — SC 집계 ✅3/⚠5 → ✅6/⚠2, RELAY-01/03 Complete, RELAY-02 는 잔여 2건으로 Pending 유지.

## (a) Step 1 읽기 전용 실측 3종 — 실제 값

### (a-1) relay 라이브 상태 — `curl -s https://dma.jx1.io/healthz` (2026-09-08 20:37 KST)

```json
{"status":"ok","vpn":true,"dma":true,"version":"a2c5238","sessionCount":1}
```

**해석 규칙 적용.** `dma` = `sessionCount === 0 || readyCount > 0` 이므로 `dma:true` 단독은 무증거다.
그러나 `sessionCount:1` 과 동시에 참이면 **`readyCount > 0` 이 강제**되고, 상태기계가
`Idle → Connecting → LoggingIn → DeclaringAccounts → Ready` 이므로 **Ready 도달 = 로그인 성공 + 계좌 선언 완료**다.
세션은 wss 첫 메시지 인증 + `dma_credentials` allowlist 통과 후에만 생성되므로 **allowlist positive 경로 개통**의 증거이기도 하다.
(2026-09-06 §2 실측은 `sessionCount:0` · `version:4ba6f83` 이었다.)

### (a-2) Supabase REST 카운트 (`GET` + `Prefer: count=exact` + `Range: 0-0`, 본문 폐기)

| 테이블 | 2026-09-06 (§2) | 2026-09-08 |
|--------|-----------------|------------|
| `dma_credentials` | 0행 | **2행** |
| `dma_orders` | 0행 | **5행** — `rejected` 3 · `accepted` 2 |

`dma_orders` 비PII 상세(계좌번호·`user_id` 미조회):

| 생성(UTC) | status | rc | notice | side | qty/filled | origin |
|-----------|--------|----|--------|------|-----------|--------|
| 2026-09-06T23:44Z | rejected | **606** (알고리즘거래자ID 오류) | R | B | 1/0 | manual |
| 2026-09-07T23:51Z | rejected | **515** (알 수 없는 거부코드) | R | B | 1/0 | manual |
| 2026-09-07T23:51Z | rejected | **515** | R | B | 1/0 | manual |
| 2026-09-08T10:17Z | accepted | **0** (체결) | E | B | 1/1 | manual |
| 2026-09-08T10:17Z | accepted | **0** (체결) | E | S | 1/1 | manual |

- `order_no` 5/5 SET · `isin` 5/5 SET · **`org_order_no` 5/5 NULL**(취소 경로 미실행) · `origin` 5/5 `manual`
- 전이 지연 `updated_at − created_at` = 145.7 / 77.0 / 45.8 / 87.3 / 72.1 ms → **median 77.0 ms**
  (mock median 3.33 ms 는 loopback. D-22 의 5초 상한 대비 약 1/60. 단 이 Δ 는 DB 측 근사이며 계측된 `OrderResp` 지연 자체는 아니다)

### (a-3) ISIN 결손 — `bash scripts/smoke-relay.sh --check-isin`

```
ISIN-1 stocks.isin 컬럼 존재 + REST 노출 ... PASS
  활성 주식(주권·미상장폐지) 2717 종목 / isin NULL 0 종목
ISIN-2 활성 주식 isin NULL 0건 ... PASS
ISIN-3a isin 길이 12 무결성 (이탈 0 행) ... PASS
ISIN-3b isin 형태 무결성 (이탈 0 행) ... PASS
PASS: 4  FAIL: 0  SKIP: 0
```

2026-09-06 은 `2,749종목 중 NULL 42` (ISIN-2 **FAIL**) 였다 → `8816557`(master-sync basDd 역탐색) 로 원인 제거, **해소**.

## (b) SC-4 ~ SC-8 재판정 전후

| SC | 2026-09-06 | 2026-09-08 | 결정 근거 요약 |
|----|------------|------------|----------------|
| SC-4 | ⚠ 부분 | **⚠ 부분 유지** (3항 중 2항 해소) | allowlist positive = `sessionCount:1`∧`dma:true` + `dma_credentials` 2행 · 실브로커 호가/체결 = 실 게이트웨이 + `531930e`·`fd7942b`·`12bd478` |
| SC-5 | ⚠ 부분 | **✅ 충족** | Ready 도달이 로그인+계좌 선언 완료를 함의 · `531930e`(실데이터 없이는 알 수 없는 0수량 삭제 계약) · `fd7942b`(잔고·미체결 화면) · D-17 조항은 `f13eb7d` 로 **조건 소멸** |
| SC-6 | ⚠ 부분 | **⚠ 부분 유지** (6항 중 4항 해소) | 실주문 5건 왕복 · 실코드 606/515/0 · Δ median 77 ms · ISIN 5/5 · 매수·매도 양방향 |
| SC-7 | ⚠ 부분 | **✅ 충족** | qnf 가 4개 스펙 29건 + `orderbook.spec.ts` 동시 **37 passed/exit 0** · 선재 E2E 11→0 · `da24eec`·`12bd478` 실사용 관측 · 라이브 wss 세션이 배포 번들 URL 사용을 함의 |
| SC-8 | ⚠ (미충족 1건) | **✅ 충족** | 비밀 미기록 게이트 0건(py9) · `dd2a8cc` 임계값 튜닝 · "실서버 접속은 사용자 지시 전엔 하지 않는다" 는 **지시 후 전환**이므로 준수 |

**집계:** ✅ 3 / ⚠ 5 → **✅ 6 (SC-1·2·3·5·7·8) / ⚠ 2 (SC-4·SC-6) / ❌ 0**
(SC-1~3 은 이미 ✅ 였고 그 근거가 라이브 전환으로 달라지지 않아 재판정 대상이 아니다.)

§4-A~§4-E 미증명 17항 재분류: **증명됨 10 · 해소 4 · 조건 소멸 1 · 여전히 ⚠ 2**.
§5 이관 15건: **해소/종결 14 · 이 quick 이 처리 1**(항목 15 = REQUIREMENTS 재판정).

## (c) 여전히 ⚠ 로 남은 항목과 해소 조건

| 남은 것 | 왜 ⚠ 인가 | 무엇을 하면 닫히는가 |
|---------|-----------|----------------------|
| SC-4 — 마지막 wss 종료 **5분 뒤** 세션 종료 실관측 | 상수·단위 테스트 수준 그대로. 5분 대기 관측을 이 quick 에서 새로 하지 않았다 | 세션 보유자가 마지막 wss 를 닫은 시각을 특정하고 5분 뒤 `/healthz` 의 `sessionCount` 가 `0` 인지 확인 (읽기 전용, 실계좌 위험 없음) |
| SC-6 — 취소(`C`) 왕복과 `cancelled` 전이 | `dma_orders` 5행이 전부 `org_order_no` NULL. 취소 경로가 한 번도 실행되지 않았다 | 장중 체결되지 않을 지정가 1주 주문 → 즉시 취소 → `cancelled` 전이 관측. **실계좌에 주문이 나가므로 사용자 명시 지시 필요**(§7 D-20 규율) |
| SC-6 — `GET /api/orders` 목록 복원 응답 | 복원 소스 5행은 실재하나 엔드포인트 응답을 관측하지 않았다. 로그인 토큰 취득이 이 quick 범위 밖 | 로그인 액세스 토큰으로 `GET /api/orders` 1회 호출(읽기 전용) |
| §5-8 — 알림 임계값 0.9 (원 권고 0.5~0.7) | 오경보를 실제로 관측한 적이 없다 | 라이브 운영 중 단일 리전 순간 실패 오경보를 관측한 뒤 그 관측을 근거로 조정 |
| (판정 아님) 2026-09-08 19:17 KST 체결 통보 2건의 시각 성격 | 정규장·시간외 단일가 종료 이후 시각이다 | 통보가 왔다는 사실만 기록. 필요 시 사용자가 게이트웨이 측 동작으로 확인 |

## (d) RELAY-01/02/03 최종 상태와 근거

| 요구사항 | 최종 | 근거 |
|----------|------|------|
| **RELAY-01** | **Complete** | 조항별 근거가 전부 있다 — 사용자별 DMA 세션 + wss 첫 메시지 인증 + allowlist = `sessionCount:1`∧`dma:true` + `dma_credentials` 2행 / 호가 10단·체결 테이프·`AccountState` 팬아웃 = `531930e`·`fd7942b` / 4탭 + 호가주문 탭 = `da24eec`·`12bd478` 실사용 + `stock-detail-tabs`·`orderbook` 스펙 green. SC-4 잔여(5분 유예)는 **세션 수명 관측 기록의 공백**이지 RELAY-01 열거 조항의 결손이 아니다 |
| **RELAY-02** | **Pending — 잔여 2건** | 열거 조항 중 **취소 주문 릴레이 + 취소확인(`C`) 푸시**, **오늘 주문 목록 복원(`GET /api/orders`)** 에 실측 근거가 없다. 나머지(신규 매수/매도 릴레이 · `OrderResp` ≤5초 · 체결(`E`) 푸시 · `dma_orders` 기록 · ISIN 매핑 · 409)는 증명됨 |
| **RELAY-03** | **Complete** | SC-2 ✅ 유지 + SC-8 ✅ 전환. "재시도 상한·백오프" 조항은 `f9ca062`·`1ef7cc7` 로 **상시 유지 정책으로 대체**(결손이 아니라 설계 갱신, 정본 `infra/relay/README.md` §VPN 조작) |

정의부 체크박스와 Traceability 상태는 대칭이다 (`- [x]` ⇔ `Complete`, `- [ ]` ⇔ `Pending — 잔여:`).

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 읽기 전용 실측 3종 + `15-LIVE-VERIFICATION.md` §8 재집계 append + §3 포인터 | `0575091` | 15-LIVE-VERIFICATION.md (+140 / −0) |
| 2 | REQUIREMENTS RELAY-01/02/03 재판정 (정의부 · Traceability · Last updated) | `2709455` | REQUIREMENTS.md |
| 3 | ROADMAP 정합 + STATE Phase 15 종결 기록 | `eaab52d` (STATE) · ROADMAP 은 `baa9e81` 에 포함 | ROADMAP.md · STATE.md |

## Deviations from Plan

**1. [Rule 3 - 동시 편집] ROADMAP.md 편집이 Phase 16 세션 커밋에 흡수됨**

- **Found during:** Task 3 커밋 직전 `git status --porcelain`
- **Issue:** ROADMAP 3곳(상단 목록 `[x]` + `(completed 2026-09-06, 20/20 plans)` · `**Plans:** 20/20` · `15-20-PLAN.md [x]`)을 Edit 로 반영한 직후, 병행 실행 중이던 Phase 16 세션이 같은 `master` 작업 트리에서 `.planning/ROADMAP.md` 를 통째로 스테이징해 `baa9e81 docs(phase-16): update tracking after wave 6` 로 커밋했다. 내 변경이 그 커밋 안에 함께 들어갔다.
- **Fix:** 없음(수정 불필요). `git show baa9e81 -- .planning/ROADMAP.md` 로 내 3줄이 **정확히 의도한 내용대로** 들어갔음을 확인했다. 유실·왜곡 0. 커밋 귀속만 다르다. 되돌려 재커밋하면 오히려 상대 세션의 Phase 16 행(`6/17 → 7/17`)을 흔들 위험이 있어 그대로 두었다.
- **교훈:** 동시 편집 트리에서는 "파일 단위 add + task 단위 즉시 커밋" 으로도 상대가 파일 전체를 스테이징하면 흡수될 수 있다. 방어는 **내용 보존 확인**이지 커밋 귀속이 아니다.
- **Commit:** `baa9e81` (상대 세션), 사실 기록은 `eaab52d` 메시지에 남겼다.

**2. [실측 우선] PLAN 의 §4-D Playwright 가정이 실측으로 뒤집힘**

- **Found during:** Task 1 Step 2
- **Issue:** PLAN 은 "`orderbook` 7건 재실행 기록은 없으므로 **부분** 해소"로 지시했으나, quick-260908-qnf SUMMARY 가 *"목표 4개 스펙 + `orderbook.spec.ts` 동시 실행 최종 확인: 37 passed / exit 0"* 을 기록하고 있었다.
- **Fix:** PLAN 의 "실측이 이긴다" 규칙대로 §4-D Playwright 를 **전부 해소**로 판정하고, 어긋난 사실을 §8.1 주석에 명시했다. 이 판정이 SC-7 을 ✅ 로 올리는 근거의 일부다.
- **Commit:** `0575091`

## Threat Flags

없음. 이 quick 은 코드·인프라 표면을 만들지 않는다.

- T-scu-02 (실계좌 주문 경로): `dma_orders` 는 **읽기 카운트/조회만**. `POST`/`PATCH`/`DELETE` 0건, 새 주문 0건.
  `dma_orders` 5행이 0행이 아니었기 때문에 §4-C 네 항목 중 3건을 판정할 수 있었고, **판정을 위해 주문을 내지는 않았다.**
- T-scu-03 (Supabase service role): `GET` + `Prefer: count=exact` + `Range: 0-0` + `-o /dev/null` 만. 키 값 출력·기록 0건.
- T-scu-04 (비밀 기록): KB VPN 계정 ID · DMA `user_id` · 전체 계좌번호 신규 기록 0건. 전역 게이트 재확인 **0건**.
- T-scu-07 (§1~§7 보존): `git diff` 삭제 라인 **0줄**(append 140줄 + 포인터 삽입만).

## Verification

| 검사 | 결과 |
|------|------|
| Task 1 automated gate | **VERIFY-1-OK** |
| Task 2 automated gate | **VERIFY-2-OK** |
| Task 3 automated gate | **VERIFY-3-OK** |
| `Co-Authored-By` (내 커밋 3개) | **0 / 0 / 0** |
| 코드 변경 (내 커밋 3개, `.planning/` 밖 파일) | **0 / 0 / 0** |
| 병행 세션 무손상 — `Phase: 16 (trading-limit-chaser-vi-my-page)` | **1** (Current Position 블록 · `progress:` 프론트매터 · Session Continuity 무변경) |
| 비밀 게이트 `grep -rlIE` | **0** |
| `15-LIVE-VERIFICATION.md` 삭제 라인 | **0** |

## Self-Check: PASSED

- FOUND: `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md` (§8 존재, 5개 소절)
- FOUND: `.planning/REQUIREMENTS.md` (RELAY 정의부 3항 · Traceability 3행 대칭)
- FOUND: `.planning/ROADMAP.md` (Phase 15 `[x]` · 20/20 · 15-20 `[x]` · Phase 16 절 무손상)
- FOUND: `.planning/STATE.md` (`### Phase 15 Production State (2026-09-08)` · `| 260908-scu |` 행)
- FOUND commits: `0575091` · `2709455` · `eaab52d` (+ ROADMAP 내용은 `baa9e81` 에 포함)
