---
phase: 5
slug: scanner-ui
plan: 1
type: execute
status: draft
wave_count: 4
created: 2026-04-14
autonomous: true
depends_on: []
requirements:

  - SCAN-01
  - SCAN-02
  - SCAN-03
  - SCAN-04
  - SCAN-05
  - SCAN-06
  - SCAN-07

security_enforcement: true
nyquist_compliant: false
files_modified:

  - webapp/package.json
  - webapp/vitest.config.ts
  - webapp/src/components/ui/popover.tsx
  - webapp/src/components/ui/toggle-group.tsx
  - webapp/src/components/ui/toggle.tsx
  - webapp/src/lib/scanner-query.ts
  - webapp/src/lib/scanner-query.test.ts
  - webapp/src/lib/scanner-time.ts
  - webapp/src/lib/scanner-time.test.ts
  - webapp/src/lib/scanner-api.ts
  - webapp/src/hooks/use-polling.ts
  - webapp/src/hooks/use-polling.test.ts
  - webapp/src/components/scanner/scanner-client.tsx
  - webapp/src/components/scanner/scanner-filters.tsx
  - webapp/src/components/scanner/scanner-table.tsx
  - webapp/src/components/scanner/scanner-card-list.tsx
  - webapp/src/components/scanner/scanner-empty.tsx
  - webapp/src/components/scanner/scanner-error.tsx
  - webapp/src/components/scanner/scanner-skeleton.tsx
  - webapp/src/app/scanner/page.tsx

must_haves:
  truths:

    - /scanner 진입 시 상위 100개 종목의 현재가·등락률·거래량이 Table(데스크톱) 또는 Card(모바일) 로 표시된다
    - Slider 를 10~29% 범위로 조작하면 URL `?min=` 이 동기화되고 서버 minRate 필터 결과가 렌더된다
    - 마켓 토글(ALL/KOSPI/KOSDAQ)을 변경하면 URL `?market=` 이 즉시 반영되고 해당 마켓 종목만 렌더된다
    - 각 행에 KOSPI/KOSDAQ 마켓 배지가 표시된다
    - "헤더에 `최근 갱신 HH:MM:SS KST` 가 표시된다 (성공 fetch 시 업데이트)"
    - 60초 간격으로 /api/scanner 가 자동 재호출되며 데이터가 갱신된다
    - 폴링 중 에러 발생 시 기존 리스트는 유지되고 에러 카드가 병기된다 (stale-but-visible)
    - 잘못된 URL 쿼리(`?min=99&market=UNKNOWN`) 는 기본값(min=25, market=ALL) 로 복원된다
  artifacts:

    - "path: webapp/src/lib/scanner-query.ts"
    - "path: webapp/src/lib/scanner-time.ts"
    - "path: webapp/src/lib/scanner-api.ts"
    - "path: webapp/src/hooks/use-polling.ts"
    - "path: webapp/src/components/scanner/scanner-client.tsx"
    - "path: webapp/src/app/scanner/page.tsx"
  key_links:

    - "from: webapp/src/components/scanner/scanner-client.tsx"
    - "from: webapp/src/components/scanner/scanner-client.tsx"
    - "from: webapp/src/components/scanner/scanner-filters.tsx"
    - "from: webapp/src/app/scanner/page.tsx"

wave: 1
---

<objective>
Phase 4 의 `/scanner` placeholder 를 Variant C · Plain 디자인 그대로 구현하는 실제 인터랙티브 스캐너 화면으로 교체한다. 신규 런타임 의존성 없이 Phase 2 `/api/scanner` + Phase 3 shadcn 컴포넌트 + Phase 4 `apiFetch` 를 조합해 SCAN-01 ~ SCAN-07 을 모두 만족한다.

Purpose: 트레이더가 상한가 근접 종목을 1분 간격으로 자동 갱신되는 리스트로 추적하고, 임계값·마켓 필터를 URL 로 공유 가능한 형태로 조작할 수 있어야 한다.

Output: `/scanner` 인터랙티브 페이지(데스크톱 Table + 모바일 Card), URL ↔ state 양방향 동기화, 60s 폴링 + 수동 refresh, stale-but-visible 에러 UX, 타임스탬프 표시. 단위 테스트(3개) 통과 + 수동 E2E 체크리스트 7종 PASS.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-scanner-ui/05-CONTEXT.md
@.planning/phases/05-scanner-ui/05-UI-SPEC.md
@.planning/phases/05-scanner-ui/05-RESEARCH.md
@.planning/phases/05-scanner-ui/05-VALIDATION.md
@CLAUDE.md

<interfaces>
<!-- 서버 API 계약 (읽기 전용 — 서버 수정 금지) -->

From server/src/schemas/scanner.ts:

```typescript
// ScannerQuery: {
//   market: 'KOSPI' | 'KOSDAQ' | 'ALL' (default 'ALL'),
//   minRate: number | undefined (coerce, 미지정 시 필터 없음 — 주의: 단위는 DB change_rate 스케일과 동일),
//   sort: 'rate_desc' | 'rate_asc' | 'volume_desc' (default 'rate_desc'),
//   limit: number | undefined (min 1, max 10000)
// }
```

From server/src/mappers/stock.ts:

```typescript
export type StockWithProximity = Stock & { upperLimitProximity: number };
// rowToStock 이 반환하는 실 응답 타입. Stock 은 @gh-radar/shared.
// 주요 필드: code, name, market ('KOSPI'|'KOSDAQ'), price, changeRate, volume, updatedAt, upperLimit, upperLimitProximity ...
```

From webapp/src/lib/api.ts:

```typescript
export class ApiClientError extends Error {
  readonly code: string;   // 'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_<n>' | 서버 envelope code
  readonly status: number; // 0 = 네트워크/타임아웃
  readonly requestId?: string;
}
export function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T>;
// init.signal 로 AbortSignal 전달 가능 — usePolling 에서 활용.
```

From webapp/src/components/ui/{badge,number,slider,skeleton,table,card,button}.tsx:

- `<Badge variant="secondary|outline|up|down|flat">` — KOSPI=secondary, KOSDAQ=outline
- `<Number value={n} format="price|percent|volume" showSign withColor />` — 단, `percent` 포맷은 내부에서 `value * 100` 을 수행하므로 이미 % 스케일인 값은 `format="plain"` + 수동 `+`/`%` 처리 또는 `value/100` 으로 넘길 것
- `<Slider min={10} max={29} step={1} defaultValue={[25]} />` — 내부 radix umbrella import 사용
- `<Skeleton className="..." />` · `<Table>` · `<Card>` · `<Button variant="primary|ghost">` 전부 Phase 3 기설치

From webapp/src/components/layout/app-shell.tsx:

```typescript
<AppShell hideSidebar>{children}</AppShell>  // Phase 4 placeholder 와 동일 호출 방식 유지
```

</interfaces>

<critical_clarifications>
**`changeRate` 단위 확인 필수 (Wave 2 구현 시)**: 서버 `minRate` 쿼리는 DB `change_rate` 컬럼과 동일 스케일로 비교된다. 현재 프로젝트에서 DB 는 소수(0.2985 = 29.85%)로 저장되는 것으로 보인다. RESEARCH 는 `minRate=25` 로 보낸다고 기술했으나, 이는 정수 % 스케일을 가정. **구현 시 `server/src/routes/scanner.ts` + 실제 Supabase 데이터 샘플**을 확인 후:

- DB 가 소수 스케일(0.25) → 클라에서 `minRate=${min/100}` 로 전송
- DB 가 정수 스케일(25) → 클라에서 `minRate=${min}` 로 전송

Scanner 렌더에서 `stock.changeRate` 표시 시에도 동일한 단위 규약을 따라야 한다. Wave 2 Task T02 에서 명시적 실측 확인 후 결정.

**최종 결정 근거**: Phase 1 SUMMARY 의 샘플 데이터(`상한가/하한가 포함` · `acml_hgpr_date`) 혹은 Phase 2 smoke INV-2 응답을 실측하여 한 번에 확정. RESEARCH open question 중 유일하게 planner 선에서 해소할 수 없었던 항목이며, 구현 시 1분 이내 실측 가능.
</critical_clarifications>
</context>

## Scope

**In-scope**:

- Phase 4 `/scanner` placeholder 완전 교체 (서버 컴포넌트 ISR → client 폴링 구조)
- `webapp/src/lib/scanner-{query,time,api}.ts`, `webapp/src/hooks/use-polling.ts`, `webapp/src/components/scanner/*.tsx` 신규 생성
- shadcn `popover` + `toggle-group` + `toggle` 블록 추가 (radix-ui umbrella import 로 후처리)
- webapp 에 vitest + jsdom + @testing-library/react 최소 설정 도입
- 3종 단위 테스트: `scanner-query.test.ts`, `scanner-time.test.ts`, `use-polling.test.ts`
- 수동 E2E 체크리스트 7종 통과 (VALIDATION.md)

## Non-Scope

- 서버(`/api/scanner`) 수정 — 스키마·핸들러 변경 금지
- 기존 shadcn 컴포넌트(`table/card/slider/badge/skeleton/button/number`) 시각·API 재디자인 금지 (재사용만)
- `AppShell` 수정 금지 — `hideSidebar` prop 그대로 사용
- `@gh-radar/shared` 타입 변경 금지
- SSE · WebSocket · Supabase Realtime · ISR 도입 금지 (CONTEXT D1 deferred)
- 가상 스크롤, 정렬 컬럼 확장, 즐겨찾기/알림, 장마감 배너, stale 경고 (모두 deferred)
- date-fns/dayjs/lodash/zustand 등 신규 런타임 의존성 도입 금지

## Architecture Summary

RESEARCH 확정 결정:

- **Polling**: 자체 `usePolling` 훅 (SWR 기각 — 번들 0KB, apiFetch 직결, 테스트 단순).
- **마켓 토글**: shadcn `ToggleGroup` 블록 (badge+button 조합 기각 — a11y 내장).
- **서버 limit 기본값**: 100 (클라이언트 상수 `SCANNER_LIMIT`, URL 미노출).
- **신규 런타임 의존성 0** — `radix-ui@1.4.3` umbrella 에 popover/toggle-group transitive 포함.
- **반응형**: 듀얼 마크업 (`hidden md:block` / `md:hidden`) — hydration 안정성 우선.
- **URL 동기화**: `useSearchParams` + `useRouter().replace` + 250ms debounce (Slider) + `startTransition`.
- **에러 UX**: stale-but-visible (data 유지 + error 병기).
- **타임스탬프**: 클라 수신 시각 `Date.now()` → `Intl.DateTimeFormat('ko-KR', Asia/Seoul)`.

파일 트리:

```
webapp/src/
├── app/scanner/
│   └── page.tsx                        # 교체 — Suspense + dynamic + ScannerClient
├── components/scanner/                 # 신규
│   ├── scanner-client.tsx              # 'use client' · usePolling 배선 · 상태 orchestration
│   ├── scanner-filters.tsx             # chip-bar + popover(Slider + ToggleGroup) + URL 동기화
│   ├── scanner-table.tsx               # md:block Table
│   ├── scanner-card-list.tsx           # md:hidden Card 리스트
│   ├── scanner-empty.tsx               # 빈 결과 블록
│   ├── scanner-error.tsx               # 에러 카드 (stale-but-visible 보조)
│   └── scanner-skeleton.tsx            # 초기 Skeleton (10행/5카드)
├── components/ui/
│   ├── popover.tsx                     # 신규 shadcn 블록 (umbrella import 후처리)
│   ├── toggle-group.tsx                # 신규
│   └── toggle.tsx                      # 신규 (toggle-group 의존)
├── hooks/
│   └── use-polling.ts                  # 범용 폴링 훅
└── lib/
    ├── scanner-query.ts                # parse/toSearchParams + clamp + whitelist
    ├── scanner-time.ts                 # formatKstTime
    └── scanner-api.ts                  # fetchScannerStocks + SCANNER_LIMIT
```

데이터 흐름:

```
URL ─▶ parseScannerSearchParams ─▶ ScannerState { min, market }
                                            │
                                            ▼
                                 key = `${min}|${market}`
                                            │
         usePolling(fetchScannerStocks, { intervalMs: 60_000, key })
                                            │
                            { data, error, lastUpdatedAt, refresh, isRefreshing }
                                            │
         ┌──────────────────┬──────────────┴──────────────┬──────────────────┐
         ▼                  ▼                             ▼                  ▼
   ScannerFilters     ScannerTable (md:block)     ScannerCardList      Error/Empty
   (chip+popover)     + ScannerSkeleton            (md:hidden)        (stale-but-visible)
         │
         ▼ 변경 감지 (Slider 는 250ms debounce)
   startTransition → useRouter().replace(?min=..&market=..)
```

## Threat Model

**Trust boundary**: 브라우저 URL 쿼리 / 사용자 입력 ─▶ ScannerClient 렌더러 + apiFetch 경계.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Verified By |
|-----------|----------|-----------|----------|-------------|------------|-------------|
| T-5-01 | Tampering / Input validation | `scanner-query.ts` URL 파서 | Low | mitigate | `parseScannerSearchParams` 에서 `min` 을 `Number.isFinite && 10~29` 로 clamp, 실패 시 25 로 fallback. `market` 은 `{ALL,KOSPI,KOSDAQ}` whitelist, 실패 시 ALL. Slider/ToggleGroup 도 동일 whitelist 로 역방향 보호. 서버 역시 zod `ScannerQuery` 에서 재검증. | `scanner-query.test.ts` 경계값(9/10/29/30/NaN/빈 문자열/UNKNOWN), 수동 체크리스트 #7 |
| T-5-02 | Injection (XSS) | Table/Card 내 종목명·코드 렌더 | Low | mitigate | React 기본 escaping 에만 의존 — `dangerouslySetInnerHTML` 금지, 원문을 attribute 값에 주입 금지. 종목명은 Supabase 신뢰 소스지만 방어 깊이 원칙으로 모든 렌더를 children 컨텍스트로 유지. | 코드 리뷰(`grep -R "dangerouslySetInnerHTML" webapp/src/components/scanner` = 0건), `pnpm --filter @gh-radar/webapp lint` |
| T-5-03 | Denial of Service (클라발) | `usePolling` + 수동 refresh 버튼 | Low | mitigate | 폴링 주기 60s 상수 하드코딩 (UI 조절 불가). 수동 refresh 는 호출 중 버튼 `disabled` + `RefreshCw` spin 으로 연타 방지(디바운스 불요 — 버튼 잠금으로 충분). key 변경 시 in-flight 요청 `AbortController.abort()` 로 단일 소비 보장. Cloud Run rate-limit (Phase 2) 이 서버 측 마지막 방어선. | `use-polling.test.ts` (fake timers 로 60s interval + manual refresh 중복 호출 시 이전 요청 abort 확인), 수동 체크리스트 #4 |

`security_enforcement=true` 이나 본 Phase threat 는 모두 `low` severity — 블로킹 게이트 없음. 모든 threat 에 구체 mitigation + 검증 경로 존재.

## Waves

**Wave 구성 전략**: Wave 0 인프라 → Wave 1 순수 로직 + 단위 테스트(스케폴딩 먼저) → Wave 2 Scanner UI 컴포넌트 + API 래퍼 → Wave 3 페이지 통합. 각 Wave 내 task 는 파일 겹침 없으면 병렬 가능하나, 솔로 개발자(Claude 순차 실행) 전제라 의존성만 보존.

### Wave 0 — 인프라 및 외부 블록 추가

<task id="5-W0-T01" type="auto">
  <name>vitest + jsdom 테스트 인프라 도입</name>
  <files_modified>webapp/package.json, webapp/vitest.config.ts, pnpm-lock.yaml</files_modified>
  <depends_on>none</depends_on>
  <autonomous>true</autonomous>
  <action>
    `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom` 실행.
    `webapp/vitest.config.ts` 신규 작성: `defineConfig({ plugins: [react()], test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{ts,tsx}'] }, resolve: { alias: { '@': path.resolve(__dirname, './src') } } })`.
    `webapp/package.json` scripts 에 `"test": "vitest --run"` 추가(watch 모드 금지 — VALIDATION.md 규약).
    주의: Next 15 App Router 와 Vitest 충돌 없음 확인(구성 파일이 별도, build/pipelines 분리). 도입된 4개 devDeps 외 런타임 deps 추가 금지.
  </action>
  <automated_verify>
    `pnpm --filter @gh-radar/webapp test -- --run` → "No test files found" 종료 코드 0(Wave 0 후속 task 로 채움). `pnpm --filter @gh-radar/webapp typecheck` PASS.
  </automated_verify>
  <manual_verify>해당 없음</manual_verify>
  <requirement_refs>--</requirement_refs>
  <threat_refs>--</threat_refs>
</task>

<task id="5-W0-T02" type="auto">
  <name>shadcn popover · toggle-group · toggle 블록 추가 + umbrella import 후처리</name>
  <files_modified>webapp/src/components/ui/popover.tsx, webapp/src/components/ui/toggle-group.tsx, webapp/src/components/ui/toggle.tsx, webapp/package.json(가능 시 변경 없어야 함)</files_modified>
  <depends_on>none</depends_on>
  <autonomous>true</autonomous>
  <action>
    `cd /Users/alex/repos/gh-radar/webapp && pnpm dlx shadcn@latest add popover toggle-group toggle` 실행.
    생성된 3개 파일의 `import * as X from "@radix-ui/react-popover"` / `"@radix-ui/react-toggle-group"` / `"@radix-ui/react-toggle"` 를 **전부** umbrella import 로 치환 (Pitfall 4 — Phase 3 Slider/Tooltip 와 동일 컨벤션):

      - `import { Popover as PopoverPrimitive } from "radix-ui"`
      - `import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"`
      - `import { Toggle as TogglePrimitive } from "radix-ui"` (필요 시)
    `webapp/package.json` dependencies 에 `@radix-ui/react-*` 가 추가되었다면 제거 — umbrella 로 이미 해결됨. 추가 스타일 변형 없이 shadcn 기본 생성물만 유지.
  </action>
  <automated_verify>
    `grep -R "@radix-ui/react-popover\\|@radix-ui/react-toggle-group\\|@radix-ui/react-toggle" webapp/src/components/ui` 결과 0건. `pnpm --filter @gh-radar/webapp typecheck` PASS. `pnpm --filter @gh-radar/webapp build` PASS (사용처 없어도 treeshake 되어 무해).
  </automated_verify>
  <manual_verify>해당 없음</manual_verify>
  <requirement_refs>--</requirement_refs>
  <threat_refs>--</threat_refs>
</task>

### Wave 1 — 순수 로직 + 훅 (TDD: 테스트 먼저, 구현 다음)

<task id="5-W1-T01" type="auto" tdd="true">
  <name>scanner-query.ts 파서/직렬화 + 단위 테스트</name>
  <files_modified>webapp/src/lib/scanner-query.ts, webapp/src/lib/scanner-query.test.ts</files_modified>
  <depends_on>5-W0-T01</depends_on>
  <autonomous>true</autonomous>
  <behavior>

    - `parseScannerSearchParams(new URLSearchParams('?min=25'))` → `{ min: 25, market: 'ALL' }`
    - 경계값 min=9 → 25(fallback), min=10 → 10, min=29 → 29, min=30 → 25
    - min 에 NaN/빈 문자열/소수(25.7) → clamp 후 `Math.round` (25.7 → 26, 'abc' → 25)
    - market 'KOSPI'/'KOSDAQ'/'ALL' 통과, 'UNKNOWN'·공백·소문자 → 'ALL'
    - `toScannerSearchParams({min:25, market:'ALL'})` → `''` (기본값 생략)
    - `toScannerSearchParams({min:15, market:'KOSDAQ'})` → `'?min=15&market=KOSDAQ'`
    - exports: `SCANNER_MIN_RATE=10`, `SCANNER_MAX_RATE=29`, `DEFAULT_SCANNER_STATE={min:25,market:'ALL'}`
  </behavior>
  <action>
    먼저 `scanner-query.test.ts` 를 RESEARCH §Code Examples 의 시그니처에 맞춰 작성 (위 behavior 전부 커버, 최소 12개 케이스). `pnpm --filter @gh-radar/webapp test -- --run` 으로 RED 확인. 이후 `scanner-query.ts` 구현 — `Market = 'ALL'|'KOSPI'|'KOSDAQ'` 유니온 타입 export + 파서 내 whitelist/clamp(T-5-01). 구현 후 GREEN. 커밋 2건(테스트 / 구현).
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp test -- --run src/lib/scanner-query.test.ts` GREEN</automated_verify>
  <manual_verify>해당 없음</manual_verify>
  <requirement_refs>SCAN-02, SCAN-05</requirement_refs>
  <threat_refs>T-5-01</threat_refs>
</task>

<task id="5-W1-T02" type="auto" tdd="true">
  <name>scanner-time.ts formatKstTime + 단위 테스트</name>
  <files_modified>webapp/src/lib/scanner-time.ts, webapp/src/lib/scanner-time.test.ts</files_modified>
  <depends_on>5-W0-T01</depends_on>
  <autonomous>true</autonomous>
  <behavior>

    - `formatKstTime(Date.UTC(2026, 3, 14, 5, 32, 8))` → `"14:32:08 KST"` (UTC+9)
    - 2자리 zero-pad (`00:00:00 KST`)
    - 단일 formatter 인스턴스 재사용 (모듈 로드 시 1회 생성)
  </behavior>
  <action>
    RESEARCH §Implementation Notes 의 코드 그대로 적용. 테스트는 고정 epoch 3~5개(자정/12시/23:59:59/경계) + 출력 문자열 정확 매칭. 구현은 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })` 모듈 상수. RED → GREEN 2 commit.
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp test -- --run src/lib/scanner-time.test.ts` GREEN</automated_verify>
  <manual_verify>해당 없음</manual_verify>
  <requirement_refs>SCAN-06</requirement_refs>
  <threat_refs>--</threat_refs>
</task>

<task id="5-W1-T03" type="auto" tdd="true">
  <name>usePolling 훅 + 단위 테스트 (fake timers)</name>
  <files_modified>webapp/src/hooks/use-polling.ts, webapp/src/hooks/use-polling.test.ts</files_modified>
  <depends_on>5-W0-T01</depends_on>
  <autonomous>true</autonomous>
  <behavior>

    - mount 즉시 fetcher 1회 호출, 60s 후 자동 재호출 (vi.useFakeTimers + vi.advanceTimersByTime)
    - unmount 시 interval clear + in-flight AbortController.abort
    - key 변경 시 이전 요청 abort + 즉시 재요청 + 타이머 재설정
    - 에러 발생 시 data 유지(stale-but-visible), error 채움. 다음 성공 시 error 클리어
    - `refresh()` 호출: 타이머 유지한 채 즉시 1회 요청 + `isRefreshing` true→false 전이, 반환 Promise 는 응답 후 resolve
    - 연속 `refresh()` 호출 시 이전 요청 abort (T-5-03)
  </behavior>
  <action>
    RESEARCH §Code Examples 스켈레톤을 그대로 구현. 테스트는 `@testing-library/react` 의 `renderHook` + `vi.useFakeTimers({ shouldAdvanceTime: true })` 사용. fetcher 는 `vi.fn().mockImplementation((signal) => new Promise(res => setTimeout(() => res(value), 100)))` 패턴. 최소 6개 케이스(mount/interval/unmount/key 변경/refresh/error 유지). `'use client'` 지시어 필수.
    stale closure 방지: fetcher 는 `useRef` 에 저장 후 interval 콜백에서 `ref.current` 를 읽는다(Pitfall 3).
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp test -- --run src/hooks/use-polling.test.ts` GREEN</automated_verify>
  <manual_verify>해당 없음</manual_verify>
  <requirement_refs>SCAN-07</requirement_refs>
  <threat_refs>T-5-03</threat_refs>
</task>

### Wave 2 — Scanner UI 컴포넌트 트리

<task id="5-W2-T01" type="auto">
  <name>scanner-api.ts + changeRate 스케일 실측 확정</name>
  <files_modified>webapp/src/lib/scanner-api.ts</files_modified>
  <depends_on>5-W1-T01</depends_on>
  <autonomous>true</autonomous>
  <action>
    구현 전 **스케일 확정**: `curl "https://gh-radar-server-1023658565518.asia-northeast3.run.app/api/scanner?sort=rate_desc&limit=3"` 응답의 `changeRate` 필드가 0.xx(소수) 인지 xx.xx(정수 %) 인지 확인. 결과를 주석으로 파일 상단에 기록.

      - 소수 스케일 → `minRate: String(min / 100)` 로 전송 + 컴포넌트 렌더 시 `Number format="percent"` (`value*100` 내부 처리) 그대로 사용
      - 정수 스케일 → `minRate: String(min)` 로 전송 + 컴포넌트 렌더 시 `Number format="plain" precision={2}` + 수동 `%`/부호 suffix
    `fetchScannerStocks({min, market}, signal)` 구현: RESEARCH §Code Examples 대로 `URLSearchParams({ sort:'rate_desc', minRate:..., market, limit: String(SCANNER_LIMIT) })` + `apiFetch<StockWithProximity[]>` 호출, `{ signal }` 전달. `SCANNER_LIMIT = 100` 상수 export.
    타입: `@gh-radar/shared` 에서 `Stock` import, `StockWithProximity` 는 mapper 파일 재export 대신 로컬 type alias 재정의(`Stock & { upperLimitProximity: number }`) — server/webapp 간 shared 미포함 필드 우회.
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp typecheck` PASS</automated_verify>
  <manual_verify>해당 없음</manual_verify>
  <requirement_refs>SCAN-01, SCAN-02, SCAN-04, SCAN-05</requirement_refs>
  <threat_refs>--</threat_refs>
</task>

<task id="5-W2-T02" type="auto">
  <name>ScannerSkeleton + ScannerEmpty + ScannerError 프레젠테이션</name>
  <files_modified>webapp/src/components/scanner/scanner-skeleton.tsx, webapp/src/components/scanner/scanner-empty.tsx, webapp/src/components/scanner/scanner-error.tsx</files_modified>
  <depends_on>5-W0-T02</depends_on>
  <autonomous>true</autonomous>
  <action>
    **ScannerSkeleton**: UI-SPEC §Wireframes §5 — 데스크톱 thead(정적) + 10 skeleton row(`hidden md:block` wrapper), 모바일 5 card skeleton(`md:hidden`). 각 Skeleton height/width 는 실제 컴포넌트 자리 크기와 맞춤. stagger 는 globals.css `.skeleton-list` 재사용.
    **ScannerEmpty**: UI-SPEC §Wireframes §3 — lucide `SearchX` 40px(--muted-fg), heading `조건에 맞는 종목이 없습니다` (16/600), body `임계값을 낮추거나 마켓 필터를 넓혀보세요.` (14/400 muted-fg), 블록 최소 높이 240px, flex 중앙 정렬.
    **ScannerError**: UI-SPEC §Wireframes §4 — `AlertTriangle` 아이콘(--destructive), 테두리 `border-color: color-mix(in oklch, var(--destructive) 40%, var(--border))`, `--card` 배경, 24px padding. props: `{ error: ApiClientError | Error; onRetry: () => void; retrying: boolean }`. 텍스트: `[${err.code}] ${err.message} 잠시 후 다시 시도해주세요.` (code 있으면만 대괄호 prefix). 버튼 `다시 시도` (primary variant, retrying 시 disabled + RefreshCw spin).
    재디자인 금지 — Badge/Button/Card 변형 variant 신규 추가 금지. 모두 class 조합만.
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp lint` PASS</automated_verify>
  <manual_verify>수동 체크리스트 #5 (에러), #1 (skeleton), 수동 필터 조정 시 #3 근처에서 부분 확인</manual_verify>
  <requirement_refs>SCAN-01</requirement_refs>
  <threat_refs>--</threat_refs>
</task>

<task id="5-W2-T03" type="auto">
  <name>ScannerTable + ScannerCardList 리스트 렌더러</name>
  <files_modified>webapp/src/components/scanner/scanner-table.tsx, webapp/src/components/scanner/scanner-card-list.tsx</files_modified>
  <depends_on>5-W2-T01</depends_on>
  <autonomous>true</autonomous>
  <action>
    **ScannerTable** (`hidden md:block` wrapper): UI-SPEC §Wireframes §1 Variant C — thead `종목명 / 코드 / 마켓 / 현재가 / 등락률 / 거래량` (12/600 Caption, --muted bg). tbody row 각각:

      - 종목명 좌 16/600, 코드 좌 12 `.mono` muted-fg, 마켓 Badge(KOSPI=`secondary`, KOSDAQ=`outline`), 현재가/거래량 우측 `.num .mono` (`<Number format="price|volume">`), 등락률 우측 `<Number format="percent" showSign withColor precision={2} />` (T-W2-T01 에서 확정된 스케일 규약 준수).
      - row 전체 `<Link href={'/stocks/' + stock.code}>` 래핑(D3). `aria-label={`${name} 상세 보기`}`. hover `bg-[color-mix(in oklch, var(--muted) 60%, transparent)]` (globals 기본), `cursor-pointer`, Enter/Space 활성화(`<Link>` 기본 + 필요시 onKeyDown).
    **ScannerCardList** (`md:hidden`): UI-SPEC §Wireframes §2 — 3줄 카드 구조(종목명+등락률 Badge / 코드·마켓 / 현재가+거래량). padding 12px, gap-y 12px, 카드 전체 `<Link>` 래핑, 터치 타겟 44px 확보(내부 padding + 3줄로 자연 달성).
    둘 다 동일 `stocks: StockWithProximity[]` props + `isRefreshing?: boolean` (선택 — 부드러운 opacity 변화 용). 100행 렌더 성능 위해 `React.useMemo` 로 row key=`stock.code` 안정화. dangerouslySetInnerHTML 절대 금지(T-5-02).
    Table/Card/Badge/Number/Link 외 신규 컴포넌트 도입 금지.
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp lint` PASS. `grep -R "dangerouslySetInnerHTML" webapp/src/components/scanner` 0건.</automated_verify>
  <manual_verify>수동 체크리스트 #1, #6</manual_verify>
  <requirement_refs>SCAN-01, SCAN-04, SCAN-05</requirement_refs>
  <threat_refs>T-5-02</threat_refs>
</task>

<task id="5-W2-T04" type="auto">
  <name>ScannerFilters — chip bar + popover (Slider + ToggleGroup) + URL 동기화</name>
  <files_modified>webapp/src/components/scanner/scanner-filters.tsx</files_modified>
  <depends_on>5-W0-T02, 5-W1-T01</depends_on>
  <autonomous>true</autonomous>
  <action>
    props: `{ state: ScannerState; onChange: (next: ScannerState) => void; lastUpdatedAt?: number; onRefresh: () => void; isRefreshing: boolean }`.
    레이아웃: `필터` 라벨(12/600 uppercase muted-fg) + 2개 chip (`등락률 ≥ {min}%` · `마켓: {label}`) + 우측 끝 `최근 갱신 HH:MM:SS KST` + `새로고침` 버튼 (flex row, gap 8px, ml-auto).
    **등락률 chip**: `<Popover>` 트리거 — Button (height 32px, `.mono` 14/600, `aria-expanded` 동기화). content: Label `최소 등락률` + 값 표시 `{min}%` + `<Slider min={10} max={29} step={1} value={[localMin]} onValueChange={...} />` + `10% ... 29%` caption. Slider 조작 중 **로컬 state** 로 즉시 chip/값 갱신, 250ms debounce 후 `startTransition(() => onChange({ ...state, min: localMin }))` 호출(Pitfall 2). debounce 는 `useRef<number>` + `setTimeout` 수동 구현(lodash 금지).
    **마켓 chip**: `<Popover>` 트리거 — Button. content: Label `마켓` + `<ToggleGroup type="single" value={state.market} onValueChange={v => v && onChange({...state, market: v})}>` with `<ToggleGroupItem value="ALL">전체</ToggleGroupItem>` · `"KOSPI"` · `"KOSDAQ"`. 즉시 반영 (debounce 없음). `onValueChange` 의 빈 값(사용자가 같은 옵션 재클릭으로 deselect 시도)은 무시 (`type="single"` + 빈값 방어).
    **새로고침 버튼**: `<Button variant="default">` (primary), `<RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />` + 텍스트 `새로고침` / `새로고침 중...`. `disabled={isRefreshing}` (T-5-03). `aria-label="스캐너 데이터 새로고침"`.
    **타임스탬프**: `lastUpdatedAt` 있을 때만 `최근 갱신 {formatKstTime(lastUpdatedAt)}` (`.mono`, 14/600 muted-fg). 없으면 공간 유지 하지 않음.
    **URL 동기화는 부모(ScannerClient) 가 담당** — 본 컴포넌트는 `onChange` 호출만. 단, popover 외부 클릭/Esc 시 포커스 트리거 복귀(radix 기본).
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp lint` PASS</automated_verify>
  <manual_verify>수동 체크리스트 #2, #3, #4 (부분 — 버튼 disabled)</manual_verify>
  <requirement_refs>SCAN-02, SCAN-03, SCAN-05, SCAN-06</requirement_refs>
  <threat_refs>T-5-01, T-5-03</threat_refs>
</task>

<task id="5-W2-T05" type="auto">
  <name>ScannerClient 최상위 배선 (usePolling · URL 동기화 · 조건부 렌더)</name>
  <files_modified>webapp/src/components/scanner/scanner-client.tsx</files_modified>
  <depends_on>5-W1-T03, 5-W2-T01, 5-W2-T02, 5-W2-T03, 5-W2-T04</depends_on>
  <autonomous>true</autonomous>
  <action>
    `'use client'`. React imports: `useCallback, useTransition`. next imports: `useRouter, useSearchParams, usePathname`.
    흐름:

      1. `const sp = useSearchParams();` + `const state = useMemo(() => parseScannerSearchParams(sp), [sp])` — URL 이 단일 진리원.
      2. `const key = `${state.min}|${state.market}``;
      3. `const fetcher = useCallback((signal) => fetchScannerStocks(state, signal), [state.min, state.market])`
      4. `const { data, error, lastUpdatedAt, refresh, isRefreshing, isInitialLoading } = usePolling(fetcher, { intervalMs: 60_000, key })`
      5. `const handleChange = (next: ScannerState) => startTransition(() => router.replace(pathname + toScannerSearchParams(next), { scroll: false }))`
    렌더:

      - 페이지 헤더(h1 `스캐너` + 서브텍스트) — UI-SPEC §Wireframes §1
      - `<ScannerFilters state={state} onChange={handleChange} lastUpdatedAt={lastUpdatedAt} onRefresh={refresh} isRefreshing={isRefreshing} />`
      - 본문 분기:
        * `isInitialLoading` → `<ScannerSkeleton />`
        * `data && data.length === 0 && !error` → `<ScannerEmpty />`
        * else → `<ScannerTable stocks={data ?? []} /><ScannerCardList stocks={data ?? []} />` (둘 다 렌더, CSS 가 분기)
      - 에러 카드 (stale-but-visible): `error && <ScannerError error={error} onRetry={refresh} retrying={isRefreshing} />` — 리스트 아래/필터 바로 아래. `isInitialLoading && error` 인 경우(데이터 없음)엔 ScannerError 만 단독 렌더(Skeleton 생략).
    AppShell 래핑은 page.tsx 에서 수행하므로 본 컴포넌트는 내부 content 만 제공.
  </action>
  <automated_verify>`pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp lint && pnpm --filter @gh-radar/webapp build` PASS</automated_verify>
  <manual_verify>Wave 3 통합 후 일괄 확인</manual_verify>
  <requirement_refs>SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05, SCAN-06, SCAN-07</requirement_refs>
  <threat_refs>T-5-01, T-5-02, T-5-03</threat_refs>
</task>

### Wave 3 — 페이지 통합 + 최종 검증

<task id="5-W3-T01" type="auto">
  <name>/scanner 페이지 교체 (Suspense + dynamic + ScannerClient)</name>
  <files_modified>webapp/src/app/scanner/page.tsx</files_modified>
  <depends_on>5-W2-T05</depends_on>
  <autonomous>true</autonomous>
  <action>
    Phase 4 placeholder 전체 삭제. 신규 내용:
    ```
    import { Suspense } from 'react';
    import { AppShell } from '@/components/layout/app-shell';
    import { ScannerClient } from '@/components/scanner/scanner-client';
    import { ScannerSkeleton } from '@/components/scanner/scanner-skeleton';

    export const dynamic = 'force-dynamic'; // Pitfall 1 — useSearchParams suspense 요구

    export default function ScannerPage() {
      return (
        <AppShell hideSidebar>
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <Suspense fallback={<ScannerSkeleton />}>
              <ScannerClient />
            </Suspense>
          </div>
        </AppShell>
      );
    }
    ```
    기존 `revalidate` export 제거(ISR 비사용). `fetchHealth` 헬퍼 등 placeholder 유산 전부 삭제. 기존 import 중 Badge/Skeleton/ApiClientError/apiFetch 사용 흔적 제거.
    주의: `ScannerPage` 자체는 `'use client'` 가 아니어야 한다 (Suspense + dynamic 를 서버 레벨에서 선언해야 Pitfall 1 회피).
  </action>
  <automated_verify>
    `pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp lint && pnpm --filter @gh-radar/webapp build` PASS.
    `pnpm -r test -- --run` 전체 GREEN (Wave 1 3개 스위트).
  </automated_verify>
  <manual_verify>수동 체크리스트 #1</manual_verify>
  <requirement_refs>SCAN-01</requirement_refs>
  <threat_refs>--</threat_refs>
</task>

<task id="5-W3-T02" type="checkpoint:human-verify" gate="blocking">
  <name>수동 E2E 체크리스트 7종 실행</name>
  <files_modified>--</files_modified>
  <depends_on>5-W3-T01</depends_on>
  <autonomous>false</autonomous>
  <action>자동화된 구현이 모두 완료된 상태에서 사용자가 직접 브라우저로 7종 시나리오를 수동 실행하여 UX·실시간 타이밍·오프라인 에러 거동을 최종 승인한다. 자동 단위 테스트로 커버 불가능한 육안 paint·드래그 제스처·Network 60s 간격·viewport 전환을 확인한다.</action>
  <what-built>
    `/scanner` 실 Scanner UI 완성. 데스크톱 Table + 모바일 Card, chip + popover 필터(Slider 10~29% · 마켓 ToggleGroup), 60s 폴링 + 수동 refresh, 타임스탬프, stale-but-visible 에러 UX.
  </what-built>
  <how-to-verify>
    VALIDATION.md §수동 E2E 체크리스트 7종을 순서대로 실행 (각 PASS 시 체크):

    1. `pnpm --filter @gh-radar/webapp dev` → `http://localhost:3000/scanner` 진입 → 1초 내 Skeleton 10행(데스크톱) 또는 5카드(모바일) → 데이터 수신 시 최대 100개 리스트 표시
    2. Slider 25% → 29% 드래그 → 250ms 내 URL `?min=29` 반영, 리스트 축소. ←/→ ±1, PageUp/Down ±5 키 동작
    3. 마켓 토글 `KOSPI` 클릭 → URL `?market=KOSPI` 즉시 반영, chip 라벨 `마켓: KOSPI`, 리스트 KOSPI 만
    4. 헤더 `최근 갱신 HH:MM:SS KST` 확인 → Devtools Network `/api/scanner` 60초 간격 재호출 → 새로고침 버튼 즉시 재호출(spinner + disabled)
    5. Devtools Network throttle Offline → 60s 대기 → 기존 리스트 유지 + 에러 카드 노출 → Online 복귀 후 `다시 시도` → 복구
    6. 모바일 뷰포트(375px) → Card 리스트 렌더 + chip/popover 정상 + 터치 타겟 44px 이상
    7. 공유 URL: `/scanner?min=15&market=KOSDAQ` 직접 진입 → 복원. 잘못된 값 `?min=99&market=UNKNOWN` → 기본값(25/ALL) 로 clamp/fallback
  </how-to-verify>
  <resume-signal>`approved` 또는 실패한 번호 + 증상 기재</resume-signal>
  <requirement_refs>SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05, SCAN-06, SCAN-07</requirement_refs>
  <threat_refs>T-5-01, T-5-03</threat_refs>
</task>

## Integration Verification

Phase gate (마지막 `/gsd-verify-work` 진입 전 전원 PASS 필요):

```bash
cd /Users/alex/repos/gh-radar

# 1. 정적 품질

pnpm --filter @gh-radar/webapp typecheck
pnpm --filter @gh-radar/webapp lint
pnpm --filter @gh-radar/webapp build

# 2. 단위 테스트 (Wave 1 세 스위트 + 서버 기존 스위트)

pnpm -r test -- --run

# 3. dangerouslySetInnerHTML 0건 (T-5-02)

grep -R "dangerouslySetInnerHTML" webapp/src/components/scanner webapp/src/app/scanner || echo "OK: 0건"

# 4. 서버 미수정 보장

git diff --name-only master -- server/ shared/  # Phase 5 관련 변경 0건이어야 함
```

수동 E2E 7종 (Wave 3-T02) 전원 PASS 후 `nyquist_compliant: true` 로 VALIDATION.md frontmatter 갱신.

## Out of Scope / Deferred

CONTEXT.md §`<deferred>` 승계:

- SSE / WebSocket 실시간 스트리밍 (Phase 9 이후 별도 phase 검토)
- 수백~수천 종목 가상 스크롤 (현 서버 limit=100 로 회피)
- 사용자 정의 컬럼 on/off, 정렬 컬럼 확장 UX
- 장마감 / 휴장 / 장전 전용 UI 배너
- stale 상태 경고 (`N초 이상 갱신 안 됨`)
- 즐겨찾기 · 알림 (향후 AUTH/PERS capability)
- 모바일 popover → bottom sheet 대체 (UI-SPEC Wireframes §2 optional — 1차 구현에선 popover collision detection 으로 충분)

## Open Questions / Assumptions

RESEARCH Open Questions 중 planner 선에서 확정한 값:

| 원 질문 | 확정 결정 | 근거 |
|--------|----------|------|
| Polling 훅 선택 (SWR vs 자체) | **자체 `usePolling`** | RESEARCH Decision 1 — 번들 0KB, 테스트 단순, cross-component 캐시 공유 미활용 |
| 마켓 토글 구현 (badge+button vs ToggleGroup) | **shadcn ToggleGroup 블록** | RESEARCH Decision 2 — a11y 내장, radix umbrella 에 이미 포함 |
| 서버 limit 기본값 (50/100/200) | **100** (`SCANNER_LIMIT` 상수) | RESEARCH Decision 3 — 스캔 범위 충분 + 모바일 DOM 안정 |
| webapp vitest 도입 | **YES — Wave 0 에서 devDep 4종 추가** | VALIDATION.md Wave 0 요구, 순수 함수 3종 + 훅 1종 테스트 커버 |
| @testing-library/react 도입 | **YES** | `usePolling` 훅 테스트에 `renderHook` 필요. RESEARCH 원안은 "선택"이었으나 SCAN-07 자동 커버 위해 도입 확정 |
| 모바일 popover vs sheet | **popover 유지** | UI-SPEC §Responsive: 1차 구현 popover + collision detection 충분, sheet 전환은 deferred |
| 거래량 표기 (정수 콤마 vs 축약 8.4M) | **`<Number format="volume">` 내장 포맷 (만/억 표기)** | Phase 3 확정 컴포넌트 재사용, UI-SPEC wireframe 의 raw 정수 예시는 참고용이며 디자인 시스템 일관성 우선 |

실측 확정 필요 (Wave 2-T01 에서 1분 이내 해소):

- **DB `change_rate` 스케일 (소수 vs 정수 %)**: curl 로 실측 후 `scanner-api.ts` 주석에 기록. 둘 중 어느 쪽이든 SCANNER_LIMIT + minRate 필터 동작에는 영향 없음 — 렌더 시 `<Number format="percent">` 인자 변환만 결정.

가정:

- Cloud Run `/api/scanner` 는 Phase 2 INV-2 PASS 이후 가용. 본 Phase 기간 중 가용성 변동 없음.
- `radix-ui@1.4.3` umbrella 가 `@radix-ui/react-popover`·`@radix-ui/react-toggle-group`·`@radix-ui/react-toggle` 을 transitive 로 포함(RESEARCH VERIFIED). 다르게 밝혀지면 Wave 0-T02 에서 `pnpm add` 로 직접 추가 후 umbrella 치환 유지.
- Vercel 배포 환경변수 `NEXT_PUBLIC_API_BASE_URL` 은 Phase 4 에서 설정 완료. 본 Phase 에서 변경 없음.

## PLAN COMPLETE
