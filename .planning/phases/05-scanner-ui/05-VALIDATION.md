---
phase: 5
slug: scanner-ui
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-14
---

# Phase 5 — Validation Strategy

> Scanner UI 의 per-task 피드백 샘플링 계약. RESEARCH.md §Validation Architecture 에서 파생. Planner 가 각 task 에 자동/수동 verify 를 붙일 때 이 문서를 참조한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (webapp 신규 — Wave 0 에서 설치) / server 는 이미 vitest 설치됨 |
| **Config file** | `webapp/vitest.config.ts` (Wave 0 신규) |
| **Quick run command** | `pnpm --filter @gh-radar/webapp test -- --run` |
| **Full suite command** | `pnpm -r test -- --run` |
| **Estimated runtime** | ~4 초 (webapp 단위 테스트, jsdom) |

추가 품질 게이트(기존 인프라):
- `pnpm --filter @gh-radar/webapp typecheck`
- `pnpm --filter @gh-radar/webapp lint`
- `pnpm --filter @gh-radar/webapp build`

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp lint` (Wave 0 이후 추가: `pnpm --filter @gh-radar/webapp test -- --run`)
- **After every plan wave:** `pnpm -r typecheck && pnpm -r lint && pnpm -r test -- --run`
- **Before `/gsd-verify-work`:** 위 full suite green + 수동 E2E 체크리스트(하단) 전원 PASS
- **Max feedback latency:** 15 초

---

## Per-Task Verification Map

> Task ID 는 planner 가 PLAN.md 작성 시 확정. 여기서는 요구사항별 검증 레이어만 잠금.

| Req ID | Wave | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|--------|------|----------|------------|-----------|-------------------|-------------|--------|
| SCAN-02 | 1 | URL `?min=25` 파싱 · clamp 10~29 · 기본 25 | T-5-01 (URL 인젝션 clamp) | unit (순수 함수) | `pnpm --filter @gh-radar/webapp test -- --run src/lib/scanner-query.test.ts` | ❌ W0 | ⬜ pending |
| SCAN-05 | 1 | `market` 파라미터 whitelist (ALL/KOSPI/KOSDAQ) | T-5-01 | unit | `pnpm --filter @gh-radar/webapp test -- --run src/lib/scanner-query.test.ts` | ❌ W0 | ⬜ pending |
| SCAN-06 | 1 | `formatKstTime(epochMs)` → `HH:MM:SS KST` | — | unit | `pnpm --filter @gh-radar/webapp test -- --run src/lib/scanner-time.test.ts` | ❌ W0 | ⬜ pending |
| SCAN-07 | 1 | `usePolling` 60 s interval · mount/unmount cleanup · 수동 refresh | — | unit (fake timers) | `pnpm --filter @gh-radar/webapp test -- --run src/hooks/use-polling.test.ts` | ❌ W0 | ⬜ pending |
| SCAN-01 | 3 | `/scanner` 실제 렌더 (Table + Card 듀얼) | — | manual E2E | 수동 체크리스트 #1 | — | ⬜ pending |
| SCAN-02 | 3 | Slider 드래그 → 250ms debounce → URL/fetch 반영 | — | manual E2E | 수동 체크리스트 #2 | — | ⬜ pending |
| SCAN-03 | 3 | Slider 10~29 step=1 | — | manual E2E | 수동 체크리스트 #2 | — | ⬜ pending |
| SCAN-04 | 3 | 현재가·등락률(색상)·거래량 포맷 | — | manual E2E | 수동 체크리스트 #1 | — | ⬜ pending |
| SCAN-05 | 3 | KOSPI/KOSDAQ 마켓 배지 렌더 · 토글 필터 동작 | — | manual E2E | 수동 체크리스트 #3 | — | ⬜ pending |
| SCAN-06 | 3 | `최근 갱신 HH:MM:SS KST` 헤더 표시 | — | manual E2E | 수동 체크리스트 #4 | — | ⬜ pending |
| SCAN-07 | 3 | 1분 자동 갱신 (Devtools Network 60s 간격 확인) | — | manual E2E | 수동 체크리스트 #4 | — | ⬜ pending |
| — | 3 | 에러 stale-but-visible | — | manual E2E | 수동 체크리스트 #5 | — | ⬜ pending |
| — | 3 | URL 직접 공유 복원 (`/scanner?min=15&market=KOSDAQ`) | T-5-01 | manual E2E | 수동 체크리스트 #7 | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `webapp/vitest.config.ts` — jsdom env + `@vitejs/plugin-react` + path alias `@/*`
- [ ] `webapp/package.json` — `test` 스크립트 추가, devDependencies 추가 (`vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`는 선택)
- [ ] `webapp/src/lib/scanner-query.test.ts` — SCAN-02/05 커버 (경계값 9/10/29/30, 잘못된 market 값, 빈 쿼리)
- [ ] `webapp/src/lib/scanner-time.test.ts` — SCAN-06 (고정 epoch → `HH:MM:SS KST`)
- [ ] `webapp/src/hooks/use-polling.test.ts` — SCAN-07 (fake timers, mount/unmount, 수동 refresh)
- [ ] shadcn `popover` / `toggle-group` 블록 추가: `pnpm --filter @gh-radar/webapp dlx shadcn@latest add popover toggle-group`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/scanner` 첫 진입 skeleton → data 전환 | SCAN-01 | DOM 스냅샷 가치 낮음, 브라우저 paint 확인 필요 | 수동 체크리스트 #1 |
| Slider 드래그 debounce UX | SCAN-02/03 | 실제 드래그 제스처 정확도 판단 | 수동 체크리스트 #2 |
| 마켓 토글 반응 | SCAN-05 | ToggleGroup aria + 키보드 조작 실사용 | 수동 체크리스트 #3 |
| 60초 자동 폴링 동작 | SCAN-07 | 실시간 타이밍 + Network 탭 검증 | 수동 체크리스트 #4 |
| 에러 stale-but-visible | — | Devtools throttling 제어 | 수동 체크리스트 #5 |
| 모바일 카드 리스트 | SCAN-01 | 뷰포트 전환 paint · 터치 타겟 | 수동 체크리스트 #6 |
| 공유 URL 복원 | SCAN-02/05 | 브라우저 주소창 입력 | 수동 체크리스트 #7 |

### 수동 E2E 체크리스트 (Phase Gate)

1. `pnpm --filter @gh-radar/webapp dev` 후 `http://localhost:3000/scanner` 첫 진입 → 1초 이내 Skeleton 10행 → 데이터 수신 시 Table 100행 (기본 `limit=100`) 표시
2. Slider 25% → 29% 드래그 → 250 ms 내 URL `?min=29` 반영, 리스트 축소. `←`/`→` 키 ±1, PageUp/Down ±5 동작
3. 마켓 토글 `KOSPI` 클릭 → URL `?market=KOSPI` 즉시 반영, chip 라벨 `마켓: KOSPI` 갱신, 리스트 KOSPI 만
4. 헤더 `최근 갱신 HH:MM:SS KST` 표시 확인 → Devtools Network 탭에서 `/api/scanner` 호출이 60 s 간격으로 재발생 → 새로고침 버튼 클릭 시 즉시 재호출(버튼 spinner, 호출 중 disabled)
5. Devtools → 네트워크 throttle Offline → 60초 대기 → 기존 리스트 유지 + 에러 카드 노출 → Online 복귀 후 "다시 시도" 클릭 → 복구
6. 모바일 뷰포트(375px) → Card 리스트 렌더, chip + popover 정상, 터치 타겟 44px 이상
7. 공유 URL 테스트: `/scanner?min=15&market=KOSDAQ` 직접 붙여넣기 → 초기 상태 복원 + 잘못된 값(`?min=99&market=UNKNOWN`) → 기본값(25/ALL)로 clamp/fallback 정상

---

## Validation Sign-Off

- [ ] All phase requirements have `<automated>` verify OR manual E2E 체크리스트 참조
- [ ] Sampling continuity: Wave 1 단위 테스트가 Wave 2~3 동안 supervisor 로 유지
- [ ] Wave 0 covers all MISSING test files (`scanner-query.test.ts`, `scanner-time.test.ts`, `use-polling.test.ts`)
- [ ] No watch-mode flags (명령에 `--run` 포함)
- [ ] Feedback latency < 15 s
- [ ] `nyquist_compliant: true` set in frontmatter (Wave 0 완료 후 planner/executor 가 업데이트)

**Approval:** pending
