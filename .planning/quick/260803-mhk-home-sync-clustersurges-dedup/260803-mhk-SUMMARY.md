# Quick Task 260803-mhk: home-sync clusterSurges dedup 후 테마 재정렬 — Summary

**완료일:** 2026-08-03
**커밋:** `8e2fdde` → `bc2786c` → `7ab2304` → `4b1d4a1` (TDD RED→GREEN 2쌍)
**상태:** 코드 완료 (Task 3 human-verify 미실행)

## 문제

`clusterSurges` 파이프라인에서 테마 배열 순서가 `enforceMembershipInvariant`(dedup) **이전** stockCodes 기준으로 확정되고, invariant가 중복 멤버를 제거해도 재정렬되지 않았다. 중복 종목을 뺏겨 2종목만 남은 테마가 3종목 테마보다 위에 노출될 수 있고, 화면의 "N종목 · 평균 X%"는 dedup 후 값으로 계산되므로 정렬 근거와 표시 값이 불일치했다.

## 변경 (workers/home-sync/src/ai/clusterSurges.ts)

- 순수 비교 함수 `compareThemeRank`(멤버 등락률 배열 기준: 멤버 수 desc → 평균 changeRate desc)를 추출해 정렬 기준의 유일한 구현으로 단일화.
- `sortThemes`(dedup 이전, ClusterTheme.stockCodes + rateByCode)와 신규 `sortHomeSurgeThemes`(invariant 이후, HomeSurgeTheme.stocks)가 `compareThemeRank`를 공유 — 정렬 기준이 두 갈래로 갈라져 같은 버그가 재발하는 것을 구조적으로 차단.
- 파이프라인 말미: `return { themes: sortHomeSurgeThemes(inv.themes), singles: finalSingles }` — 안정 정렬로 동률 시 invariant 출력 순서 보존.
- `sortThemes` 시그니처·export 무변경. `enforceMembershipInvariant` 순수 계약 유지(복제 정렬).

## 검증

- 테스트 136 passed (baseline 130 → 신규 6, 회귀 0), typecheck exit 0, build exit 0.
- RED 재현 확인: 통합 테스트가 수정 전 코드에서 `expected ['가','나'] to deeply equal ['나','가']`로 정확히 실패 — 버그·수정 모두 실증.
- 소비 측 무변경 확인: 홈 급등 경로는 `home-api.ts` → `home-client.tsx` payload 순서 그대로 렌더. `theme-api.ts:187`의 sort는 Phase 10 큐레이션 `/themes` 페이지용으로 별개 경로.

## Task 3: 배포 완료 (2026-08-03, 사용자 승인 후 실행)

- `deploy-home-sync.sh` 성공 — Cloud Run Job `gh-radar-home-sync` @ image `home-sync:fe0924f`, Scheduler/Secrets 기존 재사용.
- `smoke-home-sync.sh` 5/6 PASS. 유일 실패 INV-2("cycle complete" 로그)는 장 마감 후(17:4x KST) 실행이라 워커가 "마감(15:30) 초과 슬롯 — cycle skip"으로 의도적 스킵한 것 — 회귀 아님. INV-4(오늘 스냅샷 ≥1) 포함 나머지 전부 PASS. (INV-4는 `SUPABASE_SERVICE_ROLE_KEY` env 필요 — master-sync/.env source.)
- 잔여: 다음 거래일 장중 슬롯에서 홈 카드 순서(멤버 수 → 평균 등락률) 육안 확인.

## 참고

- 계획의 baseline 수치는 129였으나 실제 130 (직전 quick-260803-it6 반영분 추정). 회귀 0 조건 동일 충족.
- 워크트리 초기 `pnpm install` 이슈: pnpm 11이 `pnpm-workspace.yaml`에 placeholder를 자동 삽입 → 즉시 원복, 커밋 미포함. `@gh-radar/shared` 선빌드 필요.
