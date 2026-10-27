# Phase 36: 계좌별 주문가능 금액 (account-budget) - Research

**Researched:** 2026-10-27
**Domain:** gh-trade 와이어(FlatBuffers 44/66/67/80/86/87) 수용 · relay 어드민 fan-out · Supabase 저널 확장 + 집계 RPC · Next.js 주문 화면 표시
**Confidence:** HIGH (코드베이스 전부 이번 세션에 직접 읽음 · 외부 라이브러리 신규 없음)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 목업 채택 (D-00)
- **D-00: 목업 `reference/mockup-account-budget.html` 채택 — ①~④ 그대로, ⑤ 는 A 안.** 화면 ① 어드민 계좌 카드 「예수금 · 수수료 · 매도세」 상시 행 + 상태 6종 · ② 계좌 패널 요약 줄 「주문가능 / 예수금」 · ③ 수동주문 폼 주문가능 행 + 초과 검증 줄 · ④ 상따 카드 금액 3칸 합산 경고 · ⑤ 일자별 매매손익 **A**(일자 행 한 줄 + 펼침 종목별 합) × 문맥(`/admin/pnl` · `/me` 손익 탭) · 기간 7/30/90일·이달. 사용자 검토 2026-10-27(「5번은 A안으로. 나머지는 OK」). UI-SPEC 은 이 목업을 옮긴다. 목업 안의 「한도」 는 전부 「예수금」 으로 바꿔 두었다.

#### 어드민 계좌 카드 — 예수금 · 수수료 · 매도세 칸
- **D-01: 카드에 상시 노출 · 즉시 저장.** 지점·트레이더(·IP/MAC) 줄 아래 한 행 「예수금 [ 1,000 ] 만원 · 수수료 [ 0.01 ] % · 매도세 [ 0.2 ] %」(폰은 예수금 1줄 / 수수료·매도세 2줄)이 편집 모드와 무관하게 항상 보인다. 서버 체크 토글·주문 서버 세그먼트와 같은 `useFieldSave` 즉시 저장 리듬(Phase 29 D-15) — Phase 30 D-01 편집 모드(op 3 카드 저장)에는 **넣지 않는다**(예수금·비용률은 op 6·op 7 전용). 캡션 한 줄 「예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제」. 교보 계좌도 같은 칸(비용률·예수금은 증권사 무관).
- **D-02: 입력·저장 트리거.** 네이티브 숫자 입력칸(`inputmode="numeric"`/`decimal` · 천단위 콤마 표시 · 넘버패드 시트 없음 · 저장 버튼 없음). **Enter 또는 포커스 이탈** 때 저장, 바뀐 게 없으면 미전송(서버도 멱등 「변경 없음」), 보내는 동안 그 칸 잠금. 예수금: 만원 정수 → 원(`×10000`) ulong, 빈 칸/0 = 해제(op 6 `budget_krw` 0). 수수료·매도세: **% 소수 입력(0.01 · 0.2 · 소수 4자리 = 1ppm)** → 저장 전 ppm 정수 반올림, 표시는 87 ppm → %. 범위 0~1%(0~10000ppm)는 **클라가 막는다**(범위 밖은 보내지 않음 · 칸 빨간 테두리 + 오류 한 줄, Phase 30 D-04 동형). **어느 비용률 칸이든 저장 때 두 값을 함께 op 7 로 보낸다**(op 7 이 두 값을 한 번에 씀 · (0, 0) = 해제). — **Reversibility:** reversible.
- **D-03: 등록 서버 간 87 값 불일치 — Phase 30 D-10 동형 · 문구 중립.** 칸에는 (유효) 주문 서버의 87 값, 아래 다른 서버마다 경고 줄 「KB121 은 500만 — 저장하면 등록 서버가 모두 같아져요」(`OrderEndpointMismatchLines` · `WARN_LINE` 재사용 · 원인 단정 없음 — A 안으로 체결 조정이 서버마다 따로 가므로 정상 운영에서도 갈라질 수 있다). 수수료·매도세도 같은 규칙(「KB121 은 0.05% · 0.2%」). 저장하면 등록 서버 전부에 같은 값. 두 서버 동시 운영은 Phase 29 이월 「켜기 전 결정」 에 「예수금 갈림」 항목을 더한다(STATE Blockers).
- **D-04: 정본은 서버 87/67 — DB 의도 저장 없음(IP/MAC 동형).** 예수금·비용률은 Supabase 의도 표에 넣지 않고 PUT 요청에서 relay 로 바로 넘긴다(Phase 30 D-15 경로). 「다시 반영」(reconcile)은 예수금·비용률을 건드리지 않고, 「미반영」 drift 판정에도 넣지 않는다(shared `sameValues` · `fieldsOf` 무관). 이유: 서버가 체결마다 `budget_krw` 를 스스로 바꾸므로 DB 의도가 있으면 늘 어긋나 「미반영」 이 상시 켜지고 reconcile 이 정산된 값을 덮어쓴다(사용자가 처음 고른 「DB 의도 저장」 을 이 근거로 철회 · 2026-10-27). — **Reversibility:** reversible(DB 변경 없음).
- **D-05: 카드가 보이는 「현재 예수금」 출처.** 체결 조정은 users_rev·87 없이 **한도 전용 67** 로만 온다(gh-trade D-29 합의 · 체결마다 87 보내지 않음). 그래서 어드민 개요는 ① relay 에 그 계좌의 67 캐시(`#accountStates`)가 있으면 그 `budgetKrw`, ② 없으면 87 값. 어드민 개요 GET(`/api/admin/users` → relay) 때 각 서버에 **op 5 로 87 을 다시 받는다**(스로틀 · 실패면 캐시). 비용률은 87 만 본다(67 에 없음).
- **D-06: 86 code 1 표시.** 구 서버(op 6/7 모름)와 범위 밖(gh-trade 가 message 를 「비용률 범위 밖(0~10000ppm)」 · 「예수금 범위 밖(…)」 으로 구별) 모두 code 1 — 칩 「서버 미지원 · <서버 message 원문>」(err 톤). message 문장 대조 없음(Phase 30 D-11 유지). `interpretAdminResult` 의 op 타입에 6 · 7 을 추가(code 0 만 ok). 나머지 code 5/8/10/11 은 기존 실패 칩 + 서버 문구.
- **D-07: fan-out · 되싣기.** op 6/op 7 fan-out 대상 = DB 등록 서버 전부(`#serverKeysOf` 현행 · 꺼진 서버 skipped · 미접속 offline 칩). **op 3(op 1 신규 유저 첫 계좌 포함) 성공 뒤** 그 서버에 처음 생긴 계좌(87 예수금·비용률 0)에 **다른 서버 87 의 값으로 op 6 · op 7 을 이어 보낸다**(IP/MAC R3-02 되싣기 동형 — 단 이번엔 **서버 간**). 출처 서버가 여럿이고 값이 다르면 주문 서버 값 우선, 없으면 첫 등록 서버. 다른 서버에 값이 없으면(전부 0) 보내지 않는다. 같은 값이면 서버가 「변경 없음」.

#### 주문가능 표시
- **D-08: 계좌 패널 보유 표 위 요약 줄.** `account-panel.tsx` 의 보유 종목 표 바로 위 한 줄 「주문가능 **1,234만** / 예수금 2,000만」(주문가능 강조 15/600 · 예수금 흐림). 머리가 숨겨진 /me 잔고 탭(`hideAccountHeader`)에서도 같은 자리. 미설정(`budget_krw` 0) = 「주문가능 — / 예수금 미설정」 흐림 · 경고 없음. 구 서버 프레임(슬롯 없음 = 0)도 같은 표기.
- **D-09: 초과는 0 + 빨강(WinForms 동형).** 값 = `max(0, 주문가능)`, 음수면 「0만」 을 `--destructive` 로. 표기는 **원/10000 내림 · 천단위 콤마**(gh-trade D-14 — 두 클라 같은 숫자). 억 표기 없음.
- **D-10: /me 는 잔고 탭만.** 계좌 패널 한 부품이라 자동 포함. 현황 탭 상태줄(`MeStatusBar`) · 작업대 상단 줄은 무변경(deferred).
- **D-11: 계산식 = 인박스 그대로(gh-trade D-11~D-13).** 주문가능(원) = `budget_krw − Σ(HoldingState.avg_price × stock_qty) − Σ(UnfilledState side "B" ∧ !pending_cancel_sent 의 unfilled_qty × price)`. 매도 미체결 제외 · 매수는 KRX·NXT · 예약 요약 행 · 접수대기 행 포함 · `price` 0 이면 그 종목 현재가(웹 `quotes` 캐시 · KRX → NXT · `holdingQuotePrice` 선례), 없으면 0(상한가 금지). `budget_krw` 0 = 미설정. 계산·포맷 함수는 **shared 한 벌**(webapp · relay 테스트가 같은 것을 읽는다 · Phase 31 D-02 선례). 계산 위치는 Claude 재량(기본: 웹 — WinForms 클라 계산 동형 · 66/67 · 시세 · 계좌 변경 때 재계산 · price 0 매수 미체결이 있을 때만 1초 주기 재계산, gh-trade 41-02 동형).

#### 초과 경고 (차단 · alert · 토스트 없음)
- **D-12: 수동주문 폼(`manual-order-form.tsx`) — WinForms D-16·D-18 동형.** 주문금액 행 바로 밑에 **「주문가능 1,234만」** 행(같은 라벨 열 · 읽기 전용). **매수**이고 예수금 설정됨이고 `주문금액(원) > 주문가능(원)` 이면 그 값 `--destructive` 빨강 + 기존 검증 줄 채널(`priceIssue` · `role="status"`)에 「주문가능 초과: 1,500만 > 1,234만」. **버튼은 활성 유지 · 주문은 그대로 나간다**. 매도는 판정 없음. 미설정은 「—」 · 줄 없음. 수량·가격·계좌·66/67·시세가 바뀔 때마다 재판정. 토스트(alert-toasts) 없음.
- **D-13: 상따 카드 등록 — WinForms D-19 동형.** 켜진 금액 칸 합(선매수 금액 + 줄매수 금액(켜짐) + 후매수 금액(켜짐) · 만원 → 원) > 주문가능이면 **등록은 그대로** 하고 선매수 금액 값 빨강 + 안내 줄(warn 톤 · 비차단 · 기존 안내 줄 자리) 「주문가능 초과: 상따 합 2,000만 > 1,234만 — 등록은 그대로 돼요」. 값 바꿀 때마다 색·줄 재판정(로그 없음). 합이 내려오면 기본색.

#### 실현손익 · 비용률 (gh-trade 41-03 · 41-04 합의 — 2026-10-27, gh-trade 세션과 사용자 직접 결정)
- **D-14: A 안 수용 — 서버가 체결마다 `budget_krw` 자체를 조정한다(영구).** 매수 체결: 예수금 −= floor(qty×px×fee_ppm/1e6). 매도 체결: 예수금 += round(qty×(px − 직전 평단)) − floor(수수료) − floor(qty×px×sell_tax_ppm/1e6). 0 이하면 1원, 미설정(0) 계좌는 안 바뀜. 평단 모르는 매도는 수수료·세금만 뺀다. 사용자 답 「예수금 설정 시점부터 누적」 과 같은 뜻(어드민 재설정 = 정산). **그 체결의 67 은 조정 전 값, ≤100ms 뒤 한도 전용 67(빈 벡터 · is_snapshot=false)이 새 값, 1~2초 뒤 한 번 더(늦은 옛 값 보정) → relay · 웹 모두 `budget_krw` 를 마지막 값으로 덮는다.** relay `#mergeAccountState`(subscription-hub.ts 3694~)는 델타에서 객체를 필드별로 재조립해 새 필드가 **누락되는 구조** — `budgetKrw` 를 명시적으로 옮기고(델타에 실린 값으로 덮기), 웹 `mergeAccount`(`...next` 스프레드)와 「두 곳 동일」 주석 유지. 사용자 세션이 아닌 계좌(웹 로그인 없음)는 relay 에 67 이 없다 — D-05 의 87 폴백. — **Reversibility:** reversible(서버 계약은 gh-trade 몫 · relay 는 값 전달만).
- **D-15: 저널 손익 4필드 → DB.** relay 저널 파서가 `JournalRecord` 말미 `avg_price`·`fee_krw`·`tax_krw`·`realized_pnl_krw`(long · E 레코드만 값 · 옛 레코드 0)를 읽어 이벤트 JSON 키 **이름 그대로** 싣고, 주문 이벤트 표에 **bigint 컬럼 4개(기본 0)** 마이그레이션. 계정 귀속 `dma_user_id`(재기동 뒤 "" 가능) · 일자 `trade_date`(KST). — **Reversibility:** one-way — DB 마이그레이션 + relay 이벤트 JSON 키가 계약이 된다(키 이름은 gh-trade 와 합의 완료 · 바꾸려면 append-only 새 필드).
- **D-16: 생성물 커밋 · 인박스 · 배포.** 작업 트리의 미커밋 생성물 4파일(`relay/src/generated/StockDMA.fbs` · `stock-dma/admin-account.ts` · `admin-command-req.ts` · `journal-record.ts` · SYNC MARKER 7824e51b)과 노트 `docs/inbox/from-gh-trade/261027-account-pnl.md` 를 **Phase 36 첫 태스크로 경로 지정 커밋**(`git add -A` 금지 · 동시 세션 주의). 두 노트(`261027-account-budget` · `261027-account-pnl`)는 라이브 UAT 뒤 `status: done` · `done_commit` 으로 닫는다(마지막 플랜 태스크). 배포 순서: DB → relay(20:00 KST 뒤 · `dangerouslyDisableSandbox`) → server → webapp push(= 프로덕션 · relay 뒤). gh-trade 서버는 이미 배포돼 있어 relay 를 먼저 올려도 뒤에 올려도 안전.

#### 일자별 매매손익 페이지
- **D-17: 두 곳.** ① `/admin/pnl` — `requireAdmin` · 사이드바 Admin 묶음에 「매매손익」 · 세그먼트 「계정별 | 계좌별」 — 계정별은 `dma_user_id` 묶음(`dma_user_id = ""` 체결은 「미상」 한 묶음 · 계좌번호 부제), 계좌별은 `account_no` 묶음(미상 없음), 묶음마다 기간 합 + 일자 표. ② `/me` **5번째 탭 「손익」** — 탭 위 계좌 칩(Phase 32 D-20)이 거르는 고른 계좌 한 벌(어드민 권한 분기 없음 · 내 계좌만 — 가시성은 기존 계좌 접근 RPC 의미 그대로). — **Reversibility:** reversible.
- **D-18: 표는 A 안(목업 ⑤ A).** 일자 행 한 줄 — 폰: 「10/27 (화) · **+123만** · 아랫줄 매수 1,500만 · 매도 1,640만 · 7건」, 데스크톱: 7열 한 줄(일자 · 손익 · 수수료 · 세금 · 매수 · 매도 · 건수). 누르면 펼침: 수수료 · 세금 · 체결 건수 + **종목별**(종목명 · 실현손익 · 매수/매도 금액). 상단 기간 세그먼트 **7일 | 30일 | 90일 + 이달**(기본 30일) · 합계 행(기간 합 실현손익 큰 글자 · 수수료 · 세금 · 매수 · 매도 · 체결 N건). 체결 0 인 날은 행 없음. 숫자: 손익·매수·매도는 만원 내림 콤마(+/− · 수익 `--up` · 손실 `--down`), 수수료·세금은 소수 1자리 「1.6만」. 집계 대상 `notice_type = 'E'` 만 · 매수금액/매도금액 = `exec_qty × exec_price` 를 `side` B/S 로 · 옛 레코드(4필드 0 · 배포일 이전)는 과거분 없음 — 페이지는 배포일부터(사용자 합의 · 백필 없음). B(5열 표 가로 스크롤) · C(펼침에 체결 전부) 기각.
- **D-19: 집계는 DB 쪽 RPC 1회**(일자 × 묶음 합 + 종목별 합을 한 호출로 — Cloud Run 왕복 비용 메모리). RPC 는 `REVOKE anon/authenticated` 명시 · 어드민 RPC 는 service role 경로, /me RPC 는 기존 계좌 가시성 조인. 상세는 플래너.

### Claude's Discretion
- D-07 되싣기 구현 위치(planner `withServerEndpoint` 확장 vs dispatcher 후속 op) · op 5 재조회 실패 때(캐시로 진행 · 「relay 밖 값을 지우지 않는다」 우선) · D-05 op 5 스로틀 간격.
- 어드민 `AdminAccountView` 에 서버별 `budgetKrw`·`feePpm`·`sellTaxPpm` 을 싣는 방식(IP/MAC `orderEndpoints` 동형 Record) · ulong ↔ JSON(예수금은 `usersRev` 처럼 문자열 또는 `toNum` 안전 범위 number — 시장 데이터 D-34 「전부 number」 와 맞추되 상한 명시).
- D-11 계산 위치·함수 이름·price 0 재계산 타이머 · `/me` 잔고 탭에 `priceOf` 를 넘길지(넘기면 시장가 매수 미체결이 현재가로 계산 · 안 넘기면 0 — 인박스 규칙상 둘 다 허용).
- D-12 수동주문 폼 주문금액 행의 단위(원 그대로 유지 가능 · 주문가능 행만 만원) · 상따 카드 안내 줄의 정확한 채널(기존 안내 줄 부품 재사용).
- 어드민 칸 placeholder · 저장 중 스피너 문구 · 칩 문구 세부(목업 ① 상태 6종 기준) · 교보 카드의 캡션 문구.
- `/admin/pnl` 라우트 파일 위치 · 사이드바 항목 순서 · 종목명 조인(`stocks` 마스터) · 「미상」 묶음 정렬(맨 뒤).
- 테스트 분할: relay(op 6/7 빌드 · 86 code 1 · 87 3필드 · 67 budget 덮기 · 저널 4필드 · 되싣기) · shared 계산식 · webapp 컴포넌트 · E2E 1~2(어드민 칸 저장 · /me 손익 탭 · `--maxWorkers=2`/`--workers=1` 동시 세션 메모리 규칙).

### Deferred Ideas (OUT OF SCOPE)
- **서버 간 예수금 동기화** — relay 가 체결 조정(한도 전용 67)을 받아 다른 등록 서버에 op 6 으로 밀어 맞추는 것. 경쟁 위험 · 지금은 계좌당 켜진 서버 1대라 불필요. 두 서버 동시 운영 「켜기 전 결정」(Phase 29 이월)에 「예수금 갈림」 항목 추가(D-03).
- **작업대 상단 줄 · /me 현황 상태줄에 주문가능 표시**(WinForms 메인폼 헤더 동형) — 잔고 탭만(D-10).
- **트레이더 본인용 매매손익 심화**(월 합계 · 종목별 기간 합 · CSV) — A 안 기본만.
- **과거분 손익 백필** — 저널 옛 레코드에 평단이 없어 불가 · 배포일부터(D-18).
- **수동주문 폼 주문금액 행 단위 통일(원 → 만)** — 재량 항목, 이번엔 주문가능 행만 추가.
- **어드민 예수금 변경 이력(DB 기록)** — 「DB 에 마지막 입력값만 기록」 안 기각(D-04) · 필요하면 audit 로그로.
- **gh-trade**: op 6 INT64_MAX 초과 code 1 메시지 · 평단 모르는 매도 pnl 규칙 — 인박스 추가 절로 이미 반영, gh-radar 변경 없음.
</user_constraints>

## Project Constraints (from CLAUDE.md)

| # | 지시 | 이 phase 에 걸리는 곳 |
|---|------|----------------------|
| C-1 | gh-trade 인박스: 처리하면 노트 `status: done` + `done_commit` 채워 **경로 지정 커밋** | D-16 마지막 태스크(두 노트). `261027-launch-plan-admin.md` 는 **이 phase 범위 밖**(Phase 35/별도) — 같이 add 금지 |
| C-2 | 공식 API/스크래핑 운영 기준 | 해당 없음(외부 API 호출 추가 없음) |
| C-3 | 상따 화면 반응형 = 본문 폭 4밴드 컨테이너 쿼리, 정본은 `webapp/src/styles/globals.css` §2.2b — 표 복사 금지 | D-13 상따 카드 경고 줄은 기존 `@min-[685px]/lc:` 문법 안에서만 |
| C-4 | GSD 워크플로 경유 편집 | executor 는 `/gsd-execute-phase` 안에서 |
| C-5 | 커밋 메시지 한글 · 사용자 확인 후 커밋 · Co-Authored-By 금지 (글로벌 CLAUDE.md) | 모든 커밋 태스크 |
| C-6 | (메모리) 서브에이전트 배포 금지 · relay 먼저 push 나중 · 20:00 KST 이후 relay 재시작 · 배포 명령은 허용 규칙 접두사 그대로(`supabase db push --linked --yes`) | 배포 플랜은 메인 세션 전용 체크포인트 |
| C-7 | (메모리) Supabase 새 RPC `REVOKE … FROM anon, authenticated` 명시 · 새 테이블 RLS `TO anon, authenticated` | 집계 RPC 2종 |
| C-8 | (메모리) 동시 세션: `git add -A` 금지 · vitest `--maxWorkers=2` · playwright `--workers=1` · Phase 35 실행 중이면 STATE 건드리지 않기 | 전 태스크 |
| C-9 | (메모리) 보안검사 안 함 — `security_enforcement=false`, nyquist 유지 | Security Domain 절 생략 |
| C-10 | (메모리) UI 는 목업 먼저 — 이미 D-00 채택 완료. 목업은 Chrome MCP 금지 · `open` | UI-SPEC 단계 |
| C-11 | (메모리) 「무로그 fail-safe 금지」 | relay catch 경로마다 로그(code · op · serverKey) |

## Summary

이 phase 는 **새 라이브러리 없이** 이미 있는 4개 층(relay · shared · server · webapp) + DB 마이그레이션 2개로 끝난다. 와이어 생성물은 gh-trade 가 작업 트리에 이미 넣어 두었고(SYNC 7824e51b), 접근자(`budgetKrw()` · `feePpm()` · `sellTaxPpm()` · `avgPrice()` 등)와 빌더(`addBudgetKrw` …)가 전부 있다 [VERIFIED: relay/src/generated/stock-dma/*.ts 이번 세션 Read]. 해야 할 일은 (1) relay 파서·빌더·병합·디스패처에 값을 흘리는 배선, (2) 저널 4필드를 `dma_journal_events` 컬럼과 `dma_journal_apply` INSERT 에 추가, (3) 집계 RPC 2종, (4) 웹 표시·입력 부품이다.

가장 큰 함정 세 가지: **① 지금 HEAD 에서 `relay` `typecheck:tests` 가 이미 깨져 있다** — `tests/helpers/frames.ts:490` 의 `createAccountState` 가 7인자(생성물은 8인자 · b7b25391 커밋 때부터), `:1618` 의 `createJournalRecord` 가 24인자(작업 트리 생성물은 28인자) [VERIFIED: `npx tsc -p tsconfig.tests.json` 출력 `TS2554: Expected 8 arguments, but got 7` · `Expected 28 arguments, but got 24`]. config `build_command` 에 `typecheck:tests` 가 들어 있으므로 Wave 0 첫 태스크가 고쳐야 한다. **② relay `#mergeAccountState` 는 델타 결과를 필드별로 재조립**해서 `budgetKrw` 를 명시하지 않으면 캐시에서 사라진다(재접속 캐시 재생 = 예수금 0 = 「미설정」 오표시) [VERIFIED: subscription-hub.ts:3721-3729]. **③ op 6/7 결과를 `dma_admin_results` 에 기록하면 안 된다** — 그 표는 의도↔87 반영 칩의 원천이라 예수금 저장 한 번이 계좌 등록 칩을 덮는다(D-04 의 연장).

집계는 `dma_journal_events` 원문 표에서 `notice_type='E'` 만 읽는다. `exec_qty`·`exec_price` 가 둘 다 `integer` 라 **곱을 bigint 로 캐스팅하지 않으면 21억 원 초과 체결에서 integer overflow** 로 RPC 가 통째로 실패한다 [VERIFIED: 20260924200000_dma_journal_tables.sql:83-84].

**Primary recommendation:** Wave 0 = 생성물·노트 경로 지정 커밋 + `frames.ts` 타입 복구 + shared 계약(타입·계산·포맷 함수 한 벌 + 테스트) → 그 뒤 relay / DB / server / webapp 을 병렬 웨이브로, 배포·UAT·인박스 done 은 메인 세션 체크포인트 플랜 하나로 분리한다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| op 6/op 7 송신 · fan-out · op 3 뒤 되싣기 | relay (admin dispatcher) | server(Express 프록시 · requireAdmin) | admin 관찰자 연결(role 2)은 relay 만 갖는다. Express 는 권한·검증·프록시만 |
| 87 `budget_krw`·`fee_ppm`·`sell_tax_ppm` 파싱 · 서버별 값 제공 | relay (envelope + admin-api GET) | shared(개요 파생) | 87 캐시는 relay 메모리. DB 저장 없음(D-04) |
| 66/67 `budget_krw` 수신 · 마지막 값 덮기 | relay (envelope · hub merge) | webapp(`mergeAccount`) | 두 곳 병합 규칙 동일(「두 곳 동일」 주석) |
| 주문가능 계산 · 포맷 | shared (순수 함수) | webapp(호출 · 재계산 타이밍) | D-11 「shared 한 벌」 · relay 테스트도 같은 함수 |
| 초과 경고(수동주문 · 상따) | webapp (Browser) | — | 차단 없음 · 표시만 |
| 저널 4필드 파싱 → DB 적재 | relay (journal) → DB(`dma_journal_apply`) | — | 원문 표가 사실의 정본 |
| 일자별 손익 집계 | DB (RPC 1회) | server(라우트 · 기간 계산) | Cloud Run ↔ Supabase 왕복이 지연 지배(메모리) |
| `/admin/pnl` · `/me` 손익 탭 | webapp (Next 클라이언트 컴포넌트) | server(`requireAdmin` / `requireAuth`) | 가시성은 RPC 조인이 정본 |

## Standard Stack

### Core (전부 기존 — 신규 설치 없음)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flatbuffers (TS runtime) | 25.9.23 | 44/66/67/80/86/87 조립·해석 | 이미 relay 가 사용 [VERIFIED: node_modules/.pnpm/flatbuffers@25.9.23] |
| flatc (생성기) | 25.12.19 | 생성물 — **gh-trade 소유**, 손편집 금지 | SYNC MARKER 블록 [VERIFIED: StockDMA.fbs:1-6] |
| zod | (기존) | relay admin-api · server 스키마 | 기존 `AccountSchema` · `OrderEndpointSchema` 패턴 |
| vitest | (기존) | relay · shared · server · webapp 단위 | 기존 스크립트 |
| pgTAP (docker) | (기존) | 마이그레이션·RPC 회귀 | `scripts/verify-dma-orders-price-check.sh --test …` |
| Playwright | (기존) | E2E (`workers: 1` 고정) | `webapp/playwright.config.ts:104` |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 없음.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[어드민 브라우저 /admin/users 계좌 카드]
   │ Enter/blur ─ useFieldSave
   ▼
[Express PUT /api/admin/dma-users/:dma/accounts/:broker/:no/budget | /fee]  (requireAuth→requireAdmin, zod)
   │ relay-admin-client (X-Relay-Secret)
   ▼
[relay admin-api PUT /internal/admin/…/budget | /fee]
   │
   ▼
[AdminDispatcher.setAccountCost] ── 등록 서버 키(그 계좌 active 의도) ── 서버마다 병렬
   │   꺼짐→skipped · 연결없음→offline
   ▼
[AdminConn.command(op 6|7)] ──44──▶ gh-trade ──86(code)──▶ ok/failed(code 1=「서버 미지원」)
                                         └─87(rev+1 일 때)─▶ 87 캐시 갱신
   ▼
{results:[{server,outcome,code,message}]}  ← dma_admin_results 에 기록하지 않음

[어드민 개요 GET /api/admin/users] ─ RPC admin_users_raw ‖ relay GET order-endpoints ‖ relay GET account-costs(신규)
                                                             └ 서버별: op 5 재조회(스로틀) → 87 값 + hub 67 캐시 budget(우선)
   └▶ shared deriveAdminUsersOverview(raw, endpoints, costs) → AdminAccountView.costs → summarizeAccountCosts → 카드 3칸 + 불일치 줄

[op 3/op 1(계좌) 성공 · 그 서버에 처음 생긴 계좌]
   └▶ dispatcher: 다른 등록 서버 값(주문 서버 우선) → op 6 / op 7 이어 송신(값 0 이면 생략)

[gh-trade 체결] ─67(체결 델타, 조정 전 budget)─▶ relay parseAccountState(budgetKrw)
                ─67(한도 전용, 빈 벡터)≤100ms─▶   ├ hub #mergeAccountState: budgetKrw = next.budgetKrw (덮기)
                ─67(재전송) 1~2s─▶               └ fanout 원 프레임 → 웹 mergeAccount(...next)
                                                     └▶ shared availableKrwOf(account, priceOf) → 계좌 패널 요약 줄 / 수동주문 행 / 상따 경고

[gh-trade 80 JournalBatch] ─▶ relay parseJournalBatch(+avgPrice,feeKrw,taxKrw,realizedPnlKrw)
   └▶ writer.toApplyEvent(+avg_price,fee_krw,tax_krw,realized_pnl_krw) ─▶ RPC dma_journal_apply ─▶ dma_journal_events(+4 bigint 열)

[/admin/pnl] ─ GET /api/admin/pnl?group=user|account&range= ─▶ RPC dma_pnl_daily_for_admin(from,to,group)  ┐
[/me 손익 탭] ─ GET /api/pnl?account=&range=            ─▶ RPC dma_pnl_daily_for_user(uid,acct,from,to) ┴▶ jsonb {groups[{key,total,days[{…,stocks[]}]}]}
```

### 파일 지도 (변경 대상 · 근거 줄)

| 층 | 파일 | 지금 상태 [VERIFIED 이번 세션] | 할 일 |
|----|------|-------------------------------|-------|
| relay 타입 | `relay/src/admin/types.ts:26-32` | `ADMIN_OP = { UpsertUser: 1, DeleteUser: 2, SetAccount: 3, RemoveAccount: 4, ListUsers: 5 }` | `SetAccountBudget: 6, SetAccountFee: 7` 추가. `AdminAccount`(81-100)에 선택 `budgetKrw?: number; feePpm?: number; sellTaxPpm?: number`(87 파싱용). `AdminCommandInput`(103-112)에 선택 `budgetKrw?: bigint; feePpm?: number; sellTaxPpm?: number` |
| relay 빌더 | `relay/src/dma/envelope.ts:3338-3361` `buildAdminCommandReq` | `addRequestId/addOp/addUserId/addPassword/addAccount` 만 | op 6 이면 `AdminCommandReq.addBudgetKrw(b, input.budgetKrw)`, op 7 이면 `addFeePpm`·`addSellTaxPpm`. 범위 가드(budget 0..2^64-1 · ppm 0..2^32-1)는 requestId 가드와 같은 RangeError |
| relay 87 | `envelope.ts:3393-3437` `parseAdminUsersSnapshot` | `orderIp/orderMac` 만 비어 있지 않을 때 키 | `budgetKrw: toNum(a.budgetKrw(), "admin_account.budget_krw")` · `feePpm: a.feePpm()` · `sellTaxPpm: a.sellTaxPpm()` 를 **항상** 싣는다(0 = 미설정 — IP/MAC 의 「빈 값 = 키 없음」 규칙과 다름. 숫자라 부재/0 구분이 무의미) |
| relay 66/67 | `envelope.ts:2372-2486` `parseAccountState` | 반환 `{t,a,snap,hold,unf,rm,st}` | `budgetKrw: toNum(st.budgetKrw(), "account_state.budget_krw")` 추가 |
| relay 병합 | `relay/src/hub/subscription-hub.ts:3694-3730` | 델타 반환이 7필드 재조립 | 델타 반환에 `budgetKrw: next.budgetKrw` 추가(스냅샷 분기는 `...next` 라 자동). 주석 「브라우저 mergeAccount 와 한 글자도 다르지 않은 규칙」 유지 |
| relay 67 캐시 조회 | hub `#accountStates`(987) 키 = `${userId}|${serverKey}|${accountNo}` (`ownerKey` 739 · `ownerPrefix` 744) | 사용자 단위 조회(`getAccountStates`)만 | 신규 공개 메서드 예: `liveBudgetOf(serverKey, accountNo): number \| null` — 키 두 번째 칸이 serverKey 인 항목 중 계좌 일치(같은 서버면 사용자 무관 같은 값) |
| relay 저널 | `relay/src/journal/types.ts:25-57` `JournalRecord`(23필드) · `envelope.ts:3457-3500` · `writer.ts:70-94,175-201` | 23필드 | 4필드 추가(`avgPrice/feeKrw/taxKrw/realizedPnlKrw`, `toNum` — 음수 허용) · `JournalApplyEvent` + `toApplyEvent` 에 `avg_price/fee_krw/tax_krw/realized_pnl_krw` |
| relay 디스패처 | `relay/src/admin/dispatcher.ts` `#applyServer`(287-370) · `#serverKeysOf`(532-534) · `#record`(560-) | op 1~4 | 신규 `setAccountCost(dma, {broker, accountNo}, {op:6, budgetKrw} \| {op:7, feePpm, sellTaxPpm}, {deadlineAt})` + op 3 뒤 되싣기(아래 Pattern 3) |
| relay HTTP | `relay/src/admin/admin-api.ts` (PUT accounts 453 · GET order-endpoints 672) | — | PUT `/dma-users/:dma/accounts/:broker/:accountNo/budget` · `/fee` · GET `/account-costs`(KB+교보 · op 5 스로틀 · 67 캐시) |
| shared | `packages/shared/src/admin.ts` `interpretAdminResult`(523) · `AdminAccountView`(199-224) · `deriveAdminUsersOverview`(819) | op `1\|2\|3\|4\|5` | op 타입 `1..7` · `AdminAccountView.costs?: Record<serverKey, AdminAccountCost \| null>` · 개요 3번째 인자 · `summarizeAccountCosts`(order-endpoint.ts `summarizeOrderEndpoint` 121-153 동형) |
| shared | `packages/shared/src/relay.ts:1177-1196` `RelayAccountState` | `budgetKrw` 없음 | `budgetKrw?: number`(선택 — 옛 relay 프레임 호환, 없음 = 0 = 미설정) |
| shared 신규 | `packages/shared/src/account-budget.ts`(가칭) | — | `availableKrwOf` · `formatManwonFloor` · `formatPnlManwon` · `formatManwon1` · `pctToPpm`/`ppmToPct` · 상따 합 판정. `index.ts` 배럴 export |
| server | `server/src/routes/admin.ts`(adminRouter 전역 관문 83) · `services/relay-admin-client.ts` | — | PUT budget/fee 프록시 · GET /users 에 costs 병렬 · GET `/pnl`(adminRouter 안 = 관문 자동) |
| server 신규 | `server/src/routes/pnl.ts` + `app.ts` 마운트 | — | `GET /api/pnl?account=&range=` requireAuth · `p_user_id=req.userId` |
| DB 신규 | `supabase/migrations/<ts>_dma_journal_pnl.sql` · `<ts>_dma_pnl_rpcs.sql` | — | 열 4개 + `dma_journal_apply` 재정의 · RPC 2종 |
| webapp | `components/admin/account-editor.tsx`(AccountRow 590~) · `admin-api.ts` | — | 예수금·수수료·매도세 행 |
| webapp | `components/orderbook/account-panel.tsx`(holdings 섹션 995~ · embed 1244~) | — | 요약 줄 |
| webapp | `components/trading/card/manual-order-form.tsx`(주문금액 987-996 · priceIssue 881-888) | — | 주문가능 행 + 검증 줄 |
| webapp | `components/trading/limit-chaser-form.tsx`(금액 필드 217-219) | — | 상따 합 경고 |
| webapp | `components/trading/me-client.tsx` `ME_TABS`(303-308) · 잔고 탭(515-523) | 4탭 | 5번째 「손익」 탭 |
| webapp | `lib/use-relay-socket.ts:1570-1606` `mergeAccount` | `...next` 스프레드 | 변경 불필요(자동 덮기) — 주석만 「budgetKrw 마지막 값」 보강 |
| webapp 신규 | `app/admin/pnl/page.tsx` · `components/pnl/*` · 사이드바 항목 | — | Phase 35 사이드바 커밋 **뒤에** |

### Pattern 1: op 6/7 빌드 — 기존 빌더에 분기 두 줄
**What:** `buildAdminCommandReq` 는 이미 op 별로 `password` 를 조건부로 싣는다. 같은 문법으로 말미 필드를 싣는다.
**Example:**
```typescript
// relay/src/dma/envelope.ts buildAdminCommandReq 안 — 기존 addAccount 다음
// Source: 생성 접근자 admin-command-req.ts:96-106 (addBudgetKrw slot 5 Int64 · addFeePpm slot 6 · addSellTaxPpm slot 7)
if (input.op === ADMIN_OP.SetAccountBudget) AdminCommandReq.addBudgetKrw(b, input.budgetKrw ?? 0n);
if (input.op === ADMIN_OP.SetAccountFee) {
  AdminCommandReq.addFeePpm(b, input.feePpm ?? 0);
  AdminCommandReq.addSellTaxPpm(b, input.sellTaxPpm ?? 0);
}
```
- 값 0 은 flatbuffers 가 **필드를 생략**한다(`if (this.force_defaults || value !== defaultValue)`) [VERIFIED: flatbuffers@25.9.23 builder.js:197-202] — 서버는 부재를 0 으로 읽으므로 「해제」 의미가 그대로 성립한다. 테스트는 「0 을 보내면 `budgetKrw()` 가 0n」 으로 단언하면 된다.
- op 6/7 의 `account` 는 op 4 처럼 `{ accountNo, name: "", branchNo: "", traderId: "", priority: 0 }`, `userId: ""`(서버가 읽지 않음 — 인박스 「user_id·password 는 읽지 않는다」) [CITED: docs/inbox/from-gh-trade/261027-account-budget.md].

### Pattern 2: 67 예수금 = 마지막 값 덮기 (relay · 웹 두 곳)
```typescript
// relay/src/hub/subscription-hub.ts #mergeAccountState — 델타 분기 반환
return {
  t: "acct",
  a: next.a,
  snap: true,
  hold: [...holdings.values()],
  unf: [...unfilled.values()],
  rm: [],
  st: next.st,
  // Phase 36 D-14 — 67 은 매번 그 시점 budget_krw 를 싣는다(체결 67 = 조정 전 · 한도 전용 67 = 새 값 · 1~2초 뒤 재전송).
  // 항목 병합과 달리 마지막 값으로 덮는다. 웹 mergeAccount 는 `...next` 로 같은 결과.
  budgetKrw: next.budgetKrw,
};
```
- 한도 전용 67 은 벡터가 비어 있어도 `#onAccountState` 가 버리지 않는다 — 계좌 소유 필터(29-35 `ownedAccountsOf`)만 본다 [VERIFIED: subscription-hub.ts:3318-3349]. 따라서 별도 처리 불필요.
- 와이어 직렬화는 별도 매퍼 없이 `JSON.stringify(state)` 라 **bigint 가 섞이면 TypeError** — 반드시 `toNum` 을 거친다 [VERIFIED: envelope.ts:308-326 주석 「JSON.stringify(bigint) 는 TypeError」].

### Pattern 3: op 3 뒤 서버 간 되싣기 (D-07) — dispatcher 에서
**권장 위치:** `AdminDispatcher.#applyServer` 루프 뒤(planner 는 서버 1대의 87 만 보는 순수 함수라 서버 간 값을 볼 수 없다 [VERIFIED: planner.ts:55-71 `PlanServerOpsInput.snapshot` 단일]).
```
계획 시점(R3-01 op 5 재조회 직후) 이 서버 87 의 **모든 유저**에 그 계좌(정규화 번호)가 없음 → "이 서버에 처음"
op 1(계좌) / op 3 이 ok 로 끝난 그런 계좌마다:
  출처 = 그 계좌의 다른 active 등록 서버 중 (주문 서버 지정 isOrder → 증권사 기본 주문 서버 → 레지스트리 순 첫 서버)
  값   = 출처 서버의 현재값(권장: account-costs 와 같은 헬퍼 — hub 67 budget 우선, 없으면 87) · 비용률은 87
  budget > 0 → op 6 · (fee, tax) ≠ (0,0) → op 7 · 전부 0 이면 생략
```
- 같은 서버의 다른 유저가 이미 가진 계좌는 **서버가 스스로 복사**한다(op 3 규칙 「다른 유저가 이미 가진 계좌를 추가 = 그 한도 복사」) [CITED: 261027-account-budget.md 「op 3 SetAccount 와 한도」] — 그래서 판정은 「유저 기준」이 아니라 「서버 87 전체 기준」.
- 되싣기 실패 처리(권장): **비치명** — 계좌 추가 자체는 반영됐으므로 그 서버 결과는 ok 로 두고 warn 로그(serverKey · op · code · 계좌는 `maskAccountNo`). 차이는 다음 개요의 D-03 불일치 줄이 보여 준다. (Open Question 1)

### Pattern 4: 개요의 서버별 비용 — IP/MAC `orderEndpoints` 동형 Record
```typescript
// packages/shared/src/admin.ts — 신규 타입 (이름은 플래너 재량)
export interface AdminAccountCost { budgetKrw: number; feePpm: number; sellTaxPpm: number; budgetSource: "live" | "snapshot" }
export interface AdminAccountCostRow extends Omit<AdminAccountCost, "budgetSource"> { dmaUserId: string; accountNo: string; liveBudgetKrw: number | null }
export interface AdminAccountCostsRaw { servers: Record<string, AdminAccountCostRow[]> }
// AdminAccountView 에: costs?: Record<string, AdminAccountCost | null>   (키 = active 등록 서버 · null = 모름)
```
- 기존 `GET /order-endpoints` 는 **KB 서버만**(교보 IP/MAC 은 개인 PC 식별 정보라 relay 밖으로 내보내지 않음) [VERIFIED: admin-api.ts:669-694]. 예수금·비용률은 교보에도 필요하므로 **별도 엔드포인트** `GET /internal/admin/account-costs` 로 분리한다(IP/MAC 노출 규칙을 건드리지 않음).
- Express 는 relay 개요 조회를 `RELAY_ORDER_ENDPOINTS_TIMEOUT_MS = 2_000` 으로 묶는다 [VERIFIED: relay-admin-client.ts:62]. D-05 op 5 재조회는 서버당 최대 `ADMIN_COMMAND_TIMEOUT_MS`(5초)라, **동기로 기다리면 개요가 「확인 전」 으로 떨어진다.** 권장: 서버별 마지막 재조회 시각을 들고 N초(예: 15초) 지났으면 op 5 를 쏘고 **최대 ~800ms 만** 기다린 뒤 그때의 캐시로 응답(늦게 온 87 은 다음 GET 이 읽음). 같은 스로틀로 동시 GET 이 op 5 를 겹쳐 쏘지 않게 in-flight 공유.

### Pattern 5: 주문가능 계산 — shared 순수 함수
```typescript
// packages/shared/src/account-budget.ts (가칭)
import type { RelayAccountState } from "./relay";
/** 주문가능(원). null = 예수금 미설정(budgetKrw 0 · 없음). 음수 가능 — 표시는 max(0, v). */
export function availableKrwOf(
  account: Pick<RelayAccountState, "hold" | "unf"> & { budgetKrw?: number },
  priceOf?: (isin: string) => number | undefined,
): number | null {
  const budget = account.budgetKrw ?? 0;
  if (!(budget > 0)) return null;
  let used = 0;
  for (const h of account.hold) used += h.avgPrice * h.qty;          // 매입가 기준(현재가 아님)
  for (const u of account.unf) {
    if (u.side !== "B" || u.pendingCancelSent) continue;              // 매도 제외 · 취소 보낸 행 제외
    const px = u.price > 0 ? u.price : (priceOf?.(u.isin) ?? 0);      // 시장가 = 현재가, 없으면 0 (상한가 금지)
    used += u.unfilledQty * px;                                       // KRX·NXT · 예약 요약 · 접수대기 전부 포함
  }
  return budget - used;
}
/** 원 → 「1,234만」 — 원/10000 내림 · 천단위 콤마 · 억 없음(D-09). 음수 입력은 호출부가 max(0) 후 넘긴다. */
export function formatManwonFloor(krw: number): string { /* Math.floor(krw / 10_000) + Intl ko-KR */ }
```
- 필드 이름은 shared 타입 그대로: `RelayHolding.qty/avgPrice`, `RelayUnfilled.side("B"|"S")/price/unfilledQty/pendingCancelSent/isin` [VERIFIED: relay.ts:1106-1175 · `OrderSide = "B" | "S"` relay.ts:1906].
- `avgPrice` 는 double(내림 금지 주석) → 합계가 소수일 수 있음 — 표시 단계에서만 floor.
- 재계산 타이밍(재량): React 에서는 `useMemo([account, quotes])` 로 충분하다 — `priceOf` 는 `quotes` 가 바뀔 때마다 새 함수(`trading-workbench.tsx:1328`)라 시장가 매수 미체결도 시세 변화에 따라 재계산된다. gh-trade 의 1초 타이머는 WinForms 가 반응형이 아니라서 필요했던 것 — 웹은 불필요 [ASSUMED: 동형성 판단 · 사용자 확인 불필요 수준].
- 현재가: `holdingQuotePrice(quotes, isin)` (KRX → NXT, `p > 0` 만) [VERIFIED: trading-workbench.tsx:482-491]. 구독되지 않은 종목은 undefined → 0.

### Pattern 6: 저널 4필드 → DB (원문 표 + apply 재정의)
```sql
-- supabase/migrations/<ts>_dma_journal_pnl.sql
BEGIN;
ALTER TABLE public.dma_journal_events
  ADD COLUMN avg_price        bigint NOT NULL DEFAULT 0,
  ADD COLUMN fee_krw          bigint NOT NULL DEFAULT 0,
  ADD COLUMN tax_krw          bigint NOT NULL DEFAULT 0,
  ADD COLUMN realized_pnl_krw bigint NOT NULL DEFAULT 0;
-- 집계용 부분 인덱스(체결만)
CREATE INDEX idx_dma_journal_events_fill_day ON public.dma_journal_events (trade_date, account_no) WHERE notice_type = 'E';
-- dma_journal_apply: 20261004090100 본문 그대로 복사 + INSERT 열/값 4개만 추가
--   coalesce((ev->>'avg_price')::bigint, 0), … (realized_pnl_krw 는 음수 가능)
-- 권한 3줄 재명시(REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role)
COMMIT;
```
- `dma_journal_apply` 의 **최신 정의는 `20261004090100_dma_journal_apply_skipped_rows.sql`** 이고 그 뒤 재정의 없음 [VERIFIED: grep `FUNCTION public.dma_journal_apply(` → 20260924200100 · 20261004090100 두 파일뿐]. 이 본문을 그대로 복사해야 WR-09(skipped rows) 수정이 되돌려지지 않는다.
- `ADD COLUMN … NOT NULL DEFAULT 상수` 는 PG11+ 에서 테이블 재작성 없음(메타데이터만) [ASSUMED: PostgreSQL 일반 지식 — Supabase PG15 기준 안전].
- 배포 순서 독립성: 새 relay 가 옛 DB 에 4키를 보내도 apply 는 `ev->>'…'` 로 아는 키만 읽어 무시, 옛 relay + 새 DB 는 `coalesce(…, 0)` [VERIFIED: 20261004090100:67-96 INSERT 패턴].

### Pattern 7: 일자 집계 RPC 2종 (한 번 호출에 묶음 × 일자 × 종목)
```sql
-- 권장 시그니처 (SECURITY INVOKER + service_role 전용 — 이 저장소의 실제 관례)
public.dma_pnl_daily_for_admin(p_from date, p_to date, p_group text)          -- 'user' | 'account'
public.dma_pnl_daily_for_user(p_user_id uuid, p_account_no text, p_from date, p_to date)
RETURNS jsonb  -- { groups: [ { key, sub, total:{pnl,fee,tax,buy,sell,fills},
               --              days:[ { date, pnl, fee, tax, buy, sell, fills,
               --                       stocks:[ { isin, code, name, pnl, buy, sell, fills } ] } ] } ] }
-- 공통 원천:
SELECT j.gateway, j.trade_date, j.account_no, j.dma_user_id, j.isin, j.side,
       j.exec_qty::bigint * j.exec_price AS amt,   -- ★ bigint 캐스팅 (integer×integer overflow)
       j.fee_krw, j.tax_krw, j.realized_pnl_krw
  FROM public.dma_journal_events j
 WHERE j.notice_type = 'E' AND j.trade_date BETWEEN p_from AND p_to
-- /me: JOIN public.dma_visible_accounts(p_user_id) v ON v.gateway = j.gateway AND v.account_no = j.account_no  AND j.account_no = p_account_no
-- 종목명: LEFT JOIN public.stocks s ON s.isin = j.isin  (stocks.code · stocks.name)
```
- 이 저장소의 조회 RPC 관례는 **`SECURITY INVOKER` + `service_role` 전용 GRANT + PUBLIC/anon/authenticated 명시 REVOKE** 다(예: `dma_visible_accounts` · `dma_journal_orders_for_user`) [VERIFIED: 20260929190000_dma_gateway_identities.sql:113-129, 136-184]. 오케스트레이터 문구의 「SECURITY DEFINER」 는 이 저장소 관례와 다르다 — INVOKER 로 쓴다(server 가 service_role 키로 부른다).
- 가시성 헬퍼 `dma_visible_accounts(p_user_id) RETURNS TABLE (gateway text, account_no text)` [VERIFIED: 같은 파일 113-125].
- `p_group='user'` 의 key = `dma_user_id`(`''` = 「미상」 — 정렬 맨 뒤) · sub = 그 묶음의 계좌 목록. `'account'` 의 key = `account_no`(게이트웨이 무관 묶음 — 같은 계좌가 KB120/KB121 에 나뉘어도 한 묶음), 증권사는 `gateway` 접두로 파생.
- `sum(bigint)` 은 Postgres 에서 `numeric` 반환 → jsonb 숫자로 직렬화 — 클라가 받는 값은 number [ASSUMED: PG 일반 지식].
- `apply_error` 필터(재량): 투영 실패(포맷 이상)여도 체결 사실과 손익 값은 유효하므로 **거르지 않기**를 권장. (Open Question 3)
- 「이달」 · N일 범위 계산은 server 가 KST 기준으로 한다 — `kstDateIso()` [VERIFIED: grep packages/shared/src/krxCalendar.ts:53].

### Anti-Patterns to Avoid
- **planner.ts `withServerEndpoint` 에 예수금을 섞기:** op 3 은 `budget_krw` 를 읽지 않는다 — 44 op 3 에 실어도 무시되고, `sameValues` 비교에 넣으면 「미반영」 상시 점등(D-04 위반).
- **op 6/7 결과를 `dma_admin_record_results` 로 기록:** 그 표는 (유저, 서버) 반영 칩 원천 — 계좌 등록 칩을 예수금 저장 결과로 덮는다.
- **`#mergeAccountState` 에서 `budgetKrw` 를 「0 이면 이전 값 유지」:** 0 은 「해제」 라는 정당한 값이다. 무조건 `next.budgetKrw`.
- **`exec_qty * exec_price` 를 integer 로 합산:** 2,147,483,647원 초과 한 건이면 RPC 전체 실패.
- **relay/server 에서 비용률 0~10000 을 400 으로 막기:** 클라가 이미 막는다(D-02). 서버까지 막으면 gh-trade code 1 「비용률 범위 밖」 경로가 영영 닿지 않는다(Phase 30 IPMAC-03 「형식 검사 없음」 선례 — admin-api.ts:31-35). relay·Express 는 **uint32 구조 검사만**.
- **`JSON.stringify` 에 bigint:** 87/66/67/80 의 ulong/long 은 전부 `toNum` 경유.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 44 조립 | 새 빌더 함수 | `buildAdminCommandReq` 분기 확장 | requestId 범위 가드 · password 규칙이 이미 한 곳 |
| 서버별 순차 송신 · 86/87 짝짓기 · 타임아웃 | 별도 큐 | `AdminConn.command()` (서버당 1건 비행 · 87 대기 규칙) | 「86 직후 87」 순서 짝짓기 규칙이 여기에만 있다(admin-conn.ts 30-46) |
| 마감(10초) 접기 · 줄 세우기 | 새 타이머 | dispatcher `#answerBy` · `#serial` · `#fanOut` · `#sorted` | Express 15초 상한과의 정합(WR-07) |
| 결과 칩 | 새 칩 | `chipOfResult` · `RESULT_CHIP` · `ReflectChip` · `WARN_LINE` · `OrderEndpointMismatchLines` 모양 | 목업 ① 「기존 반영 칩 그대로」 |
| 즉시 저장 | 폼 상태 | `useFieldSave`(1건 비행 · 마지막 값 큐 · flash · `releaseOn`) | Phase 29 D-15 |
| 유효 주문 서버 판정 | 새 규칙 | `resolveEffectiveOrderServer`(summarizeOrderEndpoint 가 쓰는 것) | GC-06 「두 벌 금지」 |
| 계좌 가시성 | WHERE 직접 | `dma_visible_accounts(p_user_id)` | 게이트웨이 인지 규칙 뷰 한 곳 |
| 현재가 | 새 조회 | `holdingQuotePrice` / 기존 `priceOf` | KRX→NXT 고정 축(GC-IN-04) |
| KST 날짜 | `new Date()` 산술 | `kstDateIso()` | 서버 TZ 무관 |
| 기간 칩/행 펼침 | 새 부품 | `/analytics/accum` 행 펼침 · 세그먼트 부품(Phase 34) | D-18 「행 한 줄 + 펼침」 선례 |

**Key insight:** 이 phase 의 모든 동작은 이미 한 번씩 구현된 패턴(IP/MAC 87 정본 · R3-02 되싣기 · 서버별 칩 · 행 펼침 보고서)의 재사용이다. 새로 만드는 것은 「값 4종을 흘리는 배선」과 「집계 SQL」뿐이어야 한다.

## Common Pitfalls

### Pitfall 1: relay `typecheck:tests` 가 지금 깨져 있다
**What goes wrong:** config `build_command` 의 `pnpm --filter @gh-radar/relay run typecheck:tests` 가 실패 → 어느 플랜이든 빌드 게이트에서 막힘.
**Why:** `tests/helpers/frames.ts:490` `AccountState.createAccountState(…7인자)` (생성물 8인자 — b7b25391 부터) · `:1618` `WireJournalRecord.createJournalRecord(…24인자)` (작업 트리 생성물 28인자).
**How to avoid:** Wave 0 첫 태스크(D-16 커밋과 같은 플랜)에서 `buildAccountStateFrame` 에 `budgetKrw?: bigint | number` 입력을 받아 8번째 인자로, `buildJournalBatchFrame` 에 4필드(`fakeJournalRecord` 기본 0)를 넘기게 고친다. 이건 테스트 헬퍼 확장이라 생성물 손편집이 아니다.
**Warning signs:** `TS2554: Expected 8 arguments, but got 7`.

### Pitfall 2: 재접속 캐시 재생에서 예수금이 사라진다
**What:** hub 델타 병합이 `budgetKrw` 를 버리면, 새 탭/재접속이 받는 `getAccountStates` 스냅샷이 「미설정」.
**How to avoid:** Pattern 2. 테스트: 66(budget 1000) → 67 체결 델타(budget 1000) → 67 한도 전용(빈 벡터 · budget 990) → `getAccountStates` 가 990.

### Pitfall 3: 저널 레코드 키 수 단언
`relay/tests/journal-codec.test.ts:150` 이 `Object.keys(records[0])).toHaveLength(23)` 을 단언한다 → 27 로. `packages/shared/src/order-timeline.ts` `JOURNAL_EVENT_PUBLIC_KEYS`(24키)는 픽스처 기반 단언이고 매퍼가 **명시 키만** 옮기므로 DB 에 열이 늘어도 응답에 새지 않는다 — 바꿀 필요 없음(원하면 주석만 갱신). 단 `dma_order_events_for_user` 가 `to_jsonb(j)` 라 RPC ev 에는 4키가 실린다 [VERIFIED: 20261027200100_launch_gate_apply.sql:316].

### Pitfall 4: integer overflow (집계)
`exec_qty integer`, `exec_price integer` [VERIFIED: 20260924200000:83-84]. `exec_qty::bigint * exec_price`. pgTAP 에 「1,000,000주 × 30,000원」 행을 넣어 회귀.

### Pitfall 5: `dma_admin_results` 오염 · reconcile 간섭
op 6/7 은 `#record` 를 부르지 않는다. 또 `#serial(dmaUserId)` 줄은 타도(같은 유저의 계좌 PUT 과 섞이지 않게) 결과 기록은 생략.

### Pitfall 6: 공유 계좌의 fan-out 대상
공유 계좌(예: 37728502101 — 김현중·정근형)는 op 6 한 번이 그 서버의 **모든 유저 행**을 쓴다 [CITED: 인박스 「그 서버에서 그 계좌를 가진 모든 유저 행에 같은 값」]. fan-out 대상은 「요청한 DMA 유저의 그 계좌 active 등록 서버」 로 충분하다(다른 유저가 다른 서버에도 같은 계좌를 등록했으면 그 서버는 빠짐 — 운영상 드묾). 원하면 의도 표 전체에서 (broker, 정규화 계좌) 의 active 서버 합집합 — 스토어에 그런 조회가 없으므로 최소안은 요청 유저 기준. (Open Question 2)

### Pitfall 7: 86 code 1 표시 문구
`RESULT_CHIP` 은 outcome 기준이라 code 를 보지 않는다 [VERIFIED: account-editor.tsx:196-204]. 예수금 행에서만 `r.outcome === "failed" && r.code === 1` → label 「서버 미지원」 + message 원문(D-06). 기존 계좌 칩 경로는 건드리지 않는다.

### Pitfall 8: Express 2초 상한과 op 5 재조회
Pattern 4 참조. 동기 대기 금지.

### Pitfall 9: 동시 세션 (Phase 35 실행 중)
- `.planning/milestone.lock` 이 Phase 35 세션 소유 [VERIFIED: lock 파일 `"phase": "35"`]. STATE.md · state.json 은 Phase 36 플랜/실행에서 건드리지 않는다(메모리 「plan-phase 동시 세션 STATE 경합」).
- 작업 트리에 **Phase 35 의 미커밋 사이드바 변경**(`app-sidebar.tsx` · `app-sidebar.test.tsx` · `sidebar-tree.spec.ts` — 「발사」 항목)이 있다 [VERIFIED: git diff]. Phase 36 의 「매매손익」 항목은 Phase 35 커밋 **뒤**, 「발사」 다음에 넣는다. 그 전에는 사이드바 파일을 열지 않는다.
- Phase 35 가 `server/src/app.ts` 마운트를 이미 바꿨다(admin-launch). `/api/pnl` 마운트도 같은 파일 — 전용 worktree 에서 최신 master 기준으로.
- D-16 경로 지정 커밋 대상 정확히 5개: `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/admin-account.ts` · `relay/src/generated/stock-dma/admin-command-req.ts` · `relay/src/generated/stock-dma/journal-record.ts` · `docs/inbox/from-gh-trade/261027-account-pnl.md`. `261027-launch-plan-admin.md`(untracked)는 **제외**.

### Pitfall 10: 마이그레이션 타임스탬프 순서
Phase 35 계획에 `20261028200000_launch_project_mapping.sql` 이 있다(아직 파일 없음). Phase 36 마이그레이션이 그보다 큰 타임스탬프로 먼저 원격 적용되면 35 의 push 가 「원격 마지막보다 이른 로컬 마이그레이션」 으로 거부될 수 있다(`--include-all` 필요) [ASSUMED: Supabase CLI 2.75 동작]. 작성 시점에 `ls supabase/migrations | tail` 을 보고, 원격 적용 순서를 Phase 35 와 맞춘다(배포 체크포인트에서 `supabase migration list --linked` 확인).

### Pitfall 11: shared 는 dist 로 소비된다
`@gh-radar/shared` 의 `main/exports` 가 `./dist/*` [VERIFIED: package.json]. shared 를 고친 뒤 `pnpm --filter @gh-radar/shared build` 없이 relay/server/webapp typecheck·테스트를 돌리면 옛 타입을 본다. 모든 하류 태스크의 verify 앞에 shared build.

### Pitfall 12: 수동주문 폼에는 「매수/매도 선택 상태」 가 없다
폼은 매수·매도 버튼 두 개를 함께 그리고(`OrderButton tone="buy"` · manual-order-form.tsx:1040) side 는 클릭 때 정해진다(670). D-12 「매수이고」 를 그대로 옮길 상태가 없다. (Open Question 4)

### Pitfall 13: 손익 「내림」 과 음수
목업 포맷터: `man = sign + Math.floor(Math.abs(v))` (U+2212 「−」) · `man1 = Math.floor(Math.abs(v)*10)/10` [VERIFIED: mockup-account-budget.html:267-268 Read]. 즉 **절댓값 내림 후 부호** — `Math.floor(-12345/1e4)` = −2 가 아니라 「−1만」. 주문가능(D-09)은 항상 `max(0, v)` 라 이 문제가 없다.

## Code Examples

### 87 파싱 확장
```typescript
// relay/src/dma/envelope.ts parseAdminUsersSnapshot — accounts.push 에 추가
// Source: admin-account.ts:72-85 (budgetKrw():bigint slot 18 · feePpm():number slot 20 · sellTaxPpm():number slot 22)
budgetKrw: toNum(a.budgetKrw(), "admin_account.budget_krw"),
feePpm: a.feePpm(),
sellTaxPpm: a.sellTaxPpm(),
```

### 저널 레코드 확장
```typescript
// relay/src/dma/envelope.ts parseJournalBatch — rec 객체 끝에
// Source: journal-record.ts:168-186 (avgPrice/feeKrw/taxKrw/realizedPnlKrw — readInt64 → bigint, 부재 0)
avgPrice: toNum(w.avgPrice(), "journal_record.avg_price"),
feeKrw: toNum(w.feeKrw(), "journal_record.fee_krw"),
taxKrw: toNum(w.taxKrw(), "journal_record.tax_krw"),
realizedPnlKrw: toNum(w.realizedPnlKrw(), "journal_record.realized_pnl_krw"),
// relay/src/journal/writer.ts toApplyEvent — 키 이름은 gh-trade 와 합의된 그대로(D-15 one-way)
avg_price: r.avgPrice, fee_krw: r.feeKrw, tax_krw: r.taxKrw, realized_pnl_krw: r.realizedPnlKrw,
```

### interpretAdminResult 확장
```typescript
// packages/shared/src/admin.ts:523 — 현재: (op: 1 | 2 | 3 | 4 | 5, code) → code 0 ok · op4&8 ok · op2&4 ok
export function interpretAdminResult(op: 1 | 2 | 3 | 4 | 5 | 6 | 7, code: number): "ok" | "failed" {
  if (code === 0) return "ok";            // op 6/7 「변경 없음」 도 code 0
  if (op === 4 && code === 8) return "ok";
  if (op === 2 && code === 4) return "ok";
  return "failed";                         // op 6/7 의 code 1(구 서버 · 범위 밖) · 5 · 8 · 10 · 11
}
```

### % ↔ ppm (D-02)
```typescript
// 1 ppm = 0.0001%  →  ppm = round(pct × 10_000)   예: 0.01% → 100 · 0.05% → 500 · 0.2% → 2000
export const pctToPpm = (pct: number): number => Math.round(pct * 10_000);
export const ppmToPct = (ppm: number): string => /* 소수 4자리까지, 끝 0 제거 */ String(ppm / 10_000);
// 범위 0~10000ppm(0~1%) 밖이면 저장하지 않음 · 빨간 테두리 + 오류 한 줄(클라)
```
(현재 값 교보 10279758101 fee 500 · tax 2000, KB fee 100 · tax 2000 [CITED: 36-CONTEXT.md domain] → 화면 0.05% · 0.2% / 0.01% · 0.2%)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 계좌 한도 없음 | 서버가 `budget_krw` 보관·체결마다 조정 | gh-trade Phase 41 (2026-10-27 배포) | 웹은 표시·입력만, 판정·차단 없음 |
| JournalRecord 23필드 | 27필드(말미 append) | SYNC 7824e51b | 이벤트 JSON 키 4개 추가(one-way) |
| fbs `JournalRecord` 주석 「평단 모름 0」 | 평단 모르는 매도 = `−(fee+tax)` | gh-trade a017ddd9 | 주석은 낡음 — 정본은 gh-trade `docs/features/order-journal.md` [CITED: 261027-account-pnl.md 추가 절 4] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ADD COLUMN … NOT NULL DEFAULT 0` 은 테이블 재작성 없음 | Pattern 6 | 낮음 — 재작성돼도 표 크기 작음, 배포 창(20:00 이후)에서 잠깐 잠금 |
| A2 | `sum(bigint)` → numeric → jsonb 숫자 | Pattern 7 | 낮음 — 테스트에서 타입 확인 |
| A3 | Supabase CLI 가 「원격 마지막보다 이른 로컬 마이그레이션」 을 `--include-all` 없이 거부 | Pitfall 10 | 중 — Phase 35/36 push 순서 꼬이면 배포 체크포인트에서 막힘 |
| A4 | 웹은 1초 재계산 타이머 불필요(`useMemo([account, quotes])` 로 동형) | Pattern 5 | 낮음 — D-11 재량 범위 |
| A5 | 되싣기 실패를 비치명(ok 유지 + warn)으로 두는 것이 사용자 의도에 맞다 | Pattern 3 | 중 — 사용자가 실패 칩을 원하면 그 서버 결과를 failed 로 |
| A6 | 집계에서 `apply_error` 행도 포함 | Pattern 7 | 낮음 — 포맷 이상 체결은 드묾 |
| A7 | pnl 「미상」 묶음·계좌 묶음 키 = 게이트웨이 무관 `account_no` | Pattern 7 | 낮음 |

## Open Questions

1. **D-07 되싣기가 실패(구 서버 code 1 · offline)하면 그 서버 칩은?**
   - What we know: 계좌 추가(op 3)는 이미 반영됨. 되싣기는 부가 동작.
   - What's unclear: 결과 칩을 failed 로 바꿀지.
   - Recommendation: ok 유지 + warn 로그 — 차이는 다음 개요의 D-03 불일치 줄이 드러낸다. 플래너가 사용자 확인 없이 정해도 되는 재량 범위(D-07 구현 위치 재량).

2. **op 6/7 fan-out 서버 집합 — 요청 유저의 그 계좌 등록 서버 vs 계좌 전역 합집합**
   - Recommendation: 요청 유저 기준(`#serverKeysOf` 현행 그대로 · D-07 문구 「`#serverKeysOf` 현행」). 공유 계좌 다른 유저가 다른 서버에만 등록한 경우는 D-03 불일치 줄로 보임.

3. **`apply_error` 행 집계 포함 여부** — 권장: 포함(사실 기록). 플래너 재량.

4. **수동주문 폼의 「매수」 판정(Pitfall 12)**
   - What we know: 폼은 매수·매도 버튼을 함께 그림. 목업 ③ 상태 「매도 탭」 = 판정 없음. `ManualOrderEntry` 폰 밴드에는 `tab: 'buy'|'sell'|'manual'` 가 있으나(1191) 수동 폼 자체엔 side 상태 없음.
   - Recommendation: 예수금 설정됨 ∧ 주문금액 > 주문가능 이면 값 빨강 + 줄을 띄우되, **선택된 미체결이 매도(`selectedUnfilled?.side === 'S'`)일 때는 판정하지 않는다**(정정·취소 = 매도 방향). 문구 「주문가능 초과: …」 는 매수 버튼에만 의미가 있음을 UI-SPEC 에서 확정. **UI-SPEC/discuss 확인 대상**(사용자 결정 필요할 수 있음).

5. **`/me` 잔고 탭에 `priceOf` 를 넘길지** — /me 소켓은 보유 종목 시세를 구독하지 않을 수 있다. 넘겨도 무해(없으면 0). 권장: 작업대와 같은 `holdingQuotePrice` 를 /me 가 가진 `quotes` 로 넘김(D-11 재량).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 전 워크스페이스 | ✓ | v24.21.0 | — |
| pnpm | 빌드·테스트 | ✓ | 11.15.1 | — |
| Docker (OrbStack) | pgTAP (`verify-dma-orders-price-check.sh`) | ✓ | 29.8.2 (daemon up) | — |
| Supabase CLI | 원격 마이그레이션 적용(메인 세션) | ✓ | 2.75.0 | — |
| gcloud | relay(VM)·server(Cloud Run) 배포(메인 세션) | ✓ | 558.0.0 | — |
| `scripts/deploy-relay.sh` · `scripts/deploy-server.sh` | 배포 | ✓ | — | — |
| gh-trade 서버 op 6/7 | 라이브 UAT | ✓ (KB120 · 교보119 2026-10-27 20:42 배포) [CITED: 36-CONTEXT.md] | v1.0-893-g2d5bc207 | — |

**Missing dependencies with no fallback:** 없음.
**주의:** relay 배포·스모크는 샌드박스가 raw TCP/IAP 를 막으므로 `dangerouslyDisableSandbox` (메모리) — 메인 세션 전용.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (shared · relay · server · webapp) · pgTAP via docker · Playwright(workers 1) |
| Config file | `packages/shared/vitest.config.ts` · `relay/vitest.config.ts` · `server/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts` |
| Quick run command | `pnpm --filter @gh-radar/<ws> exec vitest run <file> --maxWorkers=2` |
| Full suite command | config `build_command` + `test_command`: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` 그리고 `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` (+ shared · server vitest) |
| pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<file>.test.sql` |
| E2E | `pnpm --filter @gh-radar/webapp exec playwright test <spec> --workers=1` (실행 전 `.next` 캐시 문제면 `rm -rf webapp/.next`) |

### Phase Requirements → Test Map (요구사항 ID 미배정 — CONTEXT 결정 ID 로 매핑)
| Ref | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-16 | frames 헬퍼가 새 생성물 인자 수와 맞음 | typecheck | `pnpm --filter @gh-radar/relay run typecheck:tests` | ✅ (현재 FAIL — Wave 0 수정) |
| D-11/D-09 | `availableKrwOf` 규칙(매도 제외 · pendingCancelSent 제외 · price 0 → priceOf → 0 · budget 0 → null) · `formatManwonFloor` | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/account-budget.test.ts` | ❌ Wave 0 |
| D-02 | pct↔ppm 왕복 · 범위 판정 | unit | 같은 파일 | ❌ Wave 0 |
| D-06 | `interpretAdminResult(6|7, 0)=ok · (6,1)=failed` | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts` | ✅ (케이스 추가) |
| D-03/D-05 | `summarizeAccountCosts` 출처=유효 주문 서버 · 불일치 · live 우선 | unit | `… vitest run src/__tests__/admin-overview.test.ts` (또는 신규 account-costs.test.ts) | ✅/❌ |
| op 6/7 빌드 | 44 에 budget/fee 실림 · 0 생략 · 범위 RangeError | unit | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts --maxWorkers=2` | ✅ (케이스 추가) |
| 87 3필드 | `parseAdminUsersSnapshot` 이 budget/fee/tax 를 실음(구 서버 = 0) | unit | 같은 파일 · `tests/admin-conn.test.ts` | ✅ |
| D-14 | 66 → 67 체결 → 67 한도 전용 → 캐시 budget 마지막 값 · 재접속 스냅샷 유지 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/account-state.test.ts --maxWorkers=2` | ✅ (케이스 추가) |
| D-15 (relay) | 저널 4필드 파싱 · apply 이벤트 키 이름 · 27키 | unit | `… vitest run tests/journal-codec.test.ts tests/journal-writer.test.ts --maxWorkers=2` | ✅ (23→27 수정) |
| D-07 | op 3 성공 · 서버에 처음 → 다른 서버 값으로 op 6/7 · 0 이면 생략 · 같은 서버 다른 유저 보유면 생략 · 출처 우선순위 | unit | `… vitest run tests/admin-dispatcher.test.ts --maxWorkers=2` | ✅ (케이스 추가) |
| D-04 | op 6/7 은 `recordResults` 를 부르지 않음 · 의도 표 무변경 | unit | 같은 파일 | ✅ |
| D-05 | GET account-costs: 교보 포함 · 67 live 우선 · op 5 스로틀 · 2초 안 응답 | unit | `… vitest run tests/admin-api.test.ts --maxWorkers=2` | ✅ (케이스 추가) |
| server 프록시 | PUT budget/fee requireAdmin · zod(uint32 구조만) · 결과 그대로 · GET /users costs 병렬 | route | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts tests/routes/admin.test.ts` | ✅ |
| D-17 server | GET /api/admin/pnl (403 trader · 400 range · RPC 1회) · GET /api/pnl (401 · p_user_id=req.userId) | route | `… vitest run tests/routes/pnl.test.ts tests/routes/admin.test.ts` | ❌ Wave 0 (pnl.test.ts) |
| D-15 DB | 4열 기본 0 · apply 가 4키 적재 · 옛 이벤트(키 없음) 0 · WR-09 skipped rows 유지 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` | ✅ (plan 수 갱신 + 케이스) |
| D-18/D-19 DB | E 만 · B/S 금액 · bigint 곱(1,000,000×30,000) · 미상 묶음 · 가시성(남의 계좌 0행) · REVOKE anon/authenticated | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_pnl_daily.test.sql` | ❌ Wave 0 |
| D-01~D-03,D-06 UI | 3칸 · Enter/blur 저장 · 변경 없음 미전송 · 범위 밖 빨간 테두리 · code 1 「서버 미지원」 · 불일치 줄 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-editor.test.tsx --maxWorkers=2` | ✅ (케이스 추가) |
| D-08/D-09 UI | 요약 줄(정상 · 0+빨강 · 미설정 흐림) — 기본 배치 · embed holdings · /me | component | `… vitest run src/components/orderbook/__tests__/account-panel.test.tsx --maxWorkers=2` | ✅ |
| D-12 UI | 주문가능 행 · 초과 줄 role=status · 버튼 활성 | component | `… vitest run src/components/trading/__tests__/manual-order-form.test.tsx --maxWorkers=2` | ✅ |
| D-13 UI | 상따 합 초과 → 선매수 금액 빨강 + 안내 줄 · 등록 막지 않음 | component | `… vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx --maxWorkers=2` | ✅ |
| D-17/D-18 UI | /me 5번째 탭 · 기간 세그먼트 · 행 펼침 · 숫자 포맷 · /admin/pnl 계정별/계좌별 | component | `… vitest run src/components/trading/__tests__/me-client.test.tsx src/components/pnl/__tests__/*.test.tsx --maxWorkers=2` | ✅/❌ |
| 사이드바 | Admin 묶음 「… 서버 · 발사 · 매매손익」 | component + E2E | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx` · `playwright test e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ (Phase 35 커밋 뒤) |
| E2E | 어드민 예수금 저장(픽스처) · /me 손익 탭 렌더 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts e2e/specs/me.spec.ts --workers=1` | ✅ (케이스 추가) |
| 라이브 | 어드민 저장 → 86 code 0 · 87 값 · 67 한도 전용 수신 · 체결 뒤 저널 4값 = `[Budget] pnl` | manual (UAT) | — | manual-only (실서버·체결 필요) |

### Sampling Rate
- **Per task commit:** 그 태스크가 건드린 워크스페이스의 quick 명령(+ shared 바꿨으면 `shared build` 먼저).
- **Per wave merge:** build_command 전체 + 바뀐 워크스페이스 vitest 전체 + 바뀐 pgTAP 파일.
- **Phase gate:** 전 워크스페이스 vitest + pgTAP(dma_journal_apply · dma_journal_schema · dma_pnl_daily · dma_strategy_read) + E2E 2~3 spec(`--workers=1`) green 후 `/gsd-verify-work`. 동시 세션 메모리 규칙상 전체 회귀는 한 세션만.

### Wave 0 Gaps
- [ ] `relay/tests/helpers/frames.ts` — `buildAccountStateFrame` 에 `budgetKrw` 입력 + 8번째 인자, `buildJournalBatchFrame` 에 4필드(기본 0), `FakeAdminAccountInput` 에 `budgetKrw/feePpm/sellTaxPpm` (주어질 때만 add — 「구 서버」 흉내 유지)
- [ ] `packages/shared/src/__tests__/account-budget.test.ts` — 계산·포맷·ppm
- [ ] `supabase/tests/dma_pnl_daily.test.sql` — 집계 RPC
- [ ] `server/tests/routes/pnl.test.ts` — /me 손익 라우트
- [ ] `webapp/src/components/pnl/__tests__/pnl-report.test.tsx` (가칭) — 행 펼침·포맷
- [ ] `supabase/tests/dma_journal_apply.test.sql` · `dma_journal_schema.test.sql` — `plan(N)` 갱신(열 4개 단언 추가 시)

## Security Domain

`security_enforcement: false` (`.planning/config.json` workflow) · 메모리 「보안검사 안 함」 — 이 절은 생략한다. (권한 관문 자체는 기존 패턴 그대로: Express `requireAuth`/`requireAdmin`, RPC service_role 전용 + anon/authenticated REVOKE, 계좌 가시성은 RPC 조인.)

## Recommended Plan Shape (플래너 참고 — 강제 아님)

| Wave | Plan | 내용 | 비고 |
|------|------|------|------|
| 0 | 36-01 | D-16 경로 지정 커밋(5파일) · frames.ts 타입 복구 · shared 계약(타입 · `availableKrwOf` · 포맷 · ppm · `interpretAdminResult` 6/7 · `RelayAccountState.budgetKrw?` · `AdminAccountView.costs?` · `summarizeAccountCosts`) + 테스트 · ROADMAP Phase 36 문구 갱신 | STATE 무접촉 |
| 1 | 36-02 relay 와이어 | 66/67 budget 파싱·병합 · 87 3필드 · 44 op 6/7 빌드 · 저널 4필드 · hub `liveBudgetOf` | |
| 1 | 36-03 DB | 열 4 + apply 재정의 + 부분 인덱스 · RPC 2종 + pgTAP | 타임스탬프 Pitfall 10 |
| 2 | 36-04 relay 어드민 | dispatcher `setAccountCost` · D-07 되싣기 · admin-api PUT×2 · GET account-costs(op 5 스로틀) | 36-02 뒤 |
| 2 | 36-05 server | PUT×2 프록시 · GET /users costs · GET /admin/pnl · GET /api/pnl | 36-01·36-03 계약 |
| 3 | 36-06 webapp 어드민 카드 | 3칸 · 칩 · 불일치 줄 | |
| 3 | 36-07 webapp 주문가능 | 계좌 패널 요약 줄 · 수동주문 행 · 상따 경고 | |
| 3 | 36-08 webapp 손익 | `/admin/pnl` · `/me` 손익 탭 · 사이드바(Phase 35 커밋 뒤) · E2E | |
| 4 | 36-09 배포·UAT | [메인 세션] DB push → relay(20:00 KST 뒤) → server → webapp push · 라이브 UAT · 두 인박스 done(경로 지정 커밋) | executor 는 지시까지만 |

## Sources

### Primary (HIGH confidence — 이번 세션 직접 읽음)
- `relay/src/generated/stock-dma/{admin-command-req,admin-account,account-state,journal-record}.ts` — 접근자·빌더·슬롯
- `relay/src/generated/StockDMA.fbs` diff — SYNC 7824e51b · 말미 append 주석
- `relay/src/admin/{types,planner,dispatcher,admin-api,admin-conn}.ts` · `relay/src/dma/envelope.ts`(2372-2486 · 3320-3500) · `relay/src/hub/subscription-hub.ts`(728-746 · 987 · 3308-3350 · 3680-3730) · `relay/src/journal/{types,writer,codec}.ts` · `relay/tests/helpers/frames.ts`
- `packages/shared/src/{admin,order-endpoint,relay,lc-amount,order-timeline}.ts` · `packages/shared/package.json`
- `server/src/routes/{admin,orders,accum-report}.ts` · `server/src/services/relay-admin-client.ts` · `server/src/app.ts`
- `supabase/migrations/20260924200000_dma_journal_tables.sql` · `20261004090100_dma_journal_apply_skipped_rows.sql` · `20260929190000_dma_gateway_identities.sql` · `20261027200100_launch_gate_apply.sql`
- `webapp/src/components/{admin/account-editor,orderbook/account-panel,trading/card/manual-order-form,trading/limit-chaser-form,trading/me-client,trading/workbench/trading-workbench}.tsx` · `webapp/src/lib/use-relay-socket.ts` · `webapp/src/components/admin/use-field-save.ts`
- `docs/inbox/from-gh-trade/261027-account-budget.md` · `261027-account-pnl.md` · `README.md`
- `.planning/phases/36-account-budget/{36-CONTEXT.md, reference/mockup-account-budget.html}`
- `/Users/alex/repos/gh-trade/.planning/phases/41-account-budget/41-CONTEXT.md` D-10~D-20 · D-25 · D-33
- 도구 확인: `npx tsc -p relay/tsconfig.tests.json`(현재 2건 실패) · flatbuffers@25.9.23 builder.js:197-202 · docker/supabase/gcloud 버전

### Secondary (MEDIUM)
- 없음(외부 웹 조사 불필요 — 신규 라이브러리 없음)

### Tertiary (LOW)
- Assumptions Log A1~A7

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 패키지 없음, 기존 버전 확인
- Architecture: HIGH — 모든 통합 지점 줄 단위 확인, 선례(Phase 29/30/34) 직접 읽음
- Pitfalls: HIGH — typecheck 실패·병합 누락·integer overflow 는 도구/코드로 확인. 마이그레이션 순서(A3)만 MEDIUM

**Research date:** 2026-10-27
**Valid until:** 2026-11-10 (Phase 35 가 같은 파일을 계속 바꾸는 중 — 플랜 직전 `git log` 로 사이드바·app.ts·마이그레이션 최신 확인)
