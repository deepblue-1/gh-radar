# Phase 31 — UI Review

**Audited:** 2026-10-12
**Baseline:** 31-UI-SPEC.md (design contract, 승인 상태 — 단 Checker Sign-Off 의 `Approval: pending` 은 미갱신)
**Screenshots:** not captured (dev server 없음 — localhost:3100 응답 000. 코드 감사 + 31-07 E2E 실측 기록 기반)
**Interaction captures:** off (workflow.ui_interaction_capture is false). 상호작용 판정은 전부 코드·단위 테스트·SUMMARY 의 E2E 기록에서 유도했으며 이번 감사에서 직접 관찰하지 않았다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 계약 문구가 코드에 충실히 반영됨. 단, 「이 값」 잔존 1건(취소 문구) · P31-4 차단 문구가 계약상 표면과 다른 채널로 노출 |
| 2. Visuals | 3/4 | 두 줄 행 위계는 계약대로. L4b(체크 값 행 라벨 접힘)는 계약 밖 신규 동작이고 시각 확인 미완 |
| 3. Color | 3/4 | 하드코딩 색 0 · 신규 accent 소비처 0. 단 컬러 분포(60/30/10)·발동잔량 `--up` 은 스크린샷으로 확인 못 함 |
| 4. Typography | 3/4 | 신규 4역할(12/12.5/14/15, 400/500) 코드와 일치. 12 vs 12.5 근접 쌍은 계약이 인정한 잔존 |
| 5. Spacing | 3/4 | 56/44 높이 분리 구현. 685 경계 여유 +0.4px 는 사실상 무여유 |
| 6. Experience Design | 3/4 | 상태 우선순위 ①~⑤ 구현·테스트됨. S3/S4/S6 시각 확인과 실서버 실증이 미완(Manual-Only) |

**Overall: 18/24**

(4점 없음 사유: 스크린샷을 못 찍어 어떤 필러도 「화면으로 증명」되지 않았고, 계약 이탈 또는 미검증 항목이 각 필러마다 최소 1건 있다.)

---

## Top 3 Priority Fixes

1. **WARNING — 체크 값 행 685 경계 여유 +0.4px, 계약 외 L4b 동작 사람 확인 미완** — 선매수 「체결량」 · 매도 「체결」 에 「999,999,999만」 이 들어가면 폭이 0.4px 차이로만 버틴다. 폰트 렌더링(Pretendard 서브셋 로딩 시점, OS 별 hinting) 한 번에 값이 라벨을 덮을 수 있다. UI-SPEC 은 라벨 접힘을 「잔량추적 기준선」 한 곳으로만 예측했는데 실제로는 체크 값 행도 접힌다(31-07 L4b). 조치: 실기기(폰 390 · 685 경계 폭)에서 L4b 모양을 눈으로 확인하고(31-07 D11), 685 에서 체크 값 행의 최악값 여유를 최소 2px 이상으로 확보(체크 묶음 gap 축소 또는 라벨 wrap 허용 폭 상향)하거나 UI-SPEC L4 절에 L4b 를 정식 반영.
2. **WARNING — S3(넘버패드 상태 줄 다행)·S4(인라인 편집 말풍선)·S6(차단 문구 줄바꿈) 시각 확인 미실시** — UI-SPEC UI Considerations 에서 backstop 으로 남긴 항목이고 VALIDATION 도 Manual-Only 로 둔 자리다. 상태 줄이 둘째 줄(「감시 중」)까지 갈 때 시트 상단만 움직이는지, 280px 말풍선에서 100자 내외 C# 원문이 잘림 없이 보이는지 아직 아무도 보지 않았다. 조치: 미리보기 배포 후 폰 시트에서 「비교가격 필요 — 매도 비교가격을 입력하세요」 + 감시 중 상태를 열어 캡처, 데스크톱에서 「999,999,999」 인라인 편집 + 말풍선 캡처.
3. **WARNING — 문구·표면 잔존 이탈 2건** — (a) `limit-chaser-form.tsx:249` 취소 잔량 차단 문장이 「…이 값 이하로 빠지면…」 인데 이는 C# 원문 그대로라 계약상 정상이나, 같은 화면의 시트 설명은 「이 금액」 으로 바뀌어 한 화면에서 「값/금액」 이 섞인다. (b) P31-4 줄매수 최대 0주 차단 문장이 계약의 「FailureBubble · 켤 수 없는 이유 패널」 이 아니라 폼 머리 `lc-submit-error` 에 선다(31-07 deviation 5). 사용자가 스위치를 누른 위치에서 멀다. 조치: (a) 문구는 C# 동형 유지로 두되 UI-SPEC 에 「의도된 잔존」 으로 명시, (b) 스위치 근처 말풍선 또는 켤 수 없는 이유 패널로 이동하거나 계약을 사후 개정.

추가 권고(상위 3건 밖): 4. UI-SPEC Checker Sign-Off `Approval: pending` 갱신. 5. 두 줄 행 `aria-label` 이 위·아래 줄을 한 문장으로 읽는데(「선매수 매도잔량 1,000만 777주」) 「비교가격 필요」 일 때 의미(경고)가 라벨에만 있고 시각적으로는 빨강 보조뿐 — 계약상 허용이나 스크린리더 사용자에게 오류 상태 신호(aria-invalid 등)는 없음. 6. 12px 아래 줄 vs 12.5px 상태 줄은 근접 쌍이라 통합 여지(계약이 사용자 채택값으로 유지).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- 계약 문구 대응: `lc-fields.ts:727`(「비교가격 필요」 alert), `lc-fields.ts:709-711`(의미어 「무제한」「1주」「없음」·「0주」), `lc-fields.ts:247-495` 시트 설명 8칸이 「이 금액」으로 갱신됨(후매수 최소는 계약대로 불변). 차단 문구는 `limit-chaser-form.tsx` 에서 한 곳(`armBlockedTextOf` 확장)으로 지어진다. 시트 「지금 {N}만」(`number-pad-sheet.tsx:283`)도 계약과 일치.
- 이탈/위험:
  - `limit-chaser-form.tsx:249` 「이 값 이하로 빠지면」 — C# 원문 동형이라 계약 8번(취소 0 검사 신설)과 합치하나, 다른 금액 설명은 「이 금액」으로 통일되어 용어 일관성이 깨진다. 계약이 「이 값 → 이 금액」을 시트 설명에만 한정했으므로 위반은 아니고 경고 수준.
  - `lc-fields.ts:371`(진입 횟수 desc) 「이 값부터」는 횟수 칸이라 정상.
  - P31-4 차단 문장이 `lc-submit-error` 에 노출되는 점은 31-07 에서 deviation 으로 기록됨. 계약의 「보이는 자리(기존 채널만)」 열거에는 이 채널이 없다.
- 일반 라벨 grep(Submit/OK/Click Here) 결과: 이번 phase 변경분에 신규 일반 라벨 없음. 빈 상태 문구는 계약상 해당 없음(0 이 값)이며 구현도 그렇다.
- 한계: 실제 렌더 문자열(쉼표, 접미 「 (12만 → 0주)」)은 단위·E2E 단언으로만 확인, 화면으로는 못 봄.

### Pillar 2: Visuals (3/4)

- 포인트: 두 줄 행은 `ROW_BOX_TALL`(`setting-group.tsx:93`, `min-h-[56px]`)과 `lc-row-sub` 슬롯(`:124-129`)으로 위 줄 15/500 vs 아래 줄 12/400 위계가 코드로 확립됨. 쉐브런은 위 줄 행에 유지, flash 는 위 줄만, busy 는 두 줄 함께 — 계약 일치. 파생 행은 `min-h-4` 로 빈 아래 줄에서도 56 유지(`:118,128`).
- 이탈: 체크 값 행에서 값 버튼 `shrink-0`(`:951`) + 라벨 `LABEL_TEXT_WRAP`(`:923`)로 라벨이 원형 체크 아래로 접힐 수 있다. 이는 31-07 이 실측 겹침(344 −8px · 685 −3.5px · 830 −9px)을 고치려고 만든 L4b 이며 UI-SPEC L4 의 「실제로 걸리는 행은 잔량추적 기준선뿐」과 다르다. 시각적으로는 「체크 | 라벨(2줄)」 모양인데 이 모양이 어색하지 않은지는 사람 확인 대기(D11).
- 아이콘 전용 버튼: 이 phase 는 아이콘 추가 없음. 체크/스위치는 `aria-label` 있음(`:710,774`).
- 한계: 스크린샷 없음 → 시각적 초점·정렬은 코드/E2E 기하 단언(잘림 0, 56/44)으로만 확인.

### Pillar 3: Color (3/4)

- 변경분에서 `#xxxxxx`/`rgb(` 하드코딩 0건. 색은 전부 토큰: 위 줄 `--fg-2`(`:145`), 아래 줄 `--muted-fg`/`--destructive`(`:129`), 발동잔량 `--up`(`:1050`), 시트 환산 안내 `--muted-fg`(`number-pad-sheet.tsx:303`), 잠금 `--destructive`(`:293`).
- accent 소비처 추가 없음(flash `--primary` 는 위 줄만, `:145`). 계약 Accent reserved 목록과 일치.
- 이탈/주의: 경고(warn) 톤이 `--destructive` 를 쓴다(`number-pad-sheet.tsx:298`) — 기존 동작이라 이번 phase 이탈은 아니다. 「비교가격 필요」 가 빨강이면서 글자로도 의미를 싣는 점(WCAG 1.4.1)은 충족.
- 한계: 라이트/다크 실제 대비비, `--muted-fg` 12px 아래 줄의 가독성(#6b7684 on #f9fafb 약 4.7:1 추정, 다크 #9e9e9e on #1a1a1a)은 직접 측정하지 못했다.

### Pillar 4: Typography (3/4)

- 신규 역할 4개가 코드와 정확히 일치: 아래 줄 `text-[12px] font-normal leading-4`(`:128`), 상태 줄 `text-[12.5px] leading-4`(`number-pad-sheet.tsx:289`), 라벨 `14px/1.5`(`:105`), 위 줄 `15px font-medium`(`:144`). 굵기는 이 phase 에서 400/500 만 추가, 발동잔량 600 은 상속.
- 이탈/주의: 상태 줄 `leading-4`(16px) 에 12.5px 글자는 계약 「16px」과 일치하나 둘째 줄(「감시 중」) 포함 시 두 줄 32px 가 되며 `min-h-4` 라 고정 높이 보장은 하단 고정 레이아웃에 의존한다. 아래 줄 12px 와 상태 줄 12.5px 는 0.5px 차이 근접 쌍(계약 Checker FLAG, 사용자 채택값이라 유지).
- 한계: 15px/500 의 `tabular-nums` 폭 보장은 E2E 폭 백스톱에 위임(`:1049`는 tabular-nums 명시, `:1033,1040` 일부 span 은 `tabular-nums` 가 자식에만 있음).

### Pillar 5: Spacing (3/4)

- 임의 값은 `[56px]` `[44px]` `[10px]` `[15px]` `[685px]`(컨테이너 쿼리 경계) 등 계약 상속/신규 치수와 일치. 56px 은 행 높이 컴포넌트 치수로 간격 스케일 위반 아님(Checker FLAG 인정). 새 간격 토큰 추가 없음.
- 높이 분리: 수량 8 + 파생 2 = 56, 나머지 44 — `ROW_BOX`(`:80`) / `ROW_BOX_TALL`(`:93`), 체크 값 행 `min-h-[56px]` vs `min-h-[44px]`(`:951`).
- 위험: 31-07 SUMMARY 의 최소 여유 annotation — P24-7: 344 2.6 · **685 0.4** · 830 2.9 · 992 9.9 / P20-3: 344 3.9 · **685 0.4** · 830 2.9 · 992 32.6. 685 에서 0.4px 는 서브픽셀 반올림, 폰트 로딩 차이로 뒤집힐 수 있는 수준이다. 계약은 「685 경계 · 최소 여유 +1.2px 그대로」 라 했으나 실측은 이보다 낮다(체크 값 행 때문). 즉 계약의 폭 추정이 체크 값 행에서 틀렸고 코드로 보정했다.
- 한계: E2E 기하 단언 통과(132 passed)는 신뢰하되 이번 감사에서 재실행하지 않았다.

### Pillar 6: Experience Design (3/4)

- 상태 커버리지: 시트 상태 줄 우선순위 ①~⑤(`number-pad-sheet.tsx:187-198`) 구현, `canConfirm` 경로로 적용 버튼 비활성, 잠금은 `role=alert`·환산은 `role=status`(`:293,303`) — 계약과 일치. 인라인 편집 아래 줄 실시간 갱신·편집 상자 56 고정, 거울 글자 auto-width 로 9자리 잘림 수정(31-07).
- 접근성: 값 행 `aria-label` = `rowNameOf(label,text,sub)`(`:943`)로 「선매수 매도잔량 1,000만 777주」 형식. 파생 행 sr 접두 유지. 비교가 0 오류에 대한 `aria-invalid` 류 신호는 없다(계약 범위 밖).
- 파괴적 동작: 없음(계약과 동일). 등록 차단 8 판정 순서·접미 구현·테스트됨(31-06).
- 미완/위험:
  - S3/S4/S6 시각 확인 backstop 미실시, 실서버 실증(D12)·AMT-01 Pending, relay·미리보기 배포는 사용자 실행 대기(31-08, VALIDATION Manual-Only).
  - fake-gateway(스텁)에 의존한 E2E 라 구 relay/신 relay 혼재 상황(84 `postBuyFloorAmount` 부재 → 「불러오는 중」)의 실제 화면은 /me 에서 단위·E2E 로만 확인.
  - `lc-submit-error` 로 노출되는 P31-4 차단은 스위치 위치와 떨어져 있어 사용자가 원인을 놓칠 수 있다.
- Registry audit: 제3자 레지스트리 없음 — 검사 대상 0 (components.json registries 비어 있음, 계약 Registry Safety 와 일치).

---

## Files Audited

- /Users/alex/repos/gh-radar/.planning/phases/31-limitchaser-amount-unit/31-UI-SPEC.md
- /Users/alex/repos/gh-radar/.planning/phases/31-limitchaser-amount-unit/31-07-SUMMARY.md, 31-08-SUMMARY.md (나머지 SUMMARY/PLAN 은 목록 확인 수준)
- /Users/alex/repos/gh-radar/webapp/src/components/trading/lc/setting-group.tsx
- /Users/alex/repos/gh-radar/webapp/src/components/trading/lc/number-pad-sheet.tsx
- /Users/alex/repos/gh-radar/webapp/src/components/trading/lc/lc-fields.ts
- /Users/alex/repos/gh-radar/webapp/src/components/trading/limit-chaser-form.tsx (문구 grep)
- 변경분 diff grep: /Users/alex/repos/gh-radar/webapp/src/components/trading, /me (하드코딩 색·임의 px)
