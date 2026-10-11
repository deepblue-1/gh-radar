---
phase: 5
plan: 1
subsystem: webapp
tags: [scanner, ui, polling, tdd]
requires: [phase-2-api-scanner, phase-3-design-system, phase-4-frontend-scaffold]
provides: [scanner-client, use-polling, scanner-query, scanner-time, scanner-api]
affects: [webapp/src/app/scanner/page.tsx]
tech_stack_added: [vitest, jsdom, @testing-library/react, @testing-library/dom, @vitejs/plugin-react]
patterns_used: [tdd-red-green, client-polling, url-single-source-of-truth, stale-but-visible, shadcn-popover-toggle-group]
key_files_created:
  - webapp/vitest.config.ts
  - webapp/src/lib/scanner-query.ts
  - webapp/src/lib/scanner-query.test.ts
  - webapp/src/lib/scanner-time.ts
  - webapp/src/lib/scanner-time.test.ts
  - webapp/src/lib/scanner-api.ts
  - webapp/src/hooks/use-polling.ts
  - webapp/src/hooks/use-polling.test.ts
  - webapp/src/components/ui/popover.tsx
  - webapp/src/components/ui/toggle-group.tsx
  - webapp/src/components/ui/toggle.tsx
  - webapp/src/components/scanner/scanner-client.tsx
  - webapp/src/components/scanner/scanner-filters.tsx
  - webapp/src/components/scanner/scanner-table.tsx
  - webapp/src/components/scanner/scanner-card-list.tsx
  - webapp/src/components/scanner/scanner-empty.tsx
  - webapp/src/components/scanner/scanner-error.tsx
  - webapp/src/components/scanner/scanner-skeleton.tsx
key_files_modified:
  - webapp/package.json
  - webapp/src/app/scanner/page.tsx
decisions:
  - changeRate 스케일을 **정수 %** (29.98=29.98%) 로 실측 확정 → minRate 쿼리/렌더 모두 정수 스케일, percent 포맷 대신 `format=plain + 수동 +/%`
  - `usePolling` 자체 구현 (SWR 제외) — 번들 0KB 추가, fake-timer 테스트 단순, key 변경 abort 직접 제어
  - shadcn 블록은 이미 `radix-ui` umbrella import 로 생성되어 별도 후처리 불필요
  - vitest 2.1.9 + @vitejs/plugin-react 4.7 페어링 (vitest 4 + plugin 6 은 vite 버전 충돌)
  - 공유 URL 기본값은 query 생략 (`/scanner` = min25/ALL) — 깔끔한 링크 우선
metrics:
  duration_minutes: ~18
  tasks_completed: 9
  commits: 11
  tests_added: 28
  files_created: 18
  files_modified: 2
completed: 2026-04-14
---

# Phase 5 Plan 1: Scanner UI Summary

Phase 4 placeholder `/scanner` 를 60초 자동 폴링·URL 단일 진리원·stale-but-visible 에러 UX 를 갖춘 실 Scanner UI 로 교체. 정수 % 스케일 실측으로 서버 계약과 렌더 단위 정합을 확보하고, webapp 에 vitest 인프라를 신규 도입하여 28개 단위 테스트로 SCAN-02/05/06/07 요구사항을 자동 커버.

## Waves 실행 결과

### Wave 0 — 인프라 (2 tasks, 2 commits)
- **W0-T01**: vitest 2.1.9 + jsdom 29 + @testing-library/react 16.3 + @vitejs/plugin-react 4.7 설치, `webapp/vitest.config.ts` (jsdom env, globals, `@/*` alias), `test` 스크립트 (`--run --passWithNoTests`, watch 금지)
- **W0-T02**: shadcn `popover/toggle-group/toggle` 3 블록 추가 — 생성물이 이미 `radix-ui` umbrella import 사용 → 후처리 없음

### Wave 1 — 순수 로직 + 훅 (TDD) (3 tasks, 4 commits — RED/GREEN 분리 1건)
- **W1-T01**: `scanner-query.ts` — `parseScannerSearchParams` (min clamp 10~29 + Math.round + market whitelist), `toScannerSearchParams` (기본값 생략). **17 테스트 PASS** (RED→GREEN 2 commit). T-5-01 mitigation.
- **W1-T02**: `scanner-time.ts` — `Intl.DateTimeFormat('ko-KR', Asia/Seoul)` 단일 인스턴스, `formatToParts` 로 2자리 zero-pad + `24→00` 정규화. **5 테스트 PASS**.
- **W1-T03**: `usePolling` — mount 즉시 + intervalMs 간격, key 변경/unmount/refresh 시 AbortController.abort, stale-but-visible, fetcher ref 로 stale closure 회피. **6 테스트 PASS** (fake timers). T-5-03 mitigation.

### Wave 2 — Scanner UI 컴포넌트 (5 tasks, 4 commits — Skeleton/Empty/Error 묶음)
- **W2-T01**: `scanner-api.ts` — Cloud Run 실측으로 `changeRate` 정수 % 스케일 확정, `SCANNER_LIMIT=100`, `StockWithProximity` 로컬 alias
- **W2-T02**: `ScannerSkeleton` (thead+10row / 5card), `ScannerEmpty` (SearchX + 안내), `ScannerError` (AlertTriangle + color-mix border + [CODE] prefix + 다시 시도 버튼)
- **W2-T03**: `ScannerTable` (md:block, 6-col Link row, Badge KOSPI=secondary/KOSDAQ=outline, 수동 +/%+색상), `ScannerCardList` (md:hidden, 3줄 카드 Link, minHeight 88px)
- **W2-T04**: `ScannerFilters` — 필터 label + 등락률/마켓 Popover chip + 타임스탬프 + 새로고침 버튼. Slider 로컬 state 즉시 chip 갱신 + 250ms debounce, ToggleGroup 빈 값 무시
- **W2-T05**: `ScannerClient` — URL 단일 진리원, `key=min|market`, `startTransition(router.replace)`, stale-but-visible 병기

### Wave 3 — 페이지 통합 (1 task + 1 checkpoint)
- **W3-T01**: `/scanner/page.tsx` 전체 교체 — Phase 4 placeholder 완전 제거, Suspense + `dynamic='force-dynamic'` + AppShell
- **W3-T02**: 수동 E2E 체크리스트 7종 — **dev 서버 실행 후 사용자 승인 대기** (아래 섹션)

## 품질 게이트 (전원 PASS)

```
pnpm --filter @gh-radar/webapp typecheck  → PASS
pnpm --filter @gh-radar/webapp lint       → PASS (Phase 5 경고 0, 기존 파일 경고 2건 scope 밖)
pnpm --filter @gh-radar/webapp build      → PASS (/scanner 7.02kB · 157kB First Load · Dynamic ƒ)
pnpm -r test -- --run                     → 100 PASS (webapp 28 · server 52 · workers 20)
grep -R "dangerouslySetInnerHTML" scanner → 0건 (T-5-02)
git diff d157f7d..HEAD -- server/ packages/shared/ → 0 파일 (서버 미수정 보장)
```

## 실측 결정 로그 (계획상 open 항목)

**changeRate 스케일 확정 (Wave 2-T01)**:
```bash
curl "https://gh-radar-server-1023658565518.asia-northeast3.run.app/api/scanner?sort=rate_desc&limit=3"
# 응답: changeRate: 30, 29.98 → 정수 % 스케일
```
- 클라→서버: `minRate=${min}` (정수 그대로)
- 렌더: `<Number format="plain" precision={2}>` + 수동 `+`/`%` + 색상 class
- `<Number format="percent">` (내부 ×100) 은 사용하지 않음

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest 버전 호환 조정**
- **Found during:** Wave 0 T01
- **Issue:** 최신 `vitest@4` + `@vitejs/plugin-react@6` 조합 시 plugin 이 `vite@^8` 요구, vitest 번들 vite@7 과 충돌 (`ERR_PACKAGE_PATH_NOT_EXPORTED`)
- **Fix:** `vitest@^2.1.9` + `@vitejs/plugin-react@^4.7` 페어로 다운그레이드 — 둘 다 vite@5/7 호환 공통 지원
- **Files modified:** `webapp/package.json`, `pnpm-lock.yaml`
- **Commit:** 7bad723

**2. [Rule 3 - Blocking] vitest `No test files` 빈 상태 exit code**
- **Found during:** Wave 0 T01 검증 (후속 task 로 테스트 채우기 전에 자동 verify 통과 필요)
- **Issue:** vitest 기본 동작은 테스트 0건 시 exit 1
- **Fix:** `test` 스크립트에 `--passWithNoTests` 플래그 추가 — watch 금지 규약은 `--run` 으로 여전히 유효
- **Commit:** 7bad723

**3. [Planner-driven] shadcn 블록 umbrella import 후처리 생략**
- **Found during:** Wave 0 T02
- **Issue:** 계획은 `import * as X from "@radix-ui/react-*"` 치환 후처리를 지시했으나, 실제 shadcn CLI 가 이미 `import { X as XPrimitive } from "radix-ui"` 형태로 생성
- **Fix:** 검증만 수행 (`grep "@radix-ui/react-" webapp/src/components/ui` → 0건), 파일 변경 없음
- **Commit:** b36a027

### 계획 대비 커밋 수 차이

- TDD RED/GREEN 커밋 분리는 W1-T01 만 수행. W1-T02/T03 은 구현 + 테스트 동시 커밋 (빠른 반복 효율, RED 상태 증명은 `test` 명령으로 구현 전 실행 확인 후 진행)
- Wave 2 Skeleton/Empty/Error 는 파일 의존성 없어 단일 커밋으로 묶음

## Known Stubs

없음. 모든 컴포넌트가 실 데이터 파이프(Cloud Run `/api/scanner` → apiFetch → usePolling → 렌더)로 연결됨.

## Threat Flags

신규 threat surface 없음 — 본 Phase 는 브라우저 URL/입력 경계만 다루며 새로운 네트워크 endpoint/스키마/auth 경로를 도입하지 않음.

## 수동 E2E 체크리스트 (Phase Gate — 사용자 승인 대기)

**자동 증거로 이미 PASS (5/7)**:
- **#1 초기 진입**: Suspense fallback → ScannerSkeleton HTML 서버 렌더 확인 (curl) + 업스트림 minRate=25 ALL 응답 PASS
- **#3 마켓 토글**: `parseScannerSearchParams` 17 테스트 + 업스트림 market=KOSDAQ/KOSPI 필터 curl PASS
- **#4 60s 폴링 + 버튼 disabled**: `usePolling` 6 테스트 (mount·60s interval·refresh·abort) + ScannerFilters `disabled={isRefreshing}`
- **#5 Offline stale-but-visible**: `usePolling` error 유지 테스트 PASS + ScannerClient 병기 분기 구현
- **#7 공유 URL + 잘못된 값 복원**: `parseScannerSearchParams` 17 테스트 (경계값 9/10/29/30/NaN/UNKNOWN/empty) 전원 PASS

**브라우저 확인 필요 (2/7)**:
- **#2 Slider 드래그 제스처 + 250ms debounce 체감**: 드래그 paint 는 단위 테스트 불가
- **#6 모바일 뷰포트(375px) Card 리스트 + 터치 타겟**: viewport 전환 paint 는 단위 테스트 불가

사용자가 `pnpm --filter @gh-radar/webapp dev` → `http://localhost:3000/scanner` 에서 #2 · #6 을 확인한 후 VALIDATION.md frontmatter 의 `nyquist_compliant: true` 로 flip 예정.

## Self-Check: PASSED

**Files exist:**
- FOUND: webapp/vitest.config.ts
- FOUND: webapp/src/lib/scanner-query.ts
- FOUND: webapp/src/lib/scanner-query.test.ts
- FOUND: webapp/src/lib/scanner-time.ts
- FOUND: webapp/src/lib/scanner-time.test.ts
- FOUND: webapp/src/lib/scanner-api.ts
- FOUND: webapp/src/hooks/use-polling.ts
- FOUND: webapp/src/hooks/use-polling.test.ts
- FOUND: webapp/src/components/ui/popover.tsx
- FOUND: webapp/src/components/ui/toggle-group.tsx
- FOUND: webapp/src/components/ui/toggle.tsx
- FOUND: webapp/src/components/scanner/scanner-client.tsx
- FOUND: webapp/src/components/scanner/scanner-filters.tsx
- FOUND: webapp/src/components/scanner/scanner-table.tsx
- FOUND: webapp/src/components/scanner/scanner-card-list.tsx
- FOUND: webapp/src/components/scanner/scanner-empty.tsx
- FOUND: webapp/src/components/scanner/scanner-error.tsx
- FOUND: webapp/src/components/scanner/scanner-skeleton.tsx

**Commits exist (11 per-task + 1 final):**
- FOUND: 7bad723 (W0-T01 vitest 인프라)
- FOUND: b36a027 (W0-T02 shadcn 블록)
- FOUND: e6ed101 (W1-T01 RED)
- FOUND: 7421244 (W1-T01 GREEN)
- FOUND: d48c7ea (W1-T02)
- FOUND: 4480507 (W1-T03)
- FOUND: b385c10 (W2-T01)
- FOUND: 902a766 (W2-T02)
- FOUND: 17b652d (W2-T03)
- FOUND: d07bc36 (W2-T04)
- FOUND: 6966cc4 (W2-T05)
- FOUND: b4f36f2 (W3-T01)
