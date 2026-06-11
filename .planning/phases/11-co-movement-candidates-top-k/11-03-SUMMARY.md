---
phase: 11-co-movement-candidates-top-k
plan: 03
subsystem: api
tags: [express, supabase, postgrest, comovement, cosurge, zod, vitest, cloud-run]

requires:
  - phase: 11-co-movement-candidates-top-k (Plan 01)
    provides: computeComovement RED 테스트 + co-movement 라우트 RED 테스트 + CoMovementResponse shared 계약
  - phase: 11-co-movement-candidates-top-k (Plan 02)
    provides: production 적재 — theme_comovement 5538행 / cosurge_edges 9704행 (prod curl 실데이터 전제)
  - phase: 10-theme-classification
    provides: themes (hidden 필터) + theme_stocks
provides:
  - "GET /api/stocks/:code/co-movement?k=K 읽기 라우트 — 앵커 테마 멤버 ∪ co-surge 이웃 → computeComovement TOP-K, 객체 {candidates} 반환"
  - "computeComovement 순수함수 — 두 경로 병합·dedup·타이트니스(1/sqrt)·앵커참여도(anchor_rel)·후행·결합점수(0.5/0.2/0.2/0.1)"
  - "quoteJoin.ts 공유 lib — themes.ts + comovement.ts 가 청크 IN(QUOTE_CHUNK) + .range(ROW_PAGE) 페이지네이션 공유"
  - "server 재배포 (revision gh-radar-server-00026-hqb) — prod 활성 + prod curl 3종 검증 통과"
affects: [11-04-worker, 11-05-ui]

tech-stack:
  added: []
  patterns:
    - "앵커 코드는 라우트가 아는 진실값을 순수함수에 명시 전달 — row 기반 휴리스틱 추론(deriveAnchor)은 다중 테마에서 실패하므로 폴백 전용"
    - "공유 조인 헬퍼 추출(quoteJoin.ts) — themes.ts/comovement.ts 중복 제거하되 themes.test.ts 회귀 0 확인"
    - "두 경로 evidence 분리(D-03): co-surge 전용 후보는 sharedThemes=[] + confD0=0 + coSurgeCount 채움"

key-files:
  created:
    - server/src/lib/computeComovement.ts
    - server/src/mappers/comovement.ts
    - server/src/schemas/comovement.ts
    - server/src/routes/comovement.ts
    - server/src/lib/quoteJoin.ts
    - .planning/phases/11-co-movement-candidates-top-k/11-DEPLOY-LOG.md
  modified:
    - server/src/routes/stocks.ts
    - server/src/routes/themes.ts

key-decisions:
  - "앵커 코드 명시 전달 — computeComovement(...,anchorCode?) 옵션 추가. 라우트는 :code 를 항상 전달, 미전달 시에만 deriveAnchor 폴백(단위 테스트 호환). 프로덕션 다중 테마에서 휴리스틱 추론이 앵커 자기 멤버십 행이 전 anchorThemes 를 못 덮으면 실패 → 앵커 자기 후보 혼입 회귀를 구조적으로 차단"
  - "quoteJoin.ts 로 fetchQuotesChunked/fetchMastersChunked/ROW_PAGE/QUOTE_CHUNK 추출 — themes.ts 와 comovement.ts 가 import. themes.test.ts 회귀 0 확인 후 채택"
  - "흥구석유는 004090 앵커의 co-surge 전용 후보(sharedThemes=[]) — 동일 활성 테마 미공유이나 ≥10% 동반바 9회로 #1. fixture ground truth(co-surge 9) 와 정확 일치"

patterns-established:
  - "순수함수에 앵커 같은 키 식별자는 호출자가 명시 전달(휴리스틱 추론 금지) — 테스트 fixture 단순화를 위한 추론은 프로덕션 데이터 분포에서 깨질 수 있음"
  - "새 라우트는 server 재배포 + prod curl(객체 vs 배열 + 필수 필드 + fixture 상위) 까지가 완료 — 코드 green ≠ production 동작"

requirements-completed: [COMV-01]

duration: 14min
completed: 2026-06-11
---

# Phase 11 Plan 03: 동조 후보 읽기 라우트 + computeComovement + server 재배포 Summary

**GET /api/stocks/:code/co-movement 가 앵커 테마 멤버 ∪ co-surge 이웃을 computeComovement 결합점수로 TOP-K 랭킹해 객체 {candidates} 로 반환하고, production(revision 00026-hqb) prod curl 에서 흥구석유 #1·앵커 제외·strength desc·빈상태·k클램프를 검증**

## Performance

- **Duration:** ~14 min (checkpoint 재개 — Task 3 만)
- **Started:** 2026-06-11 (배포 승인 후 재개)
- **Completed:** 2026-06-11
- **Tasks:** 3 (Task 1~2 는 prior agent, Task 3 본 세션 + Rule 1 버그수정)
- **Files modified:** 8 (생성 6 + 수정 2)

## Accomplishments

- **읽기 라우트 production 활성** — `GET /api/stocks/004090/co-movement?k=8` 가 prod 에서 HTTP 200 + 객체 `{candidates:[...]}` (배열 아님) + 흥구석유(024060) candidates[0] + strength desc + 전 필드(`liveChangeRate` 2.27 등 실시간 조인). ROADMAP 성공기준 4 충족.
- **앵커 자기 후보 혼입 회귀 발견·수정** — 1차 배포 prod curl 에서 앵커 004090 이 자기 후보 #1 로 노출. `deriveAnchor` 휴리스틱(다중 테마 교집합) 추론 실패가 원인. 라우트가 아는 `:code` 를 명시 전달하도록 수정 + 회귀 테스트 추가 → 재배포로 해소.
- **prod curl 3종 통과** — 흥구석유 상위(co-surge 9, fixture ground truth 일치) / 무테마(005935) `{candidates:[]}` / k=999 → 41 (≤50 클램프).
- **quoteJoin.ts 공유 추출** — themes.ts 의 청크 IN + .range() 헬퍼를 추출해 comovement.ts 와 공유. themes.test.ts 회귀 0.
- server 재배포 (revision `gh-radar-server-00026-hqb`, SHA `1dc1091`), smoke 9/9 PASS, `DISCUSSION_CLASSIFY_ENABLED=false` 유지(회귀 함정 회피).

## Task Commits

1. **Task 1: computeComovement 순수함수 + mapper + zod 스키마** - `47bee19` (feat) — prior agent
2. **Task 2: GET /:code/co-movement 라우트 + quoteJoin 추출** - `cfc6387` (feat) — prior agent
3. **Task 3: [BLOCKING] server 재배포 + prod curl + DEPLOY-LOG**
   - `1dc1091` (fix) — 앵커 코드 명시 전달 회귀수정 + 회귀 테스트 I (Rule 1)
   - `8ce406f` (docs) — 11-DEPLOY-LOG.md (prod curl 검증 기록)

## Files Created/Modified

- `server/src/lib/computeComovement.ts` - 두 경로 병합·dedup·타이트니스·앵커참여도·후행 순수함수 (Task 3 에서 anchorCode 명시 전달 추가)
- `server/src/mappers/comovement.ts` - ThemeComovementRow/CosurgeEdgeRow 타입 + toNum 정규화
- `server/src/schemas/comovement.ts` - CoMovementParams zod (code regex)
- `server/src/routes/comovement.ts` - 읽기 라우트 (청크 IN + .range() + computeComovement, code 명시 전달)
- `server/src/lib/quoteJoin.ts` - fetchQuotesChunked/fetchMastersChunked 공유 헬퍼
- `server/src/routes/stocks.ts` - comovementRouter 등록 (/:code 보다 먼저)
- `server/src/routes/themes.ts` - quoteJoin.ts import 로 교체 (동작 동일, 회귀 0)
- `.planning/phases/11-co-movement-candidates-top-k/11-DEPLOY-LOG.md` - 재배포 revision + prod curl 검증

## Decisions Made

- **앵커 코드 명시 전달(휴리스틱 추론 폐기):** `deriveAnchor` 는 테스트가 anchorCode 를 안 넘기는 계약 때문에 도입됐으나, 프로덕션에서 앵커가 다중 활성 테마에 속하고 자기 멤버십 행이 전 anchorThemes 를 못 덮으면 교집합 추론이 실패해 앵커 미제외. 라우트는 `:code` 라는 진실값을 항상 알고 있으므로 `computeComovement(...,anchorCode?)` 로 명시 전달. deriveAnchor 는 단위 테스트 호환용 폴백으로 잔존. 이것이 가장 단순·정확한 해법 — 순수함수에 키 식별자를 호출자가 주입하는 패턴.
- **흥구석유 sharedThemes=[] 정상:** 004090 앵커의 상위 후보가 co-surge 전용(테마 미공유)으로 나오는 것은 RESEARCH §두 경로 결합(D-03 evidence 분리)대로. confD0=0 + coSurgeCount 채움이 co-surge 전용 시그니처. fixture co-surge 9 와 정확 일치.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] computeComovement 앵커 자기 후보 혼입 — 앵커 코드 명시 전달로 수정**
- **Found during:** Task 3 (1차 배포 후 prod curl `004090?k=8`)
- **Issue:** 앵커 004090(한국석유)이 자기 co-movement 후보 #1 로 노출(coSurgeCount 9). `deriveAnchor` 휴리스틱이 "모든 anchorThemes 에 속한 code = 앵커"(교집합)로 추론하나, 프로덕션에서 004090 자기 멤버십 행이 일부 테마만 덮어 추론 실패 → 앵커 미제외 + 흥구석유가 후보에서 밀려남.
- **Fix:** `computeComovement` 에 optional `anchorCode` 파라미터 추가. 라우트가 `:code` 를 명시 전달(미전달 시에만 deriveAnchor 폴백 — 단위 테스트 계약 유지). 회귀 테스트 Test I 추가(추론 실패 케이스에도 앵커 제외 검증).
- **Files modified:** server/src/lib/computeComovement.ts, server/src/routes/comovement.ts, server/src/lib/computeComovement.test.ts
- **Verification:** 단위 161 passed (회귀 테스트 I 포함), build/typecheck exit 0. 재배포(00026) 후 prod curl: 앵커 제외 확인 + 흥구석유 candidates[0] + strength desc.
- **Committed in:** 1dc1091 (Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 1 버그)
**Impact on plan:** prod curl acceptance("흥구석유 상위 + 앵커 제외")의 핵심 게이트가 잡아낸 버그. 수정은 순수함수 시그니처에 옵션 1개 추가 + 라우트 인자 1개 — 스코프 확장 없음. 오히려 prod 검증이 의도대로 회귀를 포착(코드 green ≠ production 동작 입증).

## Issues Encountered

- **워크트리 base 불일치:** 재개 시 worktree 가 a1ab777(11-03 이전) 트리로 생성돼 Task 1~2 산출물(computeComovement.ts 등)이 디스크에 없었음. `git reset --hard cfc6387`(master HEAD = Task 1~2 머지본)로 정렬 후 진행.
- **worktree 의존성 미설치:** node_modules 부재 + `@gh-radar/shared/dist` 미빌드로 12개 테스트 파일이 packageEntryFailure(코드 회귀 아님). `pnpm install` + `pnpm -F @gh-radar/shared build` 후 21 files / 160 passed 정상화.
- **smoke rate-limit 잔여 429:** 배포 smoke 의 INV-8(201 req → 429)이 per-IP 윈도우를 소진해 직후 prod curl 이 일시 429. 윈도우 클리어 후 재시도(첫 시도 200)로 깨끗하게 검증.

## Known Stubs

None — 읽기 라우트·순수함수·prod 검증 모두 실데이터로 동작. (Plan 04 워커 야간 rebuild, Plan 05 UI 는 후속 책임.)

## User Setup Required

None - server 재배포는 사용자 사전 승인(배포 진행) 하에 수행 완료.

## Next Phase Readiness

- **Plan 04 (worker):** rebuild_comovement(24) REST 경로 + task-timeout 180s(11-CALIBRATION)는 Plan 02 에서 확정. 읽기 라우트가 prod 활성이라 워커 적재 → 라우트 조회 end-to-end 경로 검증됨.
- **Plan 05 (UI):** `GET /api/stocks/:code/co-movement` 가 prod 200 + 객체 {candidates} + 전 필드(confD0/strength/isTrailing/sharedThemes/coSurgeCount/sampleConfidence/liveChangeRate) 반환 → `apiFetch<CoMovementResponse>` 가 실데이터 렌더 가능. 흥구석유 상위·strength desc 정렬 보장.
- **블로커 없음.** STATE.md/ROADMAP.md 갱신은 오케스트레이터 책임(worktree 분리 정책).

---
*Phase: 11-co-movement-candidates-top-k*
*Completed: 2026-06-11*

## Self-Check: PASSED

- 생성 파일 7개 전부 디스크 확인: computeComovement.ts, mappers/comovement.ts, schemas/comovement.ts, routes/comovement.ts, lib/quoteJoin.ts, 11-DEPLOY-LOG.md, 11-03-SUMMARY.md.
- 커밋 4개 git log 확인: 47bee19, cfc6387, 1dc1091, 8ce406f.
- 단위 161 passed (21 files), build/typecheck exit 0.
- prod 실측: revision gh-radar-server-00026-hqb 활성, 004090?k=8 → 200 객체 {candidates} 8건 (흥구석유 #1, 앵커 제외, strength desc), 005935 → {candidates:[]}, k=999 → 41 (≤50).
