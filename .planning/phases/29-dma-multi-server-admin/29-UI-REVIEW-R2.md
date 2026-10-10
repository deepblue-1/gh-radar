# Phase 29 — UI Review (ROUND 2, gap-closure 29-27 … 29-44)

**Audited:** 2026-10-11
**Baseline:** 추상 6-필러 기준 (UI-SPEC.md 없음) + 채택 목업 admin-control A (`reference/mockup-g1-account-order-server.html`) · workbench-display A (`reference/mockup-g1-workbench-order-server.html`) + 29-CONTEXT + globals.css 토큰
**Screenshots:** 미캡처 — `localhost:3100` HTTP 000(개발 서버 없음). 다른 세션과 머신을 공유하므로 서버를 띄우지 않았다. 코드 전용 감사다. 시각 결론은 전부 코드 도출이며 픽셀 대조·실측 폭은 확인하지 못했다.
**Interaction captures:** off (workflow.ui_interaction_capture=false). 상호작용 결론은 전부 코드 도출.

범위: R1 Top 이슈의 해소 여부 + 29-38(주문 서버 세그먼트) · 29-39(작업대 칩·경고 줄) 신규 UI.

---

## R1 이월 결함 처분

| R1 항목 | R2 상태 | 근거 |
|---|---|---|
| 데스크톱 시트 blur 오버레이 | 해소 | `admin-sheet.tsx:72-77` 데스크톱 `modal={false}` · `overlay={!desktop}` · `onInteractOutside` preventDefault. `AdminPanelPage` 가 본문 폭 784+ 에서 오른쪽 440 을 비운다(컨테이너 쿼리, 뷰포트 아님) |
| 터치 타깃 28/32px | 해소(폰만) | `h-9 sm:h-7`(account-editor:256, role-segment:31) · `h-9 sm:h-8`(server-card:122) → 폰 36px. 단 권장 44px 미달 |
| 「사용 중」 토글 이유 title 전용 | 해소 | `server-in-use-note` 상시 한 줄 + `aria-describedby` (29-31) |
| `Button size="sm"` 글자색 소실 | 미해소(범위 밖 파일) | `button.tsx` 미변경. `admin/password-change.tsx:117`, `pending-section.tsx:106` 이 여전히 `h-7`(28px) 사용 |
| 타이포 스케일 이탈 | 악화 | 아래 Pillar 4 |
| chat-sheet 384px 가능성 | 미확인 | 범위 밖 |

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 해요체·원인 포함·행동 지시가 있는 새 문구. 단 「클라(OCX)」 약어와 「주문 서버 KB120 → KB121 …」 한 줄이 길고 내부 용어 |
| 2. Visuals | 3/4 | 채택 A 와 구조 일치(세그먼트 · 꼬리표 + 칩). 서버 키 칩 10px/700 은 작고, 꺼진 칸이 취소선+faint 라 「고장」과 「선택 불가」 구분 약함 |
| 3. Color | 2/4 | `--led-latent` 주황이 경고 5곳 + 꺼진 선택 칸에 쓰이는데 라이트 값 `#ff9f1a` 는 흰 배경 대비 약 2:1 — 11~12px 경고 문구가 읽기 어렵다 |
| 4. Typography | 2/4 | 하드코딩 px 12종(10 · 10.5 · 11 · 12 · 12.5 · 13 · 14 · 15 · 16 · 17 + 토큰 2) · 굵기 3종. R1 보다 늘었다 |
| 5. Spacing | 3/4 | 폰 36px 로 개선, 새 줄도 4/8 계열. 44px 미달 · 상태줄 칩 h-[18px] · 선택 `h-[26px]` 은 작은 타깃 |
| 6. Experience Design | 3/4 | 비모달 전환 · 상호 배타 시트 · 즉시 저장 · 꺼진 지정 경고 · 닫기 불가 경고는 잘 설계. 비모달 시트의 포커스 관리와 경고 `role` 처리가 약점 |

**Overall: 16/24** (R1 17/24)

점수가 내려간 이유: R1 이 지적한 타이포·색 문제가 새 UI 에서 같은 방식으로 반복되어 늘었다. 구조·상호작용(필러 6)은 R1 보다 낫다.

---

## Top Priority Fixes

1. **WARNING — `--led-latent` 라이트 대비 부족** (`workbench-status-bar.tsx:107` AUX_LINE, `account-editor.tsx:270-271` WARN_LINE · ORDER_ITEM_OFF_ON, globals.css:121) — 「끄지 못했어요 · 클라(OCX)에서 끄세요」 는 운영자가 반드시 읽어야 할 위험 경고인데, 라이트 테마에서 11px 주황(#ff9f1a)은 흰 바탕 대비가 약 2:1 이다(다크 #ffb13d 는 무난). — 경고 **글자**는 라이트에서 더 어두운 주황/갈색 토큰(예 `--led-latent-text`, 대비 4.5:1 이상)으로 쓰거나 아이콘 + `--fg-2` 글자 + 주황 좌측 막대로 바꾼다. 실제 대비는 실측 필요(미실측).
2. **WARNING — 타이포 일원화** — `text-[12px]` 22 · `[12.5px]` 20 · `[14px]` 6 · `[11px]` 6 · `[15px]` 5 · `[13px]` 3 · `[10px]` 2 · `[10.5px]` · `[17px]` · `[16px]` + 토큰 `--t-sm` 3 · `--t-caption` 1. 12 와 12.5 가 42곳에 중복(R1 36). 새 UI(세그먼트 12.5, 서버 라벨 12, 경고 줄 11~12, 칩 10)가 계속 늘렸다. — 12.5 → 12 로 합치고 `--t-*` 토큰으로 치환하는 별도 quick 하나.
3. **WARNING — 폰 터치 타깃 44px 미달 + 잔존 `h-7`** — 폰 36px 는 개선이나 `password-change.tsx:64,113,117` · `pending-section.tsx:106` 은 여전히 28px(폰 변형 없음). 작업대 계좌 `select` 는 `h-[26px]`, 닫기 × 는 `size-5`(20px)·`size-8`. — 잔존 4곳에 `h-9 sm:h-7` 을 적용하고, 안내 닫기 버튼은 `before:` 로 클릭 영역만 36px+ 로 확장.
4. **WARNING — 서버 키 칩 가독성** (`workbench-status-bar.tsx:422`) — 10px · 700 · `--fg-2` on `--muted`. 이 칩은 「이 주문이 어느 서버로 가나」 를 알리는 안전 정보인데 상태줄에서 가장 작은 글자다(R1 메모리의 「크기 과장 금지」 와 균형 필요하지만 10px 은 하한). — 11px 로 올리고 칩 안에 `title` 만이 아니라 `aria-label="주문 서버 KB121"` 부여.
5. **WARNING — 꺼진 서버 칸 표현** (`account-editor.tsx:269-270`) — `line-through + --faint`. 취소선은 「삭제됨」 으로 읽히고, 꺼진 칸은 `disabled` 라 왜 못 누르는지 칸 안에 설명이 없다(경고 줄은 「꺼진 지정」 일 때만 뜸). — 취소선 대신 점선 테두리 + 칸 `title`/보조 줄 「서버 꺼짐」, 터치 사용자용 설명은 경고 줄이 아니라 세그먼트 아래 상시 1줄로.
6. **WARNING — 비모달 시트 키보드 포커스** (`admin-sheet.tsx:72`) — `modal=false` 는 포커스 트랩이 없다. 열림 시 포커스가 시트로 가는지, 닫을 때 호출한 행으로 복귀하는지 코드로 확인되지 않는다(Radix 비모달은 `onOpenAutoFocus` 가 기본 동작이지만 `onCloseAutoFocus` 로 트리거 복귀는 비모달에서 보장되지 않음). — 닫힘 시 선택 행 포커스 복귀를 명시하고 e2e 로 한 번 확인.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 잘한 점: 문구 상수화 유지(`ACCOUNT_EDITOR_TEXT`, `WORKBENCH_STATUS_TEXT`) · 해요체 · 원인+행동 포함 (`workbench-status-bar.tsx:99-103` 「끄지 못했어요 · 클라(OCX)에서 끄세요」). `count === null` 일 때 「몇 건인지 모름」 으로 모름을 숨기지 않는 점이 좋다. `orderServerOff` 「KB121 꺼짐 — 기본 KB120 으로」 는 결과를 알려 준다.
- 결함: 「클라(OCX)」 · 「대사」 는 운영자 전용 은어. 트레이더 화면(상태줄)에 노출되는데 사용자 계층이 Admin 으로 한정되지 않는다 — 일반 사용자는 못 읽는다. 「주문 서버 KB120 → KB121 — 옛 서버 잔고 · 미체결은 클라(OCX) 대사로 맞추세요」 는 한 줄에 사실·행동 둘이 섞여 11px 에서 두세 줄로 접힌다.
- 결함: 세그먼트 첫 칸 「기본 · KB120」 은 의미(`기본`=증권사 기본 서버)가 시트 안내 문장(`orderServerNote`, 852행)에만 있다.
- 1대일 때 「주문 서버 KB120 (기본)」 은 명확하다.

### Pillar 2: Visuals (3/4)
- 채택 A 대응: 서버 칩 줄 아래 「주문 서버」 세그먼트(account-editor:481-519), 작업대 필 옵션 꼬리표 + 필 옆 칩(status-bar:408-428) — 구조는 목업과 일치(구조 대조만, 픽셀 비교 안 함).
- 1대면 컨트롤 대신 글자만 — 선택지 없는 컨트롤을 만들지 않는 좋은 결정.
- 결함: 꺼진 선택 칸의 취소선(위 Fix 5). 꺼진 지정 칸이 「선택됨 + 취소선 + 주황」 3신호를 겹쳐 한 칸에 의미가 과적재.
- 결함: 서버 키 칩과 필 `select` 가 별개 요소라 폰에서 줄바꿈되면 칩이 필과 떨어져 「누구의 칩인가」 가 흐려질 수 있다(29-39 SUMMARY 도 인지). 꼬리표(옵션 안 `· KB121`)는 select 닫힘 상태에서 보이므로 보완은 된다.
- 경고 줄(`workbench-stale-strategies`)은 `basis-full` 로 상태줄 끝에 선다 — 위계상 가장 위험한 정보가 가장 작은 글자(11px)이고 맨 아래. 아이콘 없음.

### Pillar 3: Color (2/4)
- 하드코딩 hex: 새 파일 없음(admin-sheet.tsx:84 주석 1건) — 토큰 일관성은 유지.
- `--led-latent` 사용: 상태줄 경고 · 안내(AUX_LINE), 계좌 꺼진 지정 경고(WARN_LINE), 꺼진 선택 칸(ORDER_ITEM_OFF_ON), 서버 카드 stale 한 줄 등. 「잠복 LED」 로 정의된 토큰(globals.css:113)을 「경고 문구 글자색」 으로 재사용 — 의미 겹침. 라이트 `#ff9f1a`, 다크 `#ffb13d`(globals.css:121, 263). 라이트 대비는 약 2:1 로 추정(미실측) — 글자색으로는 부적합.
- 칩·경고·이전 R1 의 「파랑 admin vs 파랑 주문 서버 배지」 겹침은 이번 범위에서 새로 해소되지도 악화되지도 않았다.
- 주황이 「경고」 이면서 「꺼진 서버 칸」 으로도 쓰여 같은 색이 위험과 비활성을 동시에 가리킨다.

### Pillar 4: Typography (2/4)
- 크기 분포(admin + status-bar): 12px×22 · 12.5px×20 · 14px×6 · 11px×6 · 15px×5 · 13px×3 · 10px×2 · 10.5px×1 · 17px×1 · 16px×1 + `--t-sm`×3 · `--t-caption`×1. 기준 ≤4 대비 크게 초과(R1 7종 → 10종+).
- 굵기 (admin): semibold 16 · bold 6 · medium 4 — 3종(R1 3종과 동일, 기준 ≤2 초과). 서버 키 칩 700 은 프로젝트의 「위계는 색 대비로, 굵기 과장 금지」 원칙과 어긋난다.
- 12 / 12.5 중복은 세그먼트(12.5)·라벨(12)을 같은 줄에 둬 눈에 띄는 불일치를 만든다(account-editor:268 vs 498).

### Pillar 5: Spacing (3/4)
- 개선: 폰 36px 타깃을 `h-9 sm:h-7` 로 폰만 키워 데스크톱 밀도 유지(경계 640 = 시트·앱 셸과 동일, 일관).
- 임의값은 칩 미세 조정 수준 유지(`gap-[5px]`, `size-[7px]`, `pl-[46px]`, `p-0.5`). 새 임의값: `PANEL_RESERVE` 의 784 · 440 은 근거 주석이 있고 테스트로 고정되어 허용.
- 결함: 상태줄 칩 `h-[18px]` · 계좌 select `h-[26px]` · 안내 닫기 `size-5` 는 터치 타깃이 아니라 표시지만 `select` 와 닫기는 조작 요소.
- 작업대 반응형은 globals.css §2.2b 의 본문 폭 컨테이너 밴드를 정본으로 하는데, 상태줄 새 줄(`basis-full`)이 밴드별로 어떻게 접히는지 코드만으로는 확인하지 못했다(685 · 830 · 992 경계, 미실측).

### Pillar 6: Experience Design (3/4)
- 잘한 점: (a) 비모달 시트에서 편집·생성 시트 상호 배타(29-31), (b) 즉시 저장 + 비행 중 마지막 값만 + `releaseOn` 으로 재조회 때 의도 해제, (c) 꺼진 지정 경고와 `disabled` 칸 잠금, (d) 마지막 계좌·중복 계좌 가드를 화면이 먼저 안다, (e) 삭제 확인에 꺼진 서버 안내(`disabledServersNote`) + skipDisabled 로 막힌 삭제 우회, (f) stale 전략 경고는 닫기 없음 — 위험 신호를 사용자가 치울 수 없게 한 설계가 맞다.
- 결함: 비모달 시트 포커스 복귀 불확실(Fix 6). Esc · × 는 유지.
- 결함: `workbench-stale-strategies` 는 `role="status"`(polite). 주문이 영향받는 위험 경고라 `role="alert"` 가 맞을 수 있으나 상태줄에 상시 상주하는 줄이라 반복 낭독 문제가 있다 — 최초 등장 때만 alert 로 올리거나 현 상태를 유지하고 사유를 문서화.
- 결함: `movedFrom` 안내는 탭 로컬 dismiss — 새로고침 시 재등장. 운영 안내라 합리적이나 어느 정도 소음.
- 미검증: 모바일 바텀시트의 `max-h-[92dvh]` + 키보드 노출 시 푸터(삭제 · 저장) 가림, 세그먼트 롤링 중 `save.state` 플래시 모션과 `prefers-reduced-motion`.
- Registry audit: 해당 없음.

---

## 검증 한계
- 개발 서버 없음 → 스크린샷 0장. 폭(390 · 1080) · 컨테이너 밴드 접힘 · 실측 대비는 모두 미확인. 재검증 시 `shots/` 에서 29-38 · 29-39 e2e 캡처(P29-G1 390/1080)를 열어 위 Fix 1 · 4 · 5 를 눈으로 확정하길 권한다.
- 목업 HTML 은 열지 않았다(SUMMARY 의 채택 기술과 코드 주석의 일치만 확인).

## Files Audited
- `webapp/src/components/admin/{account-editor,admin-sheet,role-segment,server-card,servers-client,use-field-save,user-sheet,users-client}` (부분 열람: admin-sheet 전체, account-editor 주문 서버 구간 · 상수, 나머지는 grep)
- `webapp/src/components/ui/sheet.tsx`(overlay prop — SUMMARY 로 확인), `webapp/src/components/trading/workbench/workbench-status-bar.tsx`(AUX_LINE · AccountPill · 경고 줄), `trading-workbench.tsx`(grep 수준)
- `webapp/src/components/admin/{password-change,pending-section}.tsx`(잔존 `h-7` 확인)
- `29-UI-REVIEW.md`(R1) · SUMMARY 29-30 · 31 · 34 · 38 · 39 · 40
