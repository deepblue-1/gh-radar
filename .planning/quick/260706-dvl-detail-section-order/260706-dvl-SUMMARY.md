# Quick Task 260706-dvl: 종목상세 섹션 순서 교체 + 동반상승 근거 기본 접힘 — Summary

**Completed:** 2026-07-06
**Tasks:** 2/2
**Commits:** 8d9cd1e (feat), c9102ee (test)

## 변경 내용

### 1. 섹션 순서 교체 (8d9cd1e)
- `webapp/src/components/stock/stock-detail-client.tsx` — `StockLimitUpSection`(상한가 다음날 이력)을 `StockComovementSection`(동반상승 후보) 위로 렌더 순서 교체 (두 줄 swap).

### 2. 동반상승 근거 기본 접힘 (8d9cd1e)
- `webapp/src/components/stock/stock-comovement-section.tsx` — `CandidateRow` 근거 아코디언 초기값 `useState(true)` → `useState(false)`. 기존 "근거 보기/근거 접기" 토글 버튼(`aria-expanded`)은 그대로 재사용 — 새 컴포넌트 불필요.

### 3. 테스트 업데이트 (c9102ee)
- `webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx` — Test 10을 "기본 펼침" 검증에서 "기본 접힘 → 토글 시 펼침" 시나리오로 전환. Test 5/6 주석 정정 (assertion은 접힘 상태에서도 통과).

## 검증
- typecheck 통과
- vitest 전체 통과: 38 files / 288 tests (1 pre-existing skip)
- E2E 영향 없음 — 어떤 spec도 섹션 순서·근거 펼침 상태를 assert하지 않음 (계획 단계에서 확인)

## Deviation
- 격리 워크트리에 node_modules 부재 + `@gh-radar/shared` dist 미빌드로 typecheck 실패 → `pnpm install --frozen-lockfile` + `pnpm --filter @gh-radar/shared build`로 환경 셋업 후 진행. 코드/테스트 변경은 플랜대로 정확히 실행.
