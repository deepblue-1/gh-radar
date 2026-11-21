# Phase 44 — UI Review (R2 · 정독 + 실측 재감사)

**Audited:** 2026-11-21
**Baseline:** 44-UI-SPEC.md 전체 605줄 (승인본 2026-11-20) · 44-CONTEXT.md · SUMMARY 06 · 07 · 09 · 10 · 11 · 12
**Screenshots:** captured — Playwright `webServer` 가 `next dev` 를 3100 에 직접 띄움, e2e 스펙의 `mockSettlementApi` 와 로그인 설정 재사용, 운영 접속 없음. 360 · 390 · 1024 · 1440 × 라이트 · 다크 전체 화면, 거래 줄 · 정산 줄 펼침, 거래 기록 · 정산하기 시트(390 · 1440 · 360), 정산 취소 확인 창, 미설정 · 못 읽음 · 서버 간 다름 상태(360). 저장 위치 `.planning/ui-reviews/44-20261121-104122/`(png 는 gitignore). 임시 spec 2개는 삭제함.
**Interaction captures:** off (`workflow.ui_interaction_capture` false). 위 Playwright 캡처는 시트 열기 · 알약 클릭 · 저장 눌러 오류 유발 · 줄 펼침까지 직접 구동한 것이며 chrome-devtools 인터랙션 캡처는 아님.
**읽지 못한 것:** PLAN 13개는 이번에도 통독하지 않았다(SUMMARY 로 대체). 실제 relay 응답은 목이라 실데이터 상태는 미확인.

---

## 점수

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 계약 문구 전부 일치. 금액 8자리 이상 붙여넣기가 안내 없이 통째로 버려짐 |
| 2. Visuals | 3/4 | ② 큰 숫자가 계약(「9억 2,450만」)과 다른 값(「5억 2,450만」)을 그림 — 미결 판단 |
| 3. Color | 2/4 | 라이트에서 경고 글자 `--led-latent` 대비 2.05 : 1 · 「바로 출금」 켜짐 흰 글자 3.7 : 1 |
| 4. Typography | 3/4 | 실측 크기 12 / 14 / 18 / 24 · 굵기 400 / 600 만. 위반 없음 |
| 5. Spacing | 3/4 | 360 ~ 1440 가로 넘침 0. 계약 밖 2px · 6px 각 1곳 |
| 6. Experience Design | 3/4 | 상태 · 확인 창 완비. 링크 18px · 알약 32px 터치 대상, 시트 첫 포커스 × 버튼 |

**Overall: 17/24** — BLOCKER 없음. 이전 R1(18/24)보다 낮아진 이유는 렌더 실측으로 Color 결함이 증거화됐기 때문.

---

## 이전 미확인 5건 처리

| 항목 | 결과 | 근거 |
|---|---|---|
| 다크 Dialog 면에서 문단 상자 · ⑩ 상자 소실 | **기각** | 다크 확인 창 면 rgb(21,21,21) 위 문단 상자 rgb(45,45,45)로 구분됨(`confirm-cancel-390-dark.png`). 단 새 결함 발견 — 아래 W3 |
| 펼침 줄 파괴 버튼이 다크에서 사라짐 | **기각** | 다크 「고치기」 · 「지우기」 면 rgb(21,21,21) + ring rgb(61,61,61) 가 펼침 상자 rgb(45,45,45) 위에서 보이고 「지우기」 는 빨강 글자(`ledger-expanded-390-dark.png`) |
| 360 세그먼트가 가려짐 | **기각** | 세그먼트 폭 244px ≤ 카드 안 320px, 가로 스크롤 없음(scrollW 244 = clientW 244). 계약 산수(≈310)보다 작음 |
| `mt-0.5` vs `ml-0.5` | **확인(경미)** | 「원」 앞 `ml-0.5` 는 `person-cards.tsx:89` 에 계약대로 있음. `name-vs-card.tsx:94` `mt-0.5` 는 계약 예외 목록에 없는 세로 2px(실측 margin-top 2px) |
| 알약 `h-8` 히트 | **확인(경미)** | 실측 알약 32px, 스위치만 44 히트 확장. 계약이 32 로 승인 — 폰 터치에서는 작은 편 |

---

## 우선 수정

1. **[결정됨 2026-11-21 · totalKrw 유지] ② 큰 숫자 값이 계약과 다름** — UI-SPEC ② 문구 정본은 큰 숫자 「9억 2,450만 · 9억 2,450만 · 7,200만」(= 「지금 몫 전체」)인데, 구현(`person-cards.tsx:88`)은 `totalKrw` 를 그려 실제 화면은 「5억 2,450만원 · 5억 2,450만원 · 0원」이다. 44-06 SUMMARY 가 채택 목업 코드를 근거로 일부러 바꿨고 e2e 는 이 값을 잠그지 않는다. UI-SPEC 시선 앵커 절은 이 숫자를 화면의 첫 읽을거리로 지정하므로 계약 문서와 코드 중 하나를 고쳐야 한다. 한 줄(`x.totalKrw` → `x.stakeKrw`)이거나 UI-SPEC 정정이다. 현재 심쥬니 카드는 「0원」 큰 숫자 아래 「지금 몫 전체 7,200만」 이어서 독자가 숫자 둘을 혼동하기 쉽다. 사용자 답(44-13-SUMMARY key-decisions): 큰 숫자는 지금처럼 totalKrw — 코드는 그대로 두고 UI-SPEC ② 표 · 시선 앵커와 e2e 주석을 정정했다(quick 261121-gdx).
2. **[WARNING] 라이트 경고 글자 대비 2.05 : 1** — `text-[var(--led-latent)]`(#ff9f1a) 를 흰 카드 위 12px 로 쓰는 곳: 「미설정」 · 「…못 읽어 어제 19:58 에 읽은 값이에요」 · 「서버마다 예수금이 달라…」 · 「예수금이 설정되지 않은 계좌가 있어요」 · 「현중 → 근형」 꼬리표(18% 틴트 위). `bad-360-light.png` 에서 확인. WCAG AA(4.5 : 1)에 크게 미달하고 이 글자가 D-25 의 핵심 상태 신호다. 라이트에서만 `--led-latent` 대신 더 진한 주황(예: 대비 4.5 : 1 이상 토큰)을 쓰거나 줄 앞에 아이콘 · 굵기로 보강할 것. Phase 36 `WARN_LINE` 선례를 그대로 상속한 결과이므로 정산에서만 고치면 어드민 안 불일치가 생긴다 — 전역 토큰 결정이 필요.
3. **[WARNING] 「바로 출금」 켜짐 알약 대비 3.7 : 1** — 흰 12px/600 글자 on `--primary` #3182f6(`settle-sheet.tsx:324`). 큰 글자가 아니라 AA 미달. 글자를 14 로 올리거나 면을 진하게.
4. **[WARNING] 다크 확인 창 하단 구분선이 순백** — `ui/dialog.tsx:113` 의 `DialogFooter` `border-t` 가 색을 지정하지 않아 다크에서 rgb(255,255,255) 1px 로 그려짐(`crop-confirm-390-dark.png` 픽셀 확인). 정산 확인 창이 이 부품을 그대로 써서 다크 면 보정(계약 22번)만 하고 선 색은 놓쳤다. `settle-confirm.tsx:166` 의 `DialogFooter` 에 `border-[var(--border-subtle)]` 를 줄 것.
5. **[WARNING] ⑤ 「이체 내역 보기」 터치 대상 67 × 18px** — `transfer-card.tsx:53` 버튼에 패딩이 없다(실측 h 18). 폰에서 오탭 위험. `py-3 -my-2` 류로 히트 높이 확장.
6. **[WARNING] 금액 입력 7자리 초과가 조용히 버려짐** — 「99999999」 를 붙여넣으면 값이 통째로 빈 칸이 되고 「금액을 넣어 주세요」 오류가 뜬다(측정: `amount: ""`). 한 글자씩 칠 때도 8번째 자리는 피드백 없이 무시된다. 상한을 알리는 문구나 잘라 넣기가 필요.
7. **[WARNING] 시트 열림 첫 포커스가 머리 × 버튼** — 실측 `document.activeElement` = `sheet-close`. 44-10 · 11 SUMMARY 가 인지하고 넘긴 한계(`AdminSheet` 가 `onOpenAutoFocus` 미지원). 키보드 사용자는 시트를 열 때마다 닫기 버튼에서 시작한다.
8. **[낮음] 펼침 작은 버튼 · 알약 32px** — 「고치기」 · 「지우기」 · 「정산 취소」 52 × 32, 알약 32. 계약 승인값이지만 계약 자신의 터치 기준(줄 버튼 ≥ 44)과 별개로 폰에서 빡빡함.
9. **[낮음] 넓은 카드 계좌 표 눈 이동** — 1440(카드 900) 에서 계좌 이름과 값 사이가 약 600px 비어 있고 줄 구분선이 없어 행 추적이 어렵다(`full-1440-light.png`). 계약 설계 그대로이나 행 hover · 얇은 구분선 검토 가치.
10. **[낮음] 계약 밖 간격** — `name-vs-card.tsx:94` `mt-0.5`(2px), `open-pools-card.tsx:124` `gap-1.5`(6px, 묶음 이름 · 비율 사이 — 계약의 6px 예외는 사람 점 `mr-1.5` 뿐).

---

## 세부 소견

### Pillar 1: Copywriting (3/4)
- 계약 문구와 대조해 일치 확인(화면 실물): 「내 수익 몫 / 아직 계좌에 두고 있는 돈」 · 「정산 전 수익」 부제와 D-28 한 줄 · 「김현중 → 정근형 5,950만원이면 맞음」(「원」 포함) · 「정근형이 3억 더 보냄」 · 「법인 용역으로 옮긴 돈 1건 · 개인 이체 아님」 · 거래 줄 꼬리표(「계좌 옮김」 · 「근형 → 현중」 · 「법인 용역 · 개인 이체 아님」 · 「11/20 정산」) · 「배포 때 미리 넣은 내역」 · 정산 취소 문단과 「예수금에도 반영」 미리 보기 · 「뺄 계좌 — 김현중 교보 김현중 · 정근형 KB 정근형 · 금액은 만원 미만을 버리고 적어요」 · 시트 칸 이름과 순서 · 「금액을 넣어 주세요」.
- 미설정 · 못 읽음 · 서버 간 다름 상태도 360 에서 문구 그대로 확인(`bad-360-light.png`): 「교보 김현중 — 매매 서버에서 못 읽어 어제 19:58 에 읽은 값이에요」 · 「KB 정근형 — 서버마다 예수금이 달라 주문 서버 값으로 계산했어요」 · 「예수금이 설정되지 않은 계좌가 있어 맞출 금액을 계산할 수 없어요」.
- 감점: 우선 수정 6(입력 상한 안내 없음). 큰 숫자 값 문제는 Visuals 로 셈.

### Pillar 2: Visuals (3/4)
- 시선 앵커: ② 24/600 큰 숫자가 화면에서 가장 크고 ③ · ④ 18 이 한 단 아래 — 위계 구조는 계약대로(`full-1440-light.png`). 아이콘은 `ChevronDown` 뿐, aria-hidden.
- 감점: 우선 수정 1. 값이 달라 계약이 의도한 「한눈에 몫」 읽기가 바뀌었다. 같은 숫자(5억 2,450만원)가 김현중 · 정근형 두 카드에 나란히 반복돼 변별력도 약함.
- 감점 보조: 우선 수정 9.

### Pillar 3: Color (2/4)
- 하드코딩 hex 0건. accent 는 스위치 · 「바로 출금」 켜짐 · 링크 3곳 · 주 버튼으로 계약 목록 안. 사람 점 토큰 라이트 · 다크 모두 렌더 확인. 손익 빨강 `+` 숫자와 파괴 빨강(「지우기」 · 오류 줄)이 한 화면에서 섞이는 자리는 거래 줄에서 금액 무색 규칙대로 지켜짐.
- 결함: 우선 수정 2 · 3. 라이트 경고 글자 2.05 : 1(계산: #ff9f1a 상대휘도 0.461, 흰색 대비), 「바로 출금」 3.7 : 1. 상태를 말하는 글자라 시각 결함이 곧 정보 손실이다.
- 다크는 `--led-latent` #ffb13d on #151515 로 충분.

### Pillar 4: Typography (3/4)
- 실측 computed: 12 · 14 · 18 · 24px, 굵기 400 · 600(상속 역할 제외). 계약의 새 역할 4 크기 · 2 굵기 그대로. `tabular-nums` · `whitespace-nowrap` 로 값 칸이 360 에서도 안 잘림(큰 숫자 scrollW = clientW = 320).
- 감점 사유: 경고 · 상태 문구 전부 12px 라 우선 수정 2 와 합쳐 읽기 부담. 위반은 아님.

### Pillar 5: Spacing (3/4)
- 뷰포트 360 · 390 · 1024 · 1440 문서 가로 넘침 0, 계좌 표 시트 안 328 / 358 / 399 에서 scrollW = clientW, 나누기 줄 높이 48 ~ 49 한 줄, 정산 · 시트 360 넘침 0. 반응형 768 컨테이너 경계로 ② 1열 ↔ 3열, ④ ⑤ 1열 ↔ 2열 전환 확인(데스크톱 패널 열림 시 좁은 배치로 바뀌는 것도 `ledger-sheet-1440-light.png` 에서 확인).
- 감점: 우선 수정 10, 터치 높이는 우선 수정 8.

### Pillar 6: Experience Design (3/4)
- 완비된 것: 첫 로딩 Skeleton(`aria-busy`) · 불러오기 실패 `role="alert"` + 다시 시도 · 403 · 빈 목록 · 저장 중 버튼 비활성 · 검증 오류 줄 `aria-invalid` + `role="alert"` · 파괴 동작 alertdialog(정산 취소 확인 창 실물 확인: 반영 상자 켜짐 + 미리 보기 「교보 김현중 예수금 1억 5,950만 → 6억 8,400만」) · 심쥬니 알약 `aria-disabled`(D-29, 실측 40% 흐림) · 줄 펼침 · 정산 확정 뒤 흐름.
- 감점: 우선 수정 5 · 6 · 7 · 8. 동일 계좌 선택은 저장 전까지 막지 않고, 금액 오류가 먼저 나와 「보낸 계좌와 받은 계좌가 같아요」 는 두 번째 저장 시도 때야 보인다(계약 순서).
- 미확인: 실제 relay 응답 · 장중 줄(실제 시계 의존) · 터치 기기 포커스 링 없음 규칙.

---

## Registry Safety
Registry audit: 서드파티 레지스트리 0건(`registries: {}`), 생략.

## Files Audited
`/Users/alex/repos/gh-radar/webapp/src/components/settlement/` — person-cards · open-pools-card · account-table · name-vs-card · transfer-card · settlement-client(230 ~ 519행 + 헤더 · 상태 분기) 를 전문 정독. activity-card · ledger-row · settle-row · ledger-sheet · settle-sheet · settle-confirm · reflect-box 는 클래스 grep + 렌더 캡처 · 실측으로 확인하고 전문 정독은 하지 않았다. 그 밖 `/Users/alex/repos/gh-radar/webapp/src/components/ui/dialog.tsx`(border-t) · `/Users/alex/repos/gh-radar/webapp/src/components/admin/admin-sheet.tsx` · `/Users/alex/repos/gh-radar/webapp/src/styles/globals.css`(토큰) · `/Users/alex/repos/gh-radar/webapp/e2e/specs/admin-settlement.spec.ts` · `/Users/alex/repos/gh-radar/webapp/e2e/fixtures/settlement.ts`.
