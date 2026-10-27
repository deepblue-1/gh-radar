# Phase 36: 계좌별 주문가능 금액 - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade Phase 41 계약 **두 인박스**(`261027-account-budget.md` · `261027-account-pnl.md` · fbs SYNC MARKER **7824e51b**)를 받아, ① **어드민이 계좌별 예수금(원 · 화면 만원) · 수수료(%) · 매도세(%) 를 설정**하고(44 op 6 SetAccountBudget · op 7 SetAccountFee · 전 등록 서버 fan-out · op 3 뒤 되싣기 · 87 `budget_krw`·`fee_ppm`·`sell_tax_ppm` 파싱), ② **웹 주문 화면(계좌 패널 · /me 잔고 탭 · 수동주문 폼 · 상따 카드)이 「주문가능 금액」을 실시간 표시**하며 초과는 경고만 하고(차단 · alert 없음), ③ **서버가 체결마다 예수금을 실현손익·수수료·세금만큼 스스로 조정**한 값을 66/67 `budget_krw`(한도 전용 67 델타 포함)로 받아 relay 가 항목 병합 위에 마지막 값으로 덮으며, ④ **주문 저널(80 JournalRecord) 말미 손익 4필드**(`avg_price`·`fee_krw`·`tax_krw`·`realized_pnl_krw`)를 relay 가 파싱해 DB 컬럼에 적재하고 **「일자별 매매손익」 페이지**(`/admin/pnl` 어드민 전용 전 계정·계좌 + `/me` 「손익」 탭 내 계좌)를 만든다. 마지막으로 라이브 UAT 뒤 두 인박스 노트를 `status: done` 으로 닫는다.

**용어(사용자 결정 2026-10-27):** 화면에서는 「한도」 대신 **「예수금」** 이라고 부른다(와이어 `budget_krw` · gh-trade 문서 · ROADMAP 의 「한도」 = 같은 것). 이 CONTEXT 의 「예수금」 은 전부 `budget_krw` 다.

**ROADMAP 범위 확장(플래너가 반영):** 로드맵 Phase 36 요약 · 성공 기준은 ①② 만 적혀 있다. 사용자 결정으로 ③④(비용률 op 7 · 체결 자동 조정 67 · 저널 4필드 · DB · 매매손익 페이지 2곳)가 **같은 Phase 36** 에 들어온다. 플래너는 ROADMAP Phase 36 Goal · Success Criteria · Depends on(인박스 `261027-account-pnl.md` 추가 · SYNC 7824e51b)을 `gsd_run query` 핸들러 또는 직접 편집으로 고친다(Phase 32 선례). 성공 기준 초안: 1 목업 확인(완료 — 아래 D-00) · 2 relay(op 6·op 7 송신 · 87 3필드 · 66/67 budget 마지막 값 덮기 · 저널 4필드 · op 3 뒤 op 6/7 되싣기) · 3 server/shared(어드민 쓰기 경로 2종 · 응답 계약 · bigint↔JSON) · 4 DB(주문 이벤트 컬럼 4 · 일자 집계 RPC) · 5 webapp(어드민 카드 3칸 · 계좌 패널 요약 줄 · 수동주문 행 · 상따 경고 · `/admin/pnl` · `/me` 손익 탭) · 6 라이브 UAT + 두 인박스 done.

**gh-trade 서버는 이미 배포됨(2026-10-27 20:42, KB120 · 교보119, v1.0-893-g2d5bc207).** 두 서버가 op 6 · op 7 을 받고 87/66/67/저널에 새 필드를 싣는다. 현재 값: 교보 10279758101 예수금 7억 · fee 500 · tax 2000, KB 37728502101 · 37703857101 예수금 미설정 · fee 100 · tax 2000. 내일 장중 체결부터 저널에 손익 값이 쌓인다. relay 배포 시점은 gh-radar 판단(append-only 라 순서 무관).

</domain>

<decisions>
## Implementation Decisions

### 목업 채택 (D-00)
- **D-00: 목업 `reference/mockup-account-budget.html` 채택 — ①~④ 그대로, ⑤ 는 A 안.** 화면 ① 어드민 계좌 카드 「예수금 · 수수료 · 매도세」 상시 행 + 상태 6종 · ② 계좌 패널 요약 줄 「주문가능 / 예수금」 · ③ 수동주문 폼 주문가능 행 + 초과 검증 줄 · ④ 상따 카드 금액 3칸 합산 경고 · ⑤ 일자별 매매손익 **A**(일자 행 한 줄 + 펼침 종목별 합) × 문맥(`/admin/pnl` · `/me` 손익 탭) · 기간 7/30/90일·이달. 사용자 검토 2026-10-27(「5번은 A안으로. 나머지는 OK」). UI-SPEC 은 이 목업을 옮긴다. 목업 안의 「한도」 는 전부 「예수금」 으로 바꿔 두었다.

### 어드민 계좌 카드 — 예수금 · 수수료 · 매도세 칸
- **D-01: 카드에 상시 노출 · 즉시 저장.** 지점·트레이더(·IP/MAC) 줄 아래 한 행 「예수금 [ 1,000 ] 만원 · 수수료 [ 0.01 ] % · 매도세 [ 0.2 ] %」(폰은 예수금 1줄 / 수수료·매도세 2줄)이 편집 모드와 무관하게 항상 보인다. 서버 체크 토글·주문 서버 세그먼트와 같은 `useFieldSave` 즉시 저장 리듬(Phase 29 D-15) — Phase 30 D-01 편집 모드(op 3 카드 저장)에는 **넣지 않는다**(예수금·비용률은 op 6·op 7 전용). 캡션 한 줄 「예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제」. 교보 계좌도 같은 칸(비용률·예수금은 증권사 무관).
- **D-02: 입력·저장 트리거.** 네이티브 숫자 입력칸(`inputmode="numeric"`/`decimal` · 천단위 콤마 표시 · 넘버패드 시트 없음 · 저장 버튼 없음). **Enter 또는 포커스 이탈** 때 저장, 바뀐 게 없으면 미전송(서버도 멱등 「변경 없음」), 보내는 동안 그 칸 잠금. 예수금: 만원 정수 → 원(`×10000`) ulong, 빈 칸/0 = 해제(op 6 `budget_krw` 0). 수수료·매도세: **% 소수 입력(0.01 · 0.2 · 소수 4자리 = 1ppm)** → 저장 전 ppm 정수 반올림, 표시는 87 ppm → %. 범위 0~1%(0~10000ppm)는 **클라가 막는다**(범위 밖은 보내지 않음 · 칸 빨간 테두리 + 오류 한 줄, Phase 30 D-04 동형). **어느 비용률 칸이든 저장 때 두 값을 함께 op 7 로 보낸다**(op 7 이 두 값을 한 번에 씀 · (0, 0) = 해제). — **Reversibility:** reversible.
- **D-03: 등록 서버 간 87 값 불일치 — Phase 30 D-10 동형 · 문구 중립.** 칸에는 (유효) 주문 서버의 87 값, 아래 다른 서버마다 경고 줄 「KB121 은 500만 — 저장하면 등록 서버가 모두 같아져요」(`OrderEndpointMismatchLines` · `WARN_LINE` 재사용 · 원인 단정 없음 — A 안으로 체결 조정이 서버마다 따로 가므로 정상 운영에서도 갈라질 수 있다). 수수료·매도세도 같은 규칙(「KB121 은 0.05% · 0.2%」). 저장하면 등록 서버 전부에 같은 값. 두 서버 동시 운영은 Phase 29 이월 「켜기 전 결정」 에 「예수금 갈림」 항목을 더한다(STATE Blockers).
- **D-04: 정본은 서버 87/67 — DB 의도 저장 없음(IP/MAC 동형).** 예수금·비용률은 Supabase 의도 표에 넣지 않고 PUT 요청에서 relay 로 바로 넘긴다(Phase 30 D-15 경로). 「다시 반영」(reconcile)은 예수금·비용률을 건드리지 않고, 「미반영」 drift 판정에도 넣지 않는다(shared `sameValues` · `fieldsOf` 무관). 이유: 서버가 체결마다 `budget_krw` 를 스스로 바꾸므로 DB 의도가 있으면 늘 어긋나 「미반영」 이 상시 켜지고 reconcile 이 정산된 값을 덮어쓴다(사용자가 처음 고른 「DB 의도 저장」 을 이 근거로 철회 · 2026-10-27). — **Reversibility:** reversible(DB 변경 없음).
- **D-05: 카드가 보이는 「현재 예수금」 출처.** 체결 조정은 users_rev·87 없이 **한도 전용 67** 로만 온다(gh-trade D-29 합의 · 체결마다 87 보내지 않음). 그래서 어드민 개요는 ① relay 에 그 계좌의 67 캐시(`#accountStates`)가 있으면 그 `budgetKrw`, ② 없으면 87 값. 어드민 개요 GET(`/api/admin/users` → relay) 때 각 서버에 **op 5 로 87 을 다시 받는다**(스로틀 · 실패면 캐시). 비용률은 87 만 본다(67 에 없음).
- **D-06: 86 code 1 표시.** 구 서버(op 6/7 모름)와 범위 밖(gh-trade 가 message 를 「비용률 범위 밖(0~10000ppm)」 · 「예수금 범위 밖(…)」 으로 구별) 모두 code 1 — 칩 「서버 미지원 · <서버 message 원문>」(err 톤). message 문장 대조 없음(Phase 30 D-11 유지). `interpretAdminResult` 의 op 타입에 6 · 7 을 추가(code 0 만 ok). 나머지 code 5/8/10/11 은 기존 실패 칩 + 서버 문구.
- **D-07: fan-out · 되싣기.** op 6/op 7 fan-out 대상 = DB 등록 서버 전부(`#serverKeysOf` 현행 · 꺼진 서버 skipped · 미접속 offline 칩). **op 3(op 1 신규 유저 첫 계좌 포함) 성공 뒤** 그 서버에 처음 생긴 계좌(87 예수금·비용률 0)에 **다른 서버 87 의 값으로 op 6 · op 7 을 이어 보낸다**(IP/MAC R3-02 되싣기 동형 — 단 이번엔 **서버 간**). 출처 서버가 여럿이고 값이 다르면 주문 서버 값 우선, 없으면 첫 등록 서버. 다른 서버에 값이 없으면(전부 0) 보내지 않는다. 같은 값이면 서버가 「변경 없음」.

### 주문가능 표시
- **D-08: 계좌 패널 보유 표 위 요약 줄.** `account-panel.tsx` 의 보유 종목 표 바로 위 한 줄 「주문가능 **1,234만** / 예수금 2,000만」(주문가능 강조 15/600 · 예수금 흐림). 머리가 숨겨진 /me 잔고 탭(`hideAccountHeader`)에서도 같은 자리. 미설정(`budget_krw` 0) = 「주문가능 — / 예수금 미설정」 흐림 · 경고 없음. 구 서버 프레임(슬롯 없음 = 0)도 같은 표기.
- **D-09: 초과는 0 + 빨강(WinForms 동형).** 값 = `max(0, 주문가능)`, 음수면 「0만」 을 `--destructive` 로. 표기는 **원/10000 내림 · 천단위 콤마**(gh-trade D-14 — 두 클라 같은 숫자). 억 표기 없음.
- **D-10: /me 는 잔고 탭만.** 계좌 패널 한 부품이라 자동 포함. 현황 탭 상태줄(`MeStatusBar`) · 작업대 상단 줄은 무변경(deferred).
- **D-11: 계산식 = 인박스 그대로(gh-trade D-11~D-13).** 주문가능(원) = `budget_krw − Σ(HoldingState.avg_price × stock_qty) − Σ(UnfilledState side "B" ∧ !pending_cancel_sent 의 unfilled_qty × price)`. 매도 미체결 제외 · 매수는 KRX·NXT · 예약 요약 행 · 접수대기 행 포함 · `price` 0 이면 그 종목 현재가(웹 `quotes` 캐시 · KRX → NXT · `holdingQuotePrice` 선례), 없으면 0(상한가 금지). `budget_krw` 0 = 미설정. 계산·포맷 함수는 **shared 한 벌**(webapp · relay 테스트가 같은 것을 읽는다 · Phase 31 D-02 선례). 계산 위치는 Claude 재량(기본: 웹 — WinForms 클라 계산 동형 · 66/67 · 시세 · 계좌 변경 때 재계산 · price 0 매수 미체결이 있을 때만 1초 주기 재계산, gh-trade 41-02 동형).

### 초과 경고 (차단 · alert · 토스트 없음)
- **D-12: 수동주문 폼(`manual-order-form.tsx`) — WinForms D-16·D-18 동형.** 주문금액 행 바로 밑에 **「주문가능 1,234만」** 행(같은 라벨 열 · 읽기 전용). **매수**이고 예수금 설정됨이고 `주문금액(원) > 주문가능(원)` 이면 그 값 `--destructive` 빨강 + 기존 검증 줄 채널(`priceIssue` · `role="status"`)에 「주문가능 초과: 1,500만 > 1,234만」. **버튼은 활성 유지 · 주문은 그대로 나간다**. 매도는 판정 없음. 미설정은 「—」 · 줄 없음. 수량·가격·계좌·66/67·시세가 바뀔 때마다 재판정. 토스트(alert-toasts) 없음.
- **D-13: 상따 카드 등록 — WinForms D-19 동형.** 켜진 금액 칸 합(선매수 금액 + 줄매수 금액(켜짐) + 후매수 금액(켜짐) · 만원 → 원) > 주문가능이면 **등록은 그대로** 하고 선매수 금액 값 빨강 + 안내 줄(warn 톤 · 비차단 · 기존 안내 줄 자리) 「주문가능 초과: 상따 합 2,000만 > 1,234만 — 등록은 그대로 돼요」. 값 바꿀 때마다 색·줄 재판정(로그 없음). 합이 내려오면 기본색.

### 실현손익 · 비용률 (gh-trade 41-03 · 41-04 합의 — 2026-10-27, gh-trade 세션과 사용자 직접 결정)
- **D-14: A 안 수용 — 서버가 체결마다 `budget_krw` 자체를 조정한다(영구).** 매수 체결: 예수금 −= floor(qty×px×fee_ppm/1e6). 매도 체결: 예수금 += round(qty×(px − 직전 평단)) − floor(수수료) − floor(qty×px×sell_tax_ppm/1e6). 0 이하면 1원, 미설정(0) 계좌는 안 바뀜. 평단 모르는 매도는 수수료·세금만 뺀다. 사용자 답 「예수금 설정 시점부터 누적」 과 같은 뜻(어드민 재설정 = 정산). **그 체결의 67 은 조정 전 값, ≤100ms 뒤 한도 전용 67(빈 벡터 · is_snapshot=false)이 새 값, 1~2초 뒤 한 번 더(늦은 옛 값 보정) → relay · 웹 모두 `budget_krw` 를 마지막 값으로 덮는다.** relay `#mergeAccountState`(subscription-hub.ts 3694~)는 델타에서 객체를 필드별로 재조립해 새 필드가 **누락되는 구조** — `budgetKrw` 를 명시적으로 옮기고(델타에 실린 값으로 덮기), 웹 `mergeAccount`(`...next` 스프레드)와 「두 곳 동일」 주석 유지. 사용자 세션이 아닌 계좌(웹 로그인 없음)는 relay 에 67 이 없다 — D-05 의 87 폴백. — **Reversibility:** reversible(서버 계약은 gh-trade 몫 · relay 는 값 전달만).
- **D-15: 저널 손익 4필드 → DB.** relay 저널 파서가 `JournalRecord` 말미 `avg_price`·`fee_krw`·`tax_krw`·`realized_pnl_krw`(long · E 레코드만 값 · 옛 레코드 0)를 읽어 이벤트 JSON 키 **이름 그대로** 싣고, 주문 이벤트 표에 **bigint 컬럼 4개(기본 0)** 마이그레이션. 계정 귀속 `dma_user_id`(재기동 뒤 "" 가능) · 일자 `trade_date`(KST). — **Reversibility:** one-way — DB 마이그레이션 + relay 이벤트 JSON 키가 계약이 된다(키 이름은 gh-trade 와 합의 완료 · 바꾸려면 append-only 새 필드).
- **D-16: 생성물 커밋 · 인박스 · 배포.** 작업 트리의 미커밋 생성물 4파일(`relay/src/generated/StockDMA.fbs` · `stock-dma/admin-account.ts` · `admin-command-req.ts` · `journal-record.ts` · SYNC MARKER 7824e51b)과 노트 `docs/inbox/from-gh-trade/261027-account-pnl.md` 를 **Phase 36 첫 태스크로 경로 지정 커밋**(`git add -A` 금지 · 동시 세션 주의). 두 노트(`261027-account-budget` · `261027-account-pnl`)는 라이브 UAT 뒤 `status: done` · `done_commit` 으로 닫는다(마지막 플랜 태스크). 배포 순서: DB → relay(20:00 KST 뒤 · `dangerouslyDisableSandbox`) → server → webapp push(= 프로덕션 · relay 뒤). gh-trade 서버는 이미 배포돼 있어 relay 를 먼저 올려도 뒤에 올려도 안전.

### 일자별 매매손익 페이지
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### gh-trade 계약 (정본 — 인박스)
- `docs/inbox/from-gh-trade/261027-account-budget.md` — op 6 SetAccountBudget · 86 code 표 · 87/66/67 `budget_krw` · op 3 보존/복사/0 규칙 · 67 한도 전용 델타 · 계산식 · 구 서버 code 1. **UAT 뒤 done 처리 대상.**
- `docs/inbox/from-gh-trade/261027-account-pnl.md` — 41-03 op 7 SetAccountFee(`fee_ppm`·`sell_tax_ppm` · 범위 밖 code 1) · 체결 예수금 자동 조정 시맨틱(조정 전 67 → 한도 전용 67 · users_rev·87 미갱신) · 41-04 JournalRecord 24~27 필드 · 「추가 — 코드 리뷰 수정 뒤 동작 변화」 절(67 1~2초 뒤 재전송 · code 1 message · 평단 모르는 매도). **UAT 뒤 done 처리 대상.** 작업 트리 미커밋 — D-16.
- `docs/inbox/from-gh-trade/README.md` — 노트 형식 · done 처리 규칙(경로 지정 커밋).
- `relay/src/generated/StockDMA.fbs` — SYNC MARKER 7824e51b · `AccountState.budget_krw`(942~) · `AdminAccount`/`AdminCommandReq` 말미(1841~1870) · `JournalRecord` 24~27. 생성 접근자: `relay/src/generated/stock-dma/account-state.ts:80 budgetKrw()` · `admin-account.ts:72` · `admin-command-req.ts:57` · `journal-record.ts`(avgPrice·feeKrw·taxKrw·realizedPnlKrw) — 전부 bigint.
- `/Users/alex/repos/gh-trade/.planning/phases/41-account-budget/41-CONTEXT.md` — gh-trade 쪽 결정 D-01~D-24(특히 **D-11~D-20 클라 계산·표시·경고 — 웹 동형 기준**) · 41-03/41-04 는 인박스 노트가 정본.
- `/Users/alex/repos/gh-trade/docs/features/account-budget.md` — 계산식 ⑦ · 경고 규칙 · 화면(WinForms). `/Users/alex/repos/gh-trade/docs/features/order-journal.md` 「JournalRecord 27 필드」.

### 목업 · 선행 phase 결정
- `.planning/phases/36-account-budget/reference/mockup-account-budget.html` — **채택 목업**(D-00): ①~④ 그대로 · ⑤ A. 상단 「화면」 ①~⑤ · 「기기」 폰 390/데스크톱 1120 · 「테마」 · 상태/문맥/안 토글. UI-SPEC 은 이 목업을 옮긴다.
- `.planning/milestones/v1.0-phases/29-dma-multi-server-admin/29-CONTEXT.md` D-05(DB 의도 vs 87 반영 — 예수금·비용률은 **예외**, D-04) · D-15(즉시 저장 · 결과 칩) · D-23 ④⑤(서버 문구 그대로 · op 4 code 8).
- `.planning/phases/30-kb-ip-mac/30-CONTEXT.md` D-01·D-02(편집 모드 — 이번엔 안 씀) · D-04(클라 검증 모양) · D-06(결과 표시) · D-10(서버 간 불일치 — D-03 동형) · D-11(message 문장 대조 없음) · D-15·D-16(op 5 재조회 · 되싣기 — D-07 선례).
- `.planning/phases/32-account-axis/32-CONTEXT.md` D-20~D-24(/me 계좌 칩 · 잔고 탭 한 벌 · `hideAccountHeader`) — /me 손익 탭 · 잔고 탭 요약 줄의 틀.
- `.planning/phases/31-limitchaser-amount-unit/31-CONTEXT.md` D-02(shared 환산 한 벌) · D-07(두 줄 행 · 만원 표기) · 상따 카드 금액 칸 이름.
- `.planning/phases/34-accum/34-CONTEXT.md` · `/analytics/accum` 구현 — 「행 한 줄 + 펼침」 보고서 · 목록/상세 분리 RPC 선례(D-18 · D-19).

### 운영 규칙(메모리 · CLAUDE.md)
- 배포: relay 먼저 · push 나중(push = 프로덕션) · 20:00 KST 뒤 · 배포 명령은 허용 규칙 접두사 그대로 · 서브에이전트 배포 금지(메인 세션).
- Supabase: 새 RPC 는 `REVOKE anon/authenticated` 명시 · RLS `TO anon, authenticated`.
- 동시 세션: `git add -A` 금지 · 긴 execute 는 전용 worktree · vitest `--maxWorkers=2` · playwright `--workers=1`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webapp/src/components/admin/account-editor.tsx` — `AccountRow`(590) · `useFieldSave`(`use-field-save.ts`, `{state, run, results, error, errorCode, value}` · 비행 1건 · 마지막 값만 큐) · `RESULT_CHIP`/`chipOfResult`(196~204 · outcome 기준, message 원문) · `WARN_LINE`(421) · `OrderEndpointLine`/`OrderEndpointMismatchLines`(477/499) — D-01·D-03 의 본체. `editSaveBodyOf`(563~588)는 op 3 전용이라 건드리지 않는다.
- `packages/shared/src/admin.ts` — `AdminAccountFields`(89~105 · budget/fee 없음) · `AdminAccountView.orderEndpoints?: Record<serverKey, …>`(223 · 서버별 값 선례) · `AdminServerResult`(315) · `interpretAdminResult(op 1|2|3|4|5, code)`(523~528 → 6·7 추가) · `REFLECT_LABEL`(186). `packages/shared/src/order-endpoint.ts` `summarizeOrderEndpoint`(121~153 · 주문 서버 기준 불일치 판정 — 예수금·비용률 동형 함수).
- `relay/src/admin/types.ts` `ADMIN_OP`(26~32 · 1~5) · `ADMIN_CODE`(38~59) · `AdminCommandInput`(103~112). `relay/src/dma/envelope.ts` `buildAdminCommandReq`(3338~3361 · `addBudgetKrw`/`addFeePpm`/`addSellTaxPpm` 미호출) · `parseAdminUsersSnapshot`(3393~3437) · `parseAccountState`(2372~2486) · `toNum(bigint)`(315~326 · 안전 범위 클램프) · `SetVITrigger.addOrderAmountKrw(BigInt(...))`(1787 · 아웃바운드 ulong 선례).
- `relay/src/admin/planner.ts` `withServerEndpoint`(82~85 · 우선순위 override > 내 87 > 다른 유저 87) · `otherByNo`(114~135 · R3-02 같은 서버 되싣기) · op 순서 1→3→4(137~161). `relay/src/admin/dispatcher.ts` R3-01 op 5 재조회(313~328) · `#fanOut`/`#serverKeysOf`(446~462 · 532~534) · `#applyServer`(346~356) · `reconcileUser`(169~185).
- `relay/src/hub/subscription-hub.ts` `#accountStates`(987) · `#mergeAccountState`(3694~3735 · **델타 재조립 — budgetKrw 명시 필요**). `webapp/src/lib/use-relay-socket.ts` `mergeAccount`(1570~1605 · `...next`) · `RelayConnectionState.accountStates`/`quotes`(429 · 454). `packages/shared/src/relay.ts` `RelayAccountState`(1177~1197) · `RelayUnfilled`(1124~1174 · `pendingCancelSent` · `queuedStatus`).
- `webapp/src/components/orderbook/account-panel.tsx`(props 221~323 · `account` · `currentPrice` · `priceOf` · `hideAccountHeader` · 보유 뷰 431~449 `cost = qty×avgPrice`) — D-08 요약 줄 자리. `webapp/src/components/trading/card/manual-order-form.tsx`(주문금액 987~996 `KRW.format` · 주문계좌 999~1030 · `priceIssue` 881~888 `role="status"`) — D-12. 상따 카드 금액 3칸(`buyOrderAmount` 류) — D-13.
- `webapp/src/components/trading/me-client.tsx` `ME_TABS`(303) · 잔고 탭(483~526 · `priceOf` 미전달) · `MeAccountChips`(434~440) — D-10 · D-17 ②. `webapp/src/components/trading/workbench/trading-workbench.tsx` `holdingQuotePrice`(482~491 · KRX→NXT) · `priceOf`(1328) — D-11 현재가.
- 포맷: `packages/shared/src/lc-amount.ts formatManwon`(201 · 「N만」/「X.Y억」 — 억 섞임 · D-09 는 억 없음이라 **새 함수**) · `webapp/src/lib/vi-alert.ts krwToManwon`(36 · floor) · `limitup-lanes.ts`(109~113 「N,NNN만」). 톤: `--led-latent`(warn · globals.css 138/293) · `--destructive` · `reflect-chip.tsx`(30).
- 저널: `relay/src/journal/{writer,types,observer}.ts` · `relay/src/generated/stock-dma/journal-record.ts` · `supabase/migrations/20260929180000_dma_strategy_events.sql`(이벤트 표 선례) — D-15. `/analytics/accum` 목록·상세 RPC 분리 · 행 펼침 부품 — D-18·D-19.

### Established Patterns
- 어드민 값은 「DB 의도 vs 87 반영」(Phase 29 D-05)이 기본이지만 IP/MAC 은 87 정본 + 요청 통과(Phase 30) — 예수금·비용률은 **후자**(D-04).
- 86 code → 칩은 outcome 기준 · message 원문(문장 대조 없음). code 테이블은 relay `ADMIN_CODE` 상수뿐.
- 와이어 JSON 은 number(시장 D-34 `toNum`), ulong 식별자는 문자열(`usersRev`). 예수금은 원 단위라 안전 범위 안 — 선택은 플래너.
- Phase 31 D-02: 환산·서식 함수는 shared 한 벌, webapp · relay 테스트가 같은 것을 읽는다.
- relay 67 항목 병합은 relay·웹 두 곳 「반드시 동일」 주석 — 둘 다 고친다.

### Integration Points
- server `PUT /api/admin/dma-users/:dma/accounts` 옆에 예수금·비용률 쓰기 경로(새 라우트 또는 body 확장 — 플래너) → `relay-admin-client` → relay `admin-api.ts` → dispatcher op 6/op 7 fan-out → 86/87 → 칩.
- relay `GET /internal/admin/order-endpoints` 동형으로 서버별 예수금·비용률(+ 67 현재값) 제공 → `fetchOrderEndpoints`(server admin.ts 230) 옆.
- 웹 `{t:"acct"}` 프레임에 `budgetKrw` → `RelayAccountState` → 계좌 패널 · 수동주문 폼 · 상따 카드 · /me.
- 저널 writer → DB 이벤트 표 4컬럼 → 일자 집계 RPC → `/admin/pnl` · `/me` 손익 탭.

</code_context>

<specifics>
## Specific Ideas

- 사용자: 「한도가 아니라 **예수금**이라고 하자」 — 화면 용어 전부.
- 사용자(gh-trade 세션 경유): 「매도할 때마다 수익(손실)만큼 주문가능 금액에 반영, 수수료 뺀 수익 천만원이면 주문가능 +천만원」 → A 안 · 계좌별 수수료 · 매도세 ppm · 「거래마다 손익을 계산하게 됐으니 계정별/계좌별 일자별 매매손익 페이지도 gh-radar 와 같이」.
- 사용자: 매매손익은 「어드민 전용으로 전 계정/계좌 볼 수 있는 페이지도 만들고, /me 에 손익탭을 만들어서 내 계좌만 볼 수 있게도」 · 「둘 다 목업부터」 → ⑤ A 채택.
- WinForms 동형이 기본(메모리) — 숫자(만원 내림 · 0+빨강) · 경고(주문은 나감 · 로그 대신 검증 줄) · 상따 합산 판정.
- 목업 임의 결정(사용자 OK): ③ 주문금액을 만 단위로 그림(구현 단위는 재량) · ⑤ 수수료·세금 소수 1자리 · 「미상」 은 계정별만.

</specifics>

<deferred>
## Deferred Ideas

- **서버 간 예수금 동기화** — relay 가 체결 조정(한도 전용 67)을 받아 다른 등록 서버에 op 6 으로 밀어 맞추는 것. 경쟁 위험 · 지금은 계좌당 켜진 서버 1대라 불필요. 두 서버 동시 운영 「켜기 전 결정」(Phase 29 이월)에 「예수금 갈림」 항목 추가(D-03).
- **작업대 상단 줄 · /me 현황 상태줄에 주문가능 표시**(WinForms 메인폼 헤더 동형) — 잔고 탭만(D-10).
- **트레이더 본인용 매매손익 심화**(월 합계 · 종목별 기간 합 · CSV) — A 안 기본만.
- **과거분 손익 백필** — 저널 옛 레코드에 평단이 없어 불가 · 배포일부터(D-18).
- **수동주문 폼 주문금액 행 단위 통일(원 → 만)** — 재량 항목, 이번엔 주문가능 행만 추가.
- **어드민 예수금 변경 이력(DB 기록)** — 「DB 에 마지막 입력값만 기록」 안 기각(D-04) · 필요하면 audit 로그로.
- **gh-trade**: op 6 INT64_MAX 초과 code 1 메시지 · 평단 모르는 매도 pnl 규칙 — 인박스 추가 절로 이미 반영, gh-radar 변경 없음.

</deferred>

---

*Phase: 36-account-budget*
*Context gathered: 2026-10-27*
