---
phase: "30"
slug: "kb-ip-mac"
status: approved
reviewed_at: "2026-10-11"
shadcn_initialized: true
preset: radix-nova
created: "2026-10-11"
---

# Phase 30 — UI Design Contract

> 인박스 KB 계좌별 주문자 IP/MAC + 계좌명 편집. 손대는 화면은 **Admin 사용자 편집 시트 → 「계좌 · 등록 서버」 계좌 카드 1종**뿐이다(`webapp/src/components/admin/account-editor.tsx` `AccountRow`).
> 레이아웃 · 문구는 채택 목업 **B**(`reference/mockup-account-edit.html` — 「편집」 → 카드 펼침)가 정본이다. A · C 는 기각.
> 새 토큰 · 새 폰트 · 새 색 0개 — Phase 29 계좌 카드 상수(`ACCOUNT_CARD` · `ACCOUNT_BUTTON` · `NOTE` · `ERROR_LINE` · `WARN_LINE` · `ADMIN_BUTTON_*`)를 그대로 쓴다. 새 클래스 상수는 `EDIT_ERROR_LINE` 1개뿐(기존 `BusyLines` err 줄과 같은 클래스 조합 — Typography 참조).
> **갭 클로징 Addendum(맨 아래 · 2026-10-11 · D-17 · D-18)** 이 아래 본문의 IP/MAC **값 표기**(§1-3 「87 정규화값 그대로(재정규화 금지)」 · §1-4 불일치 줄 값 · §2 초깃값 · Typography/Copywriting/E1 의 `010041001124` · `1CFD087D978E` 예시)를 대체하고, 편집 모드에 공유 계좌 안내 줄 1개를 더한다. 충돌하면 Addendum 이 이긴다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (`webapp/components.json`) |
| Preset | `radix-nova` · baseColor neutral · cssVariables (기존 — 변경 없음) |
| Component library | radix (`radix-ui@1.4.3`) |
| Icon library | lucide (`lucide-react@1.8.0`) — 이번 phase 는 아이콘을 쓰지 않는다 |
| Font | Pretendard Variable (`--font-sans`, globals.css) · 숫자는 `tabular-nums` |

출처: `npx shadcn info`(webapp) · `webapp/src/styles/globals.css` · Phase 29 계좌 카드 상수.

---

## Component Inventory

Enumerated by `cd webapp && npx shadcn info` — 21 components — shadcn@4.2.0 (base radix-ui@1.4.3) — 2026-10-11.

설치된 전체: badge, button, card, chart, checkbox, command, dialog, input-group, input, popover, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle-group, toggle, tooltip. 아래 표는 이번 phase 가 쓰는 것만 — 닫힌 허용 목록이 아니다(그 밖이 필요하면 위 명령으로 확인하고 쓴다).

| Component | Import path | Notes |
|-----------|-------------|-------|
| Button | `@/components/ui/button` | 「편집」 · 「취소」 = `variant="secondary"` + `ADMIN_BUTTON_SECONDARY` + `ACCOUNT_BUTTON`(폰 36px · sm 이상 28px). 「저장」 = 기본 변형 + `ADMIN_BUTTON_PRIMARY` + `ACCOUNT_BUTTON` — 추가 폼 「추가」 버튼과 같은 조합. 세 버튼 모두 계좌를 특정하는 `aria-label` 을 단다(Copywriting 「CTA 접근 이름」 표) |
| Input | `@/components/ui/input` | `size="sm"`(h-8 · 12px). 잘못된 값은 `aria-invalid` → 기존 `--destructive` 테두리 채널. 포커스는 기존 `--ring` 테두리 한 겹 |
| ReflectChip (프로젝트) | `@/components/admin/reflect-chip` | 저장 결과는 기존 서버 칩(반영됨 · 실패 · BUSY · 응답 없음 · 서버 연결 안 됨)으로 — 새 칩 없음 |
| useFieldSave (프로젝트) | `@/components/admin/use-field-save` | 카드 저장 1건 · 성공 flash 0.7초 · HTTP 오류 한 줄(`저장하지 못했어요 · <message>`) |

---

## Spacing Scale

신규 요소의 간격은 아래 값만 쓴다(4 의 배수).

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | 칸 라벨 → 입력칸(`mb-1`) · 지점/트레이더 줄 → IP/MAC 줄(`mt-1`) |
| sm | 8px | IP · MAC 2열 그리드 간격(`gap-2`) · 계좌명 칸 → IP/MAC 그리드(`mt-2`) · 제목줄 「편집」 ↔ 「제거」 사이(`AccountTitle` 의 기존 `gap-2` — 새 간격 클래스를 달지 않는다) |
| md | 16px | (계좌 카드 밖 — 기존 시트 여백 그대로, 이번 phase 신규 사용 없음) |
| lg | 24px | (신규 사용 없음) |

Exceptions(전부 Phase 29 계좌 카드에서 물려받은 기존 리듬 — 새로 만들지 않는다):
- **10px**(`mt-2.5`) — 카드 안 블록 간격. 지점/트레이더(또는 IP/MAC 줄) → 편집 입력 블록, 입력 블록 → 「취소 · 저장」 줄, 「취소 · 저장」 → 서버 토글 줄. 기존 서버 토글 줄 · 주문 서버 줄이 같은 `mt-2.5` 다.
- **6px**(`mt-1.5` · `gap-1.5`) — 한 줄 안내(도움말 · 검증 오류 · 결과 줄 · 불일치 경고)의 위 간격(`NOTE` · `WARN_LINE` · `BusyLines` 와 같은 `mt-1.5`) · 「취소」「저장」 버튼 사이(기존 추가 폼 동작 줄 `flex justify-end gap-1.5` 와 같은 형제 간격 — 그 줄을 그대로 본뜬다).
- **카드 안쪽 12px × 14px**(`px-3.5 py-3`) — `ACCOUNT_CARD` 그대로.
- **터치 타깃** — 버튼은 `ACCOUNT_BUTTON`(폰 `h-9` 36px · `sm:` 28px). 입력칸은 추가 폼과 같은 `Input size="sm"` 32px.

---

## Typography

이번 phase 가 새로 그리는 요소는 아래 **2크기(12 · 14) · 2굵기(400 · 600)** 만 쓴다.

| Role | Size | Weight | Line Height | 쓰는 곳 |
|------|------|--------|-------------|---------|
| Body(입력 · 메타 · 한 줄 안내) | 12px | 400 | 1.5 | 입력칸 글자(`Input sm` = `--t-caption`) · 칸 라벨 · IP/MAC 읽기 줄 · 도움말 · 불일치 경고 · 「변경 없음」 · **검증 오류 · 저장 결과 오류 줄**(색만 `--destructive`) |
| Label 강조 | 12px | 600 | 1.5 | IP/MAC 읽기 줄의 값(`010041001124` · `1CFD087D978E`) · 버튼 글자(`ADMIN_BUTTON_*` = 12px 600) |
| Heading(제목줄) | 14px | 600 | 1.2 | 계좌 카드 제목줄 — 기존 `AccountTitle` 그대로 |

- **편집 블록의 오류 줄은 12px** — 새 상수 `EDIT_ERROR_LINE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--destructive)]"`(기존 `BusyLines` err 줄과 같은 클래스 · 목업 B `.err` 12px). 검증 오류는 12px 도움말 **자리를 대신**하므로 같은 크기여야 줄 높이가 튀지 않는다. 기존 `ERROR_LINE`(12.5px)은 카드 하단 계좌 오류 줄 · 추가 폼에서 **그대로** 쓰이고 이번 phase 신규 요소에는 쓰지 않는다.
- **물려받은 Phase 29 크기 · 굵기 = 문서화된 예외(손대지 않음 · 신규 요소 아님)**: 증권사 배지 11px/600 · 서버 알약 12.5px · 알약 칩 10.5px · 주문 서버 줄 12.5px · 기존 `ERROR_LINE` 12.5px · 제목줄 계좌명 14px/500. 읽기 카드의 「이름 없음」 은 기존 계좌명 `<span>` 자리에 그대로 그리므로 그 span 의 14px/500 을 물려받고 색만 `--faint` 다(새 굵기를 정의하지 않는다).
- 목업 B 의 11.5px 라벨 · 도움말과 13px 입력은 **12px 로 맞춘다**(기존 `NOTE` · `Input sm` 과 같은 크기 — 새 크기를 만들지 않는다). IP · MAC 값은 `tabular-nums`.

---

## Color

전부 기존 globals.css 토큰(라이트/다크 양쪽 정의됨).

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg` / 시트 면(라이트 #ffffff · 다크 #0a0a0a) | 시트 · 계좌 카드 면 |
| Secondary (30%) | `--muted`(라이트 #f2f4f6 · 다크 #2d2d2d) · `--border-subtle` | 입력칸 채움(`Input`) · 증권사 배지 · 「편집」/「취소」 버튼 · 카드 hairline |
| Accent (10%) | `--primary`(라이트 #3182f6 · 다크 #3485fa) | 아래 3곳만 |
| Destructive | `--destructive`(라이트 #f04452 · 다크 #f04251) | 잘못된 입력칸 테두리 · 검증 오류 줄 · 서버 실패 줄 |
| Warning | `--led-latent`(라이트 #ff9f1a · 다크 #ffb13d) | 등록 서버 간 IP/MAC 불일치 줄(D-10) · 결과 warn 줄(서버 연결 안 됨 · 미반영) |
| Success | `--led-armed` | 기존 서버 칩 「반영됨」 · 기존 카드 성공 flash(0.7초)만 — 신규 성공 문구 없음 |
| Muted text | `--muted-fg` · `--faint` | 칸 라벨 · 도움말 · 「변경 없음」 = `--muted-fg` / 「미설정(서버 NIC 값)」 · 「이름 없음」 · 「확인 전」 = `--faint` |

Accent reserved for:
1. 「저장」 버튼 면(`Button` 기본 변형 = `--primary`).
2. 편집 중 카드 테두리(`border-[var(--primary)]` — D-01 강조 테두리, 목업 `.acct.editing`).
3. 입력칸 포커스 테두리(`--ring` — `Input` 기존 동작, `--primary` 와 같은 값).

그 밖(「편집」 · 「취소」 · 라벨 · 값)은 accent 를 쓰지 않는다.

---

## 화면 계약 (Layout & Interaction)

### 1. 읽기 전용 계좌 카드 (평소 — D-01 · D-09 · D-10)

위→아래 순서. `+` 는 이번에 추가되는 것.

1. **제목줄**(`AccountTitle`) — 증권사 배지 · 계좌번호 · 계좌명 · `+「편집」` · 「제거」. 「편집」 은 **「제거」 왼쪽**, 같은 버튼 모양(`secondary` · `ACCOUNT_BUTTON`), 둘 사이 8px — `AccountTitle` 컨테이너의 기존 `gap-2` 가 그대로 벌린다(래퍼 · 새 간격 클래스 없음).
   - `+` 계좌명이 빈 값이면 계좌명 자리에 `--faint` 「이름 없음」(목업 B). 87 전용 계좌 줄(`ServerOnlyAccountRow`)은 편집 대상이 아니므로 바꾸지 않는다.
   - 「편집」 `aria-label` = `"{broker} {accountNo} 편집"`(「제거」 와 같은 규칙).
2. 지점 · 트레이더 줄(`BranchTrader` — 그대로).
3. `+` **IP/MAC 줄(KB 계좌만, `mt-1` · 12px · `--muted-fg` · `tabular-nums` · `data-slot="admin-account-ipmac"`)**
   - 설정됨: 「주문자 IP **010041001124** · MAC **1CFD087D978E**」 — 값은 600 · `--fg-2`, 87 정규화값 그대로(재정규화 금지).
   - 미설정: 「주문자 IP · MAC 」 + `--faint` 「미설정(서버 NIC 값)」.
   - 87 미확인(그 계좌의 어느 등록 서버도 87 에 그 계좌가 아직 없음): 「주문자 IP · MAC 」 + `--faint` 「확인 전」.
   - 교보 계좌는 이 줄이 없다(D-09 KB 만).
   - 값의 출처 = 그 계좌의 **유효 주문 서버**(`resolveEffectiveOrderServer`) 87 값. 유효 주문 서버가 없으면 레지스트리 순 첫 active 등록 서버.
4. `+` **불일치 경고 줄(D-10, `WARN_LINE` · `data-slot="admin-account-ipmac-mismatch"`)** — 다른 active 등록 서버의 87 값이 3번 값과 다를 때, 다른 서버마다 한 줄: 「{서버키} 값이 달라요(IP {ip} · MAC {mac}) — 편집에서 저장하면 등록 서버가 모두 같아져요」. 그 서버가 미설정이면 괄호 안은 「미설정」. 87 을 모르는 서버는 비교하지 않는다.
5. 서버 토글 알약 줄 · 주문 서버 줄 · 계좌 오류 줄 — **그대로**(즉시 저장 D-15 유지).

### 2. 편집 모드 카드 (「편집」 클릭 — D-01 · D-03 · D-04 · D-05)

**시각 앵커(하나):** 편집 중 카드는 `--primary` 테두리가 유일한 강조다(면 · 그림자 · 배지 추가 없음). 「편집」 을 누르면 **첫 포커스는 「계좌명」 칸**(`autoFocus`), 「취소」 또는 저장 성공으로 닫히면 포커스는 그 카드의 「편집」 버튼으로 돌아간다.

카드 테두리 → `--primary`. `data-editing="true"`. 위→아래:

1. **제목줄** — 증권사 배지 · 계좌번호 · 「제거」 만. 계좌명 텍스트와 「편집」 버튼은 숨긴다(계좌명은 아래 입력칸으로 옮겨 간다).
2. 지점 · 트레이더 줄(그대로). 읽기 전용 IP/MAC 줄은 숨긴다(입력칸이 대신한다).
3. **편집 블록**(`<form data-slot="admin-account-edit">`, `mt-2.5`)
   - 「계좌명」 라벨(12px · `--muted-fg` · `mb-1`) + `Input sm` 전폭 · placeholder 「계좌명(선택)」 · `maxLength={40}` · `autoComplete="off"`.
   - **KB**: `mt-2` 2열 그리드(`grid-cols-2 gap-2` — 폰 390 에서도 2열, 목업 B) —
     - 「주문자 IP」 + `Input sm` · placeholder `10.41.1.124` · `inputMode="decimal"` · `autoComplete="off"` · `spellCheck={false}`.
     - 「MAC 주소」 + `Input sm` · placeholder `1C:FD:08:7D:97:8E` · `autoComplete="off"` · `spellCheck={false}` · `autoCapitalize="characters"`.
     - 그 아래 한 줄(`mt-1.5`): 평소 = 도움말(`NOTE` · 12px), 검증 오류가 있고 값이 바뀌었으면 = 오류 줄(`EDIT_ERROR_LINE` · 12px)이 **도움말 자리를 대신**한다(목업 B — 둘이 동시에 나오지 않는다 · 같은 크기라 줄 높이가 튀지 않는다).
     - 3번 읽기 카드의 불일치 경고 줄(D-10)은 편집 모드에서도 오류/도움말 줄 아래에 그대로 둔다 — 「저장」 이 왜 켜져 있는지 설명한다.
   - **교보**: IP/MAC 칸 대신 `NOTE` 한 줄 「교보 계좌는 주문자 IP · MAC 해당 없음」(D-03).
   - 라벨은 `<label htmlFor>` 로 입력칸과 묶는다(라벨이 접근 이름).
4. **동작 줄**(`mt-2.5 flex justify-end gap-1.5` — 추가 폼 동작 줄과 같은 형제 간격) — 「취소」(secondary · `aria-label="{broker} {accountNo} 편집 취소"`) · 「저장」(primary · `type="submit"` · `aria-label="{broker} {accountNo} 편집 저장"`). 입력칸에서 Enter = 「저장」(켜져 있을 때만).
5. **결과 줄**(아래 §4) — 동작 줄 바로 아래.
6. 서버 토글 알약 줄 · 주문 서버 줄 · 계좌 오류 줄 — 그대로 보이고 **계속 즉시 저장으로 동작**한다(편집 모드와 독립 · D-02).

초깃값: 계좌명 = 개요 `name`, IP/MAC = §1-3 의 표시값(미설정 · 확인 전이면 빈 칸). 편집을 열 때마다 초깃값에서 시작한다(이전 초안 없음).

### 3. 검증 · 「저장」 활성 규칙 (D-02 · D-04 · D-07)

- 검증은 서버 규칙 그대로, 입력할 때마다 즉시: IP = 12자리 숫자 또는 `a.b.c.d`(각 0~255) · MAC = 16진 12자리(`:` · `-` 구분자 허용 · 대소문자 무관) · **둘 다 적거나 둘 다 비움**. 앞뒤 공백은 무시한다.
- 오류 표시(첫 오류 하나만, 우선순위 IP → MAC → 짝):
  - IP 형식 오류 → IP 칸 `aria-invalid` + 「IP 는 12자리 숫자 또는 10.41.1.124 형식이에요」
  - MAC 형식 오류 → MAC 칸 `aria-invalid` + 「MAC 은 12자리 16진이에요(1C:FD:08:7D:97:8E)」
  - 한쪽만 적음 → **비어 있는 칸** `aria-invalid` + 「IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요」
  - 오류 줄과 빨간 테두리는 값이 초깃값과 달라졌을 때만 보인다(편집을 열자마자 빨갛게 시작하지 않는다).
- **「저장」 비활성** = 검증 오류가 있음 **또는** 바뀐 게 없음 **또는** 저장 중. 단 D-10 불일치가 있는 계좌는 바뀐 게 없어도 켜진다(그대로 저장 = 등록 서버 맞추기).
- 「바뀜」 판정 = `name.trim()` · IP · MAC 원문(trim)이 초깃값과 다름(목업 B 의 `dirty`). 점표기로 같은 값을 다시 적는 것도 「바뀜」 으로 보고 저장을 허용한다 → §4 「변경 없음」.
- 보내는 값(D-07): 계좌명은 `trim()` 해서, IP/MAC 은 **입력 원문(trim)** 그대로 — 웹은 정규화하지 않는다. IP/MAC 은 사용자가 그 두 칸을 바꿨을 때(정규화 비교로 다름) 또는 D-10 맞추기 저장일 때만 싣는다. **계좌명만 바꾼 저장은 IP/MAC 을 싣지 않는다** — relay 가 87 값을 재조회해 보존한다(IPMAC-01 · 「relay 밖 값을 지우지 않는다」 우선). 두 칸을 다 비우고 저장 = 빈 문자열 2개를 실어 미설정으로 되돌린다(D-04).

### 4. 저장 결과 (D-06 · IPMAC-03 · 토스트 없음)

「저장」 1회 = `PUT …/accounts { account, servers }` 1건(servers = 지금 active 등록 서버 그대로 — 서버 집합을 바꾸지 않는다).

| 결과 | 카드 | 결과 줄(`data-slot="admin-account-edit-result"`) |
|------|------|--------------------------------------------------|
| 저장 중 | 편집 모드 유지 · 입력칸 `readOnly` · 「취소」 · 「저장」 비활성(글자 그대로 「저장」 — 스피너 없음) | 없음 |
| 정규화값이 지금 값과 같음(계좌명 같고 IP/MAC 정규화 비교 같고 D-10 불일치 없음) | **요청을 보내지 않는다** · 편집 모드 닫힘 | 「변경 없음」 (`NOTE` · `--muted-fg`) — 다음 「편집」 을 열 때 지운다 |
| 서버 전부 ok | 편집 모드 닫힘 · 서버 칩 「반영됨」(결과 덮개) · 카드 성공 flash 0.7초 · 재조회 뒤 IP/MAC 줄이 87 정규화값으로 다시 그려짐 | 없음(성공 문구 따로 없음 — 칩이 말한다) |
| 일부/전부 failed · timeout(code 13 BAD_ORDER_ENDPOINT · code 7 ACCOUNT_CONFLICT · BUSY 포함) | **편집 모드 · 입력값 유지** · 해당 서버 칩 err | 실패 서버마다 한 줄 `EDIT_ERROR_LINE`(12px) + `role="alert"`: 「{서버키} 실패: {서버 message 원문}」(timeout 은 message 자리에 「응답 없음」) |
| offline · skipped(warn) | 편집 모드 · 입력값 유지 · 해당 서버 칩 warn | 그 서버마다 한 줄 `WARN_LINE`: 「{서버키} 미반영: {사유 원문 또는 「서버 연결 안 됨」}」 |
| HTTP 오류(409 · 502 · 네트워크) | 편집 모드 · 입력값 유지 | `EDIT_ERROR_LINE`(12px) + `role="alert"`: `useFieldSave` 기본 문구 「저장하지 못했어요 · {message}」 |

- 서버 문구는 **바꾸거나 대조하지 않는다**(D-12 — code 7 문장이 넓어져도 웹 변경 없음).
- 같은 실패가 카드 결과 줄과 영역 하단 `BusyLines` 에 **두 번 나오지 않는다** — 편집 저장에서 온 실패 문구는 카드 결과 줄에만 둔다(칩의 `title` 에는 그대로 실린다).
- 실패 뒤 사용자가 아무 칸이나 고치면 결과 줄을 지운다(목업 B `delete MSG`).

### 5. 편집 모드 수명

| 상황 | 동작 | 근거 |
|------|------|------|
| 「취소」 | 입력 폐기 · 편집 모드 닫힘 · 결과 줄 지움 · 요청 없음 | D-01 · 목업 B `revert` |
| 한 카드가 편집 중일 때 다른 카드의 「편집」 | **비활성**(`disabled` · `title`「다른 계좌 편집 중」) — 지금 카드를 「취소」 하거나 저장해야 연다 | 한 번에 한 카드(D-01). 조용히 전환하면 적던 IP/MAC 이 사라진다 — 확인 다이얼로그를 두는 것보다 막는 편이 단순하고 손실 0 |
| 편집 중 같은 카드의 서버 토글 · 주문 서버 · 「제거」 | 그대로 동작(즉시 저장). 「제거」 가 성공하면 카드와 함께 초안도 사라진다 | D-02 즉시 저장 유지 |
| 편집 중 「+ 계좌 추가」 | 막지 않는다(독립 폼) | 추가 폼은 IP/MAC 이 없고(D-08) 상태를 공유하지 않는다 |
| 시트 닫힘 · 다른 사용자 선택 | 초안 폐기(컴포넌트 언마운트) | 저장 안 한 값은 서버에 없다 — 경고 없음(Admin 1명 운영) |
| 편집 중 재조회(다른 칸 저장 뒤 `onChanged`) | 입력값 유지 — 초깃값은 편집을 연 순간 값으로 고정 | 쓰던 값을 재조회가 덮지 않는다 |

### 6. 계좌 생성 경로 — 변경 없음 (D-08)

「+ 계좌 추가」 폼 · 「+ 사용자」 생성 시트에는 IP/MAC 칸을 넣지 않는다. 새 계좌는 미설정으로 생기고 카드에 「주문자 IP · MAC 미설정(서버 NIC 값)」(87 반영 전에는 「확인 전」)으로 보인다.

---

## Copywriting Contract

`ACCOUNT_EDITOR_TEXT` 에 추가할 문구(정본 — `edit: "편집"` · `save: "저장"` · `editCancel`/`editSave` 접근 이름 낱말 「편집 취소」 · 「편집 저장」 포함). 서버 문구는 원문 그대로라 여기 없다.

### CTA 이름 — 보이는 글자 + 접근 이름(둘 다 계약)

| CTA | 보이는 글자(목업 B · 잠금) | 접근 이름 `aria-label`(계좌 특정) | 예 |
|-----|---------------------------|-----------------------------------|-----|
| Primary — 편집 저장 | 「저장」 (`ACCOUNT_EDITOR_TEXT.save`) | `"{broker} {accountNo} 편집 저장"` | 「KB 377-28-502101 편집 저장」 |
| 편집 취소 | 「취소」 (기존 `cancel` 재사용) | `"{broker} {accountNo} 편집 취소"` | 「KB 377-28-502101 편집 취소」 |
| 편집 진입 | 「편집」 (`ACCOUNT_EDITOR_TEXT.edit`) | `"{broker} {accountNo} 편집"` | 「KB 377-28-502101 편집」 |

- **사용자 결정(2026-10-11 · ui-phase revision conflict 회신): 대안 B 채택** — 보이는 글자는 목업 B 「편집 · 취소 · 저장」 그대로, 계좌를 특정하는 `aria-label` 을 붙인다. 근거 = CONTEXT Specifics 「목업 B 의 문구 · 배치를 그대로 따른다」(목업 B 문구 잠금) + 이 사용자 결정. 짧은 보이는 CTA 글자는 사용자가 잠근 범위 한정 예외이며 researcher 판단이 아니다.
- **짧은 보이는 글자는 의도된 · 범위가 정해진 선택이다.** CONTEXT 「Specifics」 가 「목업 B 의 문구 · 배치를 그대로 따른다」 로 잠갔고, 목업 B 의 버튼 글자가 「편집 · 취소 · 저장」 이다. 이 버튼들은 **계좌 카드 안(그 카드의 증권사 · 계좌번호 제목줄 바로 밑)** 에만 나오고 카드 밖에서 재사용하지 않으므로, 시각적으로는 카드가 목적어(어느 계좌를)를 준다. 같은 카드 안의 기존 「제거」 와 같은 규칙이다.
- **화면 밖 맥락(스크린 리더 · 음성 제어 · 테스트 쿼리)은 접근 이름이 목적어를 준다** — 기존 「제거」 의 `"{broker} {accountNo} 제거"` 패턴을 그대로 확장. 접근 이름은 보이는 글자를 **끝에 그대로 포함**한다(WCAG 2.5.3 Label in Name — 「저장」 이라고 말해도 눌린다).
- 컴포넌트 테스트는 이 접근 이름으로 버튼을 찾는다(`getByRole("button", { name: "KB 377-28-502101 편집 저장" })`) — 시트에 계좌가 여러 개라 「저장」 만으로는 하나로 정해지지 않는다.

### 그 밖 문구

| Element | Copy |
|---------|------|
| 칸 라벨 | 「계좌명」 · 「주문자 IP」 · 「MAC 주소」 |
| placeholder | 계좌명 「계좌명(선택)」 · IP `10.41.1.124` · MAC `1C:FD:08:7D:97:8E` |
| 도움말(D-05) | 「같은 서버의 두 계좌가 서로 체결될 수 있으면 계좌마다 서로 다른 사용자 PC 의 IP · MAC 을 적으세요(ipconfig /all).」 |
| 교보(D-03) | 「교보 계좌는 주문자 IP · MAC 해당 없음」 |
| IP/MAC 읽기 줄(D-09) | 「주문자 IP {ip} · MAC {mac}」 |
| Empty state — 미설정(D-09) | 「주문자 IP · MAC 미설정(서버 NIC 값)」 — 「미설정(서버 NIC 값)」 만 `--faint` |
| Empty state — 87 미확인 | 「주문자 IP · MAC 확인 전」 — 「확인 전」 만 `--faint` |
| Empty state — 계좌명 없음 | 「이름 없음」(`--faint`, 읽기 카드 제목줄) |
| 불일치 경고(D-10) | 「{서버키} 값이 달라요(IP {ip} · MAC {mac}) — 편집에서 저장하면 등록 서버가 모두 같아져요」 / 그 서버 미설정이면 「{서버키} 값이 달라요(미설정) — 편집에서 저장하면 등록 서버가 모두 같아져요」 |
| 검증 오류 — IP | 「IP 는 12자리 숫자 또는 10.41.1.124 형식이에요」 |
| 검증 오류 — MAC | 「MAC 은 12자리 16진이에요(1C:FD:08:7D:97:8E)」 |
| 검증 오류 — 짝 | 「IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요」 |
| 같은 값 저장(D-06) | 「변경 없음」 |
| Error state — 서버 실패 | 「{서버키} 실패: {서버 message 원문}」 — 다음 행동은 서버 문구가 말한다(code 13 = 형식 · 짝 안내, code 7 = 다른 사용자 보유 안내). 사용자는 값을 고쳐 다시 「저장」 하거나 「취소」 |
| Error state — 미반영 | 「{서버키} 미반영: {사유 원문 \| 서버 연결 안 됨}」 |
| Error state — HTTP | 「저장하지 못했어요 · {message}」(기존 `defaultSaveErrorText`) |
| 다른 카드 편집 중(비활성 `title`) | 「다른 계좌 편집 중」 |
| Destructive confirmation | 이번 phase 신규 파괴 동작 없음. 「두 칸 비우고 저장 = 미설정으로 되돌리기」 는 확인 없이 저장한다(되돌릴 수 있는 값 변경 · 도움말 · 읽기 줄이 결과를 보여 준다). 기존 「제거」 · 마지막 계좌 제거 확인(Phase 29 D-15)은 그대로 |

모든 문구는 해요체/명사형 혼용인 기존 Admin 톤(「계좌번호는 1~12자예요」 · 「계좌는 서버 1대 이상」)을 따른다.

---

## Claude's Discretion 결정 (UI 항목)

| 항목 | 결정 | 근거 |
|------|------|------|
| 계좌명 빈 값 저장 | **허용**(빈 값 = 이름 없음) | 「+ 계좌 추가」 폼이 계좌명을 필수로 두지 않는다(`name.trim()` 그대로 전송) — 같은 규칙. placeholder 「계좌명(선택)」 |
| 계좌명 길이 상한 | **40자**(`maxLength={40}`) | 추가 폼 계좌명 `maxLength={40}` 과 같게 — 입력 자리 두 곳의 규칙을 한 벌로 |
| 계좌명 앞뒤 공백 | `trim()` 해서 저장 · 비교 | 추가 폼과 같음 |
| CTA 보이는 글자 vs 접근 이름 | 보이는 글자 = 목업 B(「편집 · 취소 · 저장」), 접근 이름 = `"{broker} {accountNo} 편집 / 편집 취소 / 편집 저장"` | 목업 B 문구 잠금(CONTEXT Specifics) 안에서 기존 「제거」 aria 패턴으로 CTA 를 특정 |
| 편집 블록 오류 줄 크기 | 12px(`EDIT_ERROR_LINE`) | 도움말 자리를 대신하는 줄 — 같은 크기 · 목업 B `.err` 12px · `BusyLines` 와 같은 클래스 |
| 편집 중 다른 카드 「편집」 | 비활성 + `title` 「다른 계좌 편집 중」 | §5 — 손실 0 · 다이얼로그 없음 |
| 「취소」 | 입력 폐기 · 요청 없음 · 결과 줄 지움 | 목업 B |
| 같은 값 재저장 판정 | 클라가 서버 규칙 정규화로 비교해 요청 없이 「변경 없음」 | 서버 「변경 없음」 문장을 대조하지 않는다는 원칙(D-12)과 맞고, D-10 불일치가 있으면 같아 보여도 보낸다 |
| 계좌명만 바뀐 저장의 IP/MAC | 싣지 않음 | 87 미확인 · relay 밖 값 보존(IPMAC-01) — 화면 초깃값이 틀려도 지우지 않는다 |
| 87 미확인 표시 | 「확인 전」 | 「미설정」 으로 보이면 실제 서버 값과 어긋난 정보를 준다 |

---

## UI Considerations

Applicable state considerations: 45 total. 36 resolved (33 explicit, 3 backstop), 9 dismissed, 0 unresolved.

Source: ui-consideration-probe. 6 elements × categories, resolved in one batch on 2026-10-11 at the user's choice. Empty-state and error-state copy lives in the Copywriting Contract; this section covers state coverage only.

| ID | Element | Category | Status | Resolution / Reason |
|----|---------|----------|--------|---------------------|
| E1 | KB IP/MAC 읽기 줄 | empty | ✅ resolved (explicit) | 미설정 계좌는 「주문자 IP · MAC 」 + `--faint` 「미설정(서버 NIC 값)」 을 그린다(§1-3). |
| E1 | KB IP/MAC 읽기 줄 | loading | ✅ resolved (explicit) | 어느 등록 서버의 87 에도 그 계좌가 아직 없으면 「미설정」 이 아니라 `--faint` 「확인 전」 을 그린다(§1-3). |
| E1 | KB IP/MAC 읽기 줄 | error | ➖ dismissed | 읽기 표시 줄이라 자체 실패 경로가 없다. 개요 로드 실패는 시트의 기존 오류 처리가 맡는다. |
| E1 | KB IP/MAC 읽기 줄 | populated | ✅ resolved (explicit) | 설정된 값은 87 정규화값(`010041001124` · `1CFD087D978E`)을 600 · `--fg-2` 로 그대로 그리고, 웹에서 다시 정규화하지 않는다(§1-3). |
| E1 | KB IP/MAC 읽기 줄 | partial | ✅ resolved (explicit) | 등록 서버 사이에 값이 다르면 유효 주문 서버의 87 값을 그리고, 다른 서버는 E3 경고 줄로 알린다(D-10). |
| E1 | KB IP/MAC 읽기 줄 | overflow | 🧪 resolved (backstop) | `{ statement: "폰 390 시트에서 「주문자 IP 010041001124 · MAC 1CFD087D978E」 가 한 줄에 들어가거나 단어 단위(break-keep)로 감기고, 잘리거나 겹치지 않는다", verification: backstop }` |
| E1 | KB IP/MAC 읽기 줄 | zero-one-many | ➖ dismissed | 계좌마다 값은 한 쌍(줄 1개)이다. 교보 계좌에는 줄이 없다(D-09). |
| E2 | 계좌 카드 제목줄 | empty | ✅ resolved (explicit) | 계좌명이 빈 값이면 계좌명 자리에 `--faint` 「이름 없음」 을 그린다(§1-1). |
| E2 | 계좌 카드 제목줄 | loading | ➖ dismissed | 정적 표시라 로딩 상태가 없다. |
| E2 | 계좌 카드 제목줄 | error | ➖ dismissed | 제목줄에는 자체 오류가 없다. 「제거」 실패는 기존 계좌 오류 줄이 맡는다(변경 없음). |
| E2 | 계좌 카드 제목줄 | populated | ✅ resolved (explicit) | 「편집」 은 「제거」 왼쪽에 같은 버튼 모양으로 둔다(간격은 `gap-2` 8px). 편집 모드에서는 계좌명 텍스트와 「편집」 을 숨긴다(§1-1 · §2-1). |
| E2 | 계좌 카드 제목줄 | partial | ➖ dismissed | 제목줄 데이터는 개요 한 번으로 모두 정해져 부분 상태가 없다. |
| E2 | 계좌 카드 제목줄 | overflow | ✅ resolved (explicit) | 계좌명은 기존 `truncate` 로 한 줄을 유지하고, 버튼 2개는 줄어들지 않는다. |
| E2 | 계좌 카드 제목줄 | zero-one-many | ✅ resolved (explicit) | 버튼은 「편집」 · 「제거」 2개로 고정이다. 다른 카드가 편집 중이면 「편집」 은 `disabled` 이고 title 은 「다른 계좌 편집 중」 이다(§5). |
| E2 | 계좌 카드 제목줄 | long-text | 🧪 resolved (backstop) | `{ statement: "폰 390 시트에서 40자 계좌명이 제목줄에서 말줄임(truncate)되어 한 줄을 유지하고, 「편집」 · 「제거」 와 겹치지 않는다", verification: backstop }` |
| E3 | 87 값 불일치 경고 줄 | empty | ✅ resolved (explicit) | 다른 active 등록 서버의 값이 모두 같으면 경고 줄을 그리지 않는다. |
| E3 | 87 값 불일치 경고 줄 | loading | ✅ resolved (explicit) | 87 을 아직 모르는 서버는 비교하지 않는다. 그 서버 몫의 경고 줄은 없다(§1-4). |
| E3 | 87 값 불일치 경고 줄 | error | ➖ dismissed | 경고 줄 자체가 상태 표시라 별도 오류 상태가 없다. |
| E3 | 87 값 불일치 경고 줄 | populated | ✅ resolved (explicit) | `WARN_LINE` 에 「{서버키} 값이 달라요(IP {ip} · MAC {mac}) — 편집에서 저장하면 등록 서버가 모두 같아져요」 를 그린다. |
| E3 | 87 값 불일치 경고 줄 | partial | ✅ resolved (explicit) | 다른 서버의 값이 미설정이면 괄호 안을 「미설정」 으로 쓴다. |
| E3 | 87 값 불일치 경고 줄 | overflow | ✅ resolved (explicit) | 줄바꿈을 허용하고 잘라내지 않는다(기존 `WARN_LINE` 과 같다). |
| E3 | 87 값 불일치 경고 줄 | zero-one-many | ✅ resolved (explicit) | 값이 다른 서버마다 한 줄을 그린다(0줄 = 일치). |
| E4 | 편집 모드 폼 | empty | ✅ resolved (explicit) | 초깃값이 미설정이거나 확인 전이면 IP · MAC 칸은 빈 칸에 placeholder(`10.41.1.124` · `1C:FD:08:7D:97:8E`)를 보인다. 편집을 열자마자 빨간 테두리를 그리지 않는다(§2 · §3). |
| E4 | 편집 모드 폼 | loading | ✅ resolved (explicit) | 저장 중에는 입력칸이 `readOnly` 이고 「취소」 · 「저장」 이 비활성이다. 스피너는 없다(§4). |
| E4 | 편집 모드 폼 | error | ✅ resolved (explicit) | 첫 검증 오류 하나만 `aria-invalid` 빨간 테두리와 함께 도움말 자리의 `EDIT_ERROR_LINE`(12px)으로 보인다. 오류가 있으면 「저장」 은 비활성이다(§3). |
| E4 | 편집 모드 폼 | populated | ✅ resolved (explicit) | 초깃값은 §1-3 의 표시값이다. 바뀐 게 없으면 「저장」 은 비활성이고, D-10 불일치가 있는 계좌만 예외다(§3). |
| E4 | 편집 모드 폼 | partial | ✅ resolved (explicit) | IP 와 MAC 중 한쪽만 적으면 비어 있는 칸을 `aria-invalid` 로 표시하고 「IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요」 를 보인다(§3). |
| E4 | 편집 모드 폼 | overflow | 🧪 resolved (backstop) | `{ statement: "폰 390 시트에서 IP · MAC `grid-cols-2` 두 칸의 placeholder `1C:FD:08:7D:97:8E` 가 잘리지 않고, 도움말 줄이 넘치지 않고 감긴다", verification: backstop }` |
| E4 | 편집 모드 폼 | zero-one-many | ✅ resolved (explicit) | KB 계좌는 계좌명 + IP · MAC 칸 2개를 보인다. 교보 계좌는 계좌명 칸만 있고, IP · MAC 칸 자리에 「교보 계좌는 주문자 IP · MAC 해당 없음」 을 둔다(D-03). |
| E4 | 편집 모드 폼 | long-text | ✅ resolved (explicit) | 계좌명 칸은 `maxLength={40}` 이고, 앞뒤 공백을 `trim()` 한 뒤 보낸다. IP/MAC 은 입력 원문을 trim 해서 그대로 보낸다(D-07). |
| E5 | 저장 결과 줄 | empty | ✅ resolved (explicit) | 서버가 전부 ok 이면 결과 줄이 없다. 서버 칩 「반영됨」 과 카드 flash 가 결과를 말한다(§4). |
| E5 | 저장 결과 줄 | loading | ✅ resolved (explicit) | 저장 중에는 결과 줄이 없다(§4). |
| E5 | 저장 결과 줄 | error | ✅ resolved (explicit) | 실패한 서버마다 `EDIT_ERROR_LINE` + `role="alert"` 로 「{서버키} 실패: {서버 message 원문}」 을 보인다(timeout 은 「응답 없음」). HTTP 오류는 「저장하지 못했어요 · {message}」 이다. 실패해도 편집 모드와 입력값은 유지한다(D-06). |
| E5 | 저장 결과 줄 | populated | ✅ resolved (explicit) | 정규화해서 비교한 값이 지금 값과 같으면(D-10 불일치 없음) 요청을 보내지 않고, 편집 모드를 닫으며 `NOTE` 「변경 없음」 을 보인다(§4). |
| E5 | 저장 결과 줄 | partial | ✅ resolved (explicit) | 일부 서버만 실패하면 ok 서버의 칩은 「반영됨」, 실패한 서버만 결과 줄에 보이고 편집 모드는 유지한다. offline · skipped 서버는 `WARN_LINE` 「{서버키} 미반영: …」 으로 보인다. |
| E5 | 저장 결과 줄 | overflow | ✅ resolved (explicit) | 긴 서버 message 는 잘라내지 않고 감는다. 같은 실패를 영역 하단 `BusyLines` 에 다시 띄우지 않는다(§4). |
| E5 | 저장 결과 줄 | zero-one-many | ✅ resolved (explicit) | 실패하거나 미반영된 서버마다 한 줄을 그린다. 사용자가 아무 칸이나 고치면 결과 줄을 지운다(§4). |
| E6 | 편집 모드 수명 | empty | ➖ dismissed | 편집 중인 카드가 0개인 상태는 평소 읽기 카드 상태(E2)와 같다. zero-one-many 에서 다룬다. |
| E6 | 편집 모드 수명 | loading | ✅ resolved (explicit) | 편집 중에 재조회(`onChanged`)가 와도 입력값은 유지한다. 초깃값은 편집을 연 순간의 값으로 고정한다(§5). |
| E6 | 편집 모드 수명 | error | ✅ resolved (explicit) | 저장에 실패해도 편집 모드와 초안을 유지한다(E5 error 와 같은 계약). |
| E6 | 편집 모드 수명 | populated | ✅ resolved (explicit) | 「취소」 는 입력을 폐기하고 편집 모드를 닫으며 결과 줄을 지운다. 요청은 보내지 않는다. 닫히면 포커스가 그 카드의 「편집」 으로 돌아간다(§2 · §5). |
| E6 | 편집 모드 수명 | partial | ✅ resolved (explicit) | 편집 중에도 서버 토글 · 주문 서버 · 「제거」 는 즉시 저장으로 동작한다. 「제거」 가 성공하면 초안도 사라진다. 시트를 닫거나 다른 사용자를 고르면 초안을 폐기한다(§5). |
| E6 | 편집 모드 수명 | overflow | ➖ dismissed | 수명 규칙이라 레이아웃 표면이 없다. |
| E6 | 편집 모드 수명 | zero-one-many | ✅ resolved (explicit) | 편집 중인 카드가 0개면 모든 「편집」 이 활성이다. 1개면 다른 카드의 「편집」 은 `disabled` 이고 title 은 「다른 계좌 편집 중」 이다. 2개 이상은 불가능하다(D-01). |
| E6 | 편집 모드 수명 | long-text | ➖ dismissed | 표시할 텍스트가 없다. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | 없음(신규 설치 0 — 기존 button · input 재사용) | not required |

`components.json` `registries: {}` — 서드파티 레지스트리 없음.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: FLAG (non-blocking — Phase 29 물려받은 크기·굵기)
- [x] Dimension 5 Spacing: FLAG (non-blocking — Phase 29 물려받은 10px·6px 리듬)
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** approved 2026-10-11 (revision 1 — D1 CTA 짧은 글자는 사용자 잠금 예외; FLAG: D4 물려받은 크기 · D5 물려받은 10px/6px 리듬)

---

## Addendum — 갭 클로징 (2026-10-11 · 실서버 UAT `30-UAT.md` gap 2건 · D-17 · D-18)

새 토큰 · 새 폰트 · 새 색 · 새 클래스 상수 0개. 기존 `WARN_LINE` · `IPMAC_LINE` · `IPMAC_VALUE` 를 그대로 쓴다.

### A1. IP/MAC 값 표기 — 사람이 읽는 표기 (D-17 · 플랜 30-08)

| 자리 | 전(87 정규화값 그대로) | 후(D-17) |
|------|------------------------|----------|
| §1-3 읽기 줄 값(`<b>` 600 · `--fg-2` · `tabular-nums` 그대로) | 「주문자 IP 010041001124 · MAC 1CFD087D978E」 | 「주문자 IP 10.41.1.124 · MAC 1C:FD:08:7D:97:8E」 |
| §1-4 불일치 경고 줄 괄호 안 값 | 「KB121 값이 달라요(IP 010041001125 · MAC 1CFD087D978F) — …」 | 「KB121 값이 달라요(IP 10.41.1.125 · MAC 1C:FD:08:7D:97:8F) — …」 (「(미설정)」 은 그대로) |
| §2 편집칸 초깃값(설정 계좌) | `010041001124` · `1CFD087D978E` | `10.41.1.124` · `1C:FD:08:7D:97:8E` (미설정 · 확인 전 · 교보는 빈 칸 그대로) |

- **변환 규칙(shared `formatOrderIp` · `formatOrderMac` 한 벌):** IP — 정확히 12자리 숫자이고 세 자리씩 끊은 네 옥텟이 모두 0~255 이면 앞자리 0 을 뗀 점표기, MAC — 정확히 대문자 16진 12자리이면 두 자리씩 콜론. **그 밖은 원문 그대로**(빈 값 · 옥텟이 255 를 넘는 12자리 `999999999999` · 소문자 · 이미 구분자가 있는 값). 변환한 값은 다시 정규화하면 원래 값이 된다(왕복 항등) — 그래서 표시값을 그대로 저장해도 서버 값이 바뀌지 않는다.
- **저장 · 전송 · 비교는 정규화값 그대로(D-07 · D-13 전송 규칙 유지).** 변환은 렌더 자리에서만 — `summarizeOrderEndpoint` · 불일치 판정 · `sameValues` · relay · server 는 정규화값을 쓴다. 「바뀜」(저장 버튼)은 칸 원문(trim)과 초깃값(표시 표기) 비교, 「보낼지 · 변경 없음」 은 양쪽을 정규화해 비교한다 — 초깃값 그대로 저장하거나 같은 값을 12자리로 다시 적어도 요청 없이 「변경 없음」.
- D-10 맞추기 저장은 칸 값(표시 표기 원문)을 그대로 싣는다 — 서버가 정규화한다.
- E1 overflow backstop(폰 390 — 줄이 카드 오른쪽을 넘지 않고 `break-keep` 으로 감긴다)은 더 긴 MAC 표기(17자)에도 그대로 적용된다.

### A2. 공유 계좌 안내 줄 — 편집 모드 (D-18 · 플랜 30-09)

**언제:** KB 계좌 카드가 편집 모드이고, 개요(`AdminUsersOverview.users`)의 **다른** DMA 사용자가 같은 증권사 · 같은 정규화 계좌번호(`normalizeAccountNo`)의 계좌를 가지고 있으며, 그 사용자의 그 계좌 서버(active 등록 서버 + 「서버에만 있음」 서버)가 이 계좌의 active 등록 서버(= 저장이 가는 서버)와 **하나 이상 겹칠 때**. 겹치는 서버가 없으면 그 사용자는 빠진다(gh-trade 전파는 서버별 users.toml 안에서만 일어난다). 판정은 shared `findSharedAccountHolders` 한 벌.

**어디:** 편집 블록 안 — 도움말/검증 오류 줄 → 불일치 경고 줄(있으면) → **안내 줄** → 동작 줄(「취소 · 저장」). 저장 버튼 바로 위라 「누르면 무엇이 함께 바뀌는지」 를 말한다.

| 항목 | 값 |
|------|-----|
| 클래스 | 기존 `WARN_LINE`(`mt-1.5` · 12px · 1.5 · `break-keep` · `--led-latent`) — 새 상수 없음 |
| data-slot | `admin-account-edit-shared` |
| role | 없음(정적 안내 — 입력마다 바뀌지 않는다) |
| 문구 | 「이 계좌를 함께 쓰는 사용자 {id1} · {id2} — 주문자 IP · MAC 이 함께 바뀌어요」 |
| {id} | 그 사용자의 DMA id(`dmaUserId`) — 오름차순 · 중복 없음 · ` · ` 로 잇는다. 자기 DMA id · DMA 없는 웹 사용자는 넣지 않는다 |

- 문구 근거: 사용자 예시(「이 계좌를 함께 쓰는 사용자 junysim2 · kim — 주문자 IP/MAC 이 함께 바뀝니다」)를 기존 Admin 해요체 · 「주문자 IP · MAC」 낱말(§Copywriting)에 맞췄다.
- 읽기 카드 · 교보 계좌 · 함께 쓰는 사용자 0명이면 줄이 없다.
- **저장 결과는 기존 §4 그대로 — 특수 처리 없음.** gh-trade 전파 배포 전: 서버 code 7 → 결과 줄 「KB120 실패: {서버 message 원문}」(문장 대조 없음 · 편집 · 입력값 · 안내 줄 유지). 배포 뒤: 전부 ok → 편집 닫힘 · 칩 「반영됨」 · 기존 `onChanged` 개요 재조회가 함께 쓰는 사용자들의 계좌 카드도 새 값으로 바꾼다.
- 한계(문서화): 웹 사용자에 연결되지 않은 87 전용 DMA id(「서버에만 있음」 사용자 행)는 개요에 계좌번호가 없어 목록에 나오지 않는다 — gh-trade 전파는 그 사용자에게도 적용된다.

| ID | Element | Category | Status | Resolution |
|----|---------|----------|--------|------------|
| E7 | 공유 계좌 안내 줄 | empty | ✅ resolved (explicit) | 함께 쓰는 사용자 0명 · 교보 · 읽기 카드 → 줄 없음 |
| E7 | 공유 계좌 안내 줄 | populated | ✅ resolved (explicit) | 위 문구 · DMA id 오름차순 |
| E7 | 공유 계좌 안내 줄 | zero-one-many | ✅ resolved (explicit) | 한 줄에 전원 · ` · ` 구분 |
| E7 | 공유 계좌 안내 줄 | error | ✅ resolved (explicit) | 저장 실패(code 7 포함)는 §4 결과 줄 — 안내 줄은 그대로 남는다 |
| E7 | 공유 계좌 안내 줄 | overflow | 🧪 resolved (backstop) | `{ statement: "폰 390 시트에서 안내 줄이 카드 오른쪽을 넘지 않고 break-keep 으로 감긴다", verification: backstop }` |
| E7 | 공유 계좌 안내 줄 | loading | ➖ dismissed | 개요 데이터만 읽는다 — 추가 요청 없음 |
