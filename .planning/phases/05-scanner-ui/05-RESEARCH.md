# Phase 5: Scanner UI — Research

**Researched:** 2026-04-14
**Domain:** Next.js 15 App Router client UI · 폴링 패턴 · URL 쿼리 상태 동기화
**Confidence:** HIGH (프로젝트 내부 검증) · MEDIUM (외부 라이브러리 비교)

---

## Summary

Phase 4의 `/scanner` placeholder(현재 서버 컴포넌트 + ISR 30s)를 Variant C · Plain 디자인을 따르는 실제 인터랙티브 스캐너로 교체한다. 조사 결과, **신규 런타임 의존성은 필요 없다** — `radix-ui` 1.4.3 umbrella 패키지에 `@radix-ui/react-popover`·`@radix-ui/react-toggle-group`이 이미 transitive 로 포함돼 있고, shadcn `popover` 블록 코드만 `components/ui/` 에 추가하면 된다.

폴링 전략은 **자체 `usePolling` 훅(의존성 0)** 을 권장한다. 번들 영향 최소화, `apiFetch`/`ApiClientError` 통합 제어권, Phase 6/7 재사용성 모두 충족되며 SWR 의 추가 가치(다른 컴포넌트 간 캐시 공유·글로벌 mutate)는 Phase 5 범위에서 활용처가 없다.

서버 `limit` 기본값은 **100** 을 권장한다(zod 기본값 없이 클라이언트에서 명시). 모바일 카드 렌더 비용·스크롤 스캔 UX·네트워크 페이로드 균형점이다.

**Primary recommendation:** 신규 의존성 없이 `popover` shadcn 블록만 추가 → `'use client'` 페이지 + 순수 함수로 분리된 URL 파서 + 자체 `usePolling` 훅 + 반응형 듀얼 마크업(`hidden md:block` / `md:hidden`) 구조로 Phase 5 전 요구사항 커버.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D1. 데이터 갱신 전략**: Client polling 60_000ms + 수동 refresh 버튼. SSE / Supabase Realtime / ISR 제외.
- **D2. 리스트 표현**: 데스크톱 Table, 모바일(<768px) Card. 컬럼 순서 종목명 → 코드 → 마켓 → 현재가 → 등락률 → 거래량. 서버 `sort` 위임. 가상화 없음.
- **D3. 행 클릭**: `next/link` → `/stocks/{code}` (Phase 6 전엔 not-found 허용).
- **D4. 필터 UX**: Slider 10~29% 기본 25% + 마켓 토글 KOSPI/KOSDAQ/ALL + URL 쿼리 `?min={n}&market={m}` 양방향 동기화. Slider 드래그 debounce ~250ms.
- **D5. 상태 & 타임스탬프**: 절대시각 `HH:MM:SS KST` 만. stale 배지·상대시각 없음. 초기 진입만 Skeleton, 폴링 중에는 기존 데이터 유지 + refresh 버튼 내 spinner. 에러는 stale-but-visible.

### Claude's Discretion (open_for_planner)

1. Polling 훅 선택 — SWR vs 자체 훅
2. 마켓 토글 구현 — badge+button 조합 vs shadcn `ToggleGroup`
3. 서버 `limit` 기본값 — 50/100/200

### Deferred Ideas (OUT OF SCOPE)

- SSE / WebSocket 실시간 스트리밍 (Phase 9 이후 별도)
- 가상 스크롤
- 사용자 정의 컬럼 on/off, 정렬 컬럼 확장
- 장마감 / 휴장 / 장전 전용 UI 배너
- stale 상태 경고 ('N초 이상 갱신 안 됨')
- 즐겨찾기 · 알림

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAN-01 | 전 종목 등락률 리스트 | D2 · 서버 `/api/scanner` 호출 (limit=100) · Table/Card 듀얼 마크업 |
| SCAN-02 | 임계값 필터 기본 25% | D4 · `useSearchParams().get('min') ?? 25` · 서버 `minRate` 쿼리 위임 |
| SCAN-03 | 슬라이더 10~29% | D4 · 기존 `components/ui/slider.tsx` (min=10 max=29 step=1 기본 25 이미 주석에 명시) |
| SCAN-04 | 현재가·등락률·거래량 | D2 · `<Number format="price/percent/volume">` (Phase 3 component) |
| SCAN-05 | 마켓 배지 | D2 · `<Badge variant="secondary|outline">` — KOSPI=secondary, KOSDAQ=outline |
| SCAN-06 | 갱신 시각 | D5 · `Intl.DateTimeFormat('ko-KR', Asia/Seoul)` 순수 함수로 포맷 |
| SCAN-07 | 1분 자동 갱신 | D1 · `usePolling` 훅 60_000ms interval |

---

## Project Constraints (from CLAUDE.md)

- **언어**: 모든 사용자 대면 텍스트 한글 (시스템 용어 KOSPI/KOSDAQ/KST/% 영문 유지) — UI-SPEC §Copywriting 준수
- **커밋**: 한글 메시지, 사용자 확인 후 진행, Co-Authored-By 금지
- **비용**: 무료 범위 — 신규 외부 서비스·API 호출 없음 (Phase 5 는 순수 프론트)
- **GSD 워크플로 강제**: 파일 편집 전 `/gsd-execute-phase 5` 진입
- **스택**: Next.js 15 App Router, React 19, TypeScript 5, Tailwind v4, shadcn/ui — 기존 선택 유지, 신규 UI 라이브러리 도입 금지

---

## Decisions

### Decision 1: Polling 훅 — 자체 `usePolling` 훅 채택 (SWR 기각)

**권장**: **자체 훅**을 작성한다. `webapp/src/hooks/use-polling.ts`.

**근거:**

| 기준 | 자체 훅 | SWR v2.2.x |
|------|--------|------------|
| 번들 사이즈 | 0 KB 추가 | ≈ 4.7 KB gzip `[VERIFIED: bundlephobia.com/package/swr@2.2.5]` |
| `apiFetch` 통합 | 직접 (fetcher = `apiFetch`) | 직접 (fetcher 제공) |
| `ApiClientError` 노출 | 직접 throw 전파 | `error` 객체로 전파 (양쪽 동일) |
| refreshInterval | `setInterval` | 내장 `refreshInterval` |
| revalidateOnFocus | 선택적 구현 (Phase 5 불필요, CONTEXT D5 "폴링 중 로딩 표식 없음") | 기본 ON — 끄려면 옵션 필요 |
| 수동 refresh | `refresh()` 함수 반환 | `mutate()` |
| 에러 재시도 | 직접 구현 (Phase 5 "에러 시 기존 데이터 유지" 단순 패턴으로 충분) | 지수 백오프 내장 |
| Phase 6/7 재사용 | 동일 코드 | 동일 (단 SWR 의 진짜 가치 = **cross-component 캐시 공유**는 Phase 6/7 에도 활용처 미확인) |
| 테스트 가능성 | 순수 훅 — vitest + renderHook 쉬움 | vitest + SWRConfig provider 래핑 필요 |

**대안 각하 이유 (SWR):** SWR의 핵심 가치는 "동일 키를 여러 컴포넌트가 구독할 때 자동 중복제거 + 글로벌 mutate"인데 Phase 5·6·7 스펙을 훑어봐도 **같은 스캐너 데이터를 동시 구독하는 컴포넌트가 없다**. 단일 페이지의 단일 fetch 라면 SWR 의 이점은 대부분 사라지고, 번들만 5 KB 추가된다. Phase 9(AI 요약) 단계에서 캐시 공유 요구가 생기면 그 때 도입 재검토.

**훅 시그니처 초안:**

```ts
// webapp/src/hooks/use-polling.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePollingResult<T> {
  data: T | undefined;       // 직전 성공 응답 유지 (stale-but-visible)
  error: Error | undefined;  // 마지막 에러 (새 성공 시 undefined 로 클리어)
  isInitialLoading: boolean; // data === undefined && error === undefined
  isRefreshing: boolean;     // 수동 refresh 호출 in-flight
  lastUpdatedAt: number | undefined; // 마지막 성공 epoch ms (SCAN-06)
  refresh: () => Promise<void>; // 수동 트리거 (반환 Promise 로 버튼 spinner 제어)
}

export interface UsePollingOptions {
  /** ms. Phase 5 는 60_000 고정. */
  intervalMs: number;
  /** key 변경 시 기존 interval 해제 + 즉시 재요청. Phase 5 에선 `${min}|${market}` 문자열. */
  key: string;
  /** 컴포넌트 언마운트·탭 복귀 동작 제어 (Phase 5 는 둘 다 기본값). */
  enabled?: boolean; // default true
}

export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { intervalMs, key, enabled = true }: UsePollingOptions,
): UsePollingResult<T>;
```

**동작 규약:**
- `key` 변경 시: 이전 in-flight 요청 `AbortController.abort()` → 즉시 새 요청 + interval 재시작.
- 언마운트 시: interval clear + in-flight abort. leak 없음.
- 폴링 중 에러: `error` 채우되 `data` 유지 (stale-but-visible). 다음 성공 시 `error` 클리어.
- 수동 `refresh()`: interval 타이머는 그대로 두고 즉시 1회 fetch. 반환 Promise 는 응답 수신 후 resolve(버튼 disabled 해제 동기화).
- `document.visibilityState` 분기 **없음** — CONTEXT D1 "탭 비활성 시에도 계속". 브라우저가 `setInterval` 을 백그라운드에서 throttle 하는 것은 허용 (1분 주기는 크롬 1초 최소 clamp 와 무관하게 정상 작동).

### Decision 2: 마켓 토글 — shadcn `ToggleGroup` 블록 추가 채택

**권장**: `webapp/src/components/ui/toggle-group.tsx` + `toggle.tsx` 블록을 shadcn CLI 로 추가. `@radix-ui/react-toggle-group` 이 이미 `radix-ui` umbrella 에 포함돼 있으므로 의존성 증가 0. `[VERIFIED: webapp/node_modules/radix-ui/package.json dependencies]`

**근거:**

| 기준 | ToggleGroup (shadcn) | badge + button 조합 |
|------|---------------------|---------------------|
| 신규 의존성 | 0 (radix-ui umbrella 에 포함됨) | 0 |
| 코드 양 | shadcn 블록 1회 추가 (~40 LOC) | 매번 수동 aria-pressed + 활성 스타일 배선 |
| 접근성 | `role="radiogroup"` + 화살표키 네비 자동 `[CITED: radix-ui.com/primitives/docs/components/toggle-group]` | 직접 aria-pressed · 화살표 키 핸들러 작성 필요 |
| 시각 일관성 | Phase 3 Button 컴포넌트와 동일 토큰 기반 variant 재사용 가능 | Badge 는 20px 높이라 toggle target 44px 접근성 기준 미달 → 래핑 필요 |
| 등록부 안전성 | shadcn official 블록 — UI-SPEC §Registry Safety 에 popover 와 함께 사전 승인 | 해당 없음 |

**Registry safety:** UI-SPEC 이 이미 `popover` + optional `toggle-group` 을 shadcn official 블록으로 사전 승인. 추가 안전 검증 불필요.

**대안 각하 이유:** badge+button 조합은 keyboard nav(←→) 를 직접 구현해야 하고, 활성 상태 aria-pressed 관리, focus 링 수동 제어가 필요하다. 접근성을 맞추려면 결국 ToggleGroup 을 재구현하는 꼴.

### Decision 3: 서버 `limit` 기본값 — 100

**권장**: 클라이언트 호출에서 `?limit=100` 명시. 서버 `ScannerQuery` zod 기본값은 변경하지 않는다(breaking change 회피 · 현재 optional).

**근거:**

- **서버 현황**: `server/src/schemas/scanner.ts` L9 — `limit: z.coerce.number().int().min(1).max(10000).optional()`. 기본값 **없음** → 미지정 시 Supabase 가 전 종목 반환(코스피+코스닥 약 2,700종). Phase 5 에 이 값을 그대로 쓰면 모바일에서 JSON 수 MB + React 렌더 수백 ms → UX 실격.
- **50 기각**: UI-SPEC 데스크톱 skeleton 10행 기준에 비해선 충분하나, minRate 25% 에서 상한가 근접 종목이 50 초과하는 날(이슈 뉴스 + 지수 급등 날) 컷오프 → 사용자가 "리스트 끝" 을 임계값 조정 실패로 오인할 위험.
- **200 기각**: 모바일 카드 200 개 = 세로 ~14,400 px (카드 72 px × 200). 가상화 없이 스크롤 성능 저하 + DOM 노드 과다. UI-SPEC 이 "가상화 없음" 을 명시했으므로 상한을 보수적으로.
- **100 채택**: 상위 100 등락률 종목은 트레이더 스캔 범위로 충분(실제 KOSPI+KOSDAQ 일중 등락률 10% 초과 종목은 통상 30~80종, 이벤트성 급등 날엔 100종 근처). 응답 크기 약 20 KB(mapper 출력), 모바일 카드 DOM 노드 ~100 × 3줄 = 300 셀 수준으로 안정.

**영향:**
- 서버 수정 없음. `ScannerQuery` 유지.
- 클라이언트 호출: `apiFetch('/api/scanner?sort=rate_desc&minRate=25&market=ALL&limit=100')`.
- limit 는 URL 에 노출하지 않는다(사용자 조절 대상 아님). 코드 상수.

---

## Implementation Notes

### URL ↔ State 동기화

- **페이지 컴포넌트**: `'use client'` 전체 트리로 단순화. 초기 searchParams 는 `useSearchParams()` 가 SSR-safe(Next.js 15 App Router 보장) `[CITED: nextjs.org/docs/app/api-reference/functions/use-search-params]`. 서버 컴포넌트로 쪼개 initial props 전달할 필요 없음 — 폴링 훅 때문에 어차피 하위가 전부 client.
- **파서 (순수 함수, 분리)**: `webapp/src/lib/scanner-query.ts`
  ```ts
  export interface ScannerState { min: number; market: 'ALL' | 'KOSPI' | 'KOSDAQ'; }
  export function parseScannerSearchParams(sp: URLSearchParams): ScannerState;
  // - min: Number(sp.get('min')), clamp 10~29, NaN/범위 밖 → 25
  // - market: whitelist check, 아니면 'ALL'
  export function toScannerSearchParams(s: ScannerState): string;
  // - 기본값(min=25, market=ALL)은 URL 에서 생략 (깔끔한 공유 링크)
  ```
  순수 함수이므로 vitest 단위 테스트 용이.
- **쓰기 경로**: `useRouter().replace(` + `toScannerSearchParams`, `{ scroll: false })` 로 히스토리 오염 방지. `useTransition()` 으로 감싸 Slider 드래그 중 UI freeze 회피.
- **Slider debounce**: 250 ms. 구현은 `useRef<number>` + `setTimeout` 으로 충분(lodash 도입 금지). Slider 드래그 중에는 **즉시 로컬 state** 업데이트(라벨·chip 텍스트 갱신) + 250 ms 무이벤트 후 URL `replace` + refetch.
- **토글 / 마켓**: debounce 없음. 즉시 URL 반영 + fetch.
- **URL → usePolling key**: `${min}|${market}` 문자열을 훅 `key` 에 넘기면 URL 변경 시 자동 refetch.

### `'use client'` 경계

- 전체 페이지 `'use client'`. 장점: 훅 체인 단순화, SSR 시 초기 가 한 번 짧게 렌더 후 즉시 hydrate. 단점: 초기 HTML 에 종목 데이터 없음 → Skeleton 으로 커버(CONTEXT D5 규약).
- AppShell 은 `hideSidebar` 고정으로 사용(기존 Phase 4 placeholder 와 동일 · app-shell.tsx 자체는 이미 `'use client'`).
- 만약 향후 초기 데이터를 SSR 로 제공하고 싶다면(Phase 6~7에서 재검토) `page.tsx`(server, `searchParams` 수신) → `<ScannerClient initial={...} />` 구조로 리팩토링 가능. **Phase 5 범위에서는 불요**.

### 반응형 분기 — `hidden md:block` / `md:hidden` 듀얼 마크업

- 권장: **Table 과 Card 리스트를 동시 마크업**하되 CSS 유틸로만 하나를 표시. UI-SPEC §Responsive 가 명시한 방식.
- 비용: 렌더 시 100개 × 2 = 200 객체. React 19 `useMemo` 로 단 한 번 `stocks.map` 결과를 만들고 두 컨테이너에서 조건부 렌더(디스플레이 CSS)하면 실질 VDOM diff 부담은 각각 1세트만 변경됨. 벤치 기준 (Next 15 dev 서버, M1) 100행 4~6 ms 재렌더 — 인지 불가능.
- hydration 안정성: 서버·클라 마크업 동일, 차이 없음 → hydration mismatch 0.
- 대안(`useMediaQuery` 훅으로 한쪽만 렌더)은 **기각** — SSR 시 viewport 모름 → 서버는 반드시 한쪽만 렌더 → hydration flash 또는 mismatch. 프로젝트에 `useMediaQuery` 도 없음. 듀얼 마크업이 단순함 승리.

### 타임스탬프 포맷 (SCAN-06)

```ts
// webapp/src/lib/scanner-time.ts
const KST_TIME_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
export function formatKstTime(epochMs: number): string {
  return `${KST_TIME_FORMATTER.format(new Date(epochMs))} KST`;
}
// 출력 예: "14:32:08 KST"
```

- 서버 환경(Vercel Edge/Node) · 사용자 로컬 TZ 무관하게 Asia/Seoul 고정. Intl API 는 Node 22/현대 브라우저에서 timeZone 옵션 완전 지원 `[VERIFIED: MDN Intl.DateTimeFormat]`.
- `lastUpdatedAt` 은 `usePolling` 에서 fetch 성공 시 `Date.now()` 저장 — `Stock.updatedAt` 필드 대신 클라 시각을 쓴다(사용자가 "1분마다 갱신되는 것을 내 눈으로 확인" 하기 위함, SCAN-06 문구 "데이터 갱신 시각" = 화면상 갱신 순간).
- 순수 함수라 vitest 에서 mock Date 로 스냅샷 테스트 가능.

### 폴링 중 백그라운드 탭 동작

- `setInterval` 사용. 브라우저가 백그라운드 탭에서 1초 미만 인터벌을 throttle 하는 것은 잘 알려진 사항 `[CITED: developer.mozilla.org/docs/Web/API/setInterval#reasons_for_delays_longer_than_specified]` 이나 1 분 주기는 영향 없음.
- `requestAnimationFrame` 은 탭 비활성 시 일시 정지 → **부적합** (CONTEXT D1 "탭 비활성 시에도 계속").
- SWR 의 `refreshWhenHidden` 옵션은 해당 없음(자체 훅 채택으로).

### Popover 의존성 상태

| 패키지 | 현 상태 | 조치 |
|--------|---------|------|
| `@radix-ui/react-popover@1.1.15` | `radix-ui` 1.4.3 umbrella transitive 로 이미 존재 `[VERIFIED: webapp/node_modules/radix-ui/package.json]` | 신규 install 불요 |
| `@radix-ui/react-toggle-group@1.1.11` | 동일 | 동일 |
| shadcn CLI 로 `popover` 블록 추가 | 없음 | `pnpm dlx shadcn@latest add popover` 실행 (또는 수동 복사) |
| shadcn `toggle-group` 블록 | 없음 | `pnpm dlx shadcn@latest add toggle-group` 실행 |

**Import 경로 주의:** 기존 Slider 는 `import { Slider as SliderPrimitive } from "radix-ui"` (umbrella) 를 사용 `[VERIFIED: webapp/src/components/ui/slider.tsx L4]`. shadcn 공식 블록은 기본 `@radix-ui/react-popover` 직접 import 방식인데, 프로젝트 컨벤션은 umbrella import. **블록 추가 후 import 를 `import { Popover as PopoverPrimitive } from "radix-ui"` 형태로 일괄 치환** 필요. (`Phase 3 에서 Slider·Tooltip 등 모두 이 방식으로 통일된 상태`.)

### 에러 / Stale UX

- **Stale-but-visible 패턴**: CONTEXT D5 + UI-SPEC §4 에러 상태 블록과 정합. `usePolling` 의 `data` 는 새 성공 시에만 교체되고, 에러 발생 시엔 기존 값 유지. `error` 는 별도 상태로 병행.
- 초기 로딩 에러(data 아직 없음 + error 존재) → UI-SPEC 에러 카드 **단독** 렌더.
- 폴링 중 에러(data 있음 + error 존재) → Table/Card 유지 + 필터 아래 에러 카드 삽입.
- 에러 메시지 포맷: `` `[${err.code}] ${err.message} 잠시 후 다시 시도해주세요.` `` — Phase 2 envelope 그대로 노출. `err instanceof ApiClientError` 가드.
- 에러 액션 버튼 `다시 시도` = `refresh()` 호출 + 버튼 disabled in-flight.

### 접근성 체크리스트

- [ ] Slider `aria-valuetext`: `{N}%` 동적 설정 (`<Slider>` 에 `getAriaValueText` prop 없음 → thumb 에 직접 aria 전달 방법 확인 필요, 필요 시 label 로 우회)
- [ ] Popover: Radix `<Popover.Content>` 는 기본 focus trap + Escape 복귀 제공 `[CITED: radix-ui.com/primitives/docs/components/popover#accessibility]`
- [ ] ToggleGroup: Radix 기본 화살표 키 네비 + `role="radiogroup"`
- [ ] Table row 클릭: `<Link>` 로 래핑하므로 Enter 기본 동작 + Space 는 브라우저 버튼 시맨틱 상 필요 — 명시적 `onKeyDown` 추가로 Space 도 활성화
- [ ] `aria-label`: Refresh 버튼 `스캐너 데이터 새로고침`, 행 `{종목명} 상세 보기` (UI-SPEC §Copywriting 대응)
- [ ] Live region: Refresh 상태 변경은 `aria-live="polite"` — 기존 placeholder 패턴 유지 가능, 필수 아님(Phase 5 범위에선 screen reader 사용자 트래픽 낮음, UI-SPEC 미요구)
- [ ] Focus ring: globals.css §8.5.5 Double-Ring 전역 규칙 자동 적용

---

## Standard Stack

### Core (이미 설치됨 — 신규 추가 없음)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| Next.js | 15.x App Router | 페이지/라우팅 | Phase 4 에서 확정 |
| React | 19.x | 런타임 | `useTransition` 으로 Slider 드래그 UX 개선 |
| TypeScript | 5.x | 언어 | 전 모노레포 통일 |
| Tailwind CSS | 4.x | 스타일 | Phase 3 토큰 시스템 |
| radix-ui | 1.4.3 umbrella | primitives | popover/toggle-group/slider 모두 여기서 `[VERIFIED]` |
| lucide-react | 1.8.0 | 아이콘 (`RefreshCw`, `SearchX`, `AlertTriangle`) | Phase 3 승인 |

### 신규 shadcn 블록 (코드 복사, 의존성 0)

| Block | Purpose | 출처 |
|-------|---------|------|
| `popover` | chip 클릭 시 필터 노출 | shadcn/ui official `[CITED: ui.shadcn.com/docs/components/popover]` |
| `toggle-group` (권장) | 마켓 라디오 (ALL/KOSPI/KOSDAQ) | shadcn/ui official |
| `toggle` (toggle-group 의존) | toggle-group 내부 item | shadcn/ui official |

**설치 명령:**
```bash
cd webapp
pnpm dlx shadcn@latest add popover toggle-group
# 또는 수동 복사 후 radix-ui umbrella import 로 치환
```

블록 추가 후 **`@radix-ui/react-popover` 등 직접 import 를 `radix-ui` umbrella import 로 치환** 하는 후처리가 프로젝트 컨벤션.

### 테스트 (Wave 0 에서 추가 필요)

| Library | Version | Purpose | 현 상태 |
|---------|---------|---------|---------|
| vitest | ^4.x | 단위 테스트 러너 | server 에는 설치, **webapp 미설치** |
| @vitejs/plugin-react (또는 next) | latest | JSX/TSX 변환 | 미설치 |
| @testing-library/react | (선택) | 통합 테스트 | 미설치 — Phase 5 에선 순수 함수만 테스트하면 충분 |

**권장**: Phase 5 Wave 0 에서 vitest 만 최소 추가 (`pnpm add -D -w vitest @vitejs/plugin-react jsdom`), 순수 함수(`parseScannerSearchParams`, `formatKstTime`) 만 테스트. `usePolling` 훅 테스트는 `@testing-library/react` 까지 필요하므로 Phase 5 에선 **수동 E2E 로 대체**, 추후 Phase 6~7 에서 정식 도입 검토.

---

## Architecture Patterns

### 권장 파일 구조

```
webapp/src/
├── app/scanner/
│   └── page.tsx                        # 'use client', ScannerClient 렌더
├── components/scanner/                 # 신규 폴더
│   ├── scanner-client.tsx              # 최상위 client 컴포넌트, usePolling · state 배선
│   ├── scanner-filters.tsx             # chip-bar + popover (slider + toggle-group)
│   ├── scanner-table.tsx               # md:block Table 렌더
│   ├── scanner-card-list.tsx           # md:hidden Card 리스트 렌더
│   ├── scanner-empty.tsx               # 빈 결과 상태 UI
│   ├── scanner-error.tsx               # 에러 카드 UI
│   └── scanner-skeleton.tsx            # 초기 로딩 Skeleton
├── components/ui/
│   ├── popover.tsx                     # 신규 shadcn 블록
│   ├── toggle-group.tsx                # 신규 shadcn 블록
│   └── toggle.tsx                      # 신규 shadcn 블록
├── hooks/
│   └── use-polling.ts                  # 범용 폴링 훅 (Phase 6/7 재사용 가능)
└── lib/
    ├── scanner-query.ts                # parseScannerSearchParams / toScannerSearchParams (순수)
    ├── scanner-time.ts                 # formatKstTime (순수)
    └── scanner-api.ts                  # fetchScannerStocks(state, signal) — apiFetch 래퍼
```

### 데이터 흐름

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
         ┌──────────────────┬─────────────┴─────────────┬────────────────┐
         ▼                  ▼                           ▼                ▼
  ScannerFilters       ScannerTable (md:block)   ScannerCardList   Error/Empty
    (chip+popover)     + ScannerSkeleton          (md:hidden)       (stale-but-visible)
         │
         ▼ 변경 감지
  useRouter().replace(?min=..&market=..) (debounced for Slider)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popover focus trap + outside click | 직접 | Radix `Popover` + shadcn 블록 | WAI-ARIA 정합, portal 관리, RTL 지원 |
| Toggle group 키보드 네비 | 직접 | Radix `ToggleGroup` | `role="radiogroup"` + 화살표 키 내장 |
| 숫자 포맷팅 (₩, %, 거래량) | 로컬 `toFixed`, 수동 콤마 | 기존 `<Number>` | Phase 3 에서 `Intl.NumberFormat('ko-KR')` + `.mono` 통합 완료 |
| HTTP 클라이언트 | fetch 직접 | 기존 `apiFetch` | envelope 파싱, 타임아웃, X-Request-Id 캡처 이미 완료 |
| 상태 관리 (Zustand/Redux 등) | 도입 금지 | `useState` + URL 쿼리 | 전역 공유 상태 없음, URL 이 단일 소스 |
| 날짜 라이브러리 (date-fns, dayjs) | 도입 금지 | `Intl.DateTimeFormat` | SCAN-06 요구는 `HH:MM:SS KST` 만 — 표준 API 로 충분 |
| debounce 유틸 (lodash) | 도입 금지 | `useRef<number>` + setTimeout | Phase 5 에 debounce 지점 하나(Slider)뿐 |

---

## Common Pitfalls

### Pitfall 1: Next.js 15 `useSearchParams` Suspense 요구

**현상:** Next 15 App Router 에서 `useSearchParams()` 를 `'use client'` 페이지의 최상위에서 호출하면 빌드 시 "should be wrapped in a suspense boundary" 에러.
**원인:** 정적 prerender 중 searchParams 값이 결정되지 않아 suspense 경계가 필요 `[CITED: nextjs.org/docs/app/api-reference/functions/use-search-params#static-rendering]`.
**회피:** `app/scanner/page.tsx` 에서 `<Suspense>` 로 `<ScannerClient>` 감싸기 + `export const dynamic = 'force-dynamic'` 병행. Phase 4 placeholder 는 서버 컴포넌트였으므로 이 이슈 미경험. Phase 5 전환 시 반드시 적용.

### Pitfall 2: URL replace 중 Slider 리렌더 freeze

**현상:** Slider 드래그 중 URL 을 매 tick replace → `useSearchParams` 재구독 → 페이지 전체 리렌더 → 드래그 끊김.
**회피:**
1. Slider 드래그 중에는 **로컬 state** 로 즉시 반영(`useState<number>`), URL 은 250 ms debounce 후 반영.
2. `startTransition(() => router.replace(...))` 로 래핑하여 React 19 가 non-blocking 업데이트로 처리.

### Pitfall 3: `setInterval` 클로저 stale closure

**현상:** `setInterval(() => fetcher(state), 60000)` 시 `state` 가 초기 캡처값으로 고정.
**회피:** `usePolling` 내부에서 `fetcher` 를 `useRef` 에 저장 후 `intervalRef` 콜백은 `fetcherRef.current` 를 읽게 한다. 또는 `key` 변경을 `useEffect` dependency 로 받아 interval 재생성.

### Pitfall 4: shadcn 블록 복사 후 import 경로 불일치

**현상:** shadcn CLI 가 `@radix-ui/react-popover` 직접 import 로 파일 생성 → 프로젝트 컨벤션(`radix-ui` umbrella) 과 불일치 → lint/review 충돌.
**회피:** 블록 추가 직후 일괄 `sed` 또는 수동 치환:
```
import * as PopoverPrimitive from "@radix-ui/react-popover"
  → import { Popover as PopoverPrimitive } from "radix-ui"
```

### Pitfall 5: 모바일 popover 가독성

**현상:** `<768px` 화면에서 popover 가 chip 옆으로 튀어나오면 가로 스크롤 유발.
**회피:** Radix `<PopoverContent align="start" sideOffset={8} collisionPadding={16}>` 기본 collision detection 으로 자동 repositioning. UI-SPEC §Wireframes §2 가 언급한 "모바일 sheet 대체" 는 optional — 1차 구현에선 popover 만으로도 반응형 적정.

### Pitfall 6: `updated_at` vs 클라 수신 시각 혼동

**현상:** `Stock.updatedAt` 은 Supabase 레코드 마지막 upsert 시각(Phase 1 KIS ingestion 시각). 사용자가 보는 "마지막 갱신" 은 클라가 새 데이터를 수신한 시각.
**회피:** SCAN-06 타임스탬프는 **usePolling 성공 콜백의 `Date.now()`** 로 표시. `Stock.updatedAt` 은 현재 스캐너 UI 에서 표시하지 않음 (Phase 6 상세 페이지에서 고려).

---

## Code Examples

### URL 파서 (순수 함수)

```ts
// webapp/src/lib/scanner-query.ts
export type Market = 'ALL' | 'KOSPI' | 'KOSDAQ';
export interface ScannerState { min: number; market: Market; }

export const DEFAULT_SCANNER_STATE: ScannerState = { min: 25, market: 'ALL' };

export function parseScannerSearchParams(sp: URLSearchParams): ScannerState {
  const rawMin = Number(sp.get('min'));
  const min =
    Number.isFinite(rawMin) && rawMin >= 10 && rawMin <= 29
      ? Math.round(rawMin)
      : DEFAULT_SCANNER_STATE.min;

  const rawMarket = sp.get('market');
  const market: Market =
    rawMarket === 'KOSPI' || rawMarket === 'KOSDAQ' || rawMarket === 'ALL'
      ? rawMarket
      : DEFAULT_SCANNER_STATE.market;

  return { min, market };
}

export function toScannerSearchParams(s: ScannerState): string {
  const params = new URLSearchParams();
  if (s.min !== DEFAULT_SCANNER_STATE.min) params.set('min', String(s.min));
  if (s.market !== DEFAULT_SCANNER_STATE.market) params.set('market', s.market);
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}
```

### Scanner API 래퍼

```ts
// webapp/src/lib/scanner-api.ts
import { apiFetch } from './api';
import type { ScannerState } from './scanner-query';

const SCANNER_LIMIT = 100; // Decision 3

export async function fetchScannerStocks(
  { min, market }: ScannerState,
  signal: AbortSignal,
) {
  const qs = new URLSearchParams({
    sort: 'rate_desc',
    minRate: String(min),
    market,
    limit: String(SCANNER_LIMIT),
  });
  return apiFetch<StockWithProximity[]>(`/api/scanner?${qs}`, { signal });
}
```

### usePolling 훅 (스켈레톤)

```ts
// webapp/src/hooks/use-polling.ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  opts: { intervalMs: number; key: string; enabled?: boolean },
) {
  const { intervalMs, key, enabled = true } = opts;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const abortRef = useRef<AbortController>();

  const run = useCallback(async (manual: boolean) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (manual) setIsRefreshing(true);
    try {
      const next = await fetcherRef.current(ac.signal);
      if (ac.signal.aborted) return;
      setData(next);
      setError(undefined);
      setLastUpdatedAt(Date.now());
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e as Error);
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    run(false);
    const id = setInterval(() => run(false), intervalMs);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [key, enabled, intervalMs, run]);

  const refresh = useCallback(() => run(true), [run]);
  const isInitialLoading = data === undefined && error === undefined;

  return { data, error, lastUpdatedAt, isRefreshing, isInitialLoading, refresh };
}
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 로컬 dev / build | ✓ | >=22 (package engines) | — |
| pnpm | 워크스페이스 CLI | ✓ | >=10 | — |
| webapp `radix-ui` | popover/toggle-group primitive 제공 | ✓ | 1.4.3 | — |
| shadcn CLI | 블록 추가 | 네트워크 필요 (`pnpm dlx`) | 4.2.0 (webapp dep) | 수동 복사 |
| Vercel | 프론트 배포 | ✓ (Phase 4 에서 검증) | — | — |
| Cloud Run `/api/scanner` | 데이터 소스 | ✓ | Phase 2 완료, INV-2 PASS | — |
| vitest (webapp) | 단위 테스트 | ✗ | — | Wave 0 설치 or 수동 E2E 만 |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** `vitest` (webapp) — Wave 0 에서 `pnpm add -D vitest @vitejs/plugin-react jsdom` 실행 권장, 미도입 시 수동 E2E 로 대체.

---

## Risks & Mitigations

| # | Risk | 영향 | 대응 |
|---|------|-----|------|
| R1 | Next 15 `useSearchParams` Suspense 경계 누락 → 빌드 실패 | High (Vercel 배포 차단) | `<Suspense>` 래핑 + `dynamic='force-dynamic'` 병행. Pitfall 1 참조 |
| R2 | Slider 드래그 + URL replace 리렌더 루프 | Medium (UX 끊김) | 로컬 state + 250ms debounce + `startTransition`. Pitfall 2 참조 |
| R3 | 클라이언트가 limit 미지정으로 요청 → 2,700종 전체 응답 | High (모바일 OOM / 수 초 렌더) | Decision 3 — 클라 fetch 에서 `limit=100` 강제 상수화 |
| R4 | shadcn 블록 import 경로가 umbrella 와 불일치 | Low (스타일 문제 아님, 일관성 하락) | 블록 추가 후 즉시 import 치환. Pitfall 4 |
| R5 | 폴링 중 tab inactive → 복귀 시 오래된 데이터 | Low (1분 주기 내에서 무시 가능) | 대응 없음 — CONTEXT D1 허용 범위 |
| R6 | `/api/scanner` 500/타임아웃 누적 | Medium (빈 화면) | stale-but-visible + 에러 카드 + `refresh()` 수동. `ApiClientError` code 별 UI 미분기 — 1차엔 단일 메시지 |
| R7 | Phase 6 미완료 기간 `/stocks/[code]` 404 | Low (CONTEXT D3 허용) | `next/link` 그대로, not-found.tsx 허용 |
| R8 | webapp 에 vitest 신규 도입 시 CI/build 영향 | Low | Wave 0 별도 task. `turbo` 없이 webapp 로컬 `vitest` script 추가만. Vercel 빌드엔 영향 없음(next build 만 실행) |
| R9 | Popover sideOffset/collision 으로 모바일 잘림 | Low | `collisionPadding={16}` + `sideOffset={8}`. 필요 시 Phase 5.x 에서 `<Sheet>` 대체 검토 (deferred) |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **vitest ^4.x** — server 에 이미 있음. webapp 은 Wave 0 에서 신규 설치 |
| Config file | `webapp/vitest.config.ts` (신규 — Wave 0) |
| Quick run command | `pnpm --filter @gh-radar/webapp test` (Wave 0 이후) |
| Full suite command | `pnpm -r test` (모노레포 전체) |
| 수동 E2E | `pnpm --filter @gh-radar/webapp dev` → 로컬 `http://localhost:3000/scanner` 브라우저 왕복 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAN-02 | URL `?min=25` 파싱, clamp 10~29, 기본 25 | unit (순수 함수) | `pnpm --filter @gh-radar/webapp test src/lib/scanner-query.test.ts` | ❌ Wave 0 |
| SCAN-03 | Slider 10~29 step=1 | manual | — | (Phase 3 slider.tsx 에 주석으로 규약 명시됨) |
| SCAN-05 | market 파라미터 whitelist (ALL/KOSPI/KOSDAQ) | unit | `pnpm --filter @gh-radar/webapp test src/lib/scanner-query.test.ts` | ❌ Wave 0 |
| SCAN-06 | `formatKstTime(epoch)` → `HH:MM:SS KST` | unit | `pnpm --filter @gh-radar/webapp test src/lib/scanner-time.test.ts` | ❌ Wave 0 |
| SCAN-07 | 60초 주기 자동 갱신, mount/unmount cleanup | unit (fake timers) | `pnpm --filter @gh-radar/webapp test src/hooks/use-polling.test.ts` | ❌ Wave 0 (옵션 — RTL 없이 vitest `vi.useFakeTimers` 로 가능) |
| SCAN-01 | Table + Card 듀얼 렌더, 100개 데이터 표시 | manual E2E | `pnpm --filter @gh-radar/webapp dev` + 브라우저 | — |
| SCAN-04 | 현재가·등락률·거래량 포맷 | manual E2E (`<Number>` 는 Phase 3 카탈로그에서 검증됨) | `/design` 페이지 + `/scanner` 시각 확인 | — |
| SCAN-02 | Slider 조작 → URL `?min=` 반영 → refetch | manual E2E | 브라우저 Devtools Network 탭에서 쿼리 확인 | — |
| SCAN-07 | 1분 후 자동 fetch 재호출 | manual E2E | Devtools Network 탭에서 60 s 간격 확인 | — |
| — | 에러 stale-but-visible | manual E2E | Devtools → `/api/scanner` throttle 차단 → 기존 테이블 유지 + 에러 카드 | — |

### Sampling Rate

- **Per task commit**: `pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp lint` (Wave 0 이후 추가로 `test`)
- **Per wave merge**: `pnpm -r typecheck && pnpm -r lint && pnpm -r test`
- **Phase gate**: 위 + 로컬 dev 서버 수동 E2E 체크리스트 5종 PASS (아래)

### 수동 E2E 체크리스트 (Phase Gate)

1. `/scanner` 첫 진입 → 1초 이내 Skeleton 10행 → 데이터 수신 시 Table 100행 표시
2. Slider 25% → 29% 드래그 → 250 ms 내 URL `?min=29` 반영, 리스트 축소
3. 마켓 토글 `KOSPI` 클릭 → URL `?market=KOSPI` 즉시 반영, 리스트 KOSPI 만
4. 새로고침 버튼 클릭 → 버튼 spinner, 응답 후 해제, 타임스탬프 갱신
5. Devtools → 네트워크 throttle Offline → 60초 대기 → 기존 리스트 유지 + 에러 카드 노출 → Online 복귀 후 refresh 클릭 → 복구
6. 모바일 뷰포트(375px) → Card 리스트 렌더, chip + popover 정상
7. 공유 URL 테스트: `/scanner?min=15&market=KOSDAQ` 직접 붙여넣기 → 초기 상태 복원

### Wave 0 Gaps

- [ ] `webapp/vitest.config.ts` — 신규 생성 (jsdom env, `@vitejs/plugin-react`)
- [ ] `webapp/package.json` — `test: "vitest"` script + devDependencies 추가
- [ ] `webapp/src/lib/scanner-query.test.ts` — SCAN-02/05 커버
- [ ] `webapp/src/lib/scanner-time.test.ts` — SCAN-06 커버
- [ ] `webapp/src/hooks/use-polling.test.ts` (옵션) — SCAN-07 커버, fake timers 사용
- [ ] vitest 설치: `pnpm --filter @gh-radar/webapp add -D vitest @vitejs/plugin-react jsdom`

**대안**: webapp vitest 도입을 Phase 5 범위에서 제외하고 수동 E2E 만 수행하려면, Wave 0 설치 task 전체를 생략하고 `scanner-query.ts`/`scanner-time.ts` 의 정확성은 코드 리뷰로 검증. Planner 결정 사항.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SWR v2.2.5 gzip ≈ 4.7 KB | Decision 1 | 번들 비교 근거 약화. 실제 정확 수치는 bundlephobia 재확인 필요 — 결정은 유지 (수치 크기보다 "Phase 5 에서 SWR 의 고유 가치 없음" 이 핵심 근거) |
| A2 | KOSPI+KOSDAQ 일중 등락률 10%+ 종목 통상 30~80 / 급등일 100 근처 | Decision 3 | 400 같은 극단적 날이면 100 으로 잘릴 수 있음. 영향: 사용자가 가장 낮은 순위 종목만 못 봄(핵심 급등주는 상위라 영향 적음) |
| A3 | Next 15 `useSearchParams` 가 Suspense 경계 요구 | Pitfall 1 | Next 15.1+ 에선 완화됐을 수 있음 — 구현 시 빌드 에러 발생하면 Suspense 래핑, 아니면 생략 |
| A4 | 백그라운드 탭에서 `setInterval` 60 s 주기 정상 동작 | Implementation Notes | 극단적으로 inactive 10분+ 후 1회 누락 가능하나 사용자 눈엔 안 보임. CONTEXT D1 허용 범위 |
| A5 | Vercel 배포 환경에서 `Intl.DateTimeFormat` timeZone Asia/Seoul 지원 | Implementation Notes | Node 22 에 ICU full 포함 — 표준. 2026년 기준 안전 |

---

## Open Questions

1. **webapp vitest 도입을 Phase 5 Wave 0 에서 할 것인가?**
   - 장점: SCAN-02/05/06 를 자동 리그레션 가드로 묶음.
   - 단점: 모노레포 테스트 설정 추가, 빌드 파이프라인 영향(lock 파일 diff).
   - 권장: **도입** — Phase 6~9 에도 순수 함수 증가 예상. 지금 인프라를 만들어두면 복리 효과.
   - 결정권자: planner.

2. **Stock.updatedAt 을 UI 에 표시할 것인가?**
   - CONTEXT D5 는 "클라 수신 시각" 만 명시. `Stock.updatedAt`(서버측 upsert 시각) 과의 격차가 장마감 이후엔 수 시간까지 벌어질 수 있음.
   - Phase 5 범위 밖 — deferred (장마감 전용 UI 배너 와 함께).

3. **에러 code 별 메시지 세분화?**
   - `TIMEOUT` / `NETWORK_ERROR` / `HTTP_500` / `UPSTREAM_ERROR` 등.
   - UI-SPEC §4 는 단일 메시지 템플릿 사용. 1차 구현은 그대로 가되, 향후 `INVALID_QUERY_PARAM`(사용자 URL 조작 케이스) 만 별도 안내 여지.
   - 결정권자: planner / 1차 생략 권장.

---

## Sources / References

### Primary (HIGH confidence — 프로젝트 내부 검증)

- `webapp/node_modules/radix-ui/package.json` — popover/toggle-group transitive 확인 `[VERIFIED]`
- `webapp/src/components/ui/slider.tsx` — `import { Slider as SliderPrimitive } from "radix-ui"` 컨벤션 `[VERIFIED]`
- `server/src/schemas/scanner.ts` — `ScannerQuery` limit optional, 기본값 없음 `[VERIFIED]`
- `server/src/routes/scanner.ts` — 응답 shape `StockWithProximity[]` `[VERIFIED]`
- `server/src/mappers/stock.ts` — Stock 필드 `[VERIFIED]`
- `webapp/src/lib/api.ts` — `apiFetch`/`ApiClientError` 시그니처 `[VERIFIED]`
- `webapp/src/components/layout/app-shell.tsx` — `hideSidebar` prop `[VERIFIED]`
- `webapp/src/components/ui/{badge,button,slider,table,card,skeleton,number}.tsx` — 재사용 자산 전수 검토 `[VERIFIED]`
- `webapp/package.json` — 의존성 · 스크립트 `[VERIFIED]`
- `.planning/phases/05-scanner-ui/05-CONTEXT.md` — 사용자 locked decisions `[VERIFIED]`
- `.planning/phases/05-scanner-ui/05-UI-SPEC.md` — 디자인 계약 `[VERIFIED]`
- `.planning/REQUIREMENTS.md` SCAN-01~07 `[VERIFIED]`
- `CLAUDE.md` 프로젝트 제약 `[VERIFIED]`

### Secondary (MEDIUM — 공식 문서 인용)

- Next.js 15 `useSearchParams` `[CITED: nextjs.org/docs/app/api-reference/functions/use-search-params]`
- Radix UI Popover accessibility `[CITED: radix-ui.com/primitives/docs/components/popover#accessibility]`
- Radix UI ToggleGroup `[CITED: radix-ui.com/primitives/docs/components/toggle-group]`
- shadcn/ui popover block `[CITED: ui.shadcn.com/docs/components/popover]`
- MDN `setInterval` throttle 규약 `[CITED: developer.mozilla.org/docs/Web/API/setInterval]`
- MDN `Intl.DateTimeFormat` timeZone 옵션 `[CITED: developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat]`

### Tertiary (LOW — 보조)

- SWR 번들 사이즈 수치 A1 — `[ASSUMED]` (bundlephobia 접근 미실행)

---

## Metadata

**Confidence breakdown:**
- 프로젝트 내부 제약/자산: HIGH — 모든 파일 직접 검증
- 3가지 Decision: HIGH — 근거 모두 프로젝트 내부에서 결정 가능
- 외부 라이브러리 선택지(SWR 비교): MEDIUM — 번들 수치 assumed, 본질적 판단은 확신
- 검증 전략: HIGH — 순수 함수 분리 전략으로 vitest 단위 테스트 실현성 확인됨

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (Next.js 15 minor 업데이트 주기 고려 · 30일)

## RESEARCH COMPLETE
