---
phase: 11-co-movement-candidates-top-k
plan: 05
subsystem: ui
tags: [nextjs, react, vercel, comovement, stock-detail, ui-spec]

requires:
  - phase: 11-co-movement-candidates-top-k (Plan 01)
    provides: CoMovementResponse / CoMovementCandidate shared 타입 계약
  - phase: 11-co-movement-candidates-top-k (Plan 03)
    provides: GET /api/stocks/:code/co-movement 읽기 라우트 (production live, revision 00026)
provides:
  - StockComovementSection — 종목상세 동조 후보 섹션 (UI-SPEC 변형C + 기본3/더보기 + 빈상태 + quiet fallback)
  - fetchStockComovement — apiFetch<CoMovementResponse> 클라이언트 (객체 계약)
  - stock-detail-client ThemeChips 다음 마운트 (COMV-01 성공기준 5)
  - Vercel production 배포 (gh-radar-webapp) — 풀스택 라이브
affects: [verify-work, future-stock-detail-ui]

tech-stack:
  added: []
  patterns:
    - "mount fetch + AbortController quiet fallback (theme-chips/daily-chart 선례 재사용)"
    - "co-surge 전용 후보(sharedThemes=[]) 동반율 '—' 표시 — confD0=0 '0%' 오표시 방지"
    - "동반율 중립색 / 실시간만 방향색 — UI-SPEC LOCKED 색 규칙"

key-files:
  created:
    - webapp/src/lib/comovement-api.ts
    - webapp/src/components/stock/stock-comovement-section.tsx
    - webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx
  modified:
    - webapp/src/components/stock/stock-detail-client.tsx
    - .planning/phases/11-co-movement-candidates-top-k/11-DEPLOY-LOG.md

key-decisions:
  - "co-surge 전용 후보 동반율 = '—' (0% 미표시) — 테마무관 동조(실측 41%)가 가장 약해 보이는 오해 방지"
  - "에러 시 섹션 조용히 숨김(null) — error.message 미노출 (T-11-18 mitigate)"
  - "시각 검증은 사용자 수동 — 종목상세 HTML 이 middleware 로그인 게이트(307) 뒤"

patterns-established:
  - "동조 후보 UI = theme-rank-row(강도바) + theme-chips(근거칩) 재사용, 신규 토큰/하드코딩 0"
  - "Vercel 프론트 수동 배포 = pull→build --prod→deploy --prebuilt --prod (ignoreCommand skip 회피)"

requirements-completed: [COMV-01]

duration: 약 12min (Task 3 배포 세그먼트)
completed: 2026-06-11
---

# Phase 11 Plan 05: 동조 후보 종목상세 섹션 + Vercel 배포 Summary

**종목상세 ThemeChips 다음에 동조 후보 섹션(강도바+근거칩+동반율 중립색/실시간 방향색+후행배지, 기본3/더보기/빈상태/quiet fallback)을 UI-SPEC 변형C로 구현하고 Vercel production 에 배포 — Supabase→worker→server→webapp 풀스택 라이브**

## Performance

- **Duration:** Task 3(배포) 약 12분 (Task 1~2 는 이전 세션)
- **Completed:** 2026-06-11
- **Tasks:** 3/3 (Task 1~2 이전 세션, Task 3 본 세션)
- **Files modified:** 5 (3 created + 2 modified)

## Accomplishments

- `StockComovementSection` — UI-SPEC §Component Structure 그대로 구현: 행 카드(강도바 .underbar 3px + 공유테마/직접동반 근거칩 + 동반율 중립색 + 실시간 방향색 + 후행형 배지), 초기 3행/더보기(useState expanded), 빈 상태("동조 데이터 부족" CircleOff), 에러 시 quiet fallback(섹션 숨김).
- `fetchStockComovement` — `apiFetch<CoMovementResponse>` 객체 계약으로 Plan 03 라우트 소비 (계약 드리프트 회피).
- co-surge 전용 후보(`sharedThemes.length===0`) 동반율 "—" 처리 — confD0=0 "0%" 오표시 방지.
- 컴포넌트 테스트 7/7 green (초기3/더보기, 빈상태, quiet fallback, 칩/배지, 동반율 표시, co-surge 전용 "—").
- **Vercel production 배포** — readyState `READY`, prod alias `gh-radar-webapp.vercel.app` → 신규 배포(`12eggp2fu`) 매핑 확인. 풀스택(Plan 02 데이터 → Plan 03 라우트 → Plan 05 UI) 라이브.

## Task Commits

1. **Task 1: comovement-api + StockComovementSection 컴포넌트** - `5d03fd1` (feat)
2. **Task 2: stock-detail-client 마운트 + 컴포넌트 테스트 7/7** - `3bfe947` (feat)
3. **Task 3: Vercel production 배포 + DEPLOY-LOG** - `3d4a310` (docs)

_Note: Task 3 는 checkpoint:human-verify 의 자동화 부분(배포). 시각 검증은 사용자 수동 대기._

## Files Created/Modified

- `webapp/src/lib/comovement-api.ts` - `fetchStockComovement(code,k,signal)` → apiFetch<CoMovementResponse>
- `webapp/src/components/stock/stock-comovement-section.tsx` - 동조 후보 섹션 (219줄, UI-SPEC 변형C)
- `webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx` - 컴포넌트 테스트 7케이스
- `webapp/src/components/stock/stock-detail-client.tsx` - StockComovementSection 마운트 (ThemeChips 다음)
- `.planning/phases/11-co-movement-candidates-top-k/11-DEPLOY-LOG.md` - Vercel 배포 항목 append

## Decisions Made

- co-surge 전용 후보 동반율 = "—" (0% 미표시) — 테마무관 동조 경로(실측 41%)가 UI 에서 가장 약해 보이는 오해 방지 (UI-SPEC 우측 메트릭 규칙).
- 에러 시 섹션 조용히 숨김(null) — error.message 미노출 (T-11-18 mitigate, theme-chips/daily-chart 선례).
- 시각 검증을 사용자 수동으로 갈음 — 종목상세 HTML 이 middleware 로그인 게이트(307 → /login) 뒤라 curl 직접 마커 확인 불가. 배포 활성은 Vercel CLI readyState `READY` + alias resolve + HTTP 307(게이트 정상) 로 입증.

## Deviations from Plan

None - plan executed exactly as written. (Vercel 배포는 plan Task 3a 의 수동 3단계 경로 그대로 사용.)

빌드 중 pre-existing 경고 1건(`theme-detail-client.tsx 'ScannerEmpty' unused`) 관측 — 본 plan 무관 파일(SCOPE BOUNDARY), 미수정. 동조 후보 신규 파일은 lint/type/hex 경고 0.

## Issues Encountered

None. 수동 3단계 배포(pull→build --prod→deploy --prebuilt --prod) 한 번에 성공, readyState READY, alias 정상 매핑.

## User Setup Required

None - 신규 env 추가 0 (기존 NEXT_PUBLIC_* 재사용). env 변경 없으므로 trailing-newline 위협(DI-04) 무관.

## 시각 검증 — 사용자 수동 검증 대기 (checkpoint:human-verify)

종목상세 HTML 은 로그인 게이트 뒤라 자동(curl) 마커 확인 불가. 아래를 **로그인 후 직접** 확인 요청 (UI-SPEC + mockups/co-movement-adopted.html 6/6 PASS 계약 대조):

- [ ] `https://gh-radar-webapp.vercel.app/stocks/004090` (한국석유) — "이 종목의 테마" 칩 **다음**에 "동조 후보" 섹션(Waypoints 아이콘 + 캡션) 렌더
- [ ] 후보 행: 종목명/코드 + 동반율(중립 검정/흰색 — 빨강/파랑 아님) + 실시간 등락률(상승=빨강/하락=파랑) + 근거칩(공유테마 또는 "직접동반 N회" accent) + 강도바(하단 빨강 라인)
- [ ] 흥구석유(024060) 상위 노출, co-surge 전용 후보(직접동반 칩만, 공유테마 없음)의 동반율이 "0%" 가 아니라 **"—"**
- [ ] 후보 >3 → "동조 후보 N개 더 보기" 버튼 → 클릭 → 전체 펼침 → "접기"
- [ ] 후행형 후보 있으면 "후행형" 배지(파랑 톤)
- [ ] 다크/라이트 토글 → 색 자동 전환 (oklch 토큰)
- [ ] 무테마 종목(예: 005935 삼성전자우) → "동조 데이터 부족" 빈 상태 박스(CircleOff)
- [ ] (선택) 잘못된 종목/네트워크 끊김 → 섹션 조용히 사라짐(에러 카피 노출 0)

문제 발견 시 구체 기술(예: "동반율이 빨강", "섹션이 테마 칩 위"). 이상 없으면 "approved".

## Next Phase Readiness

- **Phase 11 5개 성공기준 전부 충족** — COMV-01 성공기준 5(종목상세 동조 후보 섹션 + 빈 상태) 구현·배포 완료. 풀스택 라이브(Supabase 사전계산 → server 라우트 → webapp UI).
- `/gsd-verify-work` 준비 완료 (시각 검증 사용자 승인 후).
- Blocker 없음.

## Self-Check: PASSED

- FOUND: webapp/src/lib/comovement-api.ts
- FOUND: webapp/src/components/stock/stock-comovement-section.tsx
- FOUND: webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx
- FOUND: commit 5d03fd1 (Task 1)
- FOUND: commit 3bfe947 (Task 2)
- FOUND: commit 3d4a310 (Task 3)
- FOUND: Vercel deployment dpl_3zTGmDNBCRNeKFQ9FWspaFRrw2Ty (READY, prod alias 매핑)

---
*Phase: 11-co-movement-candidates-top-k*
*Completed: 2026-06-11*
