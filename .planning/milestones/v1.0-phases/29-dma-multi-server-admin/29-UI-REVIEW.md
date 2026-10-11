# Phase 29 — UI Review

**Audited:** 2026-10-10
**Baseline:** 추상 6-필러 기준 (UI-SPEC.md 없음) + 채택 목업 `reference/mockup-admin-{users,servers,user-create}.html` + 29-CONTEXT 결정(D-13~D-15 등) + `deferred-items.md`
**Screenshots:** 미캡처 — `localhost:3100` 응답 없음(HTTP 000), 개발 서버가 떠 있지 않았다. 코드 감사 + 실행 플랜이 남긴 `shots/29-15·17·18·19·22` 중 2장(`admin-users-390.png`, `admin-servers-1080.png`)을 직접 열어 확인했다. 이 캡처들은 이번 감사가 새로 찍은 것이 아니다.
**Interaction captures:** off (workflow.ui_interaction_capture=false). 상호작용 관련 결론은 전부 코드 도출이다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 문구 상수화·해요체 일관, 오류에 원인 포함. 단 "서버 칩 = 그 서버 users.toml 반영 상태" 같은 내부 용어 노출, 빈 목록 문구 미확인 |
| 2. Visuals | 3/4 | 서버 카드·사용자 행 위계 명확. 사용 중 토글이 "꺼진 듯" 보이는 비활성 표현, 주문/시세 칩 상태 구분이 색에 크게 의존 |
| 3. Color | 3/4 | 토큰(`--primary`, `--destructive`, `--led-armed`) 일관. 상태 칩 4색(녹·적·황·파)이 한 행에 겹쳐 accent 과다 |
| 4. Typography | 2/4 | 토큰 `--t-*` 와 하드코딩 px(11/12/12.5/13/14/15/16) 혼용, 크기 7종 이상 |
| 5. Spacing | 3/4 | gap/px 값 대부분 4 배수 계열이나 `h-7`(28px) 버튼·`px-[5px]`·`py-px` 등 예외, 터치 타깃 부족 |
| 6. Experience Design | 3/4 | 로딩 스켈레톤·오류 재시도·삭제 확인·부분 실패 칩 모두 갖춤. 데스크톱 시트 오버레이·`size="sm"` 결함 등 이월 결함 미해결 |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **`Button size="sm"` 글자색·크기 소실 결함 (WARNING, Admin 밖으로 전파)** — `text-[var(--t-caption)]` 를 tailwind-merge 가 글자색으로 읽어 변형 글자색을 지운다. 라이트 테마 기본(파랑) 작은 버튼 글자가 검정으로 그려질 수 있어 가독성이 깨진다. Admin 은 `ADMIN_BUTTON_PRIMARY/SECONDARY` 로 우회했을 뿐 다른 `size="sm"` 사용처는 그대로다. — `button.tsx` 의 `text-[var(--t-caption)]` 를 `text-[length:var(--t-caption)]` 로 바꾸고 사용처 시각을 한 번에 확인한다(별도 quick).
2. **데스크톱 Admin 시트 배경 흐림이 목업 A 와 다르다 (WARNING)** — 목업은 스크림 없이 목록이 그대로 보여 행 사이를 오가는 그림(D-14 「목록은 남는다」)인데, 구현은 `SheetOverlay` backdrop-blur 로 목록이 흐려지고 바깥 클릭이 시트를 닫는다. 사용자 관리 반복 작업(행 → 행)이 한 번씩 막힌다. — 데스크톱(≥md) 한정 비모달 시트로 바꾸거나 오버레이를 투명·blur 없음으로 한정한다.
3. **터치·클릭 타깃이 작다 (WARNING)** — 계좌 편집 버튼·역할 세그먼트가 `h-7`(28px), 서버 라디오 칩이 `h-8`(32px). 모바일(390) 에서 관리 작업에 오탭 위험이 있다. — 모바일 구간에서 최소 36~40px 로 키우거나 클릭 영역만 `before:` 로 확장한다.
4. **타이포 스케일 이탈 (WARNING)** — 하드코딩 `text-[12px]`(18) · `[12.5px]`(18) · `[13px]` · `[14px]`(6) · `[15px]`(5) · `[11px]` 가 토큰 `--t-sm` 등과 섞여 있다. 12 와 12.5 처럼 구분이 안 되는 값이 중복이다. — 12/12.5 를 하나로 합치고 `--t-*` 토큰으로 일원화한다.
5. **`chat-sheet` 폭 결함 가능성 (WARNING)** — `AdminSheet` 는 `data-[side=right]:` 접두로 고쳤으나 `components/chat/chat-sheet.tsx` 262행은 같은 문법이 남아 384px 로 줄어들 가능성이 있다. 실측 후 같은 접두로 정리한다.
6. **서버 목록 "사용 중 토글" 비활성 표현 (WARNING)** — 29-18 캡처에서 KB120·KYOBO119 의 켜짐 토글이 어둡게(`opacity-45`) 그려져 "꺼짐/고장" 으로 읽힌다. 이유(`inUse` 문구)는 `title` 에만 있어 터치·키보드 사용자는 못 본다. — 카드 안에 보조 문구 1줄을 상시 노출한다.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 문구가 `*_TEXT` 상수로 모여 있고(`user-sheet.tsx:61-71`, `server-card.tsx:59`, `account-editor.tsx:52`) 해요체·원인 포함 오류(`삭제하지 못했어요 · {detail}`)로 일관된다. CTA 는 "승인", "+ 사용자", "+ 서버", "삭제", "정리 뒤 다시 삭제" 처럼 구체적이다. 일반 라벨("Submit/OK") 없음.
- 삭제 확인이 대상(`user.email`)을 명시하고 "되돌릴 수 없어요." 를 알린다(`user-sheet.tsx:281`) — 좋다.
- 결함 1: "서버 칩 = 그 서버 users.toml 반영 상태"(`admin-users-390.png`) 는 `users.toml` 이라는 구현 용어를 운영자에게 그대로 보인다. 운영자라 수용 가능하나 "서버 칩 = 서버별 반영 상태" 가 낫다.
- 결함 2: 시트 안 칩 "KYOBO127 · 미반영", "KB121 · 실패 · BUSY" 의 `BUSY` 는 코드 그대로다(`code 0~12` 한국어 message 와 병행하는지 사용자 시트에서 확인 필요).
- 결함 3: `servers-client.tsx` / `users-client.tsx` 에서 `kind === "empty"` 분기를 찾지 못했다. 사용자 0명·서버 0대(레지스트리 비움) 때의 빈 상태 문구는 코드에서 확인되지 않았다(미검증, 감점 근거로만 기록).
- 미확인: `/pending` 의 `PendingCard` 본문 카피는 열어 보지 않았다.

### Pillar 2: Visuals (3/4)
- 서버 화면: 증권사 그룹 제목 → 카드(키 굵게 16px/700 → 호스트 → 상태 칩 → 주문/시세 라디오) 위계가 분명하다. 초점은 키+배지.
- 사용자 목록: 아바타 + 이메일(굵게) + 역할 칩 + DMA id + 서버 칩 구조. "웹 유저 없음"/"서버에만 있음" 점선 칩이 일반 칩과 구분된다 — 좋다.
- 결함: 아바타 이니셜 원형이 승인 대기(`!` 황색)와 일반 사용자에서 다르지만 텍스트 라벨 의존이 크다. 의미 구분은 칩 텍스트가 해 준다(색만 의존 아님 — 통과).
- 결함: 아이콘만 있는 요소는 `aria-label` 이 admin 전반에 분포(총 36개 이상)하나 `reflect-chip.tsx` 는 0개다. 칩은 텍스트를 포함하므로 허용되지만 색(녹/적/황)이 상태 전달의 주 신호라 대비·색약 점검이 필요하다.
- 결함: 모바일 캡처 하단 좌측 사용자 아바타(원형 `I`) 플로팅 버튼이 목록 마지막 줄과 겹쳐 보인다(`admin-users-390.png` 좌하단). 콘텐츠 하단 여백이 부족한지 확인 필요(공용 셸 문제일 수 있음).

### Pillar 3: Color (3/4)
- 하드코딩 색: `components/admin` · `app/admin` · `app/pending` 에서 `#hex`/`rgb()` 는 `admin-sheet.tsx:75` 주석 1건뿐 — 코드 색은 전부 토큰이다.
- 사용량: `--muted-fg` 25, `--fg` 17, `--destructive` 15, `--fg-2` 6, `--faint` 5, `--led-armed` 4, `--primary-fg` 3, `--primary` 2. 60/30/10 로 보면 중립이 지배적이고 accent(`--primary`)는 극히 적어 절제됐다.
- 결함: 한 사용자 행에 역할 칩(파랑/회색) + 서버 칩(녹/적/황) + 이메일이 동시에 색을 낸다. 4색 의미(녹=반영, 적=실패, 황=미반영, 파랑=admin)가 서로 겹쳐 "파랑 admin" 과 "파랑 주문 서버 배지" 가 같은 색으로 서로 다른 개념을 가리킨다(`admin-servers-1080.png` 의 주문 서버 배지 vs `admin` 칩 색 계열).
- 다크 테마: `--popover` 가 `--muted` 와 같은 색이라 시트 안 muted 면이 사라지는 문제를 `admin-sheet.tsx:75` 에서 우회했다. 근본 토큰 충돌은 남아 있다(다른 시트는 영향 가능).
- 라이트 테마 캡처는 실행 플랜의 `*-light-*` 만 확인(직접 열람 안 함).

### Pillar 4: Typography (2/4)
- 하드코딩 px 크기: `12px`(18) · `12.5px`(18) · `13px`(3) · `14px`(6) · `15px`(5) · `11px`(2) · `16px`(카드 제목). 토큰: `length:var(--t-sm)`(3). 한 화면 계열에서 7개 크기가 쓰인다(기준 ≤4 초과).
- 굵기: `font-semibold` 14 · `font-bold` 6 · `font-medium` 4 — 3종(기준 ≤2 초과). 프로젝트 레퍼런스 타이포 실측(탭 16/600 · 값 16/500)과도 `700` 이 섞여 어긋난다.
- 12 와 12.5 는 시각 차이가 거의 없는데 두 값이 36곳에 중복돼 유지보수 위험이다.
- 모바일 본문 12~12.5px 는 한국어에서 작은 편이다(메타 줄 · 칩 · 오류 문구가 모두 12.5).

### Pillar 5: Spacing (3/4)
- 빈도: `gap-2` 17 · `gap-1.5` 14 · `py-3` 10 · `px-2.5` 9 · `px-4` 8 · `gap-2.5` 7 · `px-5` 6 — 4/8 배수 + 0.5 단계의 일관된 체계다.
- 예외: `px-[5px]`, `py-px`(2), `py-0.5`(2), `gap-0.5`, `p-0.5` 같은 소수 단계는 칩 미세 조정이라 허용 범위이나 임의값이다.
- 터치 타깃: `h-7`(28px) 계좌 버튼 4곳(`account-editor.tsx:328,555,558,659`), `role-segment.tsx:28` `h-7`, 서버 칩 `h-8`(`server-card.tsx:112`). 모바일 44px 지침 미달.
- 시트 폭: `AdminSheet` 는 e2e 실측으로 440px 확정. `chat-sheet` 는 같은 결함이 남을 수 있다(deferred).

### Pillar 6: Experience Design (3/4)
- 로딩: `servers-client.tsx:150,269-279`, `users-client.tsx:125` 스켈레톤 + `aria-busy`. 재조회 때는 이전 목록 유지(깜빡임 없음 — `users-client.tsx:33` 설계 주석).
- 오류: 로드 실패 `role="alert"` + 재시도 버튼(`users-client.tsx:127-144`), 403 은 별도 문구. 시트 오류는 모든 폼에 `role="alert"` 존재.
- 파괴 작업: 사용자 삭제·마지막 계좌 제거가 `role="alertdialog"` 확인 1회(`user-sheet.tsx:384`), 부분 실패 시 시트 유지 + 서버별 칩. 본인 admin 권한 하강 차단(`selfLockout`). 마지막 계좌 제거를 화면이 먼저 안다(409 대기 안 함). 잘 만든 부분.
- 서버 끄기 보호: 주문/시세 주 서버는 끌 수 없다(`inUse`) — 이유가 `title` 에만 있다(모바일 비노출, 위 Fix 6).
- 이월 결함 미해결: (a) 데스크톱 시트 blur 오버레이(목업 A 와 상이), (b) `size="sm"` 글자색 소실, (c) chat-sheet 384px 가능성, (d) e2e 목 `quote-primary` 가 증권사 안에서만 플래그 변경 — 성공 경로 e2e 미보호(테스트 신뢰도 이슈, UI 결함 아님).
- 미검증: 실제 상호작용(포커스 순서·시트 포커스 트랩·키보드 `Esc`)은 개발 서버가 없어 확인하지 못했다. `/pending` 의 승인 감지 후 이동(폴링/수동 새로고침)과 트레이딩 작업대 주문 서버 바뀜 배지(`workbench-status-bar.tsx`, `shots/29-22`)는 코드 측 존재만 확인했고 시각 검증은 하지 않았다.
- Registry audit: 해당 없음(shadcn 3rd-party 레지스트리 목록 없음 — 확인 대상 아님).

---

## Files Audited
- `webapp/src/components/admin/*.tsx` (account-editor, admin-sheet, dma-connect-fields, password-change, pending-section, reflect-chip, role-segment, server-card, server-sheet, servers-client, user-create-sheet, user-row, user-sheet, users-client)
- `webapp/src/app/admin/{users,servers}/page.tsx`, `webapp/src/app/pending/page.tsx`
- `webapp/src/components/layout/app-sidebar.tsx` (Admin 그룹 주석·구조), `webapp/src/components/trading/workbench/workbench-status-bar.tsx` (존재 확인)
- `.planning/phases/29-dma-multi-server-admin/deferred-items.md`, `29-CONTEXT.md`(요약부), `shots/29-15/admin-users-390.png`, `shots/29-18/admin-servers-1080.png`
- 목업 HTML 3종은 파일 존재만 확인했고 픽셀 단위 대조는 하지 않았다(구현-목업 직접 비교 미실시)
