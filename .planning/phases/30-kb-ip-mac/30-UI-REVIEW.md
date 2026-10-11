# Phase 30 — UI Review

**Audited:** 2026-10-11
**Baseline:** 30-UI-SPEC.md (Addendum A1/A2 포함)
**Screenshots:** not captured (3100 에 dev server 없음 · Admin 화면은 인증 뒤라 정적 캡처가 첫 화면만 찍음) — 전부 코드 감사
**Interaction captures:** off (workflow.ui_interaction_capture is false) — 상호작용 findings 는 코드에서 도출

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | 계약 문구 · aria-label 전부 `ACCOUNT_EDITOR_TEXT` 한 곳에서 일치, A1 표기 반영 |
| 2. Visuals | 3/4 | 편집 카드 구조는 계약대로, 검증 오류가 입력칸과 프로그램적으로 연결 안 됨 |
| 3. Color | 3/4 | 신규 토큰 0 · 하드코딩 색 0, 단 정보성 공유 안내가 경고색(amber) |
| 4. Typography | 3/4 | 신규 요소는 12/14 · 400/600 준수, 컴포넌트 전체는 5개 크기(10.5·11·12·12.5·14) |
| 5. Spacing | 3/4 | 신규 간격 전부 mt-1/2/1.5/2.5 계약 범위, 경고 줄이 최대 4줄 연속 쌓일 수 있음 |
| 6. Experience Design | 3/4 | 상태 커버리지 양호, 접근성 연결 · 비활성 title 도달성 · 시각 검증 공백 |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **검증 오류 줄이 입력칸에 연결되지 않음** — `aria-invalid` 만 있고 `aria-describedby` 가 없어(`account-editor.tsx:811,829`; 파일 전체 grep 0건) 스크린 리더는 「무엇이 틀렸는지」를 입력칸에서 못 듣는다. 오류 줄(`data-slot="admin-account-edit-invalid"`, 838행)에 id 를 주고 해당 칸에 `aria-describedby` 로 묶는다(오류 없을 땐 도움말 id).
2. **「다른 계좌 편집 중」 안내가 `title` 뿐** — 비활성 버튼의 `title`(752행)은 터치 · 키보드 사용자에게 안 보인다(폰 390 이 주 사용 환경). 막은 이유가 전달되지 않아 버튼이 고장난 것처럼 보인다. 편집 중 카드 근처에 상시 NOTE 한 줄을 두거나, 잠금 상태에서 `aria-disabled` + 포커스 가능한 형태로 바꾼다.
3. **시각 검증 공백(backstop 4건 미확인)** — E1/E2/E4/E7 의 폰 390 overflow backstop(17자 MAC · 40자 계좌명 · placeholder · 공유 안내)을 이번 감사에서 렌더로 확인하지 못했다. e2e P30 이 390 · 1080 에서 돌지만 스크린샷 산출물이 없다. 인증된 Playwright 세션으로 `--workers=1`, 390 에서 편집 모드 + 불일치 2줄 + 공유 안내 + 실패 결과 줄이 동시에 뜨는 최악 케이스를 한 장 캡처해 확인할 것.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- 보이는 글자 「편집 · 취소 · 저장」 과 접근 이름 `"{broker} {accountNo} 편집 / 편집 취소 / 편집 저장"` 이 계약 그대로(`account-editor.tsx:750,863,873`, 문구 상수 130~165행). 접근 이름이 보이는 글자로 끝나 WCAG 2.5.3 충족.
- 라벨 「계좌명 · 주문자 IP · MAC 주소」, placeholder, 도움말, 교보 해당 없음, 검증 3종, 「변경 없음」, 「이름 없음」, 「미설정(서버 NIC 값)」, 「확인 전」 전부 계약과 일치.
- A1: 불일치 줄(147행)·읽기 줄(464~466행)·편집 초깃값(697~698행)이 `formatOrderIp/Mac` 경유. A2: `sharedAccountNote` 문구가 계약 일치.
- 서버 message 는 원문 그대로 전달(D-12 준수). 일반 라벨(Submit/OK) 사용 없음.
- 사소: 도움말 문장(ipmacHelp)이 길어 폰에서 3줄 이상 감길 수 있다 — 계약 문구라 결함은 아님.

### Pillar 2: Visuals (3/4)
- 편집 중 카드 = `border-[var(--primary)]` 단일 앵커(739행), 제목줄에서 계좌명 · 「편집」 숨김, `autoFocus` 계좌명 칸(788행), 닫힐 때 「편집」 포커스 복귀(615행) — 계약대로.
- 아이콘 전용 버튼 없음(전부 글자 + aria-label).
- 결함: 오류 줄과 입력칸 연결 없음(Fix 1). 오류 줄이 `role` 없이 입력마다 바뀌므로 `aria-live` 도 없다 — 의도(계약: role 없음)이나 스크린 리더 사용자는 저장 비활성 이유를 알 수 없다.
- 편집 모드에서 읽기 IP/MAC 줄을 숨기고(900행 분기) 입력칸이 대신하므로 「현재 저장된 값」 비교 기준이 화면에서 사라진다. D-10 불일치 줄만 남는다 — 계약 의도이나 값 확인용 참조점은 없다(WARNING 수준 아님, 참고).

### Pillar 3: Color (3/4)
- 하드코딩 hex/rgb 0건(grep). 전부 `var(--...)` 토큰. accent(`--primary`)는 「저장」 면 · 편집 카드 테두리 · 포커스 3곳만.
- 결함: A2 공유 계좌 안내(854행)는 정보성인데 `WARN_LINE`(`--led-latent` amber)을 쓴다. 계약이 지정했지만, 같은 카드에 불일치 경고 · 결과 warn · 주문 서버 경고(990, 1056행)가 모두 amber 라 「진짜 경고」와 「참고」 가 구분되지 않는다. 의미 과적재.
- 편집 모드의 결과 warn(offline)과 err(failed)는 색만 다르고 문구 접두(`실패`/`미반영`)로 구분되어 색약 대응은 충분.

### Pillar 4: Typography (3/4)
- 신규 요소: 12px/400 · 12px/600(`IPMAC_VALUE`) · 14px/600(제목줄) — 계약 일치. `EDIT_ERROR_LINE`(403행) 12px 로 도움말과 줄 높이 동일.
- 컴포넌트 전체 크기: 10.5 · 11 · 12 · 12.5 · 14px (파일 내 `text-[...]` 분포), 굵기 400 · 500 · 600. 12px 와 12.5px 가 같은 카드에 공존(`ERROR_LINE` 12.5 vs `EDIT_ERROR_LINE` 12; 주문 서버 줄 12.5 vs `NOTE` 12). Phase 29 상속이며 계약이 예외로 문서화 — 감점 사유는 「신규 요소가 그 혼재를 더 키우지 않았지만 정리도 안 했다」.
- 제목줄 계좌명 500 굵기(446행)는 계약이 문서화한 예외.

### Pillar 5: Spacing (3/4)
- 신규 간격 `mt-1`(IP/MAC 줄) · `mt-2`(그리드) · `mb-1`(라벨) · `gap-2` · `mt-1.5` · `gap-1.5` · `mt-2.5` — 전부 계약 범위. 임의 px 값은 기존 카드 상수뿐.
- 터치 타깃: 버튼 `h-9`(폰) / `sm:h-7`, 입력 `size="sm"` 32px — 폰 입력 32px 는 36~44px 권장보다 작다(계약 고정값, 추가 폼과 동일).
- 최악 케이스: 편집 모드에서 [도움말/오류] + [불일치 N줄] + [공유 안내] + [결과 줄 N개]가 모두 `mt-1.5` 로 연속되어 폰 390 에서 7줄 이상 쌓일 수 있고, 그 사이 구분이 amber/red 글자색뿐이다.

### Pillar 6: Experience Design (3/4)
- 상태 커버리지: 저장 중(`readOnly` · 버튼 비활성, 864, 874행) · 실패(편집 유지, `role="alert"`) · 부분 실패 · offline warn · HTTP 오류 · 변경 없음 · 한 카드 잠금 · 취소 · 재조회 시 초안 유지 모두 구현. 파괴적 동작 신규 없음.
- 결함 1: 비활성 「편집」 의 이유가 `title` 만(Fix 2).
- 결함 2: 저장 중 스피너 없음은 계약이지만, 저장 지연(relay timeout)이 길면 「저장」 이 단순히 회색이 되어 진행 중인지 알기 어렵다. 입력이 `readOnly` 로 바뀌는 신호뿐.
- 결함 3: Escape 로 편집 취소 불가(계약에 없음). 키보드 사용자는 Tab 으로 「취소」 까지 가야 한다. 계약 밖이라 WARNING.
- 결함 4: 두 칸을 비우고 저장 = 미설정 되돌리기는 확인 없이 진행(계약 결정). 공유 계좌가 있으면 다른 사용자의 IP/MAC 도 함께 지워지는데, 안내 줄이 이를 말하지만 「지운다」 가 아니라 「바뀌어요」 로만 쓰여 비우기의 파급이 덜 드러난다.
- 시각 검증 없음(Fix 3). Registry audit: 서드파티 레지스트리 0 — 해당 없음.

---

## Files Audited
- webapp/src/components/admin/account-editor.tsx
- .planning/phases/30-kb-ip-mac/30-UI-SPEC.md, 30-CONTEXT.md, 30-01..30-09 SUMMARY/PLAN (git log 로 Phase 30 변경 파일 대조)
- (미열람) webapp/e2e/specs/admin.spec.ts, user-sheet.tsx, users-client.tsx
