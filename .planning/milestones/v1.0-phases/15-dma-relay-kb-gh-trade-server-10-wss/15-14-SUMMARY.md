---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 14
subsystem: webapp-orderbook-verification
tags: [testing, e2e, playwright, relay, wss, fixtures, env]
status: complete

# Dependency graph
requires:
  - phase: 15-13
    provides: "StockOrderbookSection / OrderbookLadder / TradeTape — 컴포넌트 테스트 대상"
  - phase: 15-18
    provides: "OrderPanel / AccountPanel — 섹션 안에 함께 마운트되는 우측 컬럼"
  - phase: 15-12
    provides: "useRelaySocket + relay-url.ts(.trim 폴백) — 스텁 대상 + wss URL 해석"
  - phase: 15-05
    provides: "relay/src/index.ts 부팅 결선 — E2E 픽스처가 실제로 spawn 하는 프로세스"
  - phase: 15-02
    provides: "relay/tests/helpers/fake-gateway.ts + frames.ts — 재사용한 스텁 게이트웨이"
provides:
  - "webapp/src/components/stock/__tests__/orderbook.test.tsx — 호가창 섹션 계약 13건"
  - "webapp/e2e/fixtures/relay.ts — withLocalRelay(): 로컬 relay 프로세스 + 스텁 게이트웨이 + 스텁 Supabase"
  - "webapp/e2e/specs/orderbook.spec.ts — 브라우저 wss 왕복 7케이스(실서버 미접속)"
  - "e2e 종목 픽스처의 isin — 호가창 E2E 가 게이트가 아닌 **연결 경로**를 탄다"
  - "playwright.config 의 허용 목록 env 로더 — 서비스롤 키를 dev 런타임에 주입하지 않는다"
  - "webapp/README.md — NEXT_PUBLIC_* 환경변수 표 + paste 개행 검증 절차"
affects:
  - "15-19/검증 wave — 호가창 회귀는 이제 `playwright test orderbook` 하나로 잡힌다"
  - "Vercel 프로덕션 — NEXT_PUBLIC_RELAY_WS_URL=wss://dma.jx1.io/ws 가 Production+Preview 에 등록·배포 완료. 이후 프론트 배포는 이 값을 인라인한다"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E 가 실서버 대신 **자기 relay 프로세스**를 띄운다 — 중간층을 가짜로 채우면 통합 증명이 아니다"
    - "Supabase 도 로컬 HTTP 스텁 — allowlist 있음/없음을 메모리에서 전환해 실 DB 무오염"
    - "스텁 게이트웨이는 **한 벌만** 유지 — 파싱 헬퍼를 relay 쪽에 추가해 flatbuffers 를 패키지 안에 가둔다"
    - "고정 포트가 필요한 spec 은 `test.describe.configure({ mode: 'serial' })` 로 워커 경합을 막는다"
    - "env 파일 로드는 허용 목록 — 통째 로드는 webServer 상속을 통해 시크릿을 런타임에 흘린다"

key-files:
  created:
    - webapp/src/components/stock/__tests__/orderbook.test.tsx
    - webapp/e2e/fixtures/relay.ts
    - webapp/e2e/specs/orderbook.spec.ts
    - webapp/README.md
  modified:
    - webapp/playwright.config.ts
    - webapp/e2e/fixtures/stocks.ts
    - webapp/.env.local.example
    - relay/tests/helpers/fake-gateway.ts
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/deferred-items.md

key-decisions:
  - "E2E 가 relay 를 **진짜로 spawn** 한다(`tsx relay/src/index.ts`). WsFanout 을 테스트 하네스로 재조립하면 부팅 결선·경로 라우팅·포트 분리가 검증 밖으로 빠지고, 그 지점이 15-05 의 실제 위험 구간이다"
  - "Supabase 를 스텁으로 세웠다 — 실 프로젝트를 쓰면 allowlist 있음/없음 전환이 **실 DB 쓰기**가 되고, 테스트 실패가 곧 DB 오염으로 남는다. 토큰 서명 검증은 이 E2E 의 관심사가 아니며 relay 단위 테스트가 이미 4케이스로 잠근다"
  - "relay wss 포트를 고정 8090 으로 뒀다 — `NEXT_PUBLIC_*` 은 빌드 시점 인라인이라 임의 포트를 주입할 수 없다. `relay-url.ts` 의 폴백이 같은 문자열이라 dev 서버 재사용 여부와 무관하게 같은 URL 로 수렴한다"
  - "`fullyParallel: true` 저장소에서 고정 포트를 쓰므로 spec 을 serial 로 고정했다. 안 하면 워커 2개가 8090 을 동시에 잡아 EADDRINUSE 로 무작위 실패한다"
  - "`playwright.config` 의 env 로더는 **허용 목록**이다 — `webServer` 가 부모 env 를 상속하므로 통째 로드는 `SUPABASE_SERVICE_ROLE_KEY` 를 Next dev 런타임에 주입한다(SETUP.md §3 이 명시 금지)"
  - "회선 단절 케이스는 소켓만 끊지 않고 **게이트웨이 listen 까지 내린다** — 소켓만 끊으면 1초 뒤 재접속에 성공해 `재접속 중` 창이 1초짜리 경주가 된다"
  - "비로그인 케이스는 '호가주문 탭의 로그인 안내' 가 아니라 **middleware 의 /login 리다이렉트**를 단언한다 — `/stocks/*` 는 공개 경로가 아니다(제품 실제 동작)"

patterns-established:
  - "통합 E2E 의 스텁 경계는 '이 plan 이 증명하려는 경로 밖' 에만 둔다 — relay·게이트웨이 왕복은 진짜, 그 바깥(Supabase 서명 검증)만 가짜"
  - "테스트가 실계좌 표면에 닿을 수 있으면 기본값이 아니라 **명시 + grep 검사** 두 겹으로 막는다"

requirements-completed: [RELAY-01]

# Metrics
duration: 55min
completed: 2026-09-06
tasks: 3
commits: 5
---

# Phase 15 Plan 14: 호가창 컴포넌트 테스트 + wss 왕복 E2E Summary

**호가창을 두 층에서 자동 검증으로 잠갔다 — 훅만 스텁한 섹션 계약 13건, 그리고 진짜 브라우저가 진짜 relay 프로세스를 거쳐 스텁 게이트웨이까지 왕복하는 E2E 7건. `NEXT_PUBLIC_RELAY_WS_URL=wss://dma.jx1.io/ws` 는 Production+Preview 에 등록·배포됐고, 개행 오염 없음이 프로덕션 번들 바이트 대조까지 3중으로 확인됐다.**

## 진행 상태

| Task | 내용 | 상태 |
|------|------|------|
| 1 | 호가창 컴포넌트 테스트 | ✅ 완료 (`e2596a8`) |
| 2 | E2E 픽스처 + `orderbook.spec.ts` | ✅ 완료 (`70765be`) |
| 3 | Vercel `NEXT_PUBLIC_RELAY_WS_URL` 등록 + 프로덕션 확인 | ✅ 완료 — 문서 `f985a26`, env 등록·배포·검증은 오케스트레이터 실행(아래 §Task 3) |

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `webapp/src/components/stock/__tests__/orderbook.test.tsx` | 섹션 계약 13건. `useRelaySocket` 만 `importOriginal` 스텁 — 네트워크·타이머 0 |
| `webapp/e2e/fixtures/relay.ts` | `withLocalRelay()` — 스텁 게이트웨이(15-02 재사용) + 스텁 Supabase + `tsx relay/src/index.ts` 프로세스. `seedDmaCredential` / `clearDmaCredentials` / `setRespondingExchanges` / `requestLog` / `stop` |
| `webapp/e2e/specs/orderbook.spec.ts` | 브라우저 wss 왕복 7케이스 (serial) |
| `webapp/e2e/fixtures/stocks.ts` | `StockDetailResponse` 로 타입 좁힘 + `isin` / `upperLimitProximity` 충전 (15-13 deferred 해소) |
| `webapp/playwright.config.ts` | `.env.test.local` / `.env.local` **허용 목록** 로더 + `webServer.env` 에 `NEXT_PUBLIC_RELAY_WS_URL` |
| `relay/tests/helpers/fake-gateway.ts` | `readQuoteRequestKey()` 추가 — 시세 요청(28/32)의 구독 키 파싱 |
| `webapp/README.md` (신설) | `NEXT_PUBLIC_*` 4종 표 + paste 개행 사고 방지 절차 + 수동 배포 메모 |

## E2E 구조 (D-27 / D-40)

```
  브라우저(Chromium)
        │ ws://localhost:8090/ws          ← NEXT_PUBLIC_RELAY_WS_URL / relay-url 폴백
        ▼
  relay (tsx relay/src/index.ts, 진짜 프로세스)
        │ TCP 127.0.0.1:<임의>            ← DMA_HOST 명시(T-15-25 기본값에 기대지 않는다)
        ▼                                  │ HTTP 127.0.0.1:<임의>
  스텁 DMA 게이트웨이 (15-02 fake-gateway)  └─→ 스텁 Supabase (auth/v1/user · rest/v1/dma_credentials)
```

- **실서버·KB 게이트웨이·Cloud Run·VM 어디에도 접속하지 않는다.** `grep -rn '10.41.…' webapp/e2e/` = **0건**.
- 주문은 한 건도 내지 않는다 — 이 spec 은 조회 표면만 다룬다.
- 게이트웨이는 업무 로직이 없으므로 "구독하면 호가가 온다" 를 픽스처가 지시한다:
  relay 가 0→1 전이에서 보내는 `GetQuoteReq(28)` / `GetTradeTapeReq(32)` 를 보고 그 키로 스냅샷을 되돌린다.
  덕분에 **화면에 숫자가 뜬다는 것이 곧 구독 왕복이 성립했다는 증거**가 된다.

## must_haves 이행

| 계약 | 이행 |
|------|------|
| SC-7 컴포넌트 테스트가 10단 렌더·거래소 토글·상태 배지·게이트·빈 상태를 증명 | 13건 — ①20행+`.mono` ②단계-최대 정규화(누적 반례 포함) ③클릭이 구분을 안 바꿈 ④roving tabindex ⑤토글이 훅까지 전달 ⑥NXT 빈 상태 ⑦unauthorized 게이트 ⑧isin null 게이트 ⑨호가 없음 ⑩체결 없음 ⑪stale 유지 ⑫`▲ 매수`/`▼ 매도` ⑬배지 4종 verbatim |
| SC-7 / D-40 Playwright E2E 가 **로컬 relay + 스텁 게이트웨이** 위에서 wss 왕복을 증명 | 7케이스 green. 인증 → 상태 프레임 → `sub` → `GetQuoteReq` → 스냅샷 → 팬아웃 → 사다리 렌더가 한 줄로 이어진다 |
| SC-7 비로그인·권한 없음 사용자가 게이트를 보고 기존 탭은 그대로 | 케이스 5(매핑 없음 → 게이트 + `?tab=chart` 정상) · 케이스 7(비로그인 → `/login` 리다이렉트 + wss 미시도) |
| SC-7 / D-41 Vercel 프로덕션 env 설정 + 개행 없음 검증 | ✅ Production+Preview 2행 등록. 마지막 바이트 `73`(=`s`), 19바이트, 프로덕션 chunk 에 `\n` 오염 0건 — **로컬 빌드 산출물과 바이트 동일**(`cmp`). 절차는 `webapp/README.md` |

## acceptance_criteria 실측

| 검사 | 요구 | 실측 |
|------|------|------|
| `pnpm --filter webapp test orderbook` | exit 0, 12+ | **exit 0 · 13 passed** (신규 파일 기준) |
| `grep -c '실시간 호가·주문 권한이 없어요' …/orderbook.test.tsx` | ≥1 | **2** |
| `grep -c '▲ 매수' …/orderbook.test.tsx` | ≥1 | **3** |
| `grep -c 'isStale' …/orderbook.test.tsx` | ≥1 | **6** |
| `grep -c 'export async function withLocalRelay' e2e/fixtures/relay.ts` | ==1 | **1** |
| `grep -c 'seedDmaCredential' e2e/fixtures/relay.ts` | ≥1 | **5** |
| `grep -c '10.41.…' e2e/fixtures/relay.ts e2e/specs/orderbook.spec.ts` | ==0 | **0 / 0** (`webapp/e2e/` 전체도 0) |
| `grep -c '실시간 호가·주문 권한이 없어요' e2e/specs/orderbook.spec.ts` | ≥1 | **1** |
| `grep -c 'storageState' e2e/specs/orderbook.spec.ts` | ≥1 | **2** |
| `playwright test orderbook` | exit 0, 6 케이스 | **exit 0 · 7 케이스** (NXT 를 "렌더" 와 "빈 상태" 로 분리) |
| `playwright test` 전체가 hang 없이 종료 | 필수 | **56.9s 에 정상 종료** — 잔여 relay 프로세스 0, :8090 free |
| `grep -c 'NEXT_PUBLIC_RELAY_WS_URL' webapp/README.md` | ≥1 | **2** |

## 검증 결과

| 검증 | 결과 |
|------|------|
| `pnpm --filter webapp test` | 45 files / **380 passed**, 1 skipped (15-18 기준 44/367 → +1 file / +13) |
| `pnpm --filter webapp run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay test` | 13 files / **202 passed** — 회귀 0 |
| `pnpm --filter @gh-radar/relay run typecheck` / `typecheck:tests` | exit 0 / exit 0 |
| `playwright test orderbook stock-detail-tabs` | **17 passed** (setup 포함) |
| `playwright test` (전체) | 68 passed / 9 skipped / **11 failed — 전부 선재**(아래) |
| e2e 신규 파일 tsc 단독 검사 | exit 0 (`relay.ts` · `orderbook.spec.ts` · `stocks.ts` · `playwright.config.ts`) |

### 전체 Playwright 11건 실패 = 전부 선재

| 실패 | 원인 | 근거 |
|------|------|------|
| `discussions.spec.ts` 6건 + `discussion-filter.spec.ts` 4건 | `mockDiscussionsApi` 가 `{items,hasMore}` 이전 계약(배열)을 반환 | 15-11 이 `deferred-items.md` 에 이미 기록. 단독 실행에서도 동일 |
| `auth-guards.spec.ts:40` (`/` 루트) | Phase 13 D-07 이 `/ → /scanner` 서버 이동을 없앴는데 단언만 남음 | `webapp/src/app/page.tsx` 주석이 그 변경을 명시. 이번에 `deferred-items.md` 에 기록 |

15-14 의 변경 파일은 라우팅·미들웨어·토론 픽스처를 건드리지 않는다.

## Task 3 — Vercel 프로덕션 env (오케스트레이터 실행)

이 plan 은 `autonomous: false` 였고 Task 3 는 사람 게이트였다. 실행자는 **문서만** 선행하고
(`f985a26`) 멈췄으며, Vercel 로그인·등록·배포·프로덕션 확인은 **오케스트레이터가 수행**했다.
아래는 그 실측 결과다.

| 항목 | 값 |
| --- | --- |
| 계정 / 프로젝트 | `alex-9271` / `alexs-projects-eabbefc0/gh-radar-webapp` |
| 변수 | `NEXT_PUBLIC_RELAY_WS_URL` = `wss://dma.jx1.io/ws` |
| 대상 환경 | **Production + Preview** (`vercel env ls` 에 2행) |
| 배포 | `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod` |
| 배포 ID | `dpl_JBH7qdf4Spzwo9eSBQpcN8sbgmxF` · `readyState: READY` · `https://gh-radar-webapp.vercel.app` 로 alias |

### 개행 오염 검증 (3중) — T-15-42

| 단계 | 결과 |
| --- | --- |
| `vercel env pull` 후 값 | `wss://dma.jx1.io/ws` |
| 마지막 바이트 | **`73`** (= `s`) — `0a` **아님** |
| 바이트 수 | **19** |
| 로컬 빌드 산출물 | `.vercel/output/.../page-3d8cd6ca10ae53b6.js` 에 인라인 **1건**, `wss://…/ws\n` 패턴 **0건** |
| 프로덕션 chunk 직접 fetch | HTTP 200 · 인라인 1건 · 개행 오염 0건 · **로컬 빌드와 바이트 동일(`cmp` 일치)** |

마지막 행이 이 검증의 핵심이다. env 값만 보면 "대시보드에 잘 들어갔다" 까지밖에 모른다.
**프로덕션이 실제로 내려주는 번들 바이트가 로컬 빌드와 같다**는 것이 곧 "빌드 시점 인라인이
의도한 문자열로 일어났다" 는 증명이다.

### 프로덕션 회귀 확인

| 경로 | 결과 |
| --- | --- |
| `/` | 200 |
| `/scanner` | 307 → `/login?next=%2Fscanner` → 최종 **200** |
| `/stocks/005930?tab=chart` | 307 → `/login?…` → 최종 **200** |
| `/stocks/005930?tab=orderbook` | 307 → `/login?…` → 최종 **200** |

307 은 비로그인 요청에 대한 인증 가드의 정상 동작이다(회귀 아님). 이 spec 의 E2E 케이스 7 이
로컬에서 단언하는 것과 같은 동작을 프로덕션에서도 확인한 셈이다.

### ★ 확인하지 못한 것 (정직한 구분)

플랜 Task 3 의 4·5번은 **로그인 세션이 필요해 확인하지 못했다.** 비로그인 요청은 종목상세에
도달하기 전에 `/login` 으로 리다이렉트되기 때문이다.

| 항목 | 상태 |
| --- | --- |
| 프로덕션에서 상태 바가 실제로 렌더되는지 · JS 콘솔 에러 0건인지 | ❌ **브라우저 실측 미확인** |
| devtools Network 의 wss 요청 URL 이 `wss://dma.jx1.io/ws` 이고 쿼리스트링에 토큰이 없는지 | ⚠️ **코드로 보장 / 브라우저 실측 미확인** |

토큰이 쿼리스트링에 실리지 않는 성질은 15-12 의 acceptance(`grep 'token=' → 0건`)와
`useRelaySocket` 의 **첫 메시지 본문 인증** 설계(D-11 / T-15-04)로 코드 레벨에서는 보장된다.
그러나 "코드가 그렇게 되어 있다" 와 "프로덕션 브라우저에서 그렇게 나갔다" 는 다른 진술이다 —
후자는 로그인 세션으로 종목상세에 진입해야 확인할 수 있으므로 **미확인으로 남긴다.**
번들이 깨지지 않았다는 것(3중 검증)과 기존 페이지 회귀가 없다는 것까지가 지금 증명된 범위다.

## 위협 대응 (threat register)

| Threat | 대응 | 증명 |
|--------|------|------|
| T-15-28 실서버 오접속 | `DMA_HOST=127.0.0.1` 명시 + 게이트웨이는 방금 띄운 스텁의 임의 포트. 실 IP 리터럴을 **주석에도 쓰지 않는다**(grep 이 주석까지 잡는다) | `grep -rn` = 0건 |
| T-15-04 토큰 노출 | E2E 케이스 1 이 업그레이드 URL 을 `page.on('websocket')` 으로 캡처해 쿼리스트링 부재를 단언 | `expect(url).not.toContain('?')` |
| T-15-21 권한 게이트 | 케이스 5(매핑 없음)·7(비로그인) 이 **실제 브라우저**에서 두 경로를 확인. 7 은 wss 소켓이 0개임까지 단언 | 두 케이스 green |
| T-15-46 테스트 자원 누수 | `stop()` 이 SIGTERM → 3초 데드맨 SIGKILL + 게이트웨이·Supabase 스텁 정리. 고정 포트 선점 시 **원인을 말하고** 실패 | 전체 실행 정상 종료, `lsof -ti :8090` 없음 |
| T-15-42 Vercel env 오설정 | 등록 후 3중 검증 — `vercel env pull` 마지막 바이트 `73`, 로컬 빌드 chunk 인라인 1건·`\n` 0건, 프로덕션 chunk 직접 fetch 후 로컬과 `cmp` 일치 | 아래 §Task 3 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Playwright 프로세스가 `.env.test.local` 을 읽지 않아 E2E 를 실행할 수 없었다**
- **발견:** Task 2 첫 실행 — `auth.setup.ts` 가 `E2E auth env vars missing` 으로 즉시 실패.
- **문제:** `SETUP.md §5.1` 은 "쉘 또는 `.env.test.local`" 이라고 안내하지만 `playwright.config.ts` 에는 로더가 없었다. 실제로는 셸 export 만 동작한다.
- **조치:** 의존성 없이 `KEY=VALUE` 한 줄 형식을 읽는 로더를 추가했다. **허용 목록 방식**이며 `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` 은 의도적으로 제외한다 — Playwright 의 `webServer` 는 부모 env 를 상속하므로 통째로 로드하면 서비스롤 키가 Next dev 런타임에 주입된다(SETUP.md §3 이 명시 금지, RLS 우회 위험). 셸에서 export 한 값이 항상 우선한다.
- **Files:** `webapp/playwright.config.ts`
- **Committed in:** `70765be`

**2. [Rule 3 - Blocking] webapp 에서 `flatbuffers` 를 직접 import 할 수 없다**
- **문제:** pnpm 이 패키지별 `node_modules` 를 격리하므로 `webapp/e2e/fixtures/relay.ts` 가 `flatbuffers` 를 import 하면 해석에 실패한다. 시세 요청 프레임의 구독 키(isin/exchange)를 읽어야 자동 응답이 가능한데 그 파싱에 flatbuffers 가 필요하다.
- **조치:** 파싱을 **relay 쪽 스텁 파일 안으로** 옮겼다 — `fake-gateway.ts` 에 `readQuoteRequestKey(msgType, payload)` 를 export 로 추가. 스텁을 두 벌로 늘리지 않으면서(prior-wave 경고) 해석 책임을 flatbuffers 가 있는 패키지에 둔다.
- **Files:** `relay/tests/helpers/fake-gateway.ts`
- **Committed in:** `70765be`

**3. [Rule 1 - Bug] `child_process.spawn` 반환 타입 오기**
- `stdio: ['ignore','pipe','pipe']` 는 `ChildProcessByStdio<null, Readable, Readable>` 이라 `ChildProcessWithoutNullStreams` 주석이 타입 오류였다(런타임은 무해). 명시 주석을 걷어내고 추론에 맡겼다.
- **Committed in:** `70765be`

**4. [Rule 1 - Bug] plan 의 acceptance 와 모순되는 주석**
- 픽스처 상단 주석에 "KB 사내망 주소(`10.41.1.120`)는 어디에도 없다" 라고 **그 주소를 적어** 두어 `grep -c '10.41.1.120' … == 0` 을 스스로 깨뜨렸다. 주석에서 리터럴을 제거하고 "주석에도 적지 않는다" 는 이유를 남겼다.
- **Committed in:** `70765be`

### 계획과 다르게 해석한 지점

- **케이스 5 "비로그인 → 호가주문 탭이 로그인 안내를 보인다" → `/login` 리다이렉트 단언.**
  `/stocks/*` 는 공개 경로가 아니다(`lib/supabase/middleware.ts` 의 `PUBLIC_EXACT`/`PUBLIC_PREFIXES`).
  비로그인 사용자는 애초에 탭에 도달하지 못하고 middleware 가 `/login?next=…` 로 보낸다.
  제품의 실제 동작을 단언하고, 추가로 **relay wss 소켓이 0개**임까지 확인했다.
- **케이스 6 보조 문구를 단언하지 않는다.** relay 가 `{t:"state"}.msg` 로 단절 사유를 실어 보내면
  UI 는 정적 보조 문구 대신 그것을 보여주는 것이 계약이다(D-36). 정적 문구를 단언하면 그 계약과
  정면으로 어긋나므로 본문(`연결이 끊겨 다시 연결하는 중이에요`)만 단언한다.
  **첫 실행에서 실제로 이 단언이 깨져서 발견했다** — 테스트가 계약을 배웠다.
- **E2E 케이스 6건 → 7건.** plan 의 3번(`NXT 렌더 **또는** 빈 상태`)을 두 케이스로 쪼갰다.
  "둘 중 아무거나" 는 회귀를 못 잡는다 — 전환이 아예 안 돼도 통과한다.
- **`pushQuoteFixture(gateway, sock, {isin, exchange})`.** plan 시그니처에 `sock` 이 없었으나
  게이트웨이의 `pushQuote` 가 대상 소켓을 요구한다(연결마다 다른 사용자일 수 있다).
- **`webapp/README.md` 는 신설이다.** plan 은 "README env 표에 행 추가" 라고 했으나 파일이 없었다.
  셋업 절차는 `SETUP.md` 가 이미 담당하므로 README 는 **환경변수 표 + 배포/테스트 메모**만 두고
  나머지는 `SETUP.md` 로 링크했다. 실제 개발자가 복사하는 `.env.local.example` 에도 행을 추가했다.

### Task 3 에서 드러난 정정 · 환경 문제

**5. [정정] 체크포인트 메시지의 "18자" 는 오기 — 실측 19바이트**
- 실행자가 체크포인트에서 `wss://dma.jx1.io/ws` 를 "18자" 로 적었으나 실측은 **19바이트**다.
  검증 절차의 정본은 **`vercel env pull` 후 마지막 바이트가 `0a` 가 아닌지**이고 길이는 보조
  단서일 뿐이지만, 보조 단서가 틀리면 그것대로 사람을 헷갈리게 한다. 눈으로 센 값을 실측인 양
  적지 않는다 — 이 SUMMARY 의 §Task 3 표에는 실측 19를 기록했다.

**6. [환경] 구버전 Vercel CLI 에서 Preview env 등록이 막힌다**
- 설치돼 있던 CLI 50.37.0 은 `vercel env add … preview --value --yes` 를 모르고
  `git_branch_required` 로 실패한다. `npx vercel@latest` 로 우회해 등록했고, 이후 전역 CLI 를
  **59.11.7** 로 갱신했다(로그인 유지 확인). 다음 사람이 같은 데서 멈추지 않도록
  `webapp/README.md` 에 한 줄 남겼다.

**Total deviations:** 4 auto-fixed (Rule 1×3, Rule 3×2 중 중복 제외) + 해석 5건 + 정정/환경 2건.
새 npm 의존성 **0**.

## Known Stubs

없음. 이 plan 은 테스트·픽스처·문서만 추가했고 제품 코드의 스텁을 남기지 않았다.
(15-13 이 남긴 우측 컬럼 자리표시자 3종은 15-18 이 이미 실제 패널로 교체했다 — 이번 E2E 가
`order-panel` testid 로 그 존재를 확인한다.)

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·스키마를 만들지 않았다. 유일한 새 표면은
**테스트 전용 로컬 스텁 2종**(게이트웨이·Supabase)이며 전부 `127.0.0.1` 임의 포트이고
Playwright 프로세스 수명 안에서만 산다. 오히려 `playwright.config` 의 허용 목록 로더가
기존 관행(셸에 서비스롤 키를 export 한 채 dev 서버 기동)의 노출면을 **줄인다**.

## Issues Encountered

- **워크트리에 `@gh-radar/shared` 빌드 산출물 부재.** 15-11~15-13 과 동일.
  `CI=true pnpm install` → `pnpm --filter @gh-radar/shared run build` 선행으로 해소(저장소 변경 없음).
- **`.env.local` / `.env.test.local` 은 gitignore 대상이라 워크트리에 없다.** 메인 체크아웃에서
  복사해 사용했다(커밋 대상 아님). E2E 를 다른 환경에서 돌리려면 `SETUP.md §5` 절차가 여전히 필요하다.
- **컴포넌트 테스트 첫 실행에서 `rerender` 가 먹지 않았다.** 같은 element **참조**를 넘기면
  React 가 `prevElement === nextElement` 로 보고 재렌더를 건너뛴다. 매번 새 element 를 만들도록
  고쳤고 이유를 코드 주석에 박제했다.

## Next Phase Readiness

- **남은 브라우저 실측 1건.** 프로덕션 상태 바 렌더 · 콘솔 에러 0 · wss 요청 URL 의 쿼리스트링
  부재는 **로그인 세션이 있어야** 확인할 수 있어 미확인으로 남았다(위 §Task 3). `dma_credentials`
  매핑이 있는 계정으로 프로덕션 `/stocks/005930?tab=orderbook` 에 들어가 devtools Network 를
  한 번 보면 끝난다. relay 가 아직 mock 을 향하므로 `재접속 중`/`회선 단절` 배지는 정상이며,
  이 확인의 대상은 **번들이 살아 있고 소켓이 올바른 주소로 나가는가** 다.
- **호가창 회귀 진입점:** `pnpm --filter webapp exec playwright test orderbook`. 이 spec 은
  relay wss 포트 **8090** 을 점유하므로 `./dev.sh --with-relay` 가 떠 있으면 먼저 내려야 한다
  (픽스처가 원인을 말하고 실패한다).
- **선재 실패 2건**(`discussions` 계약 · `auth-guards` 루트 단언)은 `deferred-items.md` 에 기록돼 있다.
  전체 Playwright green 을 게이트로 삼으려면 그 두 quick 이 선행돼야 한다.

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-06 (Task 1~2 실행자 / Task 3 오케스트레이터)*

## Self-Check: PASSED

- 생성 파일 5종 전부 디스크에 존재 (산출물 4 + SUMMARY)
- 커밋 전부 이력에 존재 — `e2596a8` · `70765be` · `f985a26` · `7284407` · (본 갱신)
- Task 1~2 검증 표의 명령(test / typecheck / playwright / grep / lsof)은 실행자가 직접 돌린 결과다
- **§Task 3 의 수치는 오케스트레이터 실행 결과를 전달받아 기록한 것**이다. 실행자는 Vercel·배포·
  프로덕션에 접근하지 않았다(scope boundary). 출처를 섞지 않으려고 절을 분리했다
- **미확인 2건**(프로덕션 상태 바 렌더 · wss 요청 URL 브라우저 실측)을 완료로 적지 않았다
