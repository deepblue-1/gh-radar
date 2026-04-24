---
quick_id: 260424-dld
slug: remove-scanner-rate-filter
description: 스캐너 사용자 조정 등락률 필터 제거 + 서버 고정 10% 하한 적용
date: 2026-04-24
status: completed
---

# Quick Task 260424-dld — 등락률 필터 제거

## Goal

Scanner 리스트에서 **사용자 조정 가능한** 등락률 슬라이더를 제거한다 (URL `min`/API `minRate` 파라미터, UI Popover 전부). 대신 서버에 고정 10% 하한(`SCANNER_MIN_CHANGE_RATE = 10`) 을 적용해 "조용한 장에서 순위 끝자락에 붙는 저등락 종목"이 스캐너에 섞이지 않도록 한다. 마켓 필터/정렬/limit 은 유지한다.

**Why two steps:**
1차 실행에서는 사용자 요구("전부 보여라")를 그대로 반영해 컷 없이 노출. 확인 후 "10% 이상만 보이게 하자" 가 추가되어 서버 측 고정 하한을 도입. 두 변경을 같은 quick task 안에서 합쳐 커밋한다.

## Scope

- **Backend (server)**:
  - `/api/scanner` 라우트에서 `minRate` 질의 파라미터/스키마 필드/동적 `changeRate >= minRate` 필터 로직 삭제.
  - `SCANNER_MIN_CHANGE_RATE = 10` 상수 추가 + 평탄화 직후 고정 컷 `filter((s) => s.changeRate >= 10)` 적용.
  - 테스트 2건(minRate 파라미터) 제거, 스캐너 픽스처 rate 를 ≥10% 로 조정, "changeRate<10% 제외" 회귀 테스트 + "stock_quotes 없는 종목 → 컷에 걸려 제외" 갱신.
- **Frontend (webapp)**:
  - `scanner-query.ts`: `ScannerState.min`, `SCANNER_MIN_RATE`, `SCANNER_MAX_RATE`, `parseMin`, `DEFAULT_SCANNER_STATE.min` 및 직렬화 로직 삭제. `ScannerState` 는 `{ market }` 로 축소.
  - `scanner-api.ts`: `URLSearchParams` 에서 `minRate` 제거 + 스케일 주석 정리.
  - `scanner-client.tsx`: polling key/deps 에서 `state.min` 제거. 페이지 설명 문구에서 "등락률과 마켓을 조정해" → "마켓을 선택해" 수정.
  - `scanner-filters.tsx`: 등락률 Popover + Slider + `localMin` state + debounce useEffect + `SLIDER_DEBOUNCE_MS` 모두 제거.
  - `scanner-query.test.ts`: 등락률 파싱/경계값/상수 export 테스트 제거, market 관련 테스트만 유지.

## Non-goals

- `top_movers` 수집 기준(worker) 변경 없음 — 이미 스캐너 워커가 기준에 맞춰 행을 만들어두므로, 노출 단계에서의 재필터만 제거.
- `upperLimitProximity` 계산/정렬 로직 변경 없음.
- `ScannerQuery.sort`/`limit` 파라미터 유지.
- DB 마이그레이션 없음.

## must_haves

**Truths:**
- `/api/scanner` 는 `changeRate >= 10%` 종목만 반환한다. 기준은 서버 상수(`SCANNER_MIN_CHANGE_RATE`).
- `minRate` 는 클라이언트 요청에서도 서버 스키마에서도 완전히 제거됐다 — 사용자가 조정할 수단이 없다.
- 프론트엔드 `ScannerState` 는 `{ market }` 형태만 유지한다. `min` 필드는 어디에도 남지 않는다.

**Artifacts:**
- 변경된 소스 파일은 lint/type check 를 통과한다.
- 기존 backend scanner 테스트에서 minRate 관련 케이스 2건 제거, 나머지는 그대로 통과.
- 기존 webapp scanner-query 테스트에서 min 관련 케이스 제거, market 케이스는 통과.

**Key Links:**
- [server/src/routes/scanner.ts](server/src/routes/scanner.ts#L30) — `minRate` 제거 포인트
- [server/src/schemas/scanner.ts](server/src/schemas/scanner.ts#L5) — zod 스키마
- [webapp/src/lib/scanner-query.ts](webapp/src/lib/scanner-query.ts) — 타입/상수
- [webapp/src/components/scanner/scanner-filters.tsx](webapp/src/components/scanner/scanner-filters.tsx#L115) — UI 제거
- [webapp/src/lib/scanner-api.ts](webapp/src/lib/scanner-api.ts#L42) — 요청에서 `minRate` 제거
- [webapp/src/components/scanner/scanner-client.tsx](webapp/src/components/scanner/scanner-client.tsx#L36) — key/deps/copy

## Tasks

### T-1 — Backend: remove minRate from scanner route + schema + tests
- **files:**
  - `server/src/schemas/scanner.ts`
  - `server/src/routes/scanner.ts`
  - `server/tests/routes/scanner.test.ts`
- **action:**
  - `ScannerQuery` 에서 `minRate: z.coerce.number().optional()` 라인 삭제.
  - `scanner.ts` 에서 `minRate` 구조분해 삭제 + `if (typeof minRate === "number") merged = merged.filter(...)` 블록 삭제.
  - `scanner.test.ts` 에서 `minRate=1.0 → changeRate>=1.0 만`, `market+minRate AND` 두 케이스 삭제. market 전용 케이스로 축소.
- **verify:** `pnpm --filter server test -- scanner` → scanner 테스트 스위트에서 남은 케이스 전부 통과.
- **done:** `grep -n minRate server/src server/tests` 가 빈 결과를 반환.

### T-2 — Frontend: simplify ScannerState + drop min parsing/serialization + tests
- **files:**
  - `webapp/src/lib/scanner-query.ts`
  - `webapp/src/lib/scanner-query.test.ts`
- **action:**
  - `ScannerState` 를 `{ market: Market }` 로 축소, `SCANNER_MIN_RATE`/`SCANNER_MAX_RATE`/`parseMin` 제거, `DEFAULT_SCANNER_STATE` 는 `{ market: 'ALL' }` 로 변경.
  - `parseScannerSearchParams` / `toScannerSearchParams` 를 market 전용으로 재작성.
  - 테스트에서 min 관련 describe 블록 삭제, market 파싱 테스트 유지.
- **verify:** `pnpm --filter webapp test -- scanner-query` 통과.
- **done:** `grep -nE "SCANNER_MIN_RATE|SCANNER_MAX_RATE|state\\.min|DEFAULT_SCANNER_STATE\\.min" webapp/src` 가 빈 결과.

### T-3 — Frontend: remove minRate from API client
- **files:**
  - `webapp/src/lib/scanner-api.ts`
- **action:**
  - `URLSearchParams` 생성 시 `minRate` 엔트리 제거. 상단 주석에서 minRate 전송 관련 bullet 제거.
  - `state.min` 참조 없음을 확인.
- **verify:** `pnpm --filter webapp typecheck` (or build) 통과.
- **done:** `grep -n minRate webapp/src` 가 빈 결과.

### T-4 — Frontend: scanner-client + scanner-filters UI cleanup
- **files:**
  - `webapp/src/components/scanner/scanner-client.tsx`
  - `webapp/src/components/scanner/scanner-filters.tsx`
- **action:**
  - `scanner-client.tsx`: polling `key` / `useCallback` deps 에서 `state.min` 제거, 페이지 안내 문구를 "마켓을 선택해 리스트를 확인하세요." 로 교체.
  - `scanner-filters.tsx`: 등락률 Popover 전체 제거 + `localMin` state + `handleSliderChange` + 두 개의 debounce `useEffect` + `SLIDER_DEBOUNCE_MS` 상수 + `Slider` / `Popover`(등락률용) import 제거. 마켓 Popover 는 유지. 남은 `Slider`/`Popover` 사용처가 없으면 import 정리.
- **verify:** `pnpm --filter webapp lint` / dev server 에서 `/scanner` 접속 시 등락률 chip 이 사라지고 마켓 chip + 새로고침만 남아있는지 수동 확인.
- **done:** `grep -nE "등락률|SCANNER_MIN_RATE|SCANNER_MAX_RATE|localMin|handleSliderChange" webapp/src/components/scanner` 가 빈 결과.

## Verification

- `pnpm --filter server test -- scanner` 통과
- `pnpm --filter webapp test -- scanner-query` 통과
- `pnpm --filter webapp typecheck` (또는 `pnpm -w typecheck`) 통과
- 수동: dev server 에서 `/scanner` 접속 → 등락률 필터 UI 가 완전히 사라지고, top_movers 전체 종목이 표시됨.

## Out of Scope Notes

- Scanner 워커(top_movers 생성 기준) 조정은 별도 task.
- URL 에 남아있는 `?min=25` 같은 레거시 쿼리는 parser 가 무시하므로 별도 마이그레이션 불필요(기본값으로 fallback). 구 URL 을 공유해도 동작한다.
