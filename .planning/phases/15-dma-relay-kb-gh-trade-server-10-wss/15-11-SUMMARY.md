---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 11
subsystem: webapp-stock-detail
tags: [ui, tabs, routing, regression-e2e, shadcn]
requires:
  - "webapp AppShell (`main.overflow-auto p-6`) — sticky 탭 바의 스크롤 컨테이너"
  - "Phase 6/7/8/9.2/10/11/12 종목상세 섹션 7종 (재배치 대상, 내용 무변경)"
provides:
  - "StockDetailTabs — `?tab=` URL 동기화 4탭 셸 (chart|orderbook|info|news)"
  - "`호가주문` 탭 넓은 패널 자리 — 15-13 이 StockOrderbookSection 으로 채운다"
  - "webapp/src/components/ui/tabs.tsx — shadcn 공식 Radix Tabs primitive"
  - "탭 회귀 E2E 9건 — 이후 plan 이 섹션을 옮길 때의 안전망"
affects:
  - "webapp/src/app/stocks/[code]/page.tsx — 폭 제한이 페이지 → 탭 패널로 이동"
  - "종목상세를 진입점으로 쓰는 기존 E2E 6개 spec — `?tab=` 경유로 갱신"
tech-stack:
  added: []
  patterns:
    - "URL 이 탭 상태의 단일 진실 — 로컬 state 없이 `useSearchParams()` 파생값만 사용"
    - "화이트리스트 파싱 폴백 — 쿼리스트링 입력이 렌더 경로에 직접 들어가지 않는다"
    - "sticky 바 full-bleed — `-mx-6 px-6` 로 스크롤 컨테이너 패딩을 가로질러 덮는다"
key-files:
  created:
    - webapp/src/components/ui/tabs.tsx
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/e2e/specs/stock-detail-tabs.spec.ts
  modified:
    - webapp/src/components/stock/stock-detail-client.tsx
    - webapp/src/app/stocks/[code]/page.tsx
    - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
    - webapp/e2e/specs/stock-detail-chart.spec.ts
    - webapp/e2e/specs/stock-detail.spec.ts
    - webapp/e2e/specs/news.spec.ts
    - webapp/e2e/specs/discussions.spec.ts
    - webapp/e2e/specs/theme-chips.spec.ts
decisions:
  - "탭 상태를 `useState` 로 이중화하지 않고 `?tab=` 파생값만 사용 — 딥링크·뒤로가기가 추가 코드 없이 성립"
  - "`호가주문` 패널에 `px-[var(--s-5)]` 를 넣지 않음 — AppShell `main` 의 p-6 이 이미 24px 이라 중복 시 48px 이 되어 T6 계약 위반"
  - "갱신 실패 안내를 탭 밖 공통 영역으로 이동 — 종목정보 탭 안에 두면 다른 탭에서 실패를 볼 수 없다"
  - "토론 섹션 E2E 단언은 testid 접두 매칭 — 선재 픽스처 결함과 재배치 회귀 검증을 분리"
metrics:
  duration: "~24분"
  completed: 2026-09-05
  tasks: 3
  commits: 3
  files_changed: 12
---

# Phase 15 Plan 11: 종목상세 4탭 재구성 Summary

종목상세 `/stocks/[code]` 를 히어로(공통) + 상단 4탭 `차트 · 호가주문 · 종목정보 · 뉴스토론` 으로 재구성하고, 기존 7개 섹션을 **내용 무변경**으로 탭 안에 재배치한 뒤 회귀 E2E 9건으로 증명했다.

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `webapp/src/components/ui/tabs.tsx` | shadcn 공식 registry `tabs` (Radix Tabs). 신규 npm 의존성 0 |
| `webapp/src/components/stock/stock-detail-tabs.tsx` | 4탭 셸 — `?tab=` 동기화 · sticky 탭 바 · 패널별 컨테이너 폭 |
| `stock-detail-client.tsx` | 7개 기존 섹션을 탭 패널 prop 으로 재배치 + 호가주문 placeholder |
| `page.tsx` | 페이지 폭 제한 해제 (폭은 이제 탭 패널이 소유) |
| `stock-detail-tabs.spec.ts` | 탭 회귀 E2E 9건 |

## UI-SPEC 확정값 이행 (T1~T7)

| # | 계약 | 이행 |
|---|------|------|
| T1 | 히어로·갱신행은 탭 밖 | 최상위 `space-y-6` 의 자식 1·2번, E2E 9번 케이스가 모든 탭에서 노출 단언 |
| T2 | 탭 순서·라벨 고정(띄어쓰기 없음) | `TABS` 상수, `호가 주문` 공백형 0건 |
| T3 | `?tab=`, 기본 `chart`, `router.push` | `useSearchParams` 파생값 + `router.push(..., {scroll:false})`. `router.replace` 0건 |
| T4 | sticky 탭 바, 라벨에 상태 표식 없음 | `sticky top-0 z-20 -mx-6 px-6`, 배지·점 미부착 |
| T5 | shadcn 공식 tabs 신규 설치 | 설치 완료, `components.json.registries` 는 `{}` 유지 |
| T6 | `호가주문` 만 넓은 컨테이너 | 3탭 `max-w-4xl`, orderbook 은 `w-full` (24px 여백은 `main` 의 p-6) |
| T7 | 기존 섹션 내용 무변경 | 섹션 컴포넌트 파일 8개 `git diff` 0줄 |

## 검증 결과

| 검증 | 결과 |
|------|------|
| `pnpm --filter webapp run typecheck` | exit 0 |
| `pnpm --filter webapp run build` | exit 0 (`/stocks/[code]` 21.5 kB) |
| `pnpm --filter webapp test` | 38 files / 292 passed, 1 skipped |
| `playwright test stock-detail-tabs stock-detail-chart` | 13 passed |
| `playwright test stock-detail.spec news theme-chips a11y chat` | 전부 green |
| `webapp/package.json` 무변경 | 0줄 (신규 npm 의존성 없음) |
| 기존 섹션 컴포넌트 8파일 무변경 | 0줄 |

E2E 는 worktree 에 dev 서버(PORT=3100)를 띄워 실행했다. `setup` 프로젝트는 `E2E_TEST_PASSWORD` 가 없어 `--no-deps` + 기존 `storageState` 재사용으로 우회했다(세션 유효 확인됨).

## 계획과의 차이 (Deviations)

### 1. [Rule 1 - Bug] shadcn CLI 가 가짜 `cn` npm 패키지를 추가 — 되돌림

- **발견:** Task 1, `npx shadcn@latest add tabs` 직후
- **문제:** CLI 가 `import { cn } from "cn"` 을 생성하고 `webapp/package.json` 에 `"cn": "^0.2.5"` 를 추가했다. 이 저장소에서 `cn` 은 `@/lib/utils` 의 로컬 헬퍼이지 npm 패키지가 아니다. 별칭 해석 실패로 **의도치 않은 외부 패키지가 설치**됐다 — T-15-SC(공급망 표면) 가 막으려던 바로 그 상황.
- **조치:** `package.json` · `pnpm-lock.yaml` revert → `pnpm install --frozen-lockfile` 로 `node_modules` 에서 `cn@0.2.5` prune → import 를 `@/lib/utils` 로 교정 (`toggle-group.tsx` 규약).
- **결과:** acceptance `git diff --name-only webapp/package.json` = 0줄 충족.
- **커밋:** `4d79194`

### 2. [Rule 1 - Bug] CLI 산출 `data-active:` 변형이 이 저장소에서 죽은 스타일 — 정규화

- **문제:** 생성된 `tabs.tsx` 는 `data-active:bg-background` 형태를 쓰나, Radix 는 `data-state="active"` 를 발행하고 globals.css 에 `data-active` custom variant 가 없다 → 활성 탭 스타일이 전혀 적용되지 않는다. 저장소의 다른 primitive(`toggle`, `switch`, `table`)는 모두 `data-[state=...]` 를 쓴다.
- **조치:** `data-active:` → `data-[state=active]:` 일괄 정규화. plan 의 "아니면 `toggle-group.tsx` 규약에 맞춘다" 지시 범위.
- **커밋:** `4d79194`

### 3. [Rule 3 - Blocking] 워크트리에 `@gh-radar/shared` 빌드 산출물 부재

- **문제:** fresh 워크트리라 `packages/shared/dist` 가 없어 `typecheck` 가 17개 모듈 해석 실패.
- **조치:** `pnpm --filter @gh-radar/shared run build` 선행. 저장소 변경 없음.

### 4. [Rule 2 - 계약 정합] `호가주문` 패널에 `px-[var(--s-5)]` 미적용

- plan 문구는 `w-full px-[var(--s-5)]`(좌우 24px)였으나, AppShell `main` 이 이미 `p-6`(24px)을 준다. 그대로 넣으면 **48px** 이 되어 괄호 안 계약("좌우 여백 24px")을 스스로 위반한다.
- **조치:** `w-full` 만 적용 — 실효 여백 24px 로 T6 의 의도값을 맞췄다. 주석에 근거 명시.

### 5. [Rule 1 - Bug] 재배치로 깨진 기존 테스트 갱신

재배치가 직접 원인인 실패를 검증 의도를 바꾸지 않고 고쳤다.

| 파일 | 조치 |
|------|------|
| `stock-detail-client.test.tsx` | `useSearchParams` stub 추가(없어 3건 실패) + 뉴스·토론 단언을 `tab=news` 경유로. 4탭/기본탭/미지 값 폴백/호가주문 패널 케이스 4건 추가 |
| `news.spec.ts` · `discussions.spec.ts` | 상세 진입 URL 에 `?tab=news` |
| `theme-chips.spec.ts` | `?tab=info` |
| `stock-detail.spec.ts` | 통계 → `종목정보` 탭, 뉴스·토론 → `뉴스토론` 탭 경유로 분리 |
| `stock-detail-chart.spec.ts` | `Hero < Chart < Stats` 순서 단언 → `Hero < Chart` + "차트 탭에 통계 없음 / 종목정보 탭에 있음" 로 재구성 |

### 6. [범위 밖] 선재 결함 2건 — `deferred-items.md` 기록

- **토론 E2E 픽스처 구계약:** `mockDiscussionsApi` 가 배열을 반환하나 클라이언트 계약은 `{ items, hasMore }`. base 커밋 소스로 되돌려도 재현되며, 15-11 이 건드리지 않은 풀페이지 라우트 테스트도 같이 실패한다. **고치지 않았다** — 대신 탭 회귀 단언만 데이터 상태와 무관한 testid 접두 매칭으로 처리.
- **`getByLabel('일봉 차트')` strict mode violation:** 스켈레톤의 `일봉 차트 로딩 중` 이 substring 매칭에 걸려 2개 요소로 해석. base 에서도 재현. Task 3 acceptance 가 `stock-detail-chart` green 을 직접 요구하므로 **로케이터 정밀화(`exact: true`)만** 적용했다 — 단언 의도는 불변.

## 위협 모델 이행

| Threat ID | 이행 |
|-----------|------|
| T-15-37 (Tampering, `?tab=`) | `toTabValue()` 화이트리스트 폴백. 단위 1건 + E2E 1건이 `?tab=zzz` → `chart` 단언 |
| T-15-SC (공급망) | 1st-party registry 만 사용, `registries: {}` 유지, 신규 npm 의존성 0. **CLI 가 몰래 추가한 `cn@0.2.5` 를 탐지·제거** |
| T-15-38 (회귀) | 섹션 파일 8개 diff 0줄 + 탭별 렌더 E2E 9건 + 기존 spec 재실행 green |
| T-15-39 (컨텍스트 손실) | `notFound` state 승격 · `setStockContext` 발행/해제 · 스켈레톤 2경로 전부 보존, 각 지점에 "재배치 중 보존" 주석. chat.spec 의 FAB 라벨 테스트로 실증 |

## Known Stubs

| 위치 | 내용 | 해소 |
|------|------|------|
| `stock-detail-client.tsx` `StockOrderbookPlaceholder` | `호가주문` 탭 패널이 `실시간 호가는 준비 중이에요` 안내 박스 | **15-13** 이 `StockOrderbookSection` 으로 교체 |

의도된 stub 이다. plan 이 명시적으로 요구했고(UI-SPEC C1: 섹션을 숨기지 않는다), 탭 셸이 먼저 서야 15-13 이 패널을 채울 수 있다.

## 다음 plan 을 위한 메모

- 15-13 은 `stock-detail-client.tsx` 의 `orderbook={<StockOrderbookPlaceholder />}` 한 줄만 교체하면 된다. 패널 폭(`w-full`, max-w 해제)은 이미 준비돼 있다.
- 탭 패널은 Radix 기본 동작상 **비활성 시 언마운트**된다. 호가창의 wss 연결은 `호가주문` 탭에서만 살아 있게 되며, 탭 이탈 시 정리(cleanup)가 자동으로 불린다 — 연결 수명 설계 시 이 점을 전제로 할 것.
- 종목상세를 진입점으로 쓰는 새 E2E 는 대상 섹션의 탭을 `?tab=` 으로 지정해야 한다.

## Self-Check: PASSED

- 생성 파일 3종 존재 확인 (`ui/tabs.tsx`, `stock/stock-detail-tabs.tsx`, `e2e/specs/stock-detail-tabs.spec.ts`)
- 커밋 3건 존재 확인 (`4d79194`, `ee0ba2c`, `d427d63`)
- 위 검증 표의 명령 전부 실제 실행 결과
