# Phase 6: Stock Search & Detail — Research

**Researched:** 2026-04-15
**Domain:** Next.js 15 App Router 클라이언트 검색 UI(cmdk) + 동적 라우트 상세 페이지(서버/클라이언트 경계 설계)
**Confidence:** HIGH (코드베이스 검증 + npm registry + shadcn/Next.js 공식 docs)

---

## Summary

이번 Phase 6은 **백엔드 변경 없이 프론트엔드만 다루는 단일 phase**다. 백엔드 `/api/stocks/search`, `/api/stocks/:code` 두 엔드포인트는 이미 Phase 2에 구현되어 있고 **수정 금지**다 (`server/src/routes/stocks.ts`). 06-CONTEXT (D1~D6)에서 모든 핵심 결정이 잠금되어 있어 리서치 범위는 `<open_for_planner>` 5개 질문 + 주요 함정 식별로 한정된다.

가장 큰 발견은 **백엔드 매퍼와 D6 "null → em-dash" 처리의 미스매치**다. `server/src/mappers/stock.ts:36-39` 의 `rowToStock` 이 `open/high/low/marketCap` 의 nullable DB 컬럼을 `Number(null ?? 0) === 0` 으로 강제 변환하므로, 클라이언트는 `Stock.open === 0` 이라는 값만 받게 된다. 즉 "DB 가 null 이라서 0 으로 떨어진 값" 과 "실제 시장가가 0 인 값" 을 구분할 수 없다. 정책적으로 `<= 0` 또는 `!Number.isFinite(value)` 를 em-dash 로 표기해야 하며 (실제 시장가가 0 인 정상 종목은 없음 — 한국 시장 최저가 1원), 이는 Stats grid `<Number>` 래핑 컴포넌트에서 처리해야 한다.

**Primary recommendation:**
- `<open_for_planner>` 5개 모두 본 리서치에서 권고안 확정 (R1~R5 섹션).
- 핵심 신규 의존성은 **cmdk@1.1.1** 단 하나(@radix-ui/react-dialog 1.1.6 transitive 동반). shadcn `command` 블록 하나로 `command.tsx` + `dialog.tsx` 양쪽 모두 자동 생성됨. 별도 `dialog` 블록 명시 추가 불필요.
- `app/stocks/[code]/page.tsx` 는 **전체 `'use client'`** 권장 — Phase 5 ScannerClient와 일관성 + refresh 버튼·AbortController 패턴 100% 재사용.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1. 검색 진입점 — AppHeader 전역 검색만**
- 기존 `app-header.tsx` 의 '종목 검색' input 을 ⌘K/Ctrl+K 로 열리는 전역 모달로 활성화
- 별도 `/search` 페이지 **없음** — 선택 즉시 `/stocks/[code]`로 이동
- 모든 페이지에서 사용 가능한 단일 진입점

**D2. 자동완성 컴포넌트 — shadcn `Command` (cmdk) + ⌘K 단축키**
- `npx shadcn@latest add command` 로 cmdk 의존성 추가
- ⌘K (Mac) / Ctrl+K (Windows/Linux) 전역 키보드 단축키로 모달 토글
- ↑↓ Enter ESC 키보드 네비게이션은 cmdk 기본 제공
- 입력 **debounce 300ms** 후 `GET /api/stocks/search?q=` 호출
- 모달 내 로딩/빈 결과/에러 상태 별도 처리

**D3. 자동완성 항목 표시**
- 각 행: `종목명 · 종목코드 · 마켓 배지([KOSPI]/[KOSDAQ])`
- 가격·등락률은 **자동완성에 미노출** (상세 진입 후 확인 — 검색 UX 단순화)
- 서버 정렬/limit **수정 없음** — 현재 `name.ilike.%q%` OR `code.ilike.%q%`, name asc, limit 20 유지

**D4. 상세 페이지 레이아웃 — Hero + Stats grid + Phase 7/8 placeholder**
- 라우트: `app/stocks/[code]/page.tsx` (Next.js dynamic route, App Router)
- Hero 섹션: 종목명 · 종목코드 · 마켓 배지 + 큰 현재가 + 등락액/등락률(Phase 3 `up/down/flat` 토큰)
- Stats grid (2열/md: 3열): 시가 · 고가 · 저가 · 거래량 · 거래대금 · 시총 · 상한가 · 하한가
- 갱신 시각: `HH:MM:SS KST` 절대시각 (Phase 5 `ko-KR` `Asia/Seoul` 포맷과 동일)
- Phase 7/8 placeholder Card 포함
- 숫자 포맷은 기존 `components/ui/number.tsx` 재사용

**D5. 데이터 갱신 — 수동 refresh 버튼만**
- 자동 폴링 **없음** (스캐너 1분 폴링과 의도적 분리)
- Refresh 버튼 내 subtle spinner (Phase 5 버튼 패턴 재사용)
- 장마감/주말 분기 UI 없음 — 갱신시각 표기로 사용자가 판단
- 초기 로드만 `skeleton.tsx` 노출, 재조회 시 기존 데이터 유지

**D6. 에러/빈 상태 — 스테이트별 전용 UI**
- 404 StockNotFound → `app/stocks/[code]/not-found.tsx` (대소문자·형식 힌트 + '스캐너로 돌아가기')
- API 에러(5xx/타임아웃) → `app/stocks/[code]/error.tsx` (`ApiClientError.message` + 재시도)
- null 필드 값 → `—` (em-dash) 표기, `number.tsx` 의 nullish 처리 활용
- Fetch 흐름: 클라이언트 페이지(`'use client'`) — `apiFetch` 오류 envelope 사용

### Claude's Discretion (open_for_planner)

1. ⌘K Dialog 구현 형태: `CommandDialog` vs `Popover` 앵커형
2. Hero 반응형: Tailwind breakpoint vs `clamp()`
3. Stats grid 열 수 (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`)
4. `page.tsx` 서버/클라이언트 경계
5. cmdk 의존성 크기·번들 영향

→ 본 리서치 R1~R5 섹션에서 권고 확정.

### Deferred Ideas (OUT OF SCOPE)

- 최근 검색어 / 인기 종목 추천
- 서버 search 랭킹 개선 (prefix match 우선)
- 차트·기간별 시세·일봉
- Phase 7/8 placeholder 실제 데이터 연결
- 실시간 SSE/WebSocket 시세 스트림
- 즐겨찾기 / 관심종목
- 장마감 배지 / stale 경고
- 상세 페이지 자동 폴링
- `/search` 전용 페이지
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | 설명 | 본 리서치에서 매핑되는 권고 |
|---|---|---|
| **SRCH-01** | 종목명 또는 종목코드로 검색 | R1 (CommandDialog 입력 → debounce → `apiFetch('/api/stocks/search?q=')`); 서버 `name.ilike` OR `code.ilike` 그대로 사용 |
| **SRCH-02** | 검색 자동완성 드롭다운 | R1 + cmdk `shouldFilter={false}` (서버 검색이라 클라 필터 비활성), `<CommandList>` + `<CommandItem onSelect>` 키보드 네비게이션 |
| **SRCH-03** | 종목 상세 페이지 (현재가·등락률·거래량 등) | R3 (Stats grid 8필드 `grid-cols-2 md:grid-cols-3`) + R4 (`'use client'` page + apiFetch + 수동 refresh) + R5 (em-dash 정책) |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

CLAUDE.md 본문에서 추출한 본 phase 영향 directive:

| Directive | 본 리서치 반영 |
|---|---|
| 한글 커뮤니케이션 (전체 산출물 한글) | RESEARCH.md 본문 한글; UI-SPEC Copywriting 카피 한글 그대로 사용 |
| shadcn/ui 기반 컴포넌트 | cmdk는 shadcn `command` 공식 블록 (서드파티 레지스트리 아님) |
| GSD Workflow Enforcement | 본 phase는 `/gsd-execute-phase` 통해 진행, 직접 편집 금지 |
| Tailwind CSS 4.x + CSS variables | `--up`, `--down`, `--flat`, `--card`, `--ring` 토큰만 사용. 하드코딩 색상 0건 |
| Phase 3 디자인 토큰 / Phase 5 패턴 상속 | scanner-client.tsx · usePolling · scanner-api.ts 패턴 그대로 채택 |

---

## Standard Stack

### Core (이미 설치됨 — 추가 작업 불필요)

| Library | Installed Version | Purpose | Why Standard |
|---|---|---|---|
| Next.js | 15.x (App Router) | 라우팅 + SSR + 클라 컴포넌트 | webapp/package.json 명시, `dynamic = 'force-dynamic'` 패턴 보유 [VERIFIED: webapp/package.json:18] |
| React | 19.x | UI runtime | `use(params)` API 사용 가능 [VERIFIED: webapp/package.json:21] |
| TypeScript | 5.x | Language | 백엔드 `Stock` 타입 공유 (`@gh-radar/shared`) [VERIFIED] |
| Tailwind CSS | 4.x | Styling | Phase 3 토큰 그대로 [VERIFIED: webapp/package.json:39] |
| lucide-react | 1.8.0 | 아이콘 | `Search`, `RefreshCw` 아이콘 [VERIFIED: webapp/package.json:17] |
| @gh-radar/shared | workspace | `Stock`, `ApiErrorBody` 타입 | [VERIFIED: packages/shared/src/stock.ts] |

### Supporting (신규 1건만)

| Library | Latest Version | Purpose | When to Use |
|---|---|---|---|
| **cmdk** | **1.1.1** | Command palette primitive (자동완성 모달 엔진) | `shadcn add command` 시 자동 추가. `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandItem`, `CommandEmpty`, `CommandLoading` 등 export [VERIFIED: `npm view cmdk version` → 1.1.1, 2026-04-15] |
| @radix-ui/react-dialog | 1.1.6 (transitive) | `CommandDialog` 가 내부 사용 | cmdk peer/dep — 별도 설치 불필요 [VERIFIED: `npm view cmdk dependencies`] |
| @radix-ui/react-id | ^1.1.0 (transitive) | cmdk 내부 ID 생성 | [VERIFIED: same] |
| @radix-ui/react-primitive | ^2.0.2 (transitive) | cmdk slot/composition | [VERIFIED: same] |
| @radix-ui/react-compose-refs | ^1.1.1 (transitive) | cmdk ref forwarding | [VERIFIED: same] |

**버전 검증 (2026-04-15 npm registry):**
```
$ npm view cmdk version
1.1.1
$ npm view cmdk peerDependencies
{ react: '^18 || ^19 || ^19.0.0-rc', 'react-dom': '^18 || ^19 || ^19.0.0-rc' }
```
React 19 호환 [VERIFIED: npm view cmdk peerDependencies, 2026-04-15].

### 설치 명령

```bash
# 단일 명령으로 충분 — webapp/ 디렉토리에서 실행
cd webapp && pnpm dlx shadcn@latest add command
```

이 명령으로 자동 생성·설치되는 것:
- `webapp/src/components/ui/command.tsx` (CommandDialog 포함 export)
- `webapp/src/components/ui/dialog.tsx` (`command` 블록의 의존성)
- `webapp/package.json` 에 `cmdk` 추가
- transitive radix-ui dialog 패키지

[CITED: https://ui.shadcn.com/docs/components/command — "Use the CLI to add the command component"]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| **CommandDialog** (전역 모달) | Popover 앵커 (헤더 input 옆 dropdown) | **Popover 거절** — 모바일 (<768px) 에서 헤더 input 좁고, popover 위치 계산 복잡. 모달은 풀스크린 전환되어 모바일 UX 명확. cmdk 표준 패턴이 CommandDialog 임. |
| **자체 디바운스 useEffect + AbortController** | SWR / TanStack Query | Phase 5 의 `usePolling` 도 자체 구현 (의존성 0). 본 phase 는 폴링 없음 → 전용 `useDebouncedSearch` 훅 30~50줄로 충분. 일관성 + 번들 0kb. |
| **`'use client'` 전체 페이지** | 서버 컴포넌트 + Suspense + 초기 fetch | **전체 use client 채택** (R4 참조). Scanner 패턴 일치, refresh 훅 단순화, params 는 React `use()` 로 read. SEO 비핵심 (인증 불필요한 단일 종목 페이지지만 검색엔진 트래픽 우선순위 낮음). |

---

## Architecture Patterns

### 권장 폴더 구조

```
webapp/src/
├── app/
│   └── stocks/
│       └── [code]/
│           ├── page.tsx           # 'use client' — params: Promise → use(params)
│           ├── not-found.tsx      # 404 (StockNotFound 안내 + /scanner 복귀)
│           └── error.tsx          # 'use client' — error boundary
├── components/
│   ├── search/
│   │   └── global-search.tsx      # ⌘K CommandDialog + debounce + cmdk
│   ├── stock/
│   │   ├── stock-hero.tsx         # 종목명·코드·마켓 + 큰 현재가 + 등락
│   │   ├── stock-stats-grid.tsx   # 8필드 Card grid
│   │   ├── stock-detail-client.tsx # 'use client' fetch + refresh 오케스트레이션
│   │   └── coming-soon-card.tsx   # Phase 7/8 placeholder 공용
│   └── layout/
│       └── app-header.tsx         # 기존 input → SearchTrigger 마운트
├── hooks/
│   ├── use-debounced-search.ts    # 신규 — debounce + AbortController
│   └── use-cmdk-shortcut.ts       # 신규 — mod+k 전역 keydown
└── lib/
    └── stock-api.ts               # 신규 — searchStocks, fetchStockDetail
```

### Pattern 1: ⌘K 전역 단축키 (R1)

**What:** 페이지 상단 헤더 input 클릭 또는 mod+k 단축키 → CommandDialog 오픈
**When to use:** D1 결정 — 전역 단일 진입점

**예시 (cmdk 공식 + Vercel 패턴):**
```tsx
// hooks/use-cmdk-shortcut.ts
'use client';
import { useEffect } from 'react';

export function useCmdKShortcut(toggle: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // mod+k: Mac Cmd, Win/Linux Ctrl
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}
```
[CITED: https://ui.shadcn.com/docs/components/command — Dialog 섹션 표준 예제 패턴]

### Pattern 2: 서버 검색을 위한 cmdk 클라 필터 비활성 (R1 핵심)

**What:** cmdk 는 기본적으로 클라이언트 측에서 입력어로 결과를 fuzzy-filter 한다. 우리는 서버에서 이미 `name.ilike` OR `code.ilike` 로 필터링한 결과를 받으므로 클라 필터를 **반드시** 꺼야 한다.

**왜 중요한가:** 만약 `shouldFilter` 를 활성화한 채로 두면, 서버가 `삼성` 으로 매칭한 "삼성SDI", "삼성전자" 같은 결과를 cmdk 가 다시 fuzzy 매칭하면서 일부 항목이 사라질 수 있다 (예: 입력어가 영문일 때 한글 결과 매칭 실패).

```tsx
<Command shouldFilter={false}>
  <CommandInput value={query} onValueChange={setQuery} placeholder="..." />
  <CommandList>
    {loading && <CommandLoading>검색 중…</CommandLoading>}
    {!loading && results.length === 0 && query.length > 0 && (
      <CommandEmpty>"{query}" 에 해당하는 종목이 없습니다</CommandEmpty>
    )}
    {results.map((s) => (
      <CommandItem
        key={s.code}
        value={s.code}  // unique key 고정 (입력어와 무관)
        onSelect={() => router.push(`/stocks/${s.code}`)}
      >
        <span>{s.name}</span>
        <span className="text-[var(--muted-fg)] mono">{s.code}</span>
        <Badge>{s.market}</Badge>
      </CommandItem>
    ))}
  </CommandList>
</Command>
```

[CITED: https://github.com/pacocoursey/cmdk — "Disable client-side filtering when using server search: set `shouldFilter={false}` and manage filtered results yourself"]

### Pattern 3: Debounced 검색 + AbortController (R1)

**What:** 입력 후 300ms 침묵 시 API 호출. 새 입력 들어오면 in-flight 요청 abort.

```tsx
// hooks/use-debounced-search.ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { searchStocks } from '@/lib/stock-api';
import type { Stock } from '@gh-radar/shared';

export function useDebouncedSearch(query: string, delayMs = 300) {
  const [results, setResults] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setError(undefined);
      setLoading(false);
      controllerRef.current?.abort();
      return;
    }

    const timer = setTimeout(async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(undefined);
      try {
        const data = await searchStocks(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          setResults(data);
          setLoading(false);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setResults([]);
        setLoading(false);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [query, delayMs]);

  return { results, loading, error };
}
```

이 훅은 `usePolling` 보다 단순 (폴링 없음) — 30~40줄. SWR/TanStack 추가 불필요.

### Pattern 4: 동적 라우트 — Next 15 params Promise (R4)

**What:** Next 15 부터 `params` 는 **Promise** 로 전달된다. 클라이언트 컴포넌트는 React `use(params)` 로 unwrap.

[CITED: https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes — "params is a promise. You must use async/await or React's use function"]

```tsx
// app/stocks/[code]/page.tsx
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { StockDetailClient } from '@/components/stock/stock-detail-client';
import { AppShell } from '@/components/layout/app-shell';

const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

export default function StockPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  // 클라 측 1차 검증 — 잘못된 형식이면 즉시 not-found 트리거
  if (!CODE_RE.test(code)) notFound();

  return (
    <AppShell hideSidebar>
      <StockDetailClient code={code} />
    </AppShell>
  );
}
```

> **참고**: 서버 컴포넌트 패턴(`async function Page` + `await params`) 도 가능하지만 R4 권고는 클라이언트 통일.

### Anti-Patterns to Avoid

- **Popover 앵커 검색 (R1 거절안)**: 헤더 input 너비가 모바일에서 좁아 dropdown 위치 계산이 까다롭고, focus trap·키보드 네비게이션·오버레이 클로즈 동작을 직접 구현해야 함. CommandDialog 가 모두 내장.
- **`shouldFilter` 기본값(true) 유지**: 서버 결과를 클라가 다시 필터링 → 결과 사라짐 위험. 반드시 `false`.
- **`<CommandItem value={query}>`** : `value` 가 입력어와 같아지면 cmdk 내부 키 충돌. **`value={code}`** 로 고유값 고정.
- **`'use client'` page 에서 server `notFound()` 호출 누락**: API 가 404 던질 때 `ApiClientError.status === 404` 분기 → `notFound()` 호출 또는 routerGroup 의 `not-found.tsx` 로 폴백. **단, error.tsx 와 not-found.tsx 가 같은 세그먼트에서 경합** — error.tsx 가 먼저 catch 함. 따라서 클라 fetch 코드에서 명시적으로 `if (err.status === 404) notFound()` 호출 필요.
- **`Number(null ?? 0)` 결과를 그대로 0 으로 표시**: 시가/고가/저가/시총이 0 으로 표시되는 시각적 오독 — em-dash 정책 필수 (R5 참조).
- **단일 useState 로 cmdk open 토글**: 라우트 이동 후 dialog 가 열린 채로 남을 수 있음. `onOpenChange={setOpen}` + `router.push()` 직후 `setOpen(false)` 명시.
- **헤더 input 의 이중 상태**: `app-header.tsx` 의 `<Input>` 은 readonly 처리 (06-CONTEXT specifics). 클릭/포커스 시 dialog 토글만 — input 자체 value 는 미사용.

---

## Don't Hand-Roll

| 문제 | Don't Build | Use Instead | Why |
|---|---|---|---|
| Command palette UI (키보드 네비, ARIA roles) | 직접 keydown handler + focus 관리 | **cmdk** (`Command`, `CommandList`, `CommandItem`) | cmdk 는 ARIA `role="combobox"`, `aria-activedescendant`, ↑↓ Home/End/Enter/ESC, focus trap (Dialog 결합) 모두 내장 |
| Dialog focus trap + 백드롭 + ESC 닫기 | 직접 portal + outside-click | **CommandDialog** (radix Dialog 결합) | 접근성 인증된 radix Dialog 가 자동 처리 |
| Debounce | lodash debounce 등 | `setTimeout` + `clearTimeout` | 30줄로 충분, 의존성 0 |
| Fetch deduping / 폴링 | SWR / TanStack Query | 본 phase 는 폴링 없음 — 전용 `useDebouncedSearch` 30줄 | 일관성 (Phase 5도 자체 `usePolling`) |
| 숫자 한글 포맷 (조원/억원/%) | `Intl.NumberFormat` 호출 산재 | **기존 `<Number>` 컴포넌트** (`webapp/src/components/ui/number.tsx`) | `format="price\|percent\|volume\|marketCap\|trade-amount"` 5종 + `withColor` + `showSign` 모두 보유 |
| 거래대금 표시 | 직접 `Math.floor(value/1e8)` | `<Number value={x} format="trade-amount">` | Phase 05.2 D-15/D-16 에서 확립된 `formatTradeAmount` (0/null → '-' 자동) |
| 절대시각 KST 포맷 | 직접 `new Date().toString()` | `Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'}) + ' KST'` suffix | Phase 5 D5 패턴 그대로 |
| not-found / error UI | 직접 if-else 분기 | **App Router `not-found.tsx` / `error.tsx`** 파일 컨벤션 | 라우트 세그먼트별 자동 폴백, error boundary `reset()` 자동 제공 |

**Key insight:** 본 phase 는 **추가 의존성이 cmdk 단 하나** (radix transitive 4개 자동). 모든 다른 도구는 이미 코드베이스에 있다.

---

## Common Pitfalls

### Pitfall 1: 백엔드 mapper 가 nullable 필드를 0 으로 강제 변환

**What goes wrong:** Stats grid 의 시가/고가/저가/시총이 정상 종목인데도 `0` 으로 표시될 수 있다.

**Why it happens:** `server/src/mappers/stock.ts:36-39` 의 `rowToStock` 이 `Number(r.open ?? 0)`, `Number(r.market_cap ?? 0)` 로 nullable 컬럼을 강제 변환한다. `Stock` 타입 (`packages/shared/src/stock.ts`) 의 `open: number` 은 non-null. → 클라이언트는 DB null vs 실제 0 값을 구분할 수 없다.

**How to avoid (R5 정책):**
- `<Number>` 호출 시 **클라 측 정책으로 `value <= 0` 또는 `!Number.isFinite(value)` 일 때 em-dash 표기**.
- 한국 주식 가격은 1원 이상이므로 `<= 0` 분기는 안전 (단, `change_amount`, `change_rate` 는 음수 정상값이므로 분기 적용 금지).
- 거래량/거래대금은 0 이 정상값일 수 있음 (장 시작 직후) — `formatTradeAmount` 가 이미 0 → '-' 처리 [VERIFIED: webapp/src/lib/format.ts:13].

**Warning signs:** 휴장일/주말에 stale row 진입 시 시총 `0 원`, 시가/고가/저가 `0` 으로 표시 → 시각적 오류 신고.

**대안 (백엔드 변경 없이는 불가):** 매퍼를 고쳐 `null` 을 그대로 통과시키려면 `Stock` 타입 변경 + 모든 소비처 갱신 필요 → **본 phase 범위 초과** (deferred).

### Pitfall 2: cmdk `shouldFilter` 기본값으로 결과 사라짐

**What goes wrong:** "삼성" 입력 → 서버는 5개 반환 → cmdk 가 다시 매칭해 일부 사라짐.

**Why it happens:** cmdk 의 기본 fuzzy matcher 는 `value` 속성으로 매칭하는데, `<CommandItem value={stock.name}>` 처럼 입력어와 무관한 텍스트를 value 로 주면 매칭 실패.

**How to avoid:** `<Command shouldFilter={false}>` + `<CommandItem value={stock.code}>` (고유 키만 value 로). 검색 책임은 100% 서버 위임.

[CITED: https://github.com/pacocoursey/cmdk — server search 가이드]

### Pitfall 3: AbortController 미사용 시 race condition

**What goes wrong:** "삼" → "삼성" → "삼성전자" 순서로 빠르게 입력 시, 응답이 뒤늦게 도착한 "삼" 결과가 화면에 표시될 수 있다.

**How to avoid:** 매 입력마다 `controllerRef.current?.abort()` 로 in-flight 취소 (`useDebouncedSearch` 패턴 참조). `apiFetch` 는 외부 signal 연결 지원 [VERIFIED: webapp/src/lib/api.ts:73-94].

### Pitfall 4: ⌘K 단축키가 form input 에서 발화 안됨

**What goes wrong:** 사용자가 다른 input 에 포커스된 상태에서 `mod+k` 눌러도 무반응.

**Why it happens:** 기본 keydown 리스너를 `document` 가 아닌 특정 element 에 붙이면 발화 누락. **본 패턴은 `document.addEventListener` 사용 → OK.**

**Warning signs:** 만약 React 컴포넌트 root 에 onKeyDown 으로만 붙이면 발생.

### Pitfall 5: error.tsx 가 not-found 케이스를 가로챔

**What goes wrong:** 404 응답 시 `app/stocks/[code]/not-found.tsx` 가 아닌 `error.tsx` 가 표시됨.

**Why it happens:** App Router 에서 `notFound()` 호출 없이 throw 한 에러는 모두 가장 가까운 `error.tsx` 가 catch 한다.

**How to avoid:** 클라 fetch 핸들러에서 명시적으로:
```ts
try {
  const stock = await fetchStockDetail(code, signal);
  setStock(stock);
} catch (err) {
  if (err instanceof ApiClientError && err.status === 404) {
    notFound(); // → app/stocks/[code]/not-found.tsx
    return;
  }
  setError(err);  // → app/stocks/[code]/error.tsx 는 throw 했을 때만, setState 는 in-page 표기
}
```
주의: `notFound()` 는 throw 를 일으키므로 try/catch 안에서 호출 시 catch 분기와 충돌 없음 (Next 가 internal `NEXT_NOT_FOUND` 심볼로 식별).

### Pitfall 6: ⌘K 가 textarea 에서 OS 단축키 충돌

**What goes wrong:** macOS 의 일부 input 에서 `Cmd+K` 가 OS 동작과 충돌.

**How to avoid:** `e.preventDefault()` 호출 (위 패턴에 포함됨). 또한 textarea 안에서는 단축키 활성 유지가 일반적 (Linear, Vercel, Notion 모두 동일).

### Pitfall 7: 모바일에서 Stats grid 8개가 4열로 깨짐

**What goes wrong:** `lg:grid-cols-4` 가 좁은 데스크톱 뷰포트에서 라벨 + 값 + 단위가 한 셀에 다 안 들어가 줄바꿈.

**How to avoid (R3):** `grid-cols-2 md:grid-cols-3` 만. 4열은 채택 안 함 (8 ÷ 4 = 2행 × 4열 — 라벨/값 비율 너무 좁음).

---

## Code Examples

### 예시 1: shadcn add command 산출물 윤곽

```bash
$ cd webapp && pnpm dlx shadcn@latest add command
```
생성/수정:
- `webapp/src/components/ui/command.tsx` — Command, CommandDialog, CommandInput 등 export
- `webapp/src/components/ui/dialog.tsx` — radix Dialog wrapper (CommandDialog 의존)
- `webapp/package.json` deps: `cmdk` 추가
[CITED: https://ui.shadcn.com/docs/components/command]

### 예시 2: stock-api.ts (신규)

```ts
// webapp/src/lib/stock-api.ts
import type { Stock } from '@gh-radar/shared';
import { apiFetch } from './api';

export function searchStocks(q: string, signal: AbortSignal): Promise<Stock[]> {
  const params = new URLSearchParams({ q });
  return apiFetch<Stock[]>(`/api/stocks/search?${params.toString()}`, { signal });
}

export function fetchStockDetail(code: string, signal: AbortSignal): Promise<Stock> {
  return apiFetch<Stock>(`/api/stocks/${encodeURIComponent(code)}`, { signal });
}
```
> `apiFetch` 는 timeoutMs 기본 8000ms + envelope 파싱 + ApiClientError throw [VERIFIED: webapp/src/lib/api.ts:73-156].

### 예시 3: GlobalSearch 컴포넌트 골격

```tsx
// webapp/src/components/search/global-search.tsx
'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog, Command, CommandInput, CommandList,
  CommandEmpty, CommandLoading, CommandItem
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useCmdKShortcut } from '@/hooks/use-cmdk-shortcut';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { results, loading, error } = useDebouncedSearch(query, 300);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  useCmdKShortcut(toggle);

  const handleSelect = useCallback(
    (code: string) => {
      setOpen(false);
      setQuery('');
      router.push(`/stocks/${code}`);
    },
    [router],
  );

  return (
    <>
      {/* 트리거: app-header.tsx 의 input 자리 — readonly + onClick={toggle} */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="종목명 또는 종목코드를 입력하세요"
          />
          <CommandList>
            {query.length === 0 && (
              <CommandEmpty>검색어를 입력하면 결과가 표시됩니다</CommandEmpty>
            )}
            {loading && <CommandLoading>검색 중…</CommandLoading>}
            {error && (
              <div className="px-3 py-2 text-[var(--down)]">
                검색에 실패했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            )}
            {!loading && query.length > 0 && results.length === 0 && !error && (
              <CommandEmpty>"{query}" 에 해당하는 종목이 없습니다</CommandEmpty>
            )}
            {results.map((s) => (
              <CommandItem
                key={s.code}
                value={s.code}
                onSelect={() => handleSelect(s.code)}
              >
                <span className="flex-1">{s.name}</span>
                <span className="mono text-[var(--muted-fg)]">{s.code}</span>
                <Badge variant={s.market === 'KOSPI' ? 'kospi' : 'kosdaq'}>
                  {s.market}
                </Badge>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
```
> Note: `Badge variant="kospi|kosdaq"` 가 Phase 3에 정의되어 있는지 plan 단계에서 확인 필요 — 없다면 `outline` variant + 커스텀 className.

### 예시 4: useStockDetail (전체 use client)

```tsx
// webapp/src/components/stock/stock-detail-client.tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notFound } from 'next/navigation';
import { ApiClientError } from '@/lib/api';
import { fetchStockDetail } from '@/lib/stock-api';
import type { Stock } from '@gh-radar/shared';

export function StockDetailClient({ code }: { code: string }) {
  const [stock, setStock] = useState<Stock | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsRefreshing(true);
    try {
      const data = await fetchStockDetail(code, controller.signal);
      if (controller.signal.aborted) return;
      setStock(data);
      setError(undefined);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiClientError && err.status === 404) {
        notFound();
        return;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
        setIsInitialLoading(false);
      }
    }
  }, [code]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  // 렌더 분기: isInitialLoading → Skeleton, error → ErrorCard, stock → Hero+Stats+Placeholders
  // ...
}
```

### 예시 5: em-dash 정책 헬퍼 (Pitfall 1 대응)

```tsx
// 권장 — Stats 셀 전용 wrapper
function StatValue({ value, format }: { value: number; format: 'price' | 'marketCap' }) {
  if (!Number.isFinite(value) || value <= 0) {
    return <span className="mono text-[var(--muted-fg)]">—</span>;
  }
  return <Number value={value} format={format} />;
}
```
> 적용 대상: 시가, 고가, 저가, 시가총액, 상한가, 하한가. **금지 대상**: 등락액·등락률(음수 정상), 현재가(`<= 0` 검증은 정상이지만 Hero 자체적으로 처리), 거래량·거래대금(0 정상값 — `formatTradeAmount` 가 이미 처리).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Next.js 14: `params: { code: string }` (sync) | Next.js 15: `params: Promise<{ code: string }>` | Next.js 15.0 (2024-10) | 클라 컴포넌트는 `use(params)`, 서버 컴포넌트는 `await params` [CITED: https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes] |
| 자체 keyboard navigation 구현 | cmdk + radix Dialog | cmdk 1.0+ (2023~) | ARIA 자동, focus trap 자동, ↑↓ wrap 자동 |
| Popover 기반 자동완성 | CommandDialog (modal) | shadcn 공식 가이드 (2024~) | 모바일 풀스크린 + 데스크톱 centered modal |
| client-side fuzzy filter | server search + `shouldFilter={false}` | cmdk 0.2+ | 검색 권한을 서버 SQL 에 위임 (Postgres `ilike`) |

**Deprecated/outdated:**
- Next 14 `params` 동기 접근: 15에서 비동기로 deprecation 진행 중. 새 코드는 `use()` 또는 `await`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | **vitest 2.1.9** + jsdom 29.0.2 + @testing-library/react 16.3.2 [VERIFIED: webapp/package.json:31,38,41] |
| Config file | webapp/vitest.config.ts (Phase 5 에서 도입) |
| Quick run command | `pnpm --filter @gh-radar/webapp test -- src/components/search` |
| Full suite command | `pnpm --filter @gh-radar/webapp test` |
| E2E (선택) | Playwright **미설치** — 본 phase 도입 시 deferred 권고 (vitest jsdom + msw 으로 충분) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SRCH-01 | 검색 input → 서버 호출 query 검증 (`q=삼성`) | unit (vitest + msw) | `pnpm --filter @gh-radar/webapp test src/lib/__tests__/stock-api.test.ts` | ❌ Wave 0 |
| SRCH-01 | useDebouncedSearch — 300ms 후 1회 호출, 300ms 내 재입력 시 abort | unit (vitest fake timers) | `pnpm --filter @gh-radar/webapp test src/hooks/__tests__/use-debounced-search.test.ts` | ❌ Wave 0 |
| SRCH-02 | CommandDialog 오픈/닫기, ESC, mod+k 단축키 | integration (jsdom + RTL userEvent) | `pnpm --filter @gh-radar/webapp test src/components/search/__tests__/global-search.test.tsx` | ❌ Wave 0 |
| SRCH-02 | CommandItem `onSelect` → router.push 호출 | integration (mock router) | 동상 | ❌ Wave 0 |
| SRCH-02 | 빈 결과 / 로딩 / 에러 상태 카피 노출 | integration | 동상 | ❌ Wave 0 |
| SRCH-03 | StockDetailClient — 404 응답 → notFound() 호출 | integration (mock fetchStockDetail) | `pnpm --filter @gh-radar/webapp test src/components/stock/__tests__/stock-detail-client.test.tsx` | ❌ Wave 0 |
| SRCH-03 | refresh 버튼 클릭 → 재호출, isRefreshing toggle | integration | 동상 | ❌ Wave 0 |
| SRCH-03 | em-dash 정책 — `value <= 0` 일 때 `—` 표기 | unit (snapshot) | `pnpm --filter @gh-radar/webapp test src/components/stock/__tests__/stat-value.test.tsx` | ❌ Wave 0 |
| SRCH-03 | Hero 반응형 — `text-[var(--t-h1)] md:text-[var(--t-h1)]` 적용 검증 | manual-only | Vercel preview + 모바일 뷰포트 | — |
| 접근성 | Dialog focus trap, axe 위반 0 | integration (jest-axe — 신규 도입 후보) | `pnpm --filter @gh-radar/webapp test src/components/search/__tests__/global-search.a11y.test.tsx` | ❌ Wave 0 (jest-axe 도입 검토) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @gh-radar/webapp test -- src/{lib,hooks,components}/{search,stock}` (≤ 30s)
- **Per wave merge:** `pnpm --filter @gh-radar/webapp test` (전체 webapp suite)
- **Phase gate:** 전체 suite + 수동 verification plan (06-CONTEXT §Verification Plan 1~7)

### Wave 0 Gaps

- [ ] `webapp/src/lib/__tests__/stock-api.test.ts` — searchStocks/fetchStockDetail 계약 검증 (msw 모킹)
- [ ] `webapp/src/hooks/__tests__/use-debounced-search.test.ts` — fake timers
- [ ] `webapp/src/hooks/__tests__/use-cmdk-shortcut.test.ts` — keydown 시뮬레이션
- [ ] `webapp/src/components/search/__tests__/global-search.test.tsx` — Dialog 오픈/검색/선택
- [ ] `webapp/src/components/stock/__tests__/stock-detail-client.test.tsx` — fetch + refresh + 404
- [ ] `webapp/src/components/stock/__tests__/stat-value.test.tsx` — em-dash 정책
- [ ] msw 도입 또는 vi.mock(`@/lib/api`) 패턴 결정 (Phase 5 에서 어느 패턴 채택했는지 plan 단계 확인)
- [ ] (선택) jest-axe 도입 — Dialog 접근성 자동화

---

## Open Question 권고안 (Planner 결정)

### R1. ⌘K Dialog 형태 — `CommandDialog` 채택 (Popover 거절)

**권고:** shadcn `CommandDialog` 사용. Popover 거절.

**근거:**
- shadcn 공식 docs 가 ⌘K 패턴의 표준 예제로 `CommandDialog` 명시 [CITED: https://ui.shadcn.com/docs/components/command]
- 모바일(<768px) 헤더 input 폭이 좁음 → Popover 위치 계산·overflow·키보드 가림 처리 복잡
- CommandDialog 는 radix Dialog 위에 구축되어 focus trap·ESC·outside-click·portal 자동
- Vercel/Linear/Raycast 모두 동일 패턴
- 데스크톱: 화면 중앙 모달 / 모바일: 자연스럽게 풀스크린 가까이 표시

**구현 메모:** `webapp/src/components/layout/app-header.tsx` 의 기존 `<Input disabled>` 를 `<input readOnly onClick={openDialog}>` + 시각적 단축키 힌트(우측 `⌘K` 키캡)로 교체. 별도 컴포넌트로 추출해도 되고 `GlobalSearch` 의 트리거 영역으로 통합해도 무방.

### R2. Hero 반응형 — Tailwind breakpoint 단계 채택 (clamp 거절)

**권고:** `text-[length:var(--t-h2)] md:text-[length:var(--t-h1)]` (24px → 30px) 단순 분기.

**근거:**
- UI-SPEC §Typography 가 이미 "Display 30px → 모바일 24px" 2단계 명시
- `clamp(24px, 4vw, 30px)` 은 중간 크기를 만들지만 디자인 시스템 상 4사이즈 스케일을 깬다 (UI-SPEC: "사이즈 총개수 4")
- Tailwind 4의 임의값 syntax `text-[length:var(--t-h1)]` 가 Phase 3 토큰을 참조하므로 토큰 단일 진리원 유지

**거절 이유 (clamp):** 디자인 토큰 우회 + Display/Heading 의 의미 경계 흐려짐 + UI-SPEC 4사이즈 규약 위배.

### R3. Stats grid 열 수 — `grid-cols-2 md:grid-cols-3` 채택 (4열 거절)

**권고:** `grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6` (UI-SPEC s-4/s-5 토큰).

**8필드 분포:**
- 모바일 (2열): 4행 = 시가/고가, 저가/거래량, 거래대금/시총, 상한가/하한가
- 태블릿+ (3열): 3행 = 첫 2행 3개 + 마지막 행 2개 (또는 정확히 분배)

**4열 거절 이유:**
- 라벨(`시가총액` 4글자) + 값(`350.4 조원` 6글자) 이 Card 좁은 폭에서 줄바꿈
- Card padding 16px + gap 24px 고려 시 lg(1024px+) 에서도 셀폭 200px 미만 — 가독성 저하
- 8 ÷ 3 = 깔끔하지 않지만 마지막 행 2개 또는 빈 셀 한 개로 처리 (마지막 셀 빈 칸 권고: 시각적 위계 자연스러움)

**대안:** 만약 디자이너가 마지막 빈 셀 싫다면 `lg:grid-cols-4` 추가 가능 — 단, lg 에서만 활성. **최종 권고는 `grid-cols-2 md:grid-cols-3` (lg 미적용)** — 단순성 우선.

### R4. page.tsx 서버/클라이언트 경계 — 전체 `'use client'` 채택

**권고:** `app/stocks/[code]/page.tsx` 는 `'use client'` + `use(params)` 패턴.

**근거:**
- Phase 5 ScannerClient 와 일관성 (둘 다 클라 fetch + refresh 버튼)
- 06-CONTEXT D6 명시: "Fetch 흐름: 클라이언트 페이지(`'use client'`) — apiFetch 오류 envelope 사용"
- 서버 fetch 시 `apiFetch` 가 8s 타임아웃 + Cloud Run cold start 지연 → 첫 페인트 지연 증가
- SEO 필요성 낮음 (인증 무관 단일 종목 페이지지만 검색 트래픽 유입 우선순위 v1 범위 외)
- 서버 + 클라 hybrid 시 hydration 미스매치 위험 (lastUpdatedAt 등 시간값)

**거절 이유 (서버 컴포넌트 + Suspense):** Phase 5 와 다른 패턴 도입 → 멘탈 오버헤드. 서버 컴포넌트 fetch 시 에러 → `error.tsx` 만 사용 가능 (in-page 재시도 버튼 + 데이터 보존 어려움).

**대안:** 만약 v2 SEO 가 필요해지면 `generateMetadata` 만 서버에서 `<title>{name} ({code}) | gh-radar</title>` 정도 처리 + 본 컨텐츠는 클라.

### R5. cmdk 의존성 크기 — 무시 가능한 수준

**권고:** 추가 정당화 불필요. 단일 의존성 채택.

**번들 임팩트 분석 (2026-04-15 기준):**
- `cmdk@1.1.1` 자체: bundlephobia 미정확 측정이지만 historical 수치로 ~10-15kb gzipped
- transitive deps (`@radix-ui/react-dialog@1.1.6`, `@radix-ui/react-id`, `@radix-ui/react-primitive`, `@radix-ui/react-compose-refs`): radix 는 이미 `radix-ui@1.4.3` 메타 패키지로 webapp 에 포함 [VERIFIED: webapp/package.json:20] → 실제 추가량은 cmdk 본체 + react-dialog primitive 일부 (~20kb gzipped 전후)

**결론:** Phase 6 이 검색 기능의 핵심 가치를 제공하므로 20kb 가량은 합당. SWR 추가(~14kb) 대비 더 높은 가치/kb 비율. 추가 검증 불필요.

[VERIFIED: npm view cmdk 1.1.1 dependencies, 2026-04-15]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | cmdk@1.1.1 의 정확한 gzipped 번들 크기는 ~10-15kb | R5 | bundlephobia 실측이 다를 수 있음. 실측 명령: `pnpm --filter @gh-radar/webapp build && du -h .next/static/chunks/*.js` 로 검증 가능. 무시 가능 수준일 것이라는 결론은 유지. |
| A2 | Phase 3 `Badge` 가 `variant="kospi"\|"kosdaq"` 를 보유 | 코드 예시 3 | 미보유 시 `outline` + 커스텀 className. plan 단계에서 `webapp/src/components/ui/badge.tsx` 확인 필요. |
| A3 | Phase 5 가 vitest 테스트 패턴(msw vs vi.mock) 중 어느 것을 채택했는지 | Validation Architecture | 둘 다 가능 — Phase 5 패턴 일치가 권고. plan 단계에서 `webapp/vitest.config.ts` 와 기존 테스트 파일 확인. |
| A4 | 사용자가 4열 grid 를 원하지 않는다 | R3 | 디자이너가 4열 선호 시 `lg:grid-cols-4` 추가 — 본 phase 범위 내 변경 가능. |
| A5 | "한국 주식 가격은 1원 이상이므로 `<= 0` em-dash 분기는 안전" | Pitfall 1 / 코드 예시 5 | 한국 거래소 호가단위 최소가격은 1원 (KOSPI/KOSDAQ 모두). 정상값과 충돌 없음. 단, 상장폐지·거래정지 종목 가격 0 표기는 비즈니스적으로 em-dash 가 더 정직 — 정책적으로도 OK. |
| A6 | `app-header.tsx` 의 기존 `<Input disabled>` 를 readOnly + onClick 으로 변경하는 것이 디자인 회귀 없음 | R1 | UI-SPEC Copywriting 카피 "종목명 또는 코드 검색 ⌘K" 적용 시 기존 placeholder("종목 검색 (Phase 6)") 교체 필요. 디자인 토큰은 동일. |

---

## Open Questions

1. **`webapp/vitest.config.ts` 의 모킹 패턴 (msw vs vi.mock)**
   - 알려진 것: webapp 에 vitest + jsdom + RTL 설치됨
   - 불명확한 것: Phase 5 가 실제로 어떤 fetch 모킹 패턴을 채택했는지 (RESEARCH 미확인)
   - 권고: plan 단계에서 `webapp/src/components/scanner/__tests__/` 디렉토리 확인 후 일치
2. **Badge 마켓 variant 보유 여부**
   - 알려진 것: Phase 3 `Badge` 에 `up/down/flat` variant 존재
   - 불명확한 것: KOSPI/KOSDAQ 전용 variant 또는 색상 토큰 존재 여부
   - 권고: plan 단계에서 `webapp/src/components/ui/badge.tsx` 확인. 미보유 시 `outline` + 텍스트만 (마켓 색상은 의미 색상 토큰 점유 금지)
3. **헤더 input 트리거 — 별도 컴포넌트 분리 vs GlobalSearch 통합**
   - 본 리서치 권고: GlobalSearch 컴포넌트 안에 트리거 + Dialog 모두 포함 (단일 책임). app-header.tsx 는 `<GlobalSearch />` 를 `nav` prop 으로 넘김
   - 대안: SearchTrigger / GlobalSearchDialog 2개 분리 (트리거가 다른 곳에서도 필요해질 때)
   - 결정 보류 — plan 단계 구현 편의로 결정
4. **`generateStaticParams` 도입 여부**
   - 알려진 것: 종목 목록은 `stocks` 테이블에서 가져올 수 있음 (~수천 종목)
   - 권고: **도입 안 함**. 종목 데이터가 자주 변하고 (신규 상장/상폐), 빌드 시 Supabase 호출 → 빌드 시간 증가. 클라 fetch 가 더 단순.

---

## Environment Availability

본 phase 는 외부 도구 의존성이 없다 (전체 npm 생태계 + 이미 설치된 webapp 워크스페이스만 사용).

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| pnpm | shadcn add command | ✓ (workspace) | — | — |
| Node 22 LTS | Next 15 빌드 | ✓ | .nvmrc 22 [VERIFIED] | — |
| webapp Cloud Run API base | apiFetch 호출 | ✓ | NEXT_PUBLIC_API_BASE_URL (Phase 4 D-15) | localhost:8080 fallback (apiFetch 내장) |

외부 시스템 신규 의존 없음. **Step 2.6 추가 작업 불필요.**

---

## Sources

### Primary (HIGH confidence)

- shadcn/ui Command docs — https://ui.shadcn.com/docs/components/command (CommandDialog API, mod+k 패턴)
- cmdk official GitHub — https://github.com/pacocoursey/cmdk (`shouldFilter={false}` 서버 검색 가이드)
- Next.js 15 Dynamic Routes — https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes (params Promise, `use(params)`, useParams)
- 코드베이스 직접 검증:
  - `server/src/routes/stocks.ts` — `/api/stocks/search`, `/api/stocks/:code` 계약
  - `server/src/mappers/stock.ts` — nullable → 0 변환 (Pitfall 1 근거)
  - `webapp/src/lib/api.ts` — apiFetch + ApiClientError 시그니처
  - `webapp/src/components/scanner/scanner-client.tsx` — Phase 5 클라 패턴
  - `webapp/src/hooks/use-polling.ts` — AbortController + ref 패턴
  - `webapp/src/components/ui/number.tsx` — 5종 format
  - `webapp/src/lib/format.ts` — formatTradeAmount 0/null → '-' 처리
  - `webapp/src/app/scanner/page.tsx` — `dynamic = 'force-dynamic'` + Suspense
  - `webapp/src/app/{not-found,error}.tsx` — App Router 폴백 패턴
  - `webapp/components.json` — radix-nova 프리셋 + tsx + RSC
- npm registry — `npm view cmdk version|peerDependencies|dependencies` (2026-04-15)

### Secondary (MEDIUM confidence)

- 06-CONTEXT.md, 06-UI-SPEC.md (잠금된 사용자 결정)
- Phase 5 CONTEXT (선행 약속: `/stocks/[code]`, ko-KR/Asia/Seoul 포맷)
- Phase 3/4 산출물 인덱스 (디자인 토큰 + AppShell + apiFetch 계약)

### Tertiary (LOW confidence)

- cmdk 정확한 gzipped 사이즈 (bundlephobia 미직접 조회) — A1 로깅
- "사용자가 4열 grid 를 원하지 않는다" 가정 — A4 로깅

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry 직접 verify, shadcn 공식 docs, 코드베이스 직접 read
- Architecture: HIGH — Phase 5 ScannerClient 패턴 코드 직접 read 후 일치 확인
- Pitfalls: HIGH — Pitfall 1 (mapper null→0) 은 코드베이스 직접 발견, Pitfall 2 (cmdk shouldFilter) 는 공식 docs 인용
- Open question 권고 (R1~R5): HIGH — 모두 공식 패턴 + 잠금된 결정 + 코드베이스 일관성 근거

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (cmdk/Next.js 마이너 릴리스 빠른 편 — 30일 후 재검증 권고)
