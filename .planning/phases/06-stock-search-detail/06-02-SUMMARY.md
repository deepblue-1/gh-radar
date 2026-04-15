---
phase: 06-stock-search-detail
plan: 02
subsystem: webapp/search-data-layer
tags: [stock-api, debounce, abort-controller, cmdk, vitest, hooks]
requires:
  - 06-01 (vitest + jest-dom + fake timers 셋업)
  - webapp/src/lib/api.ts (apiFetch + ApiClientError)
  - "@gh-radar/shared Stock 타입"
provides:
  - "searchStocks(q, signal) → Stock[]"
  - "fetchStockDetail(code, signal) → Stock"
  - "useDebouncedSearch(query, delayMs=300) 훅"
  - "useCmdKShortcut(toggle) 훅"
affects:
  - Plan 03 (GlobalSearch) — useDebouncedSearch + useCmdKShortcut + searchStocks import
  - Plan 04 (StockDetailClient) — fetchStockDetail import
tech_stack_added: []
patterns:
  - "apiFetch 재사용 (envelope + X-Request-Id + 8s 타임아웃) — raw fetch 중복 금지"
  - "AbortController race 방지: 새 입력 발생 시 controllerRef.current?.abort()"
  - "AbortError 는 사용자 에러로 노출하지 않음 (name === 'AbortError' 체크)"
  - "document keydown 바인딩 + e.preventDefault() — input focus 무시 + OS 기본 단축키 억제"
key_files_created:
  - webapp/src/lib/stock-api.ts
  - webapp/src/lib/__tests__/stock-api.test.ts
  - webapp/src/hooks/use-debounced-search.ts
  - webapp/src/hooks/use-debounced-search.test.ts
  - webapp/src/hooks/use-cmdk-shortcut.ts
  - webapp/src/hooks/use-cmdk-shortcut.test.ts
key_files_modified: []
decisions:
  - "벡터 Phase 5 scanner-api 패턴 대신 apiFetch 재사용 — 헤더 직접 접근 필요 없음, 에러 처리 일원화 이점"
  - "useDebouncedSearch 에 AbortError 명시적 skip — fetch 도중 input 변경으로 abort 시 UI 에 빨간 에러 표시되는 UX 버그 방지"
metrics:
  duration_minutes: 8
  commits: 3
  tasks_completed: 3
completed_date: 2026-04-15
---

# Phase 06 Plan 02: 검색 데이터 레이어 + 훅 Summary

**One-liner:** stock-api 래퍼 · useDebouncedSearch · useCmdKShortcut 3개 모듈을 Plan 03/04 공통 의존성으로 선행 구현 · 17 단위 테스트 (4 + 7 + 6) 로 debounce + abort + 단축키 동작을 결정론적으로 증명.

## Context

Phase 06 Wave 1 — Plan 03 (GlobalSearch)·Plan 04 (StockDetailClient) 가 공통으로 import 할 pure 모듈만 분리. UI 렌더링은 포함하지 않음. `vi.mock` 패턴 (Phase 5 회귀) + fake timers 로 production code 변경 없이 테스트 고립.

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | stock-api.ts + 4 단위 테스트 | `93241bf` | webapp/src/lib/stock-api.ts, webapp/src/lib/__tests__/stock-api.test.ts |
| 2 | useDebouncedSearch + 7 단위 테스트 | `81d03ae` | webapp/src/hooks/use-debounced-search.ts, webapp/src/hooks/use-debounced-search.test.ts |
| 3 | useCmdKShortcut + 6 단위 테스트 | `435b2bb` | webapp/src/hooks/use-cmdk-shortcut.ts, webapp/src/hooks/use-cmdk-shortcut.test.ts |

## Verification

- `pnpm --filter @gh-radar/webapp test -- --run` → **57 passed (8 files)** — Phase 5 회귀 0, 신규 17 pass.
- `pnpm --filter @gh-radar/webapp exec tsc --noEmit` → **EXIT 0**.
- Acceptance criteria (grep 패턴) 전부 매치:
  - stock-api: `import { apiFetch } from './api'` · `encodeURIComponent(code)` ✓
  - use-debounced-search: `'use client'` · `new AbortController()` · `setTimeout` · `controllerRef.current?.abort()` · `query.trim()` ✓
  - use-cmdk-shortcut: `document.addEventListener('keydown'` · `e.metaKey || e.ctrlKey` · `e.preventDefault()` ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 누락된 안전장치] useDebouncedSearch 의 AbortError 처리**
- **Found during:** Task 2 구현.
- **Issue:** 플랜 Test 7 ("AbortError reject 는 error 건드리지 않음") 은 `controller.signal.aborted` 체크만으로는 불충분. mock fetcher 가 signal abort 전에 이미 reject(AbortError) 를 발사한 경우 `aborted === false` 상태로 catch 진입 → error 채워짐.
- **Fix:** catch 핸들러에서 `err.name === 'AbortError'` 도 명시적으로 확인하여 이 경우 조용히 early return.
- **Why this was correct:** 실제 브라우저 fetch 도 abort 시 `AbortError` 를 throw — Pitfall 3 의 race 시나리오에서 UI 에 빨간 에러 박스가 깜빡이는 UX 버그를 방지하는 Rule 2 안전장치.
- **Commit:** `81d03ae`.

## 인증 게이트

없음. 전부 로컬 pnpm 테스트.

## Known Stubs

없음. 3 모듈 모두 Plan 03/04 에서 그대로 소비될 production-ready 구현.

## Threat Flags

없음. 신규 네트워크 경로 0 (기존 `/api/stocks/search` · `/api/stocks/:code` 는 서버에서 이미 노출된 엔드포인트), DOM 이벤트 리스너는 document keydown 1개 (document-wide hotkey 표준 패턴).

## Success Criteria 충족

- [x] stock-api / use-debounced-search / use-cmdk-shortcut 3 모듈 + 3 테스트 파일 commit
- [x] AbortController race 방지 로직이 테스트로 증명됨 (Pitfall 3 — Test 5: `signals[0]!.aborted === true`)
- [x] mod+k 가 Mac (metaKey) / Win (ctrlKey) 양측 호환 (Pitfall 4, 6 — Test 1·2·5)
- [x] Plan 03/04 가 이 모듈을 import 할 수 있는 상태 (tsc 통과 + export 시그니처 일치)

## Self-Check: PASSED

- FOUND: webapp/src/lib/stock-api.ts
- FOUND: webapp/src/lib/__tests__/stock-api.test.ts
- FOUND: webapp/src/hooks/use-debounced-search.ts
- FOUND: webapp/src/hooks/use-debounced-search.test.ts
- FOUND: webapp/src/hooks/use-cmdk-shortcut.ts
- FOUND: webapp/src/hooks/use-cmdk-shortcut.test.ts
- FOUND: 93241bf (Task 1)
- FOUND: 81d03ae (Task 2)
- FOUND: 435b2bb (Task 3)
