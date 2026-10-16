---
phase: "32"
slug: "account-axis"
status: approved
shadcn_initialized: true
preset: "radix-nova (components.json · baseColor neutral · Toss TDS 토큰 override)"
created: "2026-10-13"
reviewed_at: "2026-10-16"
amended: "2026-10-16 — /me 계좌 위 선택(목업 ⑥ B · CONTEXT D-20~D-25) · 아래 「2026-10-16 수정」 절이 S5~S8 · S10 보다 우선 · 2026-10-16 32-15 작업대 상단 줄 셀렉트 → 계좌 칩(「2026-10-16 수정 (32-15)」 절 우선) · 계좌 칩 화살표 = 선택(IN-02) · 2026-10-17 quick-261017-bwt 간격 4배수 · 끄기 버튼 옅은 면 · 끄기 어휘 · 칩 잠금 개별 aria-disabled"
---

# Phase 32 — UI Design Contract

> 계좌 축 정리(AXIS-01~05). gsd-ui-researcher 가 만들고 gsd-ui-checker 가 검증한다.
> **디자인 시스템은 이미 확립돼 있다.** 이 계약은 새 색 토큰 · 새 shadcn 컴포넌트 · 새 레지스트리를 만들지 않는다. 기존 상태줄 · 사이드바 3단 · 토스트 · /me 카드 문법을 **계좌 · 서버 축으로 다시 묶고 거르는 것**이 전부다. ~~새 파일은 공용 계좌 필(`AccountPill` 이전) 하나다.~~ (32-15: 공용 필 없음 — 작업대 · /me 모두 `MeAccountChips`)
> 결정 출처: `32-CONTEXT.md` D-01~D-25(잠금 · D-09 보정 포함), 채택 목업 `reference/mockup-account-axis.html` — ① 상단 줄 **A** · ② 사이드바 · **⑥ /me 계좌 위 선택 B**(2026-10-16 · ③ · ④ · ⑤ 의 /me 부분을 대체), `32-RESEARCH.md` Pitfall 1~16 · Open Q2 · Q3.
> **2026-10-16 수정:** /me 는 탭 위 계좌 칩 한 곳에서 계좌를 고르고 현황 · 잔고 · 주문 · 설정이 그 계좌를 따른다. 아래 「2026-10-16 수정 — /me 계좌 위 선택」 절이 S5 · S6 · S7 · S8 · S10 의 /me 부분과 어긋나면 **수정 절이 이긴다**. 원문 절은 변경 이력으로 남긴다.
> **2026-10-16 수정 (32-15):** 작업대 상단 줄의 계좌 선택도 네이티브 셀렉트가 아니라 계좌 칩 줄(`MeAccountChips`)이다. 아래 「2026-10-16 수정 (32-15) — 작업대 상단 줄도 계좌 칩」 절이 S1 · S2 · S10 · S10′ · 접근성 · 폭 백스톱 · UI Considerations · Claude's Discretion 의 셀렉트 기술과 어긋나면 **그 절이 이긴다**.
> 목업 팔레트(`--led` · `--okbg` · `--warn` 등)는 목업 전용 변수다. 이 계약은 그것을 `globals.css` §9 기존 토큰으로 옮긴다(아래 「Color」).

### 웨이브 · 표면 지도 (D-19)

| 표면 | 웨이브 | 주 파일 |
|---|---|---|
| S13 /me 계좌 칩 · S11 계좌 라벨 한 벌 (S10 공용 필은 D-25 로 불필요) | ① | `components/me/account-chips.tsx`(신규 · 이름 플래너 결정) · `components/trading/me-client.tsx` · `lib/account-label.ts` |
| S5 /me 현황 = 고른 계좌(「이 계좌 끄기」 **제외**) — 수정 절 S5′ | ① | `components/trading/strategy-status-card.tsx` |
| S6 /me 주문 = 고른 계좌 평탄 목록(카드 안 필 없음) — 수정 절 S6′ | ① | `components/trading/today-orders-card.tsx` · `components/trading/me-client.tsx` |
| S7 /me 잔고 = 고른 계좌 한 벌(소제목 없음) — 수정 절 S7′ | ① | `components/orderbook/account-panel.tsx` · `me-client.tsx` |
| S1 작업대 상단 줄 A · S2 계좌 스코프 · S3 사이드바 묶음 · S4 토스트 계좌 줄 · S9 「이 기기」 카드 | ② | `workbench/workbench-status-bar.tsx` · `workbench/trading-workbench.tsx` · `workbench/card-grid.tsx` · `layout/app-sidebar.tsx` · `workbench/alert-toasts.tsx` · `lib/trading-alerts.ts` · `components/me/…` |
| S5 「이 계좌 끄기」 버튼 · 확인 다이얼로그 | ② (relay 새 메시지 타입 배포 뒤 push) | `strategy-status-card.tsx` |
| S8 /me 설정 = 고른 계좌의 서버(세그먼트 없음) — 수정 절 S8′ | ③ | `components/me/limit-chaser-defaults.tsx` |
| S12 VI 계좌별(작업대 VI 설정 행 · /me VI 행 · 사이드바 VI 줄) | ④ — **gh-trade Phase 33 뒤에만** | `workbench/vi-settings-rows.tsx` · `strategy-status-card.tsx` · `app-sidebar.tsx` |

웨이브 ①~③ 은 VI 행 · 작업대 VI 설정 행을 **건드리지 않는다**(D-16). 아래 VI 관련 문구는 「④ 전」 · 「④ 뒤」 로 나눠 적는다.

---

## 2026-10-16 수정 — /me 계좌 위 선택 (목업 ⑥ B · CONTEXT D-20~D-25)

> 사용자 결정 2026-10-16: 「탭 안에서 계좌를 고르지 말고 탭 위에서 고르고 그 계좌에 맞게 밑에 탭 내용이 나온다」. 목업 ⑥ 변형 A 필 줄 / **B 계좌 칩** / C 계정 카드 둘째 줄 중 B 채택. 이 절은 S5 · S6 · S7 · S8 · S10 의 /me 부분을 대체한다(S′). **D-27(2026-10-16 정정): /me 에 「전체 비활성화」 는 없다** — 원문 Copywriting S5 · Considerations S5 loading/error 행의 「전체 비활성화 잠금 · 오류 줄」 언급은 전부 무효. S1~S4 · S9 · S11 · S12 · 접근성 · 색 · 타이포 · 간격 규칙은 그대로이며, 새 토큰 · 새 shadcn 컴포넌트는 없다.

### S13. /me 계좌 칩 (D-20) — 새 표면

**배치.** `MeClient` 의 계정 카드(`AccountCard`) 아래 12px → **계좌 칩 줄** → 12px → 탭 줄(`TabsList`). 칩 줄은 Suspense 경계 안(탭과 함께 — `useUrlTab` 과 같은 클라이언트 영역). 계좌 0(확인 중) 이면 칩 줄 자체가 없다(높이 0 · 자리 비우지 않음).

**모양.** 가로 한 줄 `flex gap-2`(8px) `overflow-x-auto`(스크롤바 숨김 · `scrollbar-width: none`) · 줄바꿈 없음 · 말줄임 없음. 칩 = 높이 32 · 좌우 12 · `rounded-full` · 비선택 `--muted` 면 + `--muted-fg` 12.5/600 · 선택 `--seg-on-bg` + `--seg-on-shadow`(작업대 세그먼트 · `ChoiceRow` 선택 항목과 같은 면) + `--seg-on-fg`. 칩 안 글자 = S11 부분별 렌더 **상품명(12.5/600) · 번호(11/400 mono · `--muted-fg` — 선택 칩에서는 `--seg-on-fg` 투명도 .8) · 서버키 칩(S11 칩 문법 · 10/700 상속)**, 칩 안 요소 간격 `gap-1`(4px). 목업의 6px(칩 사이 · 칩 안)는 4 배수로 올린 값이다. 목록 밖 계좌(주문 · 전략 행에만 있는 계좌 — RESEARCH Pitfall 10)는 번호만 · 맨 뒤. 선택 전환 애니메이션 없음. 시선 앵커 = 선택 칩의 면색(화면에서 유일한 `--seg-on-bg`).

**목록 · 기본값 · 기억.** 목록 = `accounts[]` 순 ∪ 행 계좌(맨 뒤). 기본 = 이 화면 기억값(기기별 localStorage · 키 플래너 · 예 `gh-radar:me-account:{userId}`)이 목록 안이면 그것 → 작업대 기억 계좌(`readTradingAccount`)가 목록 안이면 그것 → 첫 계좌. 칩을 고르면 이 화면 기억값만 바뀐다(작업대 불변 · D-20). 기억값이 나중 프레임에서 목록 밖이 되면 첫 계좌로 떨어진다(알림 없음). 계좌 1개 = 칩 1개 선택 고정(누름 무효 아님 — 그대로 선택).

**네 탭 공통.** `MeClient` 가 고른 계좌를 상태로 들고 `StrategyStatusCard` · `AccountPanel` · `TodayOrdersCard` · `LimitChaserDefaultsSection` 에 prop 으로 내린다(각 카드는 계좌를 스스로 고르지 않는다). 탭 라벨 숫자 「잔고 N」(고른 계좌 미체결) · 「주문 N」(고른 계좌 오늘 주문) — 0 이면 숫자 없음(기존 규칙). 탭 전환 · `?tab=` 메커니즘 불변.

**잠금.** 설정 탭 저장 비행 · 대기열이 있으면 칩 줄 전체 `aria-disabled` + `opacity .45` + `title` 「저장 중에는 계좌를 바꿀 수 없어요」(Pitfall 12 · 3초 상한 안에 풀림) · 잠금 시 칩마다 `aria-disabled` + 같은 `title`(`disabled` 속성 없음 — 포커스 · roving 유지 · quick-261017-bwt). 끄기 응답 대기 중에는 잠그지 않는다(끄기는 계좌 인자를 실어 보내므로 전환해도 귀속이 안 깨진다).

**접근성.** 칩 줄 `role="radiogroup"` `aria-label="My page 계좌"` · 칩 `role="radio"` `aria-checked` · ~~roving tabindex(←/→ · Home/End) — `ChoiceRow` 세그먼트와 같은 키보드 문법~~ roving tabindex · ←/→/↑/↓ · Home/End 는 포커스를 옮기며 그 칩을 고른다(WAI-ARIA radio · IN-02 수정 2026-10-16) · 끝에서 반대편 · Enter/Space/클릭도 고른다 · 잠금이면 포커스만 — ChoiceRow 는 선택 = 전송이라 포커스만으로 남는다(탭 안 탭이 되지 않도록 `tablist` 는 쓰지 않는다). 칩 접근 이름 = 「{상품명} {번호} {서버키}」(칩 글자 그대로 · 서버키 칩은 장식 아님). 계좌를 바꾸면 포커스는 그 칩에 남는다. 탭 패널은 바뀐 계좌 내용으로 다시 그려지며 라이브 영역 공지는 없다(상태줄 `aria-live` 가 숫자 변화를 말한다).

**Copywriting.**

| 요소 | 문구 |
|---|---|
| 칩 줄 접근 이름 | 「My page 계좌」 |
| 칩 글자 | 「{상품명} {번호} [서버키]」 — S11 부분별 · 목록 밖 계좌는 「{번호}」 |
| 잠금 `title` | 「저장 중에는 계좌를 바꿀 수 없어요」 |
| 계좌 0 | 칩 줄 없음 · 탭 본문은 각 카드 기존 로딩 문구 |

**UI Considerations(S13).**

| Category | Element | Status | Resolution |
|----------|---------|--------|------------|
| empty | S13 계좌 칩 | ✅ resolved (explicit) | 계좌 0 = 칩 줄 없음(높이 0) · 탭 본문은 기존 로딩 · 빈 상태 |
| loading | S13 계좌 칩 | ✅ resolved (explicit) | `accounts[]` 미수신 = 칩 없음 → 수신 즉시 칩 + 기본 선택 규칙 적용(깜빡임 없음 — 칩 줄은 수신 뒤에만 마운트) |
| error | S13 계좌 칩 | ⛔ dismissed | 사유: 선택은 로컬 상태 · 실패 경로 없음. 연결 오류는 각 탭 카드가 말한다 |
| populated | S13 계좌 칩 | ✅ resolved (explicit) | `accounts[]` 순 칩 + 목록 밖 계좌 맨 뒤 · 선택 칩 `--seg-on-bg` · 네 탭이 그 계좌 · 라벨 숫자 그 계좌 건수 |
| partial | S13 계좌 칩 | ✅ resolved (explicit) | 서버키 없는 계좌 = 칩 없이 상품명 · 번호 · 상품명 없으면 번호만 · 저장 비행 중 칩 줄 잠금 |
| overflow | S13 계좌 칩 | 🧪 resolved (backstop) | { statement: "/me 폰 본문 334 에서 계좌 4개(최악값 상품명 15자 · KYOBO127)가 가로 스크롤 한 줄 · 글자 잘림 0 · 페이지 가로 스크롤 0 · 선택 칩이 화면 밖이면 마운트 때 `scrollIntoView({inline:'nearest'})`", verification: backstop } |
| zero-one-many | S13 계좌 칩 | ✅ resolved (explicit) | 0 = 줄 없음 / 1 = 칩 1개 선택 고정 / 다수 = 전환 즉시 · 기억값 밖이면 첫 계좌 |
| long-text | S13 계좌 칩 | ✅ resolved (explicit) | 칩 안 말줄임 없음(`whitespace-nowrap`) — 줄이 가로 스크롤 · 상품명 15자 + 번호 12자 + KYOBO127 ≈ 240px 한 칩 |

### S5′. /me 현황 = 고른 계좌 (D-21)

- 계좌 묶음 · `h3` 소제목 · `role="group"` 없음. 카드 머리(「전략 현황」 + 「현황 | 로그」) · 로그 본문 불변.
- **상태줄 `MeStatusBar`:** 「시세 · 주문 · 상따 **N건** · VI **가동/중지**」 — N = 고른 계좌의 켜진 전략(`isActiveStrategy` ∧ `accountNo` 일치) · VI = ④ 전 고른 계좌가 등록 계좌인 거래소 중 가동 여부 · ④ 뒤 그 계좌 슬롯 기준. **「계좌 N개」 항목 제거**. 「반영 HH:MM:SS」 유지. `aria-live` 유지.
- 본문 = 고른 계좌 `StrategyRow` 들(2줄째 「코드 · 거래소」 · `strategy-row-account` 없어짐) → VI 행(④ 전 그 계좌가 등록 계좌인 거래소가 있을 때만 · ④ 뒤 거래소별). 전략 0 ∧ VI 행 없음 = 빈 상태 「이 계좌에 등록된 전략 없음」(점선 상자 · S5 원문 모양 · 카드 전체 빈 상태 블록 「켜진 상따 전략이 없어요」 는 이 한 줄로 대체).
- **카드 맨 아래(웨이브 ② relay 뒤):** 기존 `kill` 줄 문법 — 안내 「이 계좌의 상따 전략과 VI 자동매수를 한 번에 끕니다. 이미 나간 주문은 취소되지 않아요.」 + (`ml-auto`) 버튼 **「이 계좌 끄기」**(`--destructive` 면(color-mix 10% 옅은 면 · 실행 버튼과 같은 톤 · quick-261017-bwt) · 기존 「전체 비활성화」 버튼과 같은 크기 · 끌 것 없으면 `disabled` + `opacity .45`). **「전체 비활성화」 는 없다(2026-10-16 D-27 · 사용자 정정)** — 링크 줄 · 전체 다이얼로그 · 「모든 계좌의 …」 안내가 웹에서 사라진다. 웨이브 ① 배포본은 kill 줄 자체가 없다(기존 「전체 비활성화」 줄도 ① 에서 제거 · ② relay 뒤 「이 계좌 끄기」 가 선다).
- 다이얼로그(계좌 모드) · 문구 · 오류 줄(`role="alert"` · 11px `--destructive`)은 S5 원문 표 그대로 — 오류 줄 자리는 kill 줄 바로 위.
- **끄기 응답 대기 잠금:** 「이 계좌 끄기」 를 확인하면 그 버튼을 잠그고(`disabled`), `strategies.disabled` 1프레임이 오면 연다. 계좌 칩 줄(S13)은 잠그지 않는다(계좌 인자를 실어 보내므로 전환해도 귀속이 안 깨진다 · 다른 계좌의 버튼은 그 계좌로 바꾸면 그대로 누를 수 있다).
- 접근 이름 「이 계좌 끄기 — {번호}」 유지. 시선 앵커 = 상태줄 숫자가 아니라 첫 전략 행 종목명(14/600 `--fg`).

### S6′. /me 주문 = 고른 계좌 평탄 목록 (D-23)

- 카드 머리 줄: 「오늘 주문」 · 「{N}건」 · (지연 칩). **계좌 필 · 캡션 없음**. 그룹 소제목 없음(평탄). 표(≥1280) · 카드 목록(<1280) · 묶음 펼침 · 상세창 링크 불변.
- N · 「주문 N」 = 고른 계좌 건수(`onCountChange` 를 필터 뒤 값으로). 빈 상태 · 로딩 · 실패 문구는 S6 원문 표 그대로(「… 위에서 계좌를 바꿔 보세요」 의 「위」 = 계좌 칩).
- 기억값 · 기본 선택 · 옵션 목록 규칙은 S13 으로 이동(이 카드는 `accountNo` prop 만 받는다).

### S7′. /me 잔고 = 고른 계좌 한 벌 (D-22)

- `AccountPanel` 계좌 전용 모드 **1벌**(고른 계좌) · 세로 반복 없음 · **계좌 머리(「계좌 · 번호 · 상품명」) 없음** — 머리 생략 prop(예 `hideHeader`) 또는 호출부가 머리를 그리지 않는 모드(플래너). 미체결 → 잔고 순 · ≥1280 2열 규칙 · 행 문법 · 취소 흐름 불변.
- 탭 라벨 「잔고 N」 = 고른 계좌 `accountStates.get(accountNo).unf.length`. 계좌 0 = 기존 로딩 블록.
- 고른 계좌가 `accountStates` 에 없으면(목록 밖 계좌) 미체결 · 잔고 모두 기존 빈 문구.

### S8′. /me 설정 = 고른 계좌의 서버 (D-24 · D-14a 그대로)

- 배치: 제목 줄 「상따 기본설정」 + **서버키 칩**(S11 칩 문법 · 고른 계좌 `serverKey`) + (`ml-auto`) 상태 칩 → 4px → 서버 캡션 → 기존 안내(note) → 12행 격자. **서버 세그먼트 · 서버 기억 키 없음.**
- 상태 칩: 그 서버 84 받음 = 기존 「서버 저장값」 / 「서버 저장값 없음 · 내장 기본값」 · 어느 84 도 없음(첫 로딩) = 기존 「불러오는 중」 · 다른 서버 84 는 왔고 고른 서버만 미수신 = 「아직 못 받음」(기존 `CHIP_TONE_CLASS.absent` 톤 · `--led-latent` — 새 톤 없음).
- 서버 캡션(12.5/400 `--muted-fg` · 기존 `me-lc-defaults-note` · `break-keep`): 받음 = 「이 계좌의 서버 **{서버키}** 에 저장돼요.」 + 같은 서버의 다른 계좌가 있으면 「 같은 서버의 {번호 · 번호} 계좌도 이 설정을 함께 써요.」 / 미수신 = 「{서버키} 서버 설정(84)을 아직 받지 못했어요 · 그 서버 세션이 준비되면 불러와요」. 서버키 없는 계좌(구 relay) = 칩 · 캡션 없음 · 기존 단일 동작(키 `""` 84).
- 미수신 = 12행 `opacity .45` · `aria-busy` · 편집 · 저장 잠금 · 받으면 즉시 해제(S8 원문 규칙). 저장 = 행 확정마다 고른 계좌의 `serverKey` 로 42. 성공 플래시 · 3초 미반영 · 54 거부 · 「고른 서버 세션이 없어 저장하지 않았어요 — 계좌를 다시 골라 주세요」(거부 문구의 「서버」 → 「계좌」) 는 기존 기계.
- 비행 중 잠금은 S13(칩 줄 잠금)으로 이동. 「이 기기」 카드(S9)는 계좌 무관 · 캡션 「이 브라우저(기기)에만 저장돼요. 계좌와 무관해요.」(목업 ⑥ 문구 — S9 표의 캡션을 이 문구로 바꾼다).
- 시선 앵커 = 서버키 칩(제목 줄에서 유일한 면색).

### S10′. 공용 계좌 필 (D-25 축소)

> **32-15 수정 절이 우선** — 계좌 셀렉트 기술은 계좌 칩 줄로 대체(「2026-10-16 수정 (32-15)」 절).

- /me 가 필을 쓰지 않으므로 `AccountPill` 을 공용 파일로 올릴 **필요가 없다**(작업대 안 그대로 두어도 된다 · 플래너 재량). ~~S10 원문의 모양 · props 는 작업대 상단 줄 S1 에만 적용.~~ 32-15 로 S10 은 어디에도 적용되지 않는다(작업대 · /me 모두 `MeAccountChips`). 접근성 표의 「오늘 주문 계좌」 이름은 사라진다.

### E2E · 테스트 갱신 지점(수정분)

- `webapp/e2e/specs/me.spec.ts` 603(탭) · 849(`strategy-row-account`) · 929~948(그룹 소제목 → 평탄 · 계좌 칩) · 잔고 탭 「계좌마다 한 벌」 단언 → 1벌 · 설정 탭 세그먼트 단언 없음 → 서버키 칩 · 캡션. `me-client.test.tsx` 에 칩 기본 선택 · 기억 · 탭 라벨 숫자 케이스. `limit-chaser-defaults.test.tsx` 는 `serverKey` prop 입력으로.

### 폭 백스톱(수정분)

- **계좌 칩 줄:** 계좌 4개(최악값 상품명 15자 · 번호 12자 · KYOBO127)가 /me 폰 본문 334 에서 한 줄 가로 스크롤 · 칩 글자 잘림 0 · 페이지 가로 스크롤 0.
- **설정 탭 제목 줄:** 「상따 기본설정」 + 「KYOBO127」 칩 + 「아직 못 받음」 칩이 334 에서 한 줄(넘치면 상태 칩만 다음 줄 오른쪽 끝 · `flex-wrap`).
- S5 「/me 현황 소제목」 · S8 「서버 세그먼트」 백스톱 항목은 표면이 사라져 **무효**.

---

## 2026-10-16 수정 (32-15) — 작업대 상단 줄도 계좌 칩

> 사용자 지시 2026-10-16: 「계좌선택을 콤보로 하지 말고 칩으로」 · 「칩 밖에 KB120 한번 더 표현하는건 없애줘」. 구현 커밋 `55aee55b`(feat — 셀렉트 → 칩 · 칩 밖 서버키 칩 제거 · 계좌 0 = 「계좌 확인 중…」 글자) · `09b546be`(test — E2E 칩 전환 · 폰 「상품명 · 서버키」 · 백스톱 칩 줄 판정). 32-VERIFICATION 은 「사용자 지시 변경이라 갭 아님」 으로 기록했다. **이 절이 S1 · S2 · S10 · S10′ · 접근성 · 폭 백스톱 · UI Considerations · Claude's Discretion 의 셀렉트 기술과 어긋나면 이 절이 이긴다.** 원문은 변경 이력으로 남기고 취소선 · 「32-15」 표시를 붙였다(quick-261016-udz · 32-UI-REVIEW Top 3 ①).

### S1′. 상단 줄 배치

상단 줄 카드 안, 왼쪽부터: **계좌 칩 줄 → 시세 알약 → 주문 알약 → (`ml-auto`) 컬럼 세그먼트.** 칩 밖 서버키 칩 항목은 없다. 카드 `flex-wrap` · 컬럼 세그먼트 폭 규칙 · 주문 알약 끊김 · 보조 줄은 S1 원문 그대로다.

### 부품

- `AccountPill`(이름 유지 · `workbench-status-bar.tsx` export · props `{accounts, accountNo, onChange, compact}`)은 `MeAccountChips`(`components/me/account-chips.tsx`)를 감싼 얇은 래퍼다 — 네이티브 셀렉트 없음.
- 넘기는 값: 그룹 이름(radiogroup `aria-label`) 「계좌」 · 그룹 `title` = `ACCOUNT_PILL_TITLE` 「작업대에 보일 계좌예요 · 새로 추가하는 카드도 이 계좌로 열려요」 · 그룹 슬롯 `workbench-account`(유지) · 칩 슬롯 `workbench-account-chip` + `data-account-no` · `compact` = 상단 줄 `phoneBand` · 잠금(`locked`) 없음.

### 칩 모양

S13 칩과 같은 부품 · 같은 치수 — 높이 32 · 좌우 12 · `rounded-full` · 칩 사이 8(`gap-2`) · 칩 안 4(`gap-1`) · 선택 `--seg-on-bg` + `--seg-on-shadow` + `--seg-on-fg` · 비선택 `--muted` 면 + `--muted-fg` · `whitespace-nowrap` · 한 줄 가로 스크롤 · 스크롤바 숨김.

### 칩 글자 (`compact` 3상태)

| `compact` | 언제 | 칩 글자 |
|---|---|---|
| `false` | `wb` ≥ 680 | /me 와 같은 상품명(12.5/600) · 번호(11/400 mono) · 서버키 칩(10/700) |
| `true` | `wb` < 680 — 격자 1열 고정(컬럼 세그먼트를 DOM 에서 빼는 것과 같은 판정) | 번호를 빼고 「상품명 · 서버키」. 단 상품명이 비었거나 다른 계좌와 상품명 ∧ 서버키가 같으면 상품명 대신 번호(`accountShortLabelOf` · 사이드바 소제목 규칙) |
| `null` | 폭 미판정 첫 페인트 | 두 부분을 모두 그리고 CSS `@max-[680px]/wb:hidden` 으로 줄인다(세그먼트 `hidden @min-[680px]/wb:inline-flex` 와 같은 경계) |

- 접근 이름은 언제나 전체 `accountChipLabelOf`(「{상품명} {번호} {서버키}」) — 줄인 칩도 같다.
- 작업대 폰 칩 글자(「상품명 · 서버키」)와 /me 칩 글자(번호 포함)가 다른 것은 폭 때문의 **의도된 차이**다(32-UI-REVIEW Pillar 2 메모).

### 서버키

칩 안 `data-part="server"` 뿐이다 — 칩 밖 서버키 칩(옛 슬롯 `workbench-account-server`)과 그 `title` 「이 계좌의 주문 서버」 는 없다.

### 상태

| 계좌 수 | 모양 |
|---|---|
| 0 | 칩 없이 「계좌 확인 중…」 글자 하나 — `span` · 슬롯 `workbench-account` · `aria-disabled="true"` · 같은 `title` · 11px `--muted-fg` · 높이 32(옛 「1옵션 비활성 셀렉트」 대체) |
| 1 | 칩 1개 선택 |
| 다수 | 칩 줄 · 넘치면 그 줄 안 가로 스크롤(옛 네이티브 말줄임 대체) |

### 접근성 · 키보드

- radiogroup 「계좌」 · 칩 `role="radio"` + `aria-checked` · roving tabindex(선택 칩만 `tabIndex` 0).
- 키보드는 S13 과 같다 — ←/→/↑/↓ · Home/End 는 포커스를 옮기며 그 칩을 고른다(끝에서 반대편) · Enter/Space/클릭도 고른다(IN-02 수정 · quick-261016-udz).
- 바꾼 뒤 포커스는 그 칩에 남는다(S2 「포커스는 셀렉트에」 를 대체). 작업대는 잠금이 없다.

### 슬롯 · 테스트

- S1 「유지 슬롯」 에서 칩 밖 서버키 칩 슬롯이 빠지고 `workbench-account-chip` 이 더해진다. `workbench-account` 는 칩 줄 루트(계좌 0 이면 「계좌 확인 중…」 span)다.
- E2E 조회구 = `webapp/e2e/fixtures/workbench-account.ts`(`accountChips` · `accountChip` · `pickAccount` · `expectAccount`) — 옛 `option` 개수 · `selectOption` · `toHaveValue` 대체.
- 폭 백스톱(`webapp/e2e/specs/account-axis-backstop.spec.ts`)은 칩 줄 박스가 카드 안 · 칩마다 글자 잘림 0 · 칩 한 줄을 보고, 칩 줄 자신의 가로 스크롤 폭은 넘침 판정에서 뺀다.

### S10 · S10′ 무효

공용 계좌 필(네이티브 셀렉트)은 어디에도 없다 — /me(S13) · 작업대(이 절) 모두 `MeAccountChips`.

### 무효 표시한 자리

- 머리 인용문 「새 파일은 공용 계좌 필 …」
- S13 「접근성」 문단 키보드 문법(IN-02)
- S10′ 본문
- Component Inventory `AccountPill` · `MeAccountChips` · `ChoiceRow` 행
- Spacing Exceptions 서버키 칩 · 상단 줄 계좌 셀렉트 높이
- Color Secondary · 글자 색 「계좌번호(셀렉트 · 소제목)」
- Copywriting Primary CTA · S11 쓰는 자리 ① · S1 표(접근 이름 · `title` · 계좌 0개 · 서버키 칩 `title`)
- 시각 S1(배치 · 「셀렉트 · 칩」 · 유지 슬롯) · S2(전환 · 계좌 1개) · S6 원문(계좌 필) · S10 원문
- 접근성 표(계좌 셀렉트 · /me 계좌 칩 · 계좌 전환 포커스) · 체커 메모 시선 앵커 · 폭 백스톱(최악값 · 상단 줄)
- UI Considerations S1 · S2 · S6 long-text · S10 · S11 overflow 행
- Claude's Discretion 4

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (이미 초기화 — `webapp/components.json`) |
| Preset | `radix-nova` · baseColor `neutral` · cssVariables — 색은 `globals.css` §9 Toss TDS 토큰이 override (변경 없음) |
| Component library | radix (`radix-ui@1.4.3`) |
| Icon library | lucide (`lucide-react@1.8.0`) — 이 phase 는 아이콘을 추가하지 않는다. 알림음 아이콘(`Volume2` · `VolumeX`)은 작업대에서 빠지고 /me 는 스위치를 쓴다 |
| Font | Pretendard Variable(`--font-sans`) · 계좌번호 · 서버키는 `mono` 클래스(같은 서체 + `tabular-nums`) |

반응형: 상따 화면(`/trading`)의 카드 반응형은 **본문 폭 4밴드 컨테이너 쿼리**다. 밴드 표 · 경계(685 · 830 · 992)의 정본은 `webapp/src/styles/globals.css` 상단 §2.2b 다 — 여기에 표를 복사하지 않는다. 이 phase 는 그 경계와 「격자 열 수 경계」 680 · 작업대 폰 밴드 700(`WB_PHONE_BAND_BELOW`)을 바꾸지 않는다. 앱 셸 · 사이드바 · 토스트 위치는 종전대로 **뷰포트** 브레이크포인트다.

---

## Component Inventory

Enumerated by `npx shadcn info` (cwd `webapp/`, 「Installed Components」 절) — 21 components — shadcn@4.2.0 — 2026-10-13.

설치 목록: badge, button, card, chart, checkbox, command, dialog, input-group, input, popover, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle-group, toggle, tooltip. 아래 표는 **이 phase 가 닿는 것만 고른 비배타 목록**이다 — 표 밖 컴포넌트를 확인해 쓰는 것은 정상 경로다. 이 phase 는 shadcn 컴포넌트를 새로 설치하지 않는다.

| Component | Import path | Notes |
|-----------|-------------|-------|
| ToggleGroup | `@/components/ui/toggle-group` | 작업대 「카드 단 수」 세그먼트(`workbench-cols-segment`) — 그대로 재사용 |
| Switch | `@/components/ui/switch` | /me 설정 「이 기기」 카드 「돌파 알림음」(S9). checked 색은 프로젝트 관례 `--primary`(lc 그룹 스위치 · admin 서버 카드와 같다) |
| Dialog | `@/components/ui/dialog` | 「이 계좌 끄기」 확인 다이얼로그 — 기존 `DisableAllDialog` 를 계좌 1개 모드로 쓴다(D-09). 전체 모드 호출은 D-27 로 사라진다(2026-10-16) |
| Button | `@/components/ui/button` | 「이 계좌 끄기」(2026-10-16 S5′ — 기존 「전체 비활성화」 와 같은 destructive 변형 · 카드 맨 아래 · 전체 비활성화 자체는 D-27 로 제거) · 다이얼로그 버튼(~~실행 버튼 테두리형 `--destructive`~~ → 카드 버튼과 같은 옅은 면 `KILL_BUTTON_TONE` · quick-261017-bwt) |
| Tabs | `@/components/ui/tabs` | /me 4탭(「잔고 N」 · 「주문 N」 라벨 = 고른 계좌 건수) — 메커니즘 변경 없음 |
| `AccountPill` (프로젝트) | `@/components/trading/workbench/workbench-status-bar` | ~~네이티브 `<select>` + 서버키 칩.~~ 32-15: `MeAccountChips` 래퍼 · label 「계좌」 · slot `workbench-account` / `workbench-account-chip` · compact = phoneBand. 작업대 상단 줄 전용(2026-10-16 D-25 — /me 공용화 불필요 · 올리기는 플래너 재량) |
| `MeAccountChips` (프로젝트 · 신규 · 이름 플래너) | `@/components/me/account-chips`(예) | /me 탭 위(S13) + 작업대 상단 줄(32-15 · `AccountPill` 경유) 계좌 칩 · props `choices` · `accountNo` · `onChange` · `label` · `title` · `slot` · `chipSlot` · `compact` · `locked` · `lockedTitle` · `role="radiogroup"` · roving tabindex — ~~`ChoiceRow` 세그먼트 키보드 문법 재사용~~ 키보드 WAI-ARIA radio — 화살표 · Home/End = 선택(IN-02) · 새 shadcn 설치 없음 |
| `WorkbenchStatusBar` (프로젝트) | `@/components/trading/workbench/workbench-status-bar` | 상단 줄 A 로 재구성(S1). 루트 슬롯 · `data-status` · `workbench-dma` · `workbench-quote` 유지 |
| `quotePillOf` · `orderPillOf` (프로젝트) | `@/lib/quote-state` | 시세 · 주문 알약 판정 — 함수 무변경(D-05) |
| `CardGrid` (프로젝트) | `@/components/trading/workbench/card-grid` | 숨김 카드 주차(RESEARCH Pattern 2) · 계좌 빈 상태(S2) |
| `AlertToasts` (프로젝트) | `@/components/trading/workbench/alert-toasts` | 계좌 줄 `data-part="account"` 추가(S4) |
| `AppSidebar` · `StrategyItem` · `ViItem` (프로젝트) | `@/components/layout/app-sidebar` | 「트레이딩」 3단을 계좌 묶음 트리로(S3) |
| `StrategyStatusCard` · `StrategyRow` · `DisableAllDialog` (프로젝트) | `@/components/trading/strategy-status-card` | 계좌 묶음 · 「이 계좌 끄기」(S5) |
| `StrategyBadge` (프로젝트) | `@/components/trading/strategy-badge` | VI 행 가동/중지 배지 — 그대로 |
| `TodayOrdersCard` (프로젝트) | `@/components/trading/today-orders-card` | 고른 계좌 평탄 목록(S6′ · `accountNo` prop) |
| `AccountPanel` (프로젝트) | `@/components/orderbook/account-panel` | 고른 계좌 1벌 · 머리 없음(S7′) |
| `LimitChaserDefaultsSection` (프로젝트) | `@/components/me/limit-chaser-defaults` | 고른 계좌 `serverKey` prop · 서버키 칩 · 미수신 잠금(S8′) |
| `ChoiceRow` 세그먼트 문법 (프로젝트) | `@/components/trading/lc/setting-group` | /me 계좌 칩(S13)의 선택 면 문법 원본(`role="radio"` · roving tabindex · `--seg-on-*`) · 키보드는 갈림(ChoiceRow 화살표 = 포커스만 · 선택 = 전송 / 계좌 칩 화살표 = 선택 · IN-02) |
| `ViSettingsRows` (프로젝트) | `@/components/trading/workbench/vi-settings-rows` | ④ 에서만 — 고른 계좌 KRX · NXT 행 · 옮기기 제거(S12) |

---

## Spacing Scale

Declared values (must be multiples of 4) — 프로젝트 토큰 `--s-*` 그대로:

| Token | Value | Usage |
|-------|-------|-------|
| xs (`--s-1`) | 4px | 상단 줄 아래 보조 줄 위 여백 · 소제목–첫 행 간격 · 빈 상태 상자 위 여백 |
| sm (`--s-2`) | 8px | 「트레이딩」 제목 → 상단 줄 간격 · 계좌 소제목 안 항목 간격 · 사이드바 소제목 좌우 패딩 · 설정 제목 → 서버 세그먼트 |
| (`--s-3`) | 12px | /me 현황 계좌 묶음 위 여백 · 계좌 빈 상태 상자 패딩 · 서버 세그먼트 항목 좌우 — 목업 값 · 기존 `ChoiceRow` · 카드 패딩과 같은 단계 |
| md (`--s-4`) | 16px | 상단 줄 좌우 패딩(기존 `px-4`) |
| lg (`--s-5`) | 24px | (변경 없음 — /me 빈 상태 상자 세로 패딩 기존값) |
| xl (`--s-6`) | 32px | (변경 없음) |
| 2xl (`--s-8`) | 48px | (변경 없음) |
| 3xl (`--s-10`) | 64px | (변경 없음) |

이 phase 가 새로 정하는 치수:

| 치수 | 값 | 근거 |
|---|---|---|
| 작업대 머리(`workbench-head`) 세로 간격 | 8px — 「트레이딩」 h1 줄 → 상단 줄 카드 | 목업 ① A `.wb-head{gap:8px}` |
| 상단 줄 카드 | 기존 그대로 — 패딩 16/10 · 모서리 `--r-md` 16 · 항목 간격 가로 12 · 세로 4 | 목업 `.bar` 와 같은 결 · 변경 없음 |
| ~~/me 현황 계좌 묶음 사이~~ | ~~12px~~ | 2026-10-16 무효(묶음 없음 — S5′) |
| ~~/me 현황 계좌 소제목~~ | ~~최소 높이 32px · 좌우 8px~~ | 2026-10-16 무효(소제목 없음 — S5′) |
| 「이 계좌 끄기」 버튼 | 기존 「전체 비활성화」 버튼과 같은 치수(높이 32 · 좌우 12 · `--r-sm`) — 카드 맨 아래 kill 줄 | 2026-10-16 S5′(목업 ⑥ `.btn.danger`) |
| /me 계좌 칩(S13) | 칩 높이 32px · 좌우 12px · `rounded-full` · 칩 사이 8px(`gap-2`) · 칩 안 4px(`gap-1`) · 칩 줄 위아래 12px(`--s-3`) | 2026-10-16 목업 ⑥ `.me-chips .t{height:32px;padding:0 12px}` · 6px 간격은 4 배수(8 · 4)로 |
| /me 설정 제목 줄 → 서버 캡션 | 4px | 2026-10-16 S8′ · 목업 `.cap{margin-top:4px}` |
| 계좌 빈 상태 상자 | 패딩 12px · 위 여백 4px · 점선 1px | 목업 `.empty` |
| 사이드바 계좌 소제목 | 위 8px · 아래 4px · 좌우 8px | 목업 ② `.ah{padding:7px 8px 3px}` 을 4 배수로 |
| ~~서버 세그먼트 항목~~ | ~~높이 28px · 좌우 12px~~ | 2026-10-16 무효(세그먼트 없음 — S8′) |
| ~~서버 세그먼트 → 캡션~~ | ~~4px~~ | 2026-10-16 무효 → 위 「/me 설정 제목 줄 → 서버 캡션」 |
| 토스트 계좌 줄 | 위 줄과 0px(줄 높이로만 쌓는다) | Phase 31 두 줄 행과 같은 규칙 |

Exceptions (상속 · 컴포넌트 내부 미세 치수 — 간격 스케일 밖으로 선언):
- ~~서버 세그먼트 트랙 안쪽 패딩 2px · 항목 사이 2px~~ — 2026-10-16 무효(세그먼트 없음).
- 서버키 칩 높이 18px · 좌우 6px · 모서리 5px — ~~기존 `workbench-account-server` 칩 그대로~~ 32-15 뒤 계좌 칩 안 `data-part="server"`(/me · 작업대 공용 `account-chips.tsx`) · /me 설정 제목 줄 서버키 칩(`limit-chaser-defaults.tsx`) — 옛 칩 치수 그대로.
- ~~상단 줄 계좌 셀렉트 높이 26px~~(32-15: 칩 높이 32 · S13 치수) · 컬럼 세그먼트 높이 24px · LED 점 7px — 기존값 그대로.
- 사이드바 서버키 칩 모서리 4px · 세그먼트 점 6px — 목업 값 그대로(장식 요소).
- 2026-10-16 UI 리뷰 간격 판정(quick-261016-udz) — 32-UI-REVIEW Pillar 5 지목 값 중 4배수로 바꾸지 않고 남기는 것 · 근거 = 출처 커밋 · 공용 규격:
  - 알림 토스트 카드(`alert-toasts.tsx` 토스트 버튼) `gap-2.5` · `py-2.5` = 10px — 출처 `3efe2d24` quick-260923-pgu(2026-09-23 · Phase 31 이전 상속). Phase 32 는 S4 계좌 줄(`data-part="account"`)만 더했다. 알림 토스트 7종 공통 기하라 바꾸면 Phase 32 와 무관한 모든 토스트의 높이 · 열 간격이 바뀐다(UI-REVIEW 의 「신규 코드」 판단은 blame 상 틀림).
  - 토스트 건수 배지 「{n}건」(`alert-toasts.tsx`) `px-[5px]` = 5px — 출처 `3efe2d24`(같음 · Phase 31 이전). 프로젝트 공용 마이크로 배지 규격 — `strategy-badge.tsx` · `vi-order-list.tsx` · `vi-trigger-strip.tsx` · `breakout-strip.tsx` 배지가 같은 5px.
  - 「이 계좌 끄기」 확인 다이얼로그 요약 상자 `dl`(`strategy-status-card.tsx`) `gap-1.5` = 6px · `py-2.5` = 10px — 원본 `527af76a` 16-15(2026-09-08 「전체 비활성화」 다이얼로그) → 32-01 · 32-06 이 계좌 모드로 옮김. 확인 다이얼로그 공용 문법 — `vi-settings-rows.tsx` VI 시작/중지 다이얼로그 `vi-confirm-summary` 가 같은 값이라 한쪽만 바꾸면 두 확인 다이얼로그가 갈린다.
  - 같은 다이얼로그 경고 문단(`strategy-status-card.tsx`) `px-2.5` = 10px(`py-2` 8 은 4배수) — 원본 `527af76a` 16-15(같음). 같은 근거 — `vi-settings-rows.tsx` `vi-confirm-warning` 이 같은 값.
  - 작업대 상단 줄 카드(`workbench-status-bar.tsx` 루트 `workbench-status-bar`) `py-2.5` = 10px — 출처 `f8280a45` 토스 B 테마 `.status-bar` 10/16(quick-260924-vj1 · Phase 31 이전 상속). 위 치수 표 「상단 줄 카드 — 기존 그대로 패딩 16/10」 과 같은 값을 예외로도 선언해 계약 안 모순을 없앤다. 바꾸면 작업대 머리 높이가 바뀐다.
  - 컬럼 세그먼트 항목 「1단/2단/3단」(`workbench-status-bar.tsx` `workbench-cols-segment`) `px-[9px]` = 9px — 출처 `e2f33f7c` 18-11(Phase 18) → 32-03 이 옮김. 공용 세그먼트 항목 규격(`setting-group.tsx` `ChoiceRow` 항목도 `px-[9px]`) · 24px 트랙 안 항목 폭 맞춤.
  - 옮김 안내 닫기 ×(`workbench-status-bar.tsx` `workbench-moved-from` 닫기 버튼) `-my-0.5` = −2px — 출처 `b32ef150` 29-39(Phase 29 상속). 광학 보정 — 20px(`size-5`) 누름 영역을 `AUX_LINE` 줄 높이 ≈16px(11px × 1.45) 안에 넣어 줄을 키우지 않는다(20 − 2×2 = 16).
  - 정리(예외 아님): `device-settings-card.tsx` 「이 기기」 캡션 위 여백 2px → 4px(`pt-1`)로 정리 — Phase 32 신규(`6d4e3822` 32-03) · 공용 아님 · 차이 2px. 같은 역할 캡션 `me-lc-defaults-note` 도 `pt-1` 이라 위 여백이 맞춰진다. (서버키 칩 좌우 6px 는 위 서버키 칩 항목 — 32-15 문구로 갱신.)

---

## Typography

이 phase 가 **새로 짓거나 바꾸는** 글자 역할은 아래뿐이다 — 크기 4개(11 · 12 · 12.5 · 14), 굵기 2개(400 · 600). (2026-10-16 수정: S13 계좌 칩 행 추가 · 사라진 표면 행은 취소선.)

| Role | Size | Weight | Line Height | 자리 |
|------|------|--------|-------------|------|
| 토스트 계좌 줄 · 「이 계좌 보기 ›」 · 계좌 칩 번호(S13) | 11px | 400 (「이 계좌 보기」 는 600) | 16px | `alert-toast [data-part=account]` · 칩 번호 mono(2026-10-16 — 「이 계좌 끄기」 11px 은 무효 · 아래 행) |
| 「이 계좌 끄기」 버튼 | 12px | 600 | 1.5 | 2026-10-16 S5′ — 기존 「전체 비활성화」 버튼 글자(`--t-caption`/600)와 같은 값 |
| 계좌 소제목(사이드바 · ~~/me 현황~~) · ~~주문 카드 캡션~~ · 상단 줄 「다시 연결」 | 12px | 600 | 1.5 | `--t-caption` · 기존 소제목 문법(계좌 패널 머리와 같다) · 2026-10-16: /me 현황 소제목 · 주문 캡션 무효 |
| 계좌 칩 상품명(S13) · 서버 캡션(S8′) · ~~서버 세그먼트 항목~~ | 12.5px | 600 (캡션은 400) | 1.5 | `ChoiceRow` 항목 12.5/600 과 같은 값 · 기존 `me-lc-defaults-note` 12.5/400 · 2026-10-16: 세그먼트 무효 |
| 「돌파 알림음」 행 라벨 | 14px | 400 | 1.5 | 기존 /me 행 라벨(`--t-sm`) |

상속(바꾸지 않음): 「트레이딩」 h1 20/700(`--t-h3`) · /me 카드 제목 15/600(「전략 현황」 「오늘 주문」 「상따 기본설정」 · 새 「이 기기」 도 같은 15/600) · 서버키 칩 10/700 · 상단 줄 본문 12(`--t-caption`) · 사이드바 전략 줄 14/600 · 상태 배지 10/700. 글자 크기를 폭 때문에 줄이거나 키우지 않는다.

---

## Color

| Role | Value (라이트 / 다크) | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg` #ffffff / #0a0a0a · `--surface` #f2f4f6 / #0a0a0a | 본문면 · 사이드바 면 |
| Secondary (30%) | `--card` #ffffff / #151515 · `--muted` #f2f4f6 / #2d2d2d | 상단 줄 카드 · /me 카드 · 토스트 면 / ~~계좌 셀렉트~~ 계좌 칩 비선택 면(32-15) · 서버키 칩 · 세그먼트 트랙 |
| Accent (10%) | `--primary` #3182f6 / #3485fa | 아래 목록 자리만 |
| Destructive | `--destructive` #f04452 / #f04251 | 「주문 끊김」 점 · 상태어, ~~「이 계좌 끄기」 카드 버튼(면 — 2026-10-16 S5′ · 기존 「전체 비활성화」 와 같은 변형) · 다이얼로그 실행 버튼(테두리형)~~ 「이 계좌 끄기」 카드 버튼 · 다이얼로그 실행 버튼 — 같은 옅은 면 `color-mix(in oklab, --destructive 10%, transparent)` · hover 18% · `--destructive` 글자 · 채움(솔리드) 금지 S-6 · 가격 방향 토큰 금지(quick-261017-bwt) · 경고 문단, 계좌 끄기 오류 줄 |

목업 변수 → 프로젝트 토큰(새 토큰 0):

| 목업 | 토큰 | 자리 |
|---|---|---|
| `--led` (LED · 받음 점) | `--led-armed` (#03b26c / #2fca73) | 시세 · 주문 정상 점 · 세그먼트 「받음」 점 · 사이드바 LED 켜짐 |
| `--faint` | `--faint` (#b0b8c1 / #636363) | 세그먼트 「아직 못 받음」 점 · 빈 상태 점선 |
| `--up` (끊김 점 · 「끊김」 글자) | `--destructive` | 상태 적색은 `--destructive` — 가격 방향 토큰 `--up` 을 상태에 쓰지 않는다(상태줄 ⑥ 규율) |
| `--down` (「다시 연결」 · 「이 계좌 보기 ›」) | `--primary` | 텍스트 링크 2곳 |
| `.sw.on` 초록 | `--primary` | 스위치 checked 는 프로젝트 관례 |
| `.chip.ok` · `.chip.mute` | 기존 `CHIP_TONE_CLASS` present · loading | 설정 칩 — 새 톤 없음 |
| ~~`.btn.ghost`~~ → 목업 ⑥ `.btn.danger` | ~~`--destructive` 면 · 기존 「전체 비활성화」 `Button` 변형 그대로~~ `color-mix(in oklab, --destructive 10%, transparent)` 옅은 면 · hover 18% · `--destructive` 글자 · 다이얼로그 실행 버튼과 같은 톤(quick-261017-bwt) | 「이 계좌 끄기」(2026-10-16 S5′ — 중립 테두리 안은 무효) |
| `.aux` 경고색 | `--led-latent` | 낡은 전략 · 옮김 보조 줄(기존 `AUX_LINE` 그대로) |

글자 색:

| 요소 | 토큰 |
|---|---|
| 계좌번호(~~셀렉트~~ · 소제목 — 32-15: 계좌 칩 번호는 S13 규칙) | `--fg` (`mono`) |
| 상품명 · 「계좌」 접두 · 캡션 · 토스트 계좌 줄 | `--muted-fg` |
| 서버키 칩 글자 | `--fg-2` on `--muted` |
| 세그먼트 선택 항목 | `--seg-on-fg` on `--seg-on-bg` + `--seg-on-shadow` · 비선택 `--muted-fg` |
| 미수신 서버 선택 시 12행 | 기존 흐림 `opacity .45`(`loading` 상태 재사용) |

Accent reserved for (이 phase 가 **추가하는** accent 소비처는 2곳뿐이다): ① 상단 줄 주문 알약 안 「다시 연결」 링크 글자, ② 토스트 「이 계좌 보기 ›」 글자. (「전체 비활성화 ›」 는 D-27 로 없음.) 상속(바꾸지 않음): 토스트 TTL 바 · 「접수」 토스트 왼쪽 띠, 스위치 checked 면(「돌파 알림음」 포함), 세그먼트 플래시 · 포커스 링, 저장 성공 플래시는 기존 `--led-armed`.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | 「이 계좌 끄기」(/me 현황 카드 맨 아래 — 2026-10-16 S5′ · 다이얼로그 실행 버튼) — 작업대의 주 동작은 ~~계좌 셀렉트 선택~~ 계좌 칩 선택(32-15 · 버튼 없음) · /me 의 주 조작은 계좌 칩 선택(S13) |
| Empty state heading | 작업대(고른 계좌에 카드 0 · 다른 계좌 카드 ≥1) 「이 계좌에 거래할 종목이 없어요」 · /me 현황(고른 계좌 전략 0) 「이 계좌에 등록된 전략 없음」(2026-10-16 D-21 · S5′) · /me 주문(고른 계좌 0 · 다른 계좌 ≥1) 「이 계좌의 오늘 주문이 없어요」 |
| Empty state body | 작업대 「위 검색란에서 종목을 추가하면 이 계좌로 열려요 · 다른 계좌 카드 {N}장은 계좌를 바꾸면 보여요」 · /me 주문 「다른 계좌에 오늘 주문 {N}건이 있어요 · 위에서 계좌를 바꿔 보세요」 · 전 계좌 0 이면 기존 문구 그대로(아래 표) |
| Error state | 주문 끊김 → 주문 알약 「주문 끊김 · 다시 연결」(정확한 상태어는 sr-only · title) · 계좌 끄기 미확인 「이 계좌 끄기 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.」 · 서버 설정 미수신 칩 「아직 못 받음」 |
| Destructive confirmation | 이 계좌 끄기: ~~「이 계좌의 전략을 비활성화할까요?」~~ 「이 계좌의 전략을 끌까요?」(quick-261017-bwt · 끄기 어휘 통일) + 기존 부제 함수(「상따 {N}건과 VI 자동매수가 한 번에 꺼져요.」 등) + 계좌 1개 나열 + 기존 경고 문단 · 기본 포커스 「닫기」 (전체 비활성화 다이얼로그는 D-27 로 없음) |

### S11. 계좌 라벨 한 벌 (D-12)

한 모듈(`lib/account-label.ts`)이 순서 · 생략 규칙을 한 번만 정한다. 함수 이름은 플래너 결정(예 `accountFullLabelOf` · `accountShortLabelOf`). 기존 `accountLabelOf`(「번호 · 이름」)는 수동주문 「주문계좌」 행 계약(quick-261007-h76)이라 그대로 둔다. 계좌번호는 마스킹하지 않는다(D2 · S-5).

| 변형 | 글자 | 빈 칸 규칙 | 쓰는 자리 |
|---|---|---|---|
| 전체 | 「{번호} · {상품명} · {서버키}」 — 예 「1234-5678 · 김알렉스 · KB120」 | 빈 칸은 생략하고 「 · 」 꼬리를 남기지 않는다(「8765-4321 · KYOBO119」 · 「5555-0001」) | ① ~~상단 줄 셀렉트 옵션~~(32-15: 작업대 칩 접근 이름 `accountChipLabelOf` · 폰 칩 글자 `accountShortLabelOf`) ② /me 현황 · 잔고 소제목(부분별 렌더 · 아래) ③ /me 주문 필 옵션 ④ 토스트 계좌 줄 「계좌 {전체}」 ⑤ 사이드바 소제목 `title` |
| 짧음(사이드바) | 「{상품명}」 + 서버키 칩 | 상품명이 비었거나 **보이는 다른 묶음과 상품명 · 서버키가 같으면** 번호로 대신한다(mono) · 서버키 없으면 칩 없음 | ⑤ 사이드바 계좌 소제목 |

부분별 렌더(/me 현황 · 잔고 소제목 — 목업 ③ `.ag .ah`): 「계좌」(12/600 `--muted-fg`) → 번호(12/600 `--fg` mono) → 상품명(12/400 `--muted-fg` · 있을 때만) → 서버키 칩(있을 때만). 점(「 · 」)을 쓰지 않고 8px 간격으로 띄운다. 읽는 순서는 전체 변형과 같다.

### S1. 작업대 상단 줄 A (D-05 · D-06 · D-07)

> **32-15 수정 절이 우선** — 계좌 셀렉트 기술은 계좌 칩 줄로 대체(「2026-10-16 수정 (32-15)」 절).

| 요소 | 문구 |
|---|---|
| 제목 | 「트레이딩」 h1 (불변 · 상단 줄 위 자기 줄) |
| ~~계좌 셀렉트~~ 계좌 칩 줄(radiogroup · 32-15) 접근 이름 | 「계좌」 (`aria-label` · 불변) |
| ~~계좌 셀렉트~~ 계좌 칩 줄(radiogroup · 32-15) `title` | 「작업대에 보일 계좌예요 · 새로 추가하는 카드도 이 계좌로 열려요」 — 옛 `ACCOUNT_PILL_TITLE`(「…이미 있는 카드는 자기 계좌를 유지해요」)는 D-01 로 거짓이 되므로 교체 |
| 계좌 0개 | ~~옵션 「계좌 확인 중…」 · 셀렉트 비활성(불변)~~ 32-15: 「계좌 확인 중…」 글자 span(칩 없음 · `aria-disabled`) |
| ~~서버키 칩 `title`~~ | ~~「이 계좌의 주문 서버」 (불변)~~ 32-15 로 없음(칩 밖 서버키 칩 제거) |
| 시세 알약 | `quotePillOf` 그대로 — 「● 시세」 · 「● 시세 HH:MM:SS~ 멈춤」 |
| 주문 알약 — ready | 「● 주문」 (sr-only 「실시간」 · 불변) |
| 주문 알약 — 진행 중(`connecting` · `logging_in` · `declaring` · `reconnecting`) | 「● 주문 {RELAY_STATE_LABELS}」 — 예 「주문 재접속 중」 · 점 `--flat` + pulse (불변) |
| 주문 알약 — `unauthorized` | 「● 주문 권한 없음」 (불변 · 링크 없음) |
| 주문 알약 — 끊김(`failed` · `manual_required` · `session_rejected` = 기존 `UNRECOVERABLE_STATES`) | 보이는 글자 「● 주문 **끊김** · 다시 연결」 — 「끊김」 · 점 `--destructive`, 「다시 연결」 은 `--primary` 텍스트 버튼. 정확한 상태어(「회선 단절」 · 「다시 연결하지 못했어요」 · 「로그인 거부」)는 알약 `title` 과 sr-only 「 — {상태어}」 로 남긴다(정보 손실 없음) |
| 컬럼 세그먼트 | 「1단」 「2단」 「3단」 · 그룹 이름 「카드 단 수」 (불변) |
| 낡은 전략 보조 줄 | `WORKBENCH_STATUS_TEXT.staleStrategies` 원문 그대로 |
| 옮김 보조 줄 | `WORKBENCH_STATUS_TEXT.movedFrom` 원문 그대로 · 닫기 「안내 닫기」 |

**뺀다(D-06):** 「정규」 · 예약 창 배지(`workbench-window-badge` · `queuedWindowBadgeOf` 소비처 — 소비처가 0 이 되므로 함수 · 배지 단위 테스트도 지운다 · Pitfall 8), 알림음 토글(`workbench-tone-toggle` · `workbench-alerts` → S9), 반영 시각(`stat-applied` · `useAppliedAt`), 「다시 연결」 `Button`(→ 주문 알약 안 링크). relay 77 수신 · `queuedWindow` 상태 · 카드 안 예약 표시는 그대로.

### S2. 작업대 계좌 스코프 (D-01)

| 상태 | 문구 |
|---|---|
| 전 계좌 카드 0 | 기존 `CARD_GRID_EMPTY_HEADING` 「거래할 종목이 없어요」 · `CARD_GRID_EMPTY_BODY` 「위 검색란에서 종목을 추가하거나, 돌파 목록의 종목을 눌러 시작하세요.」 (불변) |
| 고른 계좌 카드 0 ∧ 다른 계좌 카드 N ≥ 1 | 제목 「이 계좌에 거래할 종목이 없어요」 · 본문 「위 검색란에서 종목을 추가하면 이 계좌로 열려요 · 다른 계좌 카드 {N}장은 계좌를 바꾸면 보여요」 (N = 숨은 카드 수) |

### S4. 토스트 계좌 줄 (D-03)

| 요소 | 문구 |
|---|---|
| 계좌 줄(제목 바로 아래 둘째 줄) | 「계좌 {전체 라벨}」 — 예 「계좌 8765-4321 · 교보 종합 · KYOBO119」 |
| 목록 밖 계좌(`accounts[]` 에 없음) | 「계좌 {번호}」 |
| 계좌 없는 알림(돌파) | 계좌 줄 없음 |
| 전환 힌트(알림 계좌 ≠ 지금 작업대 계좌 ∧ 그 계좌가 `accounts[]` 안) | 계좌 줄 오른쪽 「이 계좌 보기 ›」 (`›` 는 `aria-hidden`) — 같은 계좌면 힌트 없음 |
| 기존 부제(`alertSubtitle`) | 셋째 줄로 내려갈 뿐 문구 불변 |

### S5. /me 현황 계좌 묶음 (D-08 · D-09)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

| 요소 | 문구 |
|---|---|
| 카드 제목 · 「현황 \| 로그」 · 요약 줄 「상따 N · VI 가동/중지」 | 불변 |
| 계좌 소제목 | 「계좌」 번호 상품명 [서버키] — S11 부분별 렌더 |
| 묶음 빈 상태 | 「등록된 전략 없음」 (D-08 원문 · 한 줄 점선 상자) |
| 목록 밖 계좌 묶음(켜진 전략의 계좌가 `accounts[]` 에 없음) | 소제목 「계좌 {번호}」 만 · 맨 뒤에 붙인다 · 「이 계좌 끄기」 없음 |
| 전략 행 2줄째 | 「{코드} · {거래소}」 — 계좌번호 제거(`strategy-row-account` 없어짐) · 접근 이름 「{종목명} {거래소} 전략 — {배지}」 불변 |
| VI 행(④ 전) | 「VI 자동매수」 + 배지 「가동」/「중지」 + 요약 — 그 계좌가 등록 계좌인 거래소만 `viSummaryText` 규칙으로(예 「KRX 500만원 · 3.0% 이상」 · 가동 없으면 「—」) |
| VI 행(④ 뒤) | 같은 글자 · 모든 계좌 묶음에 한 행 · 요약은 그 계좌의 거래소별(S12) |
| 「이 계좌 끄기」 버튼(웨이브 ②) | 보이는 글자 「이 계좌 끄기」 · 접근 이름 「이 계좌 끄기 — {번호}」 |
| 다이얼로그 제목(계좌 모드) | ~~「이 계좌의 전략을 비활성화할까요?」~~ 「이 계좌의 전략을 끌까요?」(quick-261017-bwt · 끄기 어휘 통일) |
| 다이얼로그 부제 | 기존 `disableSubtitle` 그대로(그 계좌 건수 · 그 계좌 VI 기준) — 「상따 {N}건과 VI 자동매수가 한 번에 꺼져요.」 · 「상따 {N}건이 한 번에 꺼져요.」 · 「VI 자동매수가 꺼져요.」 |
| 다이얼로그 표 | 「상따 전략」 「{N}건 → 전부 OFF」/「없음」 · 「VI 자동매수」 「가동 → 중지」/「중지 (변화 없음)」 · 「계좌」 「{전체 라벨}」 |
| 다이얼로그 경고 문단 | 「이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.」 (불변) |
| 다이얼로그 버튼 | 「닫기」(기본 포커스) · 「이 계좌 끄기」(~~테두리형 `--destructive`~~ 카드 버튼과 같은 옅은 면 · quick-261017-bwt) |
| 계좌 끄기 미확인(8초 백스톱) | 「이 계좌 끄기 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.」 |
| 계좌 끄기 전송 실패 | ~~「연결이 끊겨 비활성화 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」 (기존 원문)~~ 「연결이 끊겨 이 계좌 끄기 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」(quick-261017-bwt · 끄기 어휘 통일) |
| ~~전체 비활성화 안내 줄~~ | 2026-10-16 D-27 무효 — /me 에서 전체 비활성화 제거(안내 줄 · 다이얼로그 · 오류 줄 없음) |
| 로딩(스냅샷 전 · 계좌 0) | 기존 스켈레톤 3행 + 「전략 정보를 불러오는 중이에요…」 (불변) |

### S6. /me 주문 탭 (D-10)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

| 요소 | 문구 |
|---|---|
| 탭 라벨 | 「주문 {N}」 — N = 고른 계좌 건수 · 0 이면 숫자 없음 · 미방문이면 숫자 없음(기존 규칙) |
| 카드 제목 · 건수 | 「오늘 주문」 + 「{N}건」(고른 계좌 건수) |
| 계좌 필 접근 이름 | 「오늘 주문 계좌」 |
| 계좌 필 `title` | 「오늘 주문을 볼 계좌예요 · 작업대 계좌와 따로 기억해요」 |
| 캡션(제목 줄 아래) | 「고른 계좌의 오늘 주문만 보여요. 작업대 계좌 선택과는 따로 기억해요.」 (목업 원문) |
| 고른 계좌 0 ∧ 다른 계좌 ≥ 1 | 제목 「이 계좌의 오늘 주문이 없어요」 · 본문 「다른 계좌에 오늘 주문 {N}건이 있어요 · 위에서 계좌를 바꿔 보세요」 |
| 전 계좌 0 | 기존 「오늘 낸 주문이 없어요」 / 「주문을 넣으면 접수·체결·취소가 여기에 모두 남아요.」 (불변) |
| 로딩 · 불러오기 실패 · 지연 | 기존 문구 불변(「오늘 주문을 불러오는 중이에요…」 · 「불러오기 실패 — 목록이 최신이 아닐 수 있어요.」 등) |
| 그룹 소제목(계좌 · 번호 · 상품명 · N건) | **제거**(평탄 목록) |

### S7. /me 잔고 소제목 (D-11)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

| 요소 | 문구 |
|---|---|
| 계좌 전용 모드 머리 | 「계좌」 {번호} {상품명} [서버키] — S11 부분별 렌더 · 서버키 없으면 칩 없음 |

### S8. /me 설정 서버 세그먼트 (D-14 · D-14a)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

| 요소 | 문구 |
|---|---|
| 섹션 제목 | 「상따 기본설정」 (불변) |
| 세그먼트 항목 | 서버키 그대로 — 「KB120」 「KYOBO119」 |
| 세그먼트 그룹 이름 | 「매매설정 서버」 |
| 항목 sr 꼬리(미수신) | 「 · 아직 못 받음」 (점은 `aria-hidden`) |
| 서버 캡션 — 서버 2개 이상 | 「고른 서버에만 저장돼요. 다른 서버는 따로 봐야 해요.」 (목업 원문) |
| 서버 캡션 — 서버 1개 | 「고른 서버에만 저장돼요.」 |
| 칩 — 어느 서버 84 도 아직 없음(첫 로딩) | 기존 「불러오는 중」 · 안내 「DMA 세션이 준비되면 서버 설정(84)을 불러와요」 (불변) |
| 칩 — 다른 서버 84 는 왔고 고른 서버만 미수신 | 「아직 못 받음」 · 안내 「{서버키} 서버 설정(84)을 아직 받지 못했어요 · 그 서버 세션이 준비되면 불러와요」 |
| 칩 — 받음 | 기존 「서버 저장값」 / 「서버 저장값 없음 · 내장 기본값」 + 기존 안내 (불변) |
| 비행 중 세그먼트 잠금 `title` | 「저장 중에는 서버를 바꿀 수 없어요」 |
| 지정 서버 세션 없음(relay 거부 · 상수 이름 플래너 결정) | 「고른 서버 세션이 없어 저장하지 않았어요 — 서버를 다시 골라 주세요」 — 기존 `me-lc-defaults-reject` 빨간 한 줄로(서버 문구 원문 표시 규칙) |
| 서버 54 거부 · 범위 밖 · 3초 미반영 | 기존 문구 불변 |

### S9. /me 설정 「이 기기」 카드 (D-15)

| 요소 | 문구 |
|---|---|
| 카드 제목 | 「이 기기」 |
| 캡션 | 「이 브라우저(기기)에만 저장돼요. 계좌와 무관해요.」 (목업 ⑥ 문구 · 2026-10-16) |
| 행 라벨 · 스위치 접근 이름 | 「돌파 알림음」 |
| 자동재생 차단(켜짐 ∧ 차단) | 스위치 옆 텍스트 버튼 「클릭해 활성화」 (기존 문구) |

### S12. VI 계좌별 — 웨이브 ④ (D-16~D-18 · gh-trade Phase 33 뒤)

| 요소 | 문구 |
|---|---|
| 작업대 VI 설정 행 | 고른 계좌의 KRX · NXT 2행 — 행 문구 · 「수정」 · 더티 힌트 `VI_DIRTY_HINT` 불변 |
| 미등록(`unregistered`) 행 | 기존 미등록 빈 행 문법 그대로 — 저장하면 **고른 계좌로** 등록 |
| 제거 | `viRegisteredAccountText`(「계좌 … 에 등록된 VI 예요 — …」) · 「옮기기」 버튼 · 옮기기 확인 창 문구 전부 |
| 사이드바 VI 줄 | 「VI」 + 가동 거래소 태그 — 그 계좌 묶음 안 · 접근 이름 「VI — {거래소들} 가동」 불변 |
| /me VI 행 | S5 「VI 행(④ 뒤)」 |

④ 전(웨이브 ①~③)에는 작업대 VI 설정 행이 **현행 그대로**다 — 상단 계좌와 무관하고 「계좌 … 에 등록된 VI 예요」 고지 · 「옮기기」 흐름이 남는다(D-16 · 「안내 + 옮기기」 임시안 금지).

---

## 표면별 시각 · 상호작용 계약

### S1. 작업대 상단 줄 A

> **32-15 수정 절이 우선** — 계좌 셀렉트 기술은 계좌 칩 줄로 대체(「2026-10-16 수정 (32-15)」 절).

**배치(목업 ① A):** `workbench-head` = 세로 묶음, 간격 8px — ① 「트레이딩」 h1 자기 줄 ② 상단 줄 카드(한 줄 필) ③ 보조 줄(있을 때만).

상단 줄 카드 안, 왼쪽부터: **~~계좌 셀렉트 → 서버키 칩~~ 계좌 칩 줄(32-15) → 시세 알약 → 주문 알약 → (`ml-auto`) 컬럼 세그먼트.** 카드는 `flex-wrap` 이다 — 내용이 한 줄을 넘으면 뒤 항목부터 다음 줄로 내려가고, 세그먼트는 내려가도 오른쪽 끝(`ml-auto`)에 선다. 글자를 줄이거나 말줄임하지 않는다(~~셀렉트 내부 글자는 네이티브 `<select>` 가 자른다 · `max-w-full min-w-0`~~ 32-15: 칩 줄이 넘치면 그 줄 안 가로 스크롤).

**컬럼 세그먼트 폭 규칙 — Pitfall 7 · D-05 「플래너가 §2.2b 밴드 규칙과 맞춘다」 의 이 계약 결정:**

| `wb` 폭 | 세그먼트 |
|---|---|
| < 680 (격자 1열 고정) | **DOM 에서 뺀다**(종전 · 접근성 트리 · 탭 체인에도 없음). 이 폭에서 격자는 저장 단 수와 무관하게 1열이라 세그먼트는 눌러도 바뀌지 않는 조작이 된다. 목업 폰 390 의 「아래 줄 세그먼트」 는 이 이유로 그리지 않는다(사용자 확인 2026-10-13) |
| ≥ 680 | 같은 카드 안 오른쪽 끝. 한 줄에 다 안 들어가면 `flex-wrap` 으로 **다음 줄 오른쪽 끝**에 선다 — 목업의 「세그먼트가 줄 아래로」 는 이 줄바꿈이다 |
| 폭 미판정 첫 페인트(`null`) | 기존 CSS 폴백 `hidden @min-[680px]/wb:inline-flex` (불변) |

~~**셀렉트 · 칩:** 기존 `AccountPill` 기하 그대로 — 셀렉트 26px · 둥근 알약 · `--muted` 면 · 11px mono · 네이티브 화살표(`appearance-none` 금지). 서버키 칩은 셀렉트 바로 오른쪽(D-05 「옆 서버키 칩 유지」). 서버키가 없는 계좌는 칩 없음.~~ (32-15 로 대체 — 계좌 칩 줄 · 「2026-10-16 수정 (32-15)」 절)

**주문 알약 끊김:** `orderPillOf` 는 바꾸지 않는다. 상태줄이 `onReconnect` 를 받은 경우(= `UNRECOVERABLE_STATES`)에만 보이는 상태어를 「끊김」 으로, 점 · 상태어를 `--destructive` 로 그리고, 바로 뒤에 「 · 」 + 「다시 연결」 텍스트 버튼(`--primary` 12/600 · hover 밑줄 · `type="button"`)을 둔다. 버튼은 `workbench-dma` 라이브 영역 **밖의 형제**로 둔다(라이브 영역이 버튼 글자를 낭독하지 않게) — 둘을 감싼 `inline-flex` 묶음이 시각상 한 알약이다. 버튼 슬롯 이름은 플래너 결정(예 `workbench-reconnect`).

**보조 줄(D-06 · 플래너 재량 → 이 계약 결정):** 낡은 전략(`workbench-stale-strategies` · `role="status"`) · 옮김(`workbench-moved-from` · 닫기 ×) 두 줄은 상단 줄 카드 **밖, 바로 아래** `workbench-head` 안에 그대로 옮긴다. 양식은 기존 `AUX_LINE`(11px · `--led-latent` · `break-keep` · 줄 전체 폭) · 좌우 4px 들여쓰기 · 카드와 4px. 필드가 없으면 요소 0 — 머리 높이는 상단 줄만큼이다. 토스트성 안내로 바꾸지 않는다(사라지는 조건이 relay 다음 상태 프레임뿐이라 상시 표시가 맞다).

**유지 슬롯(Pitfall 4 — 다른 spec 5개의 준비 신호):** 루트 `data-slot="workbench-status-bar"` + `data-status={status}` · `workbench-dma`(`aria-live="polite"`) · `workbench-quote`(`aria-live="polite"`) · `workbench-cols-segment` · `workbench-account` · ~~`workbench-account-server`~~(32-15: 빠짐 · `workbench-account-chip` 추가). 루트는 상단 줄 카드 자신이다.

### S2. 작업대 계좌 스코프

> **32-15 수정 절이 우선** — 계좌 셀렉트 기술은 계좌 칩 줄로 대체(「2026-10-16 수정 (32-15)」 절).

- **보이는 것:** `card.accountNo === 고른 계좌`(또는 계좌 공란 카드)인 카드 · `viOrder.accountNo === 고른 계좌` 인 VI 트리거 스트립 칩(「미확인 n」 도 그 목록으로 센다) · 공용 패널(이미 계좌 축). 돌파 스트립 · 종목 추가란은 스코프 밖(종목 축).
- **숨은 카드:** 마운트 유지 · 화면에서만 뺀다(주차 노드 `hidden`). 에코 · 더티 · 「결과 모름」 잠금 · 미확인 카운트를 계속 받는다. 시세 구독 수는 그대로다(계좌를 바꿔도 줄지 않는다 — 이 계약은 줄어든다고 말하지 않는다).
- **전환:** ~~셀렉트를~~ 계좌 칩을(32-15) 바꾸면 **즉시** 격자가 바뀐다(전환 애니메이션 없음). 열린 넘버패드 시트 · 인라인 편집 · 카드 안 팝오버는 닫는다(카드가 숨으므로 · 더티 값은 카드 안에 보존). ~~사용자가 셀렉트로 바꾼 경우 포커스는 셀렉트에 남는다.~~ 32-15: 칩으로 바꾸면 포커스는 그 칩에 남는다.
- **프로그램 전환 3경로(토스트 · 사이드바 전략 클릭 · `?focus=`):** 모두 `pickAccount` 한 경로로 바꾸고, 바꾼 계좌는 작업대 기억 계좌(`writeTradingAccount`)가 된다 — **의도된 동작**이다(RESEARCH A1 · Pitfall 5). 그 뒤 기존 카드 포커스 · 펼침 규칙.
- **종목 단위 경로(Pitfall 6):** 종목 추가 · 보유 행 선택 · 돌파 클릭 · 「이미 카드 있음」 표시는 **고른 계좌의 카드**만 본다. 다른 계좌의 숨은 같은 종목 카드를 펼치지 않는다 — 고른 계좌에 그 종목 카드가 없으면 고른 계좌로 새 카드를 연다(같은 전략 키 1장 규칙만 전수).
- **빈 상태:** 판정은 「보이는 카드 0」. 문구는 Copywriting S2 표. 상자 기하 · 슬롯(`card-grid-empty`)은 기존 그대로. ✕ 뒤 포커스 이동은 보이는 카드 순서만 본다.
- **새 카드 기본 계좌:** 고른 계좌(불변). 목업의 점선 「+ 새 전략」 카드는 이 사실의 그림일 뿐 — **새 요소를 만들지 않는다**(기존 종목 추가란이 그 역할).
- 계좌 1개 사용자: ~~셀렉트는 그대로(옵션 1개 · 비활성 아님)~~ 32-15: 칩 1개 선택 — 라벨이 곧 「지금 보는 계좌」.

### S3. 사이드바 계좌 묶음 트리 (D-02 · 목업 ②)

```
트레이딩 [N]
│ 김알렉스            KB120   ← 계좌 소제목(짧은 라벨 + 서버키 칩)
│ VI                  KRX    ← 그 계좌의 가동 VI 줄(있을 때만)
│ 삼성전자            ●●○
│ 에코프로비엠 · NXT  ●○●
│ 교보 종합         KYOBO119
│ 한화오션            ●○○
```

- 기존 `SUB_LIST`(왼쪽 hairline · 들여쓰기 12 + 8) **안에** 계좌 묶음을 `accounts[]` 순으로 쌓는다. 묶음 안 줄은 추가 들여쓰기 없이 소제목 아래에 선다(목업 그대로).
- **묶음이 서는 조건:** 그 계좌에 켜진 전략(`isActiveStrategy`)이 있거나 그 계좌의 VI 가 가동 중. 둘 다 없으면 소제목도 없다(사이드바는 켜진 것만). 모든 묶음이 없으면 3단 목록 자체가 없다(기존 규칙).
- **목록 밖 계좌**(켜진 전략의 계좌가 `accounts[]` 에 없음): 맨 뒤 묶음 · 소제목 = 번호(mono) · 칩 없음.
- **소제목:** 12/600 `--muted-fg` · 링크 아님 · 포커스 대상 아님 · 패딩 위 8 · 아래 4 · 좌우 8. 이름 `min-w-0 truncate`(말줄임 + `title` = 전체 라벨), 서버키 칩은 오른쪽 끝 · 줄지 않음(10/700 · `--muted` 면 · 모서리 4).
- **VI 줄:** ④ 전 = `viTriggers[거래소]` 중 가동인 것을 **그 cfg 의 계좌 묶음**에 넣는다(두 거래소가 다른 계좌면 각 묶음에 한 줄씩, 태그는 그 묶음 거래소만). ④ 뒤 = 계좌별 슬롯에서 그 계좌 가동 거래소. 줄 모양 · 태그 · 접근 이름은 기존 `ViItem` 그대로.
- **전략 줄:** 기존 `StrategyItem`(종목명 + LED 3점) 그대로.
- **클릭:** 전략 줄 = `/trading?focus=` + 포커스 요청 + **작업대 계좌를 그 전략의 계좌로 전환**(`pickAccount` · CONTEXT 재량 결정 — 안 바꾸면 카드가 숨어 있다). VI 줄 = 작업대 이동(종전) — ④ 에서 그 묶음 계좌로 전환을 더한다(VI 설정 행이 계좌 스코프가 되므로). 수식 키 클릭(새 탭)은 지금 탭을 건드리지 않는다(불변).
- 「트레이딩」 배지 = 켜진 전략 전 계좌 합(불변). 레일 모드에서는 3단 목록 숨김(불변).

### S4. 토스트 계좌 줄 (D-03)

- 토스트는 **계좌와 무관하게 전부** 뜬다(숨은 계좌 것 포함). 소리 정책 · TTL · 스택 · 위치 · 최대 4개는 종전.
- 본문 버튼 안 줄 순서: ① 제목(`alertWho` + 접미 + 「N건」) ② **계좌 줄**(`data-part="account"` · 11/400 `--muted-fg` · `break-keep` 줄바꿈 · 말줄임 없음) ③ 기존 부제(`data-part="sub"`).
- 전환 힌트 「이 계좌 보기 ›」: 계좌 줄과 같은 행 오른쪽 끝 · 11/600 `--primary` · `whitespace-nowrap`. 별도 버튼이 아니다 — 토스트 전체 클릭이 동작이고 힌트는 그 결과를 말한다.
- **탭(클릭 · Enter):** 대상 계좌 = 매칭 카드의 계좌 → 없으면 알림 계좌 → 둘 다 없으면(돌파) 지금 계좌. 지금과 다르면 `pickAccount` 로 전환한 뒤 기존 `cardForAlert` 매칭 카드로 간다(펼침 · 탭 이동 · 이 알림 닫기). 계좌가 있는 알림은 「정확 일치(계좌 포함)」 가 이긴다 · 돌파는 지금 계좌 카드를 먼저 고른다(Pitfall 6).
- `TradingAlert.accountNo` 주석 「표시하지 않는다(T-pgu-02)」 는 D-03 으로 갱신한다(표시 + 매칭).

### S5. /me 현황 계좌 묶음 (목업 ③ A)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

- 카드 머리(「전략 현황」 + 「현황 | 로그」) · 요약 줄 · 로그 본문 불변. `MeStatusBar` 「상따 N건 · VI · 계좌 N개」 불변.
- 현황 본문 = `accounts[]` 순으로 **모든 계좌** 묶음(+ 목록 밖 계좌 묶음 맨 뒤). 묶음 = 소제목(`h3`) → 빈 상태 또는 전략 행들 → VI 행(조건부). 묶음 사이 12px.
- **소제목 줄:** `flex items-center gap-2 min-h-8 px-2` — 「계좌」 · 번호 · 상품명(`min-w-0 flex-1 truncate` + `title`) · 서버키 칩 · (`ml-auto`) 「이 계좌 끄기」.
- **전략 행:** 기존 `StrategyRow`(44px 이상 2줄 · 구분선 `--border-subtle`) — 2줄째에서 계좌번호만 뺀다.
- **빈 상태:** 「등록된 전략 없음」 — 점선 1px `--faint` · 모서리 `--r` · 패딩 12 · 12/400 `--muted-fg` · 가운데. 카드 전체 빈 상태(「켜진 상따 전략이 없어요」 블록)는 묶음별 빈 상태로 대체된다(D-08 「모든 계좌 소제목」).
- **VI 행:** 기존 `vi-status-row` 문법(「VI 자동매수」 + 배지 + 요약 + ›) · 링크 `/trading`. ④ 전 = 그 계좌가 등록 계좌인 거래소가 하나라도 있는 묶음에만 한 행(요약은 그 거래소만) — 어느 계좌에도 등록 VI 가 없으면 VI 행은 없다(요약 줄 「VI 중지」 가 말한다 · RESEARCH Open Q3 결정). ④ 뒤 = 모든 묶음에 한 행(목업 ③ 의 모양).
- **「이 계좌 끄기」(웨이브 ②):** 중립 테두리 버튼 28px. 비활성 조건 = 그 계좌에 켜진 전략 0 ∧ 그 계좌 VI 가동 아님 · **어느 끄기든**(계좌 · 전체) 응답 대기 중 · 세션 `ready` 아님. 비활성은 `opacity .45`(숨기지 않는다 — 묶음마다 같은 자리). 목록 밖 계좌 묶음에는 버튼이 없다.
- **확인 → 전송:** 기존 `DisableAllDialog` 를 계좌 1개 모드로(제목 · 표 · 실행 버튼 글자만 다름 · 기본 포커스 「닫기」 · ~~실행 버튼 테두리형 `--destructive`~~ 실행 버튼 옅은 면(quick-261017-bwt)). 확인하면 새 메시지 타입 1건(D-09 보정 · 예 `strategies.disable.account {accountNo}`)을 보내고, 그 묶음 버튼과 「전체 비활성화」 를 함께 잠근다. `strategies.disabled` 1프레임이 오면 둘 다 연다. 행은 60/61 에코로 빠진다(65 숫자로 행을 만들지 않는다 · 기존 ④ 규율).
- **오류 줄:** 미확인 · 전송 실패 문구는 **그 묶음 소제목 바로 아래** 한 줄(11px `--destructive` · `role="alert"`) — 전체 비활성화 오류 줄(`strategy-disable-error`)과 다른 슬롯(이름 플래너 결정).
- 웨이브 ① 배포본은 소제목에 버튼이 **없다**(relay 배포 전 Pitfall 2 방지). 버튼 자리는 비워 둘 필요 없다 — 소제목 줄이 그대로 끝난다.

### S6. /me 주문 탭 (목업 ④)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

- 카드 머리 줄: 「오늘 주문」 · 「{N}건」 · (지연 칩) · (`ml-auto`) ~~**계좌 필**(공용 `AccountPill` — 셀렉트 + 서버키 칩)~~(S6′ 로 /me 주문 필 없음 · 32-15 로 공용 필도 없음). 줄이 좁으면 필이 다음 줄 오른쪽 끝으로 내려간다(`flex-wrap`).
- 캡션 한 줄(12/400 `--muted-fg`)이 머리 줄 아래.
- **옵션 목록:** `accounts[]` ∪ 「주문 행에만 있는 계좌」(라벨 = 번호만 · Pitfall 10 — 기록된 주문을 화면이 숨기지 않는다).
- **기본 선택:** 이 탭 기억값(기기별 · 저장 키 플래너 결정 · 예 `gh-radar:me-orders-account:{userId}`)이 옵션 안이면 그것 → 작업대 기억 계좌(`readTradingAccount`)가 옵션 안이면 그것 → 첫 옵션. 이 탭에서 고르면 이 탭 기억값만 바뀐다(작업대 계좌 불변).
- **목록:** 고른 계좌 행만 **평탄하게**(그룹 소제목 제거). 표(≥1280) · 카드 목록(<1280) · 묶음 펼침 · 상세창 링크(`/trading/order-log?account=`)는 불변.
- 「주문 N」 · 머리 「N건」 = 고른 계좌 건수(`onCountChange` 를 필터 뒤 값으로).
- 잔고 탭은 D-21 그대로(계좌별 세로 반복 · 계좌 선택 없음).

### S7. /me 잔고 소제목

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

- `AccountPanel` 계좌 전용 모드 머리: 「계좌」 · 번호 · 상품명 뒤에 서버키 칩(선택 prop · 4표면 공용이라 없으면 칩 없음). 종목 축 모드(셀렉터)는 불변.

### S8. /me 설정 서버 세그먼트 (목업 ⑤ A)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).

- 배치: 제목 줄(「상따 기본설정」 + 칩) → 8px → **서버 세그먼트** → 4px → 서버 캡션 → 기존 안내(note) → 12행 격자.
- **서버 목록:** `accounts[]` 의 서버키를 나온 순서대로 중복 없이(primary 먼저 = KB 먼저 · RESEARCH Pattern 5). 목록이 비면(계좌 0 · 서버키 없는 구 relay) 세그먼트 없이 기존 단일 동작(키 `""` 84).
- **세그먼트 모양:** `ChoiceRow` 문법 — 트랙 `--muted` · 모서리 10 · 안쪽 2 · 항목 28px · 좌우 12 · 12.5/600 · 선택 `--seg-on-bg` + `--seg-on-shadow` · 비선택 `--muted-fg`. 항목 안 왼쪽에 6px 점(받음 `--led-armed` · 미수신 `--faint`). 서버 1개여도 세그먼트를 그린다(지금 어느 서버를 보는지 말한다). 항목이 넘치면 트랙이 줄바꿈된다(가로 스크롤 · 말줄임 없음).
- **기본 선택:** 마지막으로 고른 서버(기기별 localStorage · 키 플래너 결정 · 예 `gh-radar:me-settings-server:{userId}`) → 없거나 그 서버가 목록에 없으면 첫 서버. 보는 중에 고른 서버 세션이 닫히면 첫 서버로 떨어진다(알림 없음). 작업대 계좌와 독립.
- **미수신 서버 선택:** 12행 흐림(`opacity .45` · `aria-busy`) · 편집 · 저장 잠금 · 칩/안내는 Copywriting S8 표. 받으면 즉시 풀린다.
- **저장:** 행 확정마다 고른 서버에만 42(`serverKey` 실음). 성공 플래시 · 3초 미반영 · 54 거부는 기존 기계 그대로.
- **비행 중 잠금(Pitfall 12):** 저장 비행 · 대기열이 있으면 세그먼트 전체 비활성(`opacity .45` · `title` 「저장 중에는 서버를 바꿀 수 없어요」) — 3초 상한 안에 풀린다.
- 다른 서버로 복제하는 기능은 없다(2026-10-12 결정).

### S9. /me 설정 「이 기기」 카드 (목업 ⑤ 하단)

- 상따 기본설정 섹션 **아래** 별도 카드(/me 카드 면 `--card` · 모서리 `--r-lg` · 패딩 12). 제목 15/600 → 캡션 12.5/400 `--muted-fg` → 행 1개.
- 행: 「돌파 알림음」(14/400) ─ 오른쪽 `Switch`(36×20 · checked `--primary`) · 행 높이 44 · 위 hairline `--border-subtle`.
- 동작(기존 `ToneToggle` 로직 이전): 기본 꺼짐 · 저장 `gh-radar:breakout-tone` 그대로 · 켜는 클릭 **안에서** `resumeToneContext()` · 켜짐 ∧ 차단이면 스위치 왼쪽에 「클릭해 활성화」 텍스트 버튼(12/600 `--fg-2` · 누르면 `resumeToneContext()` 만 — 스위치 상태 불변). 저장값 · 차단 상태는 마운트 뒤에 읽는다(하이드레이션). 소리 재생 쪽(`readTonePref`)은 작업대에 그대로.
- 작업대에서 알림음 아이콘 버튼 DOM 은 사라진다.

### S10. 공용 계좌 필 (D-13)

> **2026-10-16 수정 절(S′)이 우선.** 아래는 2026-10-13 원문(변경 이력).
> **32-15 수정 절이 우선** — 계좌 셀렉트 기술은 계좌 칩 줄로 대체(「2026-10-16 수정 (32-15)」 절). S10 은 어디에도 적용되지 않는다.

- ~~네이티브 `<select>` + 고른 계좌 서버키 칩. `appearance-none` 금지(OS 선택 UI). 마스킹 없음. 옵션 글자 = S11 전체 변형.~~ (32-15 로 무효)
- ~~props `{accounts, accountNo, onChange, title?}` — `title` 은 쓰는 곳 문구(S1 · S6). 접근 이름 · `data-slot` 은 쓰는 곳마다 다르다(작업대 `workbench-account` · `workbench-account-server` 유지 · /me 주문은 새 슬롯 — 전달 방식 플래너 결정).~~ (32-15 로 무효)
- ~~계좌 0개 = 「계좌 확인 중…」 1옵션 · 비활성. 계좌 1개 = 활성 · 옵션 1개.~~ (32-15 로 무효)

### S12. VI 계좌별 — 웨이브 ④ 시각

- 작업대 VI 설정 행(VI 패널 「더보기」 펼침 안 2줄)은 **고른 계좌**의 KRX · NXT 행이다. 계좌를 바꾸면 행 내용이 즉시 그 계좌 슬롯으로 바뀐다. 저장 안 한 편집(더티)은 (계좌, 거래소) 슬롯마다 보존한다 — 계좌를 다시 고르면 그대로 돌아온다(숨은 카드와 같은 「버리지 않는다」 규율 · 구현 방식 플래너 결정).
- 미등록 슬롯 = 기존 미등록 빈 행. 「옮기기」 버튼 · 확인 창 · 등록 계좌 고지 줄은 제거 — 행 높이가 그만큼 줄어든다.
- /me VI 행 · 사이드바 VI 줄은 S5 · S3 의 「④ 뒤」 규칙.
- 교보119 VI 실증 UAT 는 이 웨이브 안(D-18).

---

## 접근성

| 대상 | 규칙 | 예 |
|---|---|---|
| 상단 줄 라이브 영역 | `workbench-dma` · `workbench-quote` 는 `aria-live="polite"` 유지(a11y e2e 463 · trading-workbench 5611). 「다시 연결」 버튼은 라이브 영역 밖 형제 | — |
| 주문 끊김 | 보이는 「끊김」 + sr-only 「 — {정확한 상태어}」 · 색(`--destructive`)은 보조(WCAG 1.4.1) | 「주문 끊김 — 회선 단절」 |
| 「다시 연결」 | 네이티브 `button` · 이름 = 보이는 글자 | 「다시 연결」 |
| ~~계좌 셀렉트~~ 계좌 칩 줄(32-15) | ~~네이티브 `select` · `aria-label` 「계좌」(작업대) · 서버키 칩은 장식 아님(글자 그대로 낭독)~~ 32-15: radiogroup 「계좌」 · 칩 `role="radio"` · 칩 안 서버키는 접근 이름에 포함 · (/me 주문 셀렉트는 2026-10-16 수정으로 없음) | — |
| /me 계좌 칩(S13) | `role="radiogroup"` 이름 「My page 계좌」 · 칩 `role="radio"` + `aria-checked` · roving tabindex · ←/→/↑/↓ · Home/End = 포커스 + 선택(WAI-ARIA radio · IN-02 수정 2026-10-16 · 잠금이면 포커스만) · Enter/Space/클릭도 선택 · 잠금 시 `aria-disabled` · 잠금 시 칩마다 `aria-disabled` + 같은 `title`(`disabled` 속성 없음 — 포커스 · roving 유지 · quick-261017-bwt) · 이름 = 칩 글자 그대로 · 작업대 상단 줄도 같은 부품(32-15 · 이름 「계좌」) | 「김알렉스 1234-5678 KB120」 |
| 컬럼 세그먼트 | `ToggleGroup` 이름 「카드 단 수」 · `wb` < 680 에서는 DOM 에 없음(탭 체인 · 접근성 트리에서 빠짐) | — |
| 토스트 | 컨테이너 `role="status"` · `aria-live="polite"` 유지(trading-workbench 1620). 계좌 줄 · 힌트는 본문 버튼 안이라 버튼 이름에 포함 · `›` 는 `aria-hidden` | 「한화오션 매수 체결 … 계좌 8765-4321 · 교보 종합 · KYOBO119 이 계좌 보기」 |
| 사이드바 묶음 | 묶음 = `<li>` 안에 소제목 `<div id>`(포커스 없음) + `<ul aria-labelledby>` · 전략 · VI 링크 이름 불변 · LED 묶음 `role="img"` 라벨 불변 | 목록 이름 「김알렉스 KB120」 |
| /me 현황 묶음 | (2026-10-16 수정으로 묶음 없음 — S5′) | — |
| 「이 계좌 끄기」 | 이름에 보이는 글자를 앞에 둔다(WCAG 2.5.3) · 비활성은 `disabled` | 「이 계좌 끄기 — 1234-5678」 |
| 계좌 끄기 다이얼로그 | 기본 포커스 「닫기」(Enter 연타 방어) · 실행 버튼은 닫기 뒤 | — |
| 계좌 끄기 오류 줄 | `role="alert"` | — |
| 서버 세그먼트 | (2026-10-16 수정으로 없음 — S8′ 서버키 칩은 글자 그대로 낭독 · 상태 칩 「아직 못 받음」 도 글자) | — |
| 12행 흐림 | 기존 `aria-busy="true"` · `data-dim` | — |
| 「돌파 알림음」 | `Switch`(`role="switch"`) 이름 「돌파 알림음」 · `aria-describedby` = 캡션 · 「클릭해 활성화」 는 별도 `button` | — |
| 계좌 전환 포커스 | ~~셀렉트로 바꾸면 포커스는 셀렉트에~~ 32-15: 칩으로 바꾸면 포커스는 그 칩에 · 숨은 카드 안에 포커스가 있던 경우는 없다(~~셀렉트를~~ 칩 줄을 조작 중) · 프로그램 전환은 기존 카드 포커스 규칙 | — |

---

## 체커 FLAG 반영 메모 (2026-10-13 · 비차단)

- **시선 앵커(Dim 2):** 작업대 상단 줄 = ~~**계좌 셀렉트**(가장 왼쪽 · 유일한 입력)~~ 32-15: 계좌 칩 줄의 **선택 칩**(가장 왼쪽 · `--seg-on-bg`) · /me 현황 카드 = 첫 계좌 **소제목의 번호**(12/600 `--fg` — 나머지는 `--muted-fg`) · /me 설정 = **서버 세그먼트 선택 항목**(`--seg-on-bg` 유일한 면색 대비).
- **D-14 서버 목록 출처(FLAG 2):** 이 계약은 `accounts[]` 서버키 중복 제거를 쓴다(계좌 목록이 곧 결선 세션의 산물이고 · 미수신 서버를 「아직 못 받음」 으로 **보여 주는** 상태가 D-14 의 요구이므로 84 수신 집합만으로는 그 상태를 만들 수 없다). 세션이 닫힌 서버의 계좌가 `accounts[]` 에 남는지는 플래너가 relay `state` 조립을 확인해 정한다 — 남는다면 D-14a 의 `state.sessions[]` 추가로 거른다(CONTEXT 재량 항목).
- **타이포(Dim 4):** 12 와 12.5 는 각각 기존 `--t-sm`(행 보조) · `ChoiceRow` 세그먼트 상속값이라 이 phase 가 새로 만든 간격이 아니다. 「이 계좌 끄기」 11/600 은 목업 ③ A `.btn.sm` 그대로 · 보조 동작(주 동작은 다이얼로그 실행 버튼)이라 유지.
- **E2E 갱신 지점(FLAG 7 · 플래너 체크리스트):** `webapp/e2e/specs/trading-workbench.spec.ts` 1730~1731(`stat-applied` 제거) · 5080(`workbench-window-badge` 단언 삭제) · 5611(`workbench-dma` live 유지 확인) · 1620(토스트 `role=status` 유지) · `webapp/e2e/specs/a11y.spec.ts` 463(live 영역) · `webapp/e2e/specs/me.spec.ts` 849(`strategy-row-account` 제거) · 943 근처(/me 주문 그룹 소제목 → 평탄 + 계좌 필) · 단위 `workbench-status-bar.test.tsx` · `tone` describe 이전(S9). 줄 번호는 2026-10-13 기준 — 플래너가 재확인.

---

## 폭 백스톱

- **최악값 글자:** ~~셀렉트 옵션~~ 계좌 칩(32-15) 「1234-5678-90 · 종합매매(위탁) 김알렉스 · KYOBO127」(번호 12 · 상품명 15 · 서버키 8자) · 사이드바 소제목 같은 상품명 + 「KYOBO127」 · 토스트 계좌 줄 「계좌 」 + 같은 전체 라벨.
- **상단 줄:** 본문 344(폰) · 685 · 830 · 992 에서 상단 줄 항목 잘림 0 — ~~셀렉트는 `max-w-full` 안에서 네이티브 말줄임~~ 32-15: 계좌 칩 줄은 그 줄 안 가로 스크롤(칩 글자 잘림 0), 알약 · 칩 · 세그먼트는 `whitespace-nowrap` 로 통째 줄바꿈. 가로 스크롤 0.
- **사이드바(240 · 드로어 280):** 소제목 이름만 말줄임(+ `title`) · 서버키 칩 온전 · 전략 줄은 기존 규칙(종목명 말줄임 · LED 온전).
- **/me 현황 소제목(폰 /me 본문 ≈ 334):** 번호 · 칩 · 버튼 온전, 상품명만 말줄임. 그래도 모자라면(번호 12자 + KYOBO127 + 버튼) 상품명이 0폭까지 줄고 줄은 1줄 유지.
- **토스트:** 계좌 줄 `break-keep` 로 두 줄까지 접힘 · 힌트는 줄바꿈해도 온전 · 말줄임 없음.
- **서버 세그먼트:** 서버 4개(KB120 · KB121 · KYOBO119 · KYOBO127)가 본문 334 에 안 들어가면 트랙이 두 줄로 접힌다 · 항목 글자 잘림 0.
- §2.2b 경계 · 680 · 700 값 불변. 상따 카드 행 높이 · 밴드 동작 회귀만 확인.

---

## UI Considerations

> ui-phase Step 9.5 프로브(`ui-consideration-probe.cjs` · 2026-10-13 · 표면 12 · 사용자 「일괄」 해결). 빈값 · 오류 **문구**는 `## Copywriting Contract` 가 정본이며 여기서는 상태 모양과 참조만 적는다. backstop 행은 시각 백스톱 테스트(「폭 백스톱」 절의 최악값)로 검증한다 · dismissed 행은 사유가 곧 근거다.

Applicable state considerations: 91 · resolved 85 (explicit 77 · backstop 8) · dismissed 6 · unresolved 0 · unclassified 0. **2026-10-16 수정:** S5 · S6 · S7 · S8 · S10 행은 원문 기준이며 수정 절의 S5′~S8′ · S13 표(8행 · resolved 7 · dismissed 1)가 우선한다.

| Category | Element | Status | Resolution |
|----------|---------|--------|------------|
| empty | S1 상단 줄 | ✅ resolved (explicit) | ~~계좌 0 = 셀렉트 「계좌 확인 중…」 1옵션 비활성 · 서버키 칩 없음~~ 32-15: 계좌 0 = 「계좌 확인 중…」 글자(칩 없음) · 알약 · 세그먼트는 그대로(Copywriting S1) |
| loading | S1 상단 줄 | ✅ resolved (explicit) | 주문 알약 진행 상태어(`RELAY_STATE_LABELS`) + 점 `--flat` pulse · 시세 모름이면 시세 알약 없음(기존) · 폭 미판정 첫 페인트는 CSS 폴백 `hidden @min-[680px]/wb:inline-flex` |
| error | S1 상단 줄 | ✅ resolved (explicit) | `UNRECOVERABLE_STATES` → 「주문 끊김 · 다시 연결」(점 · 상태어 `--destructive`, 링크 `--primary` · 라이브 영역 밖 형제) · 정확한 상태어는 sr-only · `title` · `unauthorized` 는 「권한 없음」 링크 없음 |
| populated | S1 상단 줄 | ✅ resolved (explicit) | ~~셀렉트 → 칩~~ 계좌 칩 줄(32-15) → 시세 알약 → 주문 알약 → (`ml-auto`) 세그먼트 한 줄 · 보조 줄 없으면 요소 0 — 머리 높이는 상단 줄만 |
| partial | S1 상단 줄 | ✅ resolved (explicit) | 서버키 없는 계좌 = 칩 없음 · 시세 알약은 시세 상태가 있을 때만 · 낡은 전략 · 옮김 보조 줄은 필드가 있을 때만 각각 1줄 |
| overflow | S1 상단 줄 | ✅ resolved (explicit) | `wb` < 680 세그먼트 DOM 제외(**사용자 확인 2026-10-13** · 목업 폰 둘째 줄 안 그림) · ≥680 `flex-wrap` 다음 줄 오른쪽 끝 · 보조 줄은 카드 밖 전체 폭 `break-keep` · 가로 스크롤 0 |
| zero-one-many | S1 상단 줄 | ✅ resolved (explicit) | ~~계좌 0 = 비활성 1옵션 / 1 = 활성 옵션 1개(라벨이 곧 보는 계좌) / 다수 = 옵션 목록~~ 32-15: 계좌 0 = 「계좌 확인 중…」 글자 / 1 = 칩 1개 선택 / 다수 = 칩 줄 가로 스크롤 · 보조 줄 0 · 1 · 2줄로 쌓임 |
| long-text | S1 상단 줄 | 🧪 resolved (backstop) | { statement: "본문 344 · 685 · 830 · 992 에서 최악값 ~~셀렉트 라벨~~ 계좌 칩(32-15) · 「주문 끊김 · 다시 연결」 · 세그먼트가 잘림 0 · 가로 스크롤 0 · 넘치면 flex-wrap 줄바꿈(세그먼트는 다음 줄 오른쪽 끝)", verification: backstop } |
| empty | S2 계좌 스코프 격자 | ✅ resolved (explicit) | 판정 「보이는 카드 0」 · 전 계좌 0 = 기존 `CARD_GRID_EMPTY_*` · 고른 계좌만 0 = 「이 계좌에 거래할 종목이 없어요」 + 숨은 카드 {N}장 안내 · 슬롯 `card-grid-empty` 기존 |
| loading | S2 계좌 스코프 격자 | ✅ resolved (explicit) | 스냅샷 전 = 기존 격자 로딩 그대로 · 고른 계좌가 아직 없는(`accounts[]` 미수신 · ~~셀렉트 「확인 중」~~ 「계좌 확인 중…」 글자 — 32-15) 동안은 **거르지 않는다**(전부 보임) → 계좌가 정해지는 순간 거른다(빈 격자 깜빡임 방지 — 이 계약 결정) |
| error | S2 계좌 스코프 격자 | ✅ resolved (explicit) | 전환은 로컬 상태라 실패 경로 없음 · 카드 안 오류 · 「결과 모름」 잠금은 숨은 채 보존 · 다른 계좌 카드의 거부 · 체결은 토스트가 전부 띄운다(S4) |
| populated | S2 계좌 스코프 격자 | ✅ resolved (explicit) | 고른 계좌 카드만 기존 격자 규칙(§2.2b 밴드 · 저장 단 수)으로 · 숨은 카드는 마운트 유지(에코 · 더티 · 결과 모름 · 미확인 카운트 보존 · 시세 구독 수 불변) |
| partial | S2 계좌 스코프 격자 | ✅ resolved (explicit) | 계좌 공란 카드는 모든 계좌에서 보인다 · VI 트리거 스트립 칩은 `viOrder.accountNo` 로 거른다 · 작업대 VI 설정 행은 ④ 전 현행(스코프 밖) |
| overflow | S2 계좌 스코프 격자 | ✅ resolved (explicit) | 격자 폭 · 단 수 규칙 불변 — 숨김은 레이아웃 폭에 영향 없음 · 숨은 카드 수는 빈 상태 본문에서만 말한다 |
| zero-one-many | S2 계좌 스코프 격자 | ✅ resolved (explicit) | 계좌 1개 = ~~셀렉트 옵션 1개 활성~~ 칩 1개 선택(32-15) · 격자 = 지금과 동일 · 다계좌 = 전환 즉시(애니메이션 없음) · 열린 시트 · 인라인 편집 · 팝오버 닫힘 · 포커스는 ~~셀렉트에~~ 그 칩에(32-15) |
| empty | S3 사이드바 묶음 | ✅ resolved (explicit) | 켜진 전략 · 가동 VI 없는 계좌는 소제목 없음 · 전부 없으면 3단 목록 자체 없음(빈 문구 없음 — 기존) |
| loading | S3 사이드바 묶음 | ✅ resolved (explicit) | 스냅샷 전 = 목록 없음(스피너 없음 — 기존) · `accounts[]` 미수신 중 켜진 전략은 목록 밖 계좌 묶음(번호 소제목)으로 섰다가 수신 후 제자리 |
| error | S3 사이드바 묶음 | ✅ resolved (explicit) | 사이드바에 오류 상태 없음 — relay 끊김 시 마지막 스냅샷 유지 · LED 는 기존 규칙(기존 동작 불변) |
| populated | S3 사이드바 묶음 | ✅ resolved (explicit) | `SUB_LIST` 안 `accounts[]` 순 묶음 · 소제목(짧은 라벨 + 서버키 칩) → VI 줄(있을 때) → 전략 줄(`StrategyItem` LED 3점) · 추가 들여쓰기 없음 |
| partial | S3 사이드바 묶음 | ✅ resolved (explicit) | 목록 밖 계좌 묶음 = 번호(mono) 소제목 · 칩 없음 · 맨 뒤 · 서버키 없는 계좌 = 칩 없음 · VI 만 가동이고 전략 0 인 묶음도 선다 |
| overflow | S3 사이드바 묶음 | 🧪 resolved (backstop) | { statement: "사이드바 240 · 드로어 280 에서 최악값 상품명 소제목이 말줄임 + title 로 보이고 서버키 칩 · LED 3점은 잘림 0", verification: backstop } |
| zero-one-many | S3 사이드바 묶음 | ✅ resolved (explicit) | 묶음 1개여도 소제목을 그린다(계좌 표시가 목적) · 같은 상품명 · 서버키 묶음이 둘 이상이면 번호로 대신 · 「트레이딩」 배지 = 전 계좌 합 |
| long-text | S3 사이드바 묶음 | ✅ resolved (explicit) | 소제목 이름 `min-w-0 truncate` + `title`(전체 라벨) · 서버키 칩 `whitespace-nowrap` 오른쪽 끝 · 전략 줄 종목명은 기존 말줄임 |
| empty | S4 토스트 계좌 줄 | ✅ resolved (explicit) | 계좌 없는 알림(돌파) = 계좌 줄 없음 → 기존 2줄 토스트 모양 그대로 |
| loading | S4 토스트 계좌 줄 | ⛔ dismissed | 사유: 토스트는 완료된 이벤트(체결 · 거부 · 돌파)로만 생성 — 로딩 중간 상태가 존재하지 않는다 |
| error | S4 토스트 계좌 줄 | ✅ resolved (explicit) | 거부 토스트도 계좌 줄을 단다 · 사유 원문은 기존 부제 줄(셋째 줄 · 불변) |
| populated | S4 토스트 계좌 줄 | ✅ resolved (explicit) | 본문 버튼 안 ① 제목(`alertWho` + 접미 + 「N건」) ② 계좌 줄 11/400 `--muted-fg` + 오른쪽 「이 계좌 보기 ›」 11/600 `--primary` ③ 기존 부제 · 소리 · TTL · 위치 종전 |
| partial | S4 토스트 계좌 줄 | ✅ resolved (explicit) | 목록 밖 계좌 = 「계좌 {번호}」 · 돌파(계좌 없음) = 줄 없음 · 같은 계좌 = 힌트 없음 · 매칭 카드 없음 = 알림 계좌로 전환만 |
| overflow | S4 토스트 계좌 줄 | ✅ resolved (explicit) | 최대 4개 스택 · 넘치면 오래된 것부터 빠짐(기존) · 계좌 줄 `break-keep` 두 줄까지 · 힌트 `whitespace-nowrap` · 말줄임 없음 |
| zero-one-many | S4 토스트 계좌 줄 | ✅ resolved (explicit) | 0 = 컨테이너 빈 채 `role="status"` 유지 · 1~4 스택 · 같은 종목 묶음 「N건」 집계 기존 · 다계좌 알림이 섞여도 각자 계좌 줄 |
| long-text | S4 토스트 계좌 줄 | 🧪 resolved (backstop) | { statement: "폰 전폭 · ≥700 폭 340 토스트에서 최악값 계좌 줄이 break-keep 두 줄 이내로 전부 보이고 「이 계좌 보기 ›」 잘림 0", verification: backstop } |
| empty | S5 /me 현황 묶음 | ✅ resolved (explicit) | 전략 0 계좌 = 「등록된 전략 없음」 점선 한 줄 · 카드 전체 빈 상태 블록은 묶음별 빈 상태로 대체 · 어느 계좌에도 등록 VI 없으면 VI 행 없음(④ 전) |
| loading | S5 /me 현황 묶음 | ✅ resolved (explicit) | 스냅샷 전 · 계좌 0 = 기존 스켈레톤 3행 + 「전략 정보를 불러오는 중이에요…」 · 끄기 응답 대기 = 그 묶음 버튼 + 「전체 비활성화」 잠금(`strategies.disabled` 1프레임에 해제) |
| error | S5 /me 현황 묶음 | ✅ resolved (explicit) | 계좌 끄기 미확인(8초) · 전송 실패 = 그 묶음 소제목 아래 `role="alert"` 한 줄(11px `--destructive` · 슬롯 플래너 결정) · 버튼 다시 열림 · 전체 비활성화 오류 줄은 별도 슬롯 기존 |
| populated | S5 /me 현황 묶음 | ✅ resolved (explicit) | `accounts[]` 순 묶음 = `h3` 소제목(「계좌」 번호 상품명 칩 · `ml-auto` 「이 계좌 끄기」 28px) → `StrategyRow` 들(2줄째 코드 · 거래소만) → VI 행 · 묶음 사이 12px · 카드 맨 아래 「전체 비활성화」 유지 |
| partial | S5 /me 현황 묶음 | ✅ resolved (explicit) | ④ 전 VI 행은 등록 계좌 묶음에만(요약은 그 거래소만) · 목록 밖 계좌 묶음은 버튼 없음 · 웨이브 ① 배포본은 소제목에 버튼 없음(자리 비우지 않음) |
| overflow | S5 /me 현황 묶음 | 🧪 resolved (backstop) | { statement: "/me 폰 본문에서 최악값 소제목(번호 12자 · 상품명 15자 · KYOBO127 · 이 계좌 끄기)이 한 줄 · 상품명만 말줄임 · 버튼 · 칩 잘림 0", verification: backstop } |
| zero-one-many | S5 /me 현황 묶음 | ✅ resolved (explicit) | 계좌 1개 = 묶음 1개(소제목 · 버튼 그대로) · 다계좌 = `accounts[]` 순 + 목록 밖 계좌 맨 뒤 · 버튼 비활성(끌 것 없음)은 `opacity .45` 로 남긴다(숨기지 않음) |
| long-text | S5 /me 현황 묶음 | ✅ resolved (explicit) | 상품명 `min-w-0 flex-1 truncate` + `title` · 번호 · 칩 · 버튼 온전(모자라면 상품명 0폭까지 · 1줄 유지) · 전략 행 종목명 기존 말줄임 |
| empty | S6 /me 주문 | ✅ resolved (explicit) | 고른 계좌 0 ∧ 다른 계좌 ≥1 = 「이 계좌의 오늘 주문이 없어요」 + 「다른 계좌에 오늘 주문 {N}건이 있어요 · 위에서 계좌를 바꿔 보세요」 · 전 계좌 0 = 기존 문구 |
| loading | S6 /me 주문 | ✅ resolved (explicit) | 기존 「오늘 주문을 불러오는 중이에요…」 · 계좌 0 = 필 「계좌 확인 중…」 비활성 · 옵션은 행 계좌로도 선다 |
| error | S6 /me 주문 | ✅ resolved (explicit) | 기존 불러오기 실패 · 지연 칩 문구 불변 · 필은 오류와 무관하게 조작 가능 |
| populated | S6 /me 주문 | ✅ resolved (explicit) | 머리 줄(「오늘 주문」 · 「{N}건」 · 지연 칩 · `ml-auto` 계좌 필) → 캡션 12/400 → 고른 계좌 행 평탄 목록(표 ≥1280 / 카드 <1280 · 묶음 펼침 · 상세창 링크 불변) |
| partial | S6 /me 주문 | ✅ resolved (explicit) | 행에만 있는 계좌도 옵션(번호 라벨) — 기록된 주문을 숨기지 않는다(Pitfall 10) · 기억값이 옵션 밖이면 작업대 계좌 → 첫 옵션 |
| overflow | S6 /me 주문 | ✅ resolved (explicit) | 머리 줄 `flex-wrap` — 좁으면 필이 다음 줄 오른쪽 끝 · 표 가로 스크롤 · 카드 목록 규칙 기존 |
| zero-one-many | S6 /me 주문 | ✅ resolved (explicit) | 「주문 N」 · 「N건」 = 고른 계좌 건수 · 0 이면 탭 숫자 없음 · 그룹 소제목 없음(평탄) · 계좌 1개 = 필 옵션 1개 활성 |
| long-text | S6 /me 주문 | ✅ resolved (explicit) | ~~필 옵션 라벨은 네이티브 `<select>` 말줄임(`max-w-full min-w-0`)~~(S6′ · 32-15 로 필 없음) · 캡션 `break-keep` 줄바꿈 · 말줄임 없음 |
| empty | S7 /me 잔고 소제목 | ✅ resolved (explicit) | 계좌 0 = `AccountPanel` 기존 빈 · 확인 중 상태 그대로(소제목 없음) |
| loading | S7 /me 잔고 소제목 | ✅ resolved (explicit) | 잔고 로딩은 기존 `AccountPanel` 그대로 · 소제목은 `accounts[]` 가 있으면 잔고와 독립해 즉시 그린다 |
| error | S7 /me 잔고 소제목 | ✅ resolved (explicit) | 잔고 조회 실패 문구 기존 · 소제목은 유지(계좌 식별은 오류와 무관) |
| populated | S7 /me 잔고 소제목 | ✅ resolved (explicit) | 「계좌」(12/600 `--muted-fg`) → 번호(12/600 mono) → 상품명(12/400) → 서버키 칩 · 점 없이 8px 간격(S11 부분별 렌더) |
| partial | S7 /me 잔고 소제목 | ✅ resolved (explicit) | 상품명 · 서버키 없으면 그 칸 생략(칩 prop 선택 · 없으면 칩 없음) · 종목 축 모드(셀렉터)는 불변 |
| overflow | S7 /me 잔고 소제목 | ✅ resolved (explicit) | 상품명만 `truncate` + `title` · 번호 · 칩 `whitespace-nowrap` · 1줄 유지 |
| zero-one-many | S7 /me 잔고 소제목 | ✅ resolved (explicit) | 계좌마다 패널 세로 반복(D-21 유지 · 계좌 선택 없음) · 1개도 소제목을 그린다 |
| long-text | S7 /me 잔고 소제목 | 🧪 resolved (backstop) | { statement: "/me 폰 본문 334 에서 최악값 소제목(번호 12자 · 상품명 15자 · KYOBO127)이 1줄 · 상품명만 말줄임 · 칩 잘림 0", verification: backstop } |
| empty | S8 서버 세그먼트 | ✅ resolved (explicit) | 서버 목록 빈 경우(계좌 0 · 서버키 없는 구 relay) = 세그먼트 · 서버 캡션 없음 · 기존 단일 동작(키 `""` 84) |
| loading | S8 서버 세그먼트 | ✅ resolved (explicit) | 첫 로딩(어느 84 도 없음) = 기존 「불러오는 중」 · 고른 서버만 미수신 = 「아직 못 받음」 + 12행 `opacity .45` · `aria-busy` · 편집 · 저장 잠금 · 점 `--faint` · 받으면 즉시 해제 |
| error | S8 서버 세그먼트 | ✅ resolved (explicit) | 지정 서버 세션 없음 거부 = `me-lc-defaults-reject` 빨간 한 줄 「고른 서버 세션이 없어 저장하지 않았어요 — …」 · 54 · 범위 밖 · 3초 미반영 기존 · 비행 중 세그먼트 잠금 `title`(Pitfall 12) |
| populated | S8 서버 세그먼트 | ✅ resolved (explicit) | 제목 줄 → 8px → 세그먼트(`ChoiceRow` 문법 · 항목 28px · 점 `--led-armed`) → 4px → 캡션 → 기존 안내 → 12행 격자 · 저장은 고른 서버에만 42(`serverKey`) |
| partial | S8 서버 세그먼트 | ✅ resolved (explicit) | 일부 서버만 84 수신 = 그 항목 점 `--faint` + sr 「 · 아직 못 받음」 · 고르면 흐림 · 다른 서버 값은 섞어 보이지 않는다(서버마다 따로) · 되싣기는 그 서버 84 에서 |
| overflow | S8 서버 세그먼트 | 🧪 resolved (backstop) | { statement: "서버 4개 세그먼트가 /me 본문 334 에서 트랙 줄바꿈으로 전부 보이고 항목 글자 잘림 0 · 가로 스크롤 0", verification: backstop } |
| zero-one-many | S8 서버 세그먼트 | ✅ resolved (explicit) | 서버 1개도 세그먼트 표시(캡션 「고른 서버에만 저장돼요.」) · 2개+ 캡션 「… 다른 서버는 따로 봐야 해요.」 · 기본 선택 = 기억 서버 → 첫 서버 · 세션 닫히면 첫 서버로(알림 없음) |
| long-text | S8 서버 세그먼트 | ✅ resolved (explicit) | 서버키 ≤ 8자 · 항목 `whitespace-nowrap` · 넘치면 트랙 줄바꿈(말줄임 · 가로 스크롤 없음) · 거부 문구는 기존 빨간 줄 `break-keep` |
| empty | S9 「이 기기」 카드 | ⛔ dismissed | 사유: 스위치는 항상 값이 있다(기본 꺼짐 · localStorage 없음 = 꺼짐) — 데이터 없음 상태가 존재하지 않는다 |
| loading | S9 「이 기기」 카드 | ✅ resolved (explicit) | 하이드레이션 전 = 꺼짐으로 그리고 마운트 뒤 `gh-radar:breakout-tone` · 차단 상태를 읽어 갱신(기존 `ToneToggle` 규칙 · 스켈레톤 없음) |
| error | S9 「이 기기」 카드 | ✅ resolved (explicit) | localStorage 접근 실패 = 꺼짐 유지 · 오류 표시 없음(기존) · 켜짐 ∧ 자동재생 차단 = 스위치 왼쪽 「클릭해 활성화」 버튼(`resumeToneContext()` 만) |
| populated | S9 「이 기기」 카드 | ✅ resolved (explicit) | /me 카드 `--card` · `--r-lg` · 패딩 12 · 제목 15/600 「이 기기」 → 캡션 12.5/400 → 행 44px 「돌파 알림음」 14/400 + `Switch` 36×20(checked `--primary`) · 위 hairline |
| partial | S9 「이 기기」 카드 | ✅ resolved (explicit) | 켜짐 ∧ 차단 = 「클릭해 활성화」 추가 상태(스위치 상태 불변) · 꺼짐이면 버튼 없음 · 작업대 알림음 아이콘 DOM 은 사라지고 `readTonePref` 재생은 유지 |
| overflow | S9 「이 기기」 카드 | ✅ resolved (explicit) | 라벨 `whitespace-nowrap` · 「클릭해 활성화」 + 스위치 묶음은 좁으면 라벨 아래로 줄바꿈 허용 · 가로 스크롤 0 |
| zero-one-many | S9 「이 기기」 카드 | ⛔ dismissed | 사유: 행 1개 고정(「돌파 알림음」) — 개수 축이 없다. 기기 설정이 늘면 같은 카드에 행을 추가한다(이 phase 밖) |
| long-text | S9 「이 기기」 카드 | 🧪 resolved (backstop) | { statement: "켜짐 ∧ 차단일 때 「돌파 알림음」 행에 「클릭해 활성화」 + 스위치가 폰 /me 본문에서 한 줄 또는 줄바꿈으로 잘림 0", verification: backstop } |
| empty | S10 공용 계좌 필 | ✅ resolved (explicit) | 계좌 0 = 「계좌 확인 중…」 1옵션 · 셀렉트 비활성 · 서버키 칩 없음 · **32-15 로 무효** |
| loading | S10 공용 계좌 필 | ✅ resolved (explicit) | 로딩 = 계좌 0 과 같은 모양(「확인 중」) · 부품은 별도 스피너 없음 · 쓰는 곳 로딩은 각자(S1 · S6) · **32-15 로 무효** |
| error | S10 공용 계좌 필 | ⛔ dismissed | 사유: 부품 자체 오류 상태 없음 — 계좌 목록은 relay `state` 에서 오고 연결 오류는 쓰는 곳(S1 주문 알약 · S6 실패 문구)이 말한다 · **32-15 로 무효** |
| populated | S10 공용 계좌 필 | ✅ resolved (explicit) | 네이티브 `<select>` 26px 둥근 알약 `--muted` 11px mono(`appearance-none` 금지) + 고른 계좌 서버키 칩 · 옵션 글자 = S11 전체 변형 · props `{accounts, accountNo, onChange, title?}` · **32-15 로 무효** |
| partial | S10 공용 계좌 필 | ✅ resolved (explicit) | 서버키 없는 계좌 = 칩 없음 · 목록 밖 계좌 옵션(S6 · 번호 라벨) · 접근 이름 · `data-slot` 은 쓰는 곳마다(작업대 `workbench-account` · `workbench-account-server` 유지) · **32-15 로 무효** |
| overflow | S10 공용 계좌 필 | ✅ resolved (explicit) | `max-w-full min-w-0` — 라벨은 네이티브 말줄임 · 칩 `whitespace-nowrap` · 컨테이너 `flex-wrap` 은 쓰는 곳 몫 · **32-15 로 무효** |
| zero-one-many | S10 공용 계좌 필 | ✅ resolved (explicit) | 0 = 비활성 1옵션 / 1 = 활성 옵션 1개 / 다수 = 전체 옵션 · 마스킹 없음 · **32-15 로 무효** |
| long-text | S10 공용 계좌 필 | 🧪 resolved (backstop) | { statement: "최악값 옵션 「1234-5678-90 · 종합매매(위탁) 김알렉스 · KYOBO127」 이 작업대 본문 344 · /me 334 에서 셀렉트 안 네이티브 말줄임으로 보이고 칩 온전 · 가로 스크롤 0", verification: backstop } · **32-15 로 무효** |
| loading | S11 계좌 라벨 | ✅ resolved (explicit) | 상품명 · 서버키 미수신(`accounts[]` 전 · 목록 밖 계좌) = 번호만 · 「 · 」 꼬리를 남기지 않는다 |
| error | S11 계좌 라벨 | ⛔ dismissed | 사유: 순수 서식 함수 — 오류 상태가 없다(빈 입력은 빈 칸 생략 규칙으로 흡수) |
| overflow | S11 계좌 라벨 | ✅ resolved (explicit) | 함수는 자르지 않는다 · 자르기는 쓰는 곳 CSS(`truncate` + `title`) — ~~네이티브 `<select>` 옵션은 OS 가 자른다~~(32-15: 셀렉트 없음 · 칩은 자르지 않고 줄이 가로 스크롤) |
| long-text | S11 계좌 라벨 | ✅ resolved (explicit) | 최악값 번호 12 · 상품명 15 · 서버키 8자 → 전체 변형 ≈ 40자 · 짧은 변형은 상품명(중복 시 번호) + 칩 · 쓰는 곳 백스톱(S1 · S3 · S5 · S7 · S10)이 잘림 0 을 확인 |
| empty | S12 VI 계좌별(④) | ✅ resolved (explicit) | 미등록 슬롯 = 기존 미등록 빈 행(저장하면 고른 계좌로 등록) · 어느 계좌에도 없음 = ④ 전 /me VI 행 없음 / ④ 뒤 모든 묶음 한 행 「중지」 |
| loading | S12 VI 계좌별(④) | ✅ resolved (explicit) | 61 프레임 전 = 기존 VI 로딩 · 구 서버(계좌 1건 61) 호환 창에서는 기존 모양 유지(relay 먼저 배포 · D-16) |
| error | S12 VI 계좌별(④) | ✅ resolved (explicit) | `vi.set` 거부 · 소유 세션 없음은 기존 VI 오류 문구를 **그 (계좌, 거래소) 슬롯** 행에 표시 |
| populated | S12 VI 계좌별(④) | ✅ resolved (explicit) | 작업대 VI 설정 행 = 고른 계좌의 KRX · NXT 2행 · 「옮기기」 · 등록 계좌 고지 줄 없음(행 높이 축소) · /me · 사이드바 VI 줄은 계좌 묶음 안 거래소별 |
| partial | S12 VI 계좌별(④) | ✅ resolved (explicit) | 한 거래소만 등록 = 다른 행은 빈 행 · 교보 세션 VI 도 받는다(KB 원천 한정 해제) · `unregistered` 프레임은 그 칸 null |
| overflow | S12 VI 계좌별(④) | ✅ resolved (explicit) | 행 높이만 줄어든다 · 기존 VI 패널 「더보기」 펼침 · 폭 규칙 불변 |
| zero-one-many | S12 VI 계좌별(④) | ✅ resolved (explicit) | 계좌 1개 = 지금과 같은 모양 · 다수 = 계좌 전환마다 슬롯 즉시 교체 · 더티 편집은 (계좌, 거래소) 슬롯마다 보존 |
| long-text | S12 VI 계좌별(④) | ⛔ dismissed | 사유: 글자 변화 없음 — 기존 VI 행 문구 · `VI_DIRTY_HINT` 그대로(제거만 있고 추가 문구 없음) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | 없음(이 phase 는 새 컴포넌트를 설치하지 않는다 · `components.json` `registries: {}` · Switch · ToggleGroup · Dialog 는 이미 설치) | not required |

제3자 레지스트리 없음 — 검사 대상 0.

---

## Claude's Discretion (이 계약이 정한 것 — 사용자 질문 0)

CONTEXT 「Claude's Discretion」 과 RESEARCH Open Q 중 화면에 닿는 것을 기존 규칙 재사용 · 목업 우선 원칙으로 정했다.

1. **폰 밴드 세그먼트(Pitfall 7 · Open Q2):** `wb` < 680 은 DOM 제외(종전 접근성 계약), ≥680 은 넘칠 때 같은 카드 안 다음 줄 오른쪽 끝. 목업 폰 390 의 아래 줄 세그먼트는 1열 고정 폭이라 동작하지 않는 조작이므로 그리지 않는다. **사용자 확인 완료(2026-10-13 · ui-phase): 「폰에서 뺀다」** — 목업 폰 390 의 둘째 줄 세그먼트는 그리지 않는다.
2. **주문 알약 끊김 문구:** `UNRECOVERABLE_STATES` 에서만 보이는 상태어 「끊김」(목업) + 「다시 연결」 링크 · 정확한 상태어는 sr-only · title. `orderPillOf` · /me 상태줄은 불변.
3. **낡은 전략 · 옮김 보조 줄:** 상단 줄 카드 밖 바로 아래(목업 `.aux` 자리) · 기존 양식 · 토스트로 바꾸지 않음.
4. ~~계좌 1개 = 셀렉트 활성 · 옵션 1개~~ 32-15: 계좌 1개 = 칩 1개 선택 / 계좌 0 = 기존 「계좌 확인 중…」(칩 없이 글자).
5. 사이드바 전략 클릭 = 작업대 계좌 전환 + 포커스 · VI 줄 클릭 전환은 ④ 에서.
6. 계좌 전환 시 시트 · 인라인 편집 닫기 · 프로그램 전환은 기억 계좌도 바꾼다(RESEARCH A1 — 의도된 동작).
7. 계좌 빈 상태 문구(숨은 카드 수 안내) · /me 주문 고른 계좌 빈 상태 문구(다른 계좌 건수 안내).
8. 토스트 계좌 줄 = 제목 바로 아래 둘째 줄(D-03 원문) · 「이 계좌 보기 ›」 는 계좌가 다를 때만.
9. /me VI 행 위치(Open Q3): ④ 전 = 등록 계좌 묶음에만 · 등록 VI 없으면 행 없음 / ④ 뒤 = 모든 묶음 한 행 · 거래소별 요약.
10. ~~「이 계좌 끄기」 = 목업 ③ A 중립 테두리 · 28px~~ → 2026-10-16 S5′: 카드 맨 아래 `--destructive` 면 버튼(전체 비활성화 버튼과 같은 크기) · 비활성은 `disabled` + `opacity .45` · 오류 줄은 kill 줄 바로 위.
11. ~~서버 세그먼트~~ → 2026-10-16 S8′: 서버 = 고른 계좌의 `serverKey` · 서버키 칩 + 상태 칩 · 「아직 못 받음」 은 고른 서버만 미수신일 때(첫 로딩은 기존 「불러오는 중」).
12. 「이 기기」 알림음 = shadcn `Switch`(checked `--primary` — 목업 초록 대신 프로젝트 관례) + 차단 시 별도 「클릭해 활성화」 버튼.
13. 사이드바 짧은 라벨 중복 시 번호 대체 · 목록 밖 계좌 묶음은 번호 소제목 맨 뒤(사이드바 · /me 현황 공통).
14. /me 계좌 칩 기본 선택 순서(화면 기억값 → 작업대 기억 계좌 → 첫 계좌) · 목록 = `accounts[]` ∪ 행 계좌(2026-10-16 S13 — 주문 탭 필에서 칩으로 이동).
15. 함수 · 파일 · 슬롯 · localStorage 키 이름은 예시만 적고 플래너가 정한다.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS (FLAG — 상태 행 보강 → UI Considerations 91행으로 해소)
- [x] Dimension 2 Visuals: PASS (FLAG — 시선 앵커 메모 추가)
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS (FLAG — 상속 크기 메모)
- [x] Dimension 5 Spacing: PASS (FLAG — `--s-3` 선언 추가)
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** APPROVED — gsd-ui-checker 2026-10-13 · BLOCK 0 · FLAG 7(비차단 · 위 메모로 반영) · D-05 폰 세그먼트 사용자 확인 「폰에서 뺀다」

**재승인(2026-10-16 수정분):** APPROVED — gsd-ui-checker 2026-10-16 2회차 · 1회차 BLOCK 2(S13 칩 번호 굵기 500 · 6px 간격) → 11/400 · gap 8/4 로 해소 · FLAG(빈 상태 제목 · 끄기 잠금 · 「이 계좌 끄기」 색 · `--warn` 토큰 · accent 3번째 소비처 · 캡션 12.5) 전부 반영 · 7차원 PASS.
