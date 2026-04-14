# Phase 5: Scanner UI — CONTEXT

## Summary

Phase 4의 `/scanner` placeholder를 실제 인터랙티브 스캐너 화면으로 교체한다. 새 인프라 추가 없이 Phase 2 `/api/scanner` API, Phase 3 디자인 시스템, Phase 4 `apiFetch` 클라이언트를 조합해 SCAN-01~SCAN-07을 만족한다.

## <decisions>

### D1. 데이터 갱신 전략 — Client polling 1분 + 수동 refresh 버튼
- `'use client'` 컴포넌트에서 SWR(`refreshInterval: 60_000`) 또는 자체 `setInterval` + `apiFetch` 훅 중 택일 (researcher가 비교)
- 사용자 트리거 refresh 버튼(버튼 내 spinner) 병행 — SCAN-07 보조
- SSE / Supabase Realtime / Next.js ISR 모두 제외
  - 사용자별 URL 상태(임계값·마켓) 때문에 SSR/ISR 부적합
  - SSE는 Phase 범위 초과 → deferred

### D2. 리스트 표현 & 정보
- **데스크톱**: `components/ui/table.tsx` 재사용한 Table
- **모바일 (`<768px`)**: `components/ui/card.tsx` 재사용한 카드 리스트 (반응형 분기 — Tailwind md: breakpoint)
- **노출 필드**: 종목명 · 종목코드 · 마켓 배지 · 현재가 · 등락률(색상) · 거래량
- **정렬**: 등락률(기본 desc), 거래량 — 서버 `sort` 쿼리 (`rate_desc` / `rate_asc` / `volume_desc`)로 위임
- **가상화 미적용** — 서버 `limit`로 상위 N개만 표시 (기본 50~100, planner 최종 결정)

### D3. 행 클릭 → Phase 6 상세 연계
- **지금부터 `next/link`로 `/stocks/[code]` 걸어둠**
- Phase 6 미완료 기간에는 해당 경로가 `not-found.tsx`로 떨어져도 허용
- hover/focus 스타일 + `cursor-pointer` 유지

### D4. 필터 컨트롤 UX — Slider + 마켓 토글 + URL 쿼리 동기화
- `components/ui/slider.tsx` 재사용, 범위 10~29% (SCAN-03), 기본 25% (SCAN-02)
- 마켓 토글: KOSPI / KOSDAQ / ALL — 기존 `badge.tsx` + `button.tsx` 조합 또는 간이 ToggleGroup (planner 최종)
- **URL 규약**: `/scanner?min=25&market=ALL`
  - `useRouter` + `useSearchParams`로 상태↔URL 양방향 동기화
  - Slider 드래그는 debounce ~250ms 후 URL·fetch 반영
- 서버 호출은 `market`, `minRate` 쿼리로 그대로 위임

### D5. 상태 & 타임스탬프 UX
- **절대시각 표기만**: `HH:MM:SS KST` 포맷 (SCAN-06)
  - stale 배지, 장마감 분기 UI, '몇 초 전' 상대시각 모두 제외
- **로딩**: 초기 진입만 `skeleton.tsx` 노출. 폴링 중에는 기존 데이터 유지 + refresh 버튼 내 subtle spinner
- **에러**: Phase 2 envelope (`ApiClientError.code` / `message`) 메시지 노출 + refresh 버튼 활성 유지
- **빈 결과**: "조건에 맞는 종목이 없습니다" + "기준을 낮춰보세요" 힌트

## <specifics>

- URL 쿼리 파라미터 이름: `min` (number, 10~29), `market` (`ALL` | `KOSPI` | `KOSDAQ`)
- 폴링 주기: 60_000 ms (정확히 1분)
- 타임스탬프 포맷: `HH:MM:SS` + ` KST` suffix, `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, ... })`
- 테이블 컬럼 순서: 종목명 → 코드 → 마켓 → 현재가 → 등락률 → 거래량
- 등락률 색상: Phase 3 `up/down/flat` 토큰 준수 (`variant="up|down|flat"` Badge와 동일 규약)
- 기본 서버 쿼리: `GET /api/scanner?sort=rate_desc&minRate={min}&market={market}&limit={N}`

## <reusable_assets>

**재사용 (읽고 그대로 사용)**:
- `webapp/src/components/ui/table.tsx`
- `webapp/src/components/ui/card.tsx`
- `webapp/src/components/ui/slider.tsx`
- `webapp/src/components/ui/badge.tsx` — `up/down/flat` variant 보유
- `webapp/src/components/ui/skeleton.tsx`
- `webapp/src/components/ui/button.tsx`
- `webapp/src/components/ui/number.tsx` — 숫자 포맷팅
- `webapp/src/components/layout/app-shell.tsx` — `AppShell hideSidebar` 유지
- `webapp/src/lib/api.ts` — `apiFetch`, `ApiClientError`

**교체 대상**:
- `webapp/src/app/scanner/page.tsx` (Phase 4 placeholder → Phase 5 실제 화면)

**레퍼런스 (API 계약 확인용)**:
- `server/src/routes/scanner.ts` — 응답 shape (`rowToStock`)
- `server/src/schemas/scanner.ts` — `ScannerQuery` (`market`, `minRate`, `sort`, `limit`)
- `server/src/mappers/stock.ts` — Stock 타입

## <canonical_refs>

- `.planning/ROADMAP.md` — Phase 5 절
- `.planning/REQUIREMENTS.md` — SCAN-01 ~ SCAN-07
- `.planning/phases/02-backend-api/` 산출물 — `/api/scanner` 계약
- `.planning/phases/03-design-system/` 산출물 — 토큰·컴포넌트 규약
- `.planning/phases/04-frontend-scaffold/` 산출물 — `apiFetch` 사용법, AppShell
- `CLAUDE.md` — 기술 스택, 네이버 API 제약 (Phase 5 무관하나 맥락)

## <deferred>

- SSE / WebSocket 실시간 스트리밍 (Phase 9 이후 별도 phase 검토)
- 수백~수천 종목 가상 스크롤 (현재 서버 limit로 회피)
- 사용자 정의 컬럼 on/off, 정렬 컬럼 확장
- 장마감 / 휴장 / 장전 전용 UI 배너
- stale 상태 경고 ('N초 이상 갱신 안 됨')
- 즐겨찾기·알림 (각각 별도 capability → 향후 roadmap)

## <open_for_planner>

1. **Polling 훅 선택**: SWR (`swr` 의존성 추가) vs 자체 `usePolling` 훅
   - SWR: 캐싱·중복 제거·revalidateOnFocus 기본 제공
   - 자체 훅: 의존성 0, 직접 제어
   - 최종 결정은 researcher가 번들 사이즈 + Phase 6/7 재사용성 비교 후
2. **마켓 토글 구현**: 기존 `badge.tsx + button.tsx` 조합 vs shadcn `ToggleGroup` 신규 추가
3. **서버 `limit` 기본값**: 50 vs 100 vs 200 (응답 크기·UX 균형)

## <folded_todos>

(해당 없음 — 미결 todo 없음)

## Success Criteria Mapping

| Requirement | 결정 위치 |
|---|---|
| SCAN-01 전 종목 리스트 | D2 |
| SCAN-02 임계값 필터(기본 25%) | D4 |
| SCAN-03 슬라이더(10~29%) | D4 |
| SCAN-04 현재가·등락률·거래량 | D2 |
| SCAN-05 마켓 배지 | D2 (`badge.tsx` up/down/flat 외 market variant는 planner에서) |
| SCAN-06 갱신 시각 표시 | D5 |
| SCAN-07 1분 자동 갱신 | D1 |

## Next Step

`/gsd-plan-phase 5`
