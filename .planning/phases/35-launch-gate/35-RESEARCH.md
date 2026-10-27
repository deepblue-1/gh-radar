# Phase 35: 발사 경계 지도 어드민 (launch-gate) - Research

**Researched:** 2026-10-27
**Domain:** Postgres(plpgsql) 저널 원문 → 투영 표 해석 · 어드민 RPC/라우트 · 순수 SVG 점 지도 · 1회 백필 스크립트
**Confidence:** HIGH (코드베이스 근거 전부 이번 세션 실독) / 칸 매핑(kind 17·18)은 **미정** — 정식 인계 노트 미도착

## Summary

이 phase 는 새 외부 패키지가 하나도 없다. 전부 기존 경로의 확장이다 — relay 는 kind 를 해석하지 않고 43칸 원문을 `dma_strategy_apply` 로 넣으며(`relay/src/journal/strategy-stream.ts:169-176`), DB 쪽에는 이미 **「원문 INSERT 는 항상 남고 투영 실패는 그 이벤트만 되돌린다」** 는 선례(주문 저널 `dma_journal_apply` 의 포이즌 격리 T-19-15, `20261004090100_dma_journal_apply_skipped_rows.sql:121-131`)와 그 실패를 relay 가 로그 + `/healthz` 계수로 드러내는 배선(`relay/src/journal/writer.ts:616-622`)이 이미 있다. 따라서 **해석 위치는 `dma_strategy_apply` 재정의**가 정답이다 — 트리거는 실패가 원문 INSERT 문장을 통째로 깨뜨리고(배치 전체 실패 → relay 영구 재시도), 반환 `errors[]` 로 실패를 올릴 길이 없고, 반환 `rows` 에서 17·18 을 빼는(= ws fan-out 누설 차단) 일을 못 한다.

가장 중요한 발견 세 가지: ① **반환 rows 에서 17·18 을 빼면 relay 무변경으로 ws fan-out 누설이 원천 차단된다** — relay 는 apply 반환 rows 만 `journal.events` 로 푸시한다(`relay/src/index.ts:501`). 그러면 kind 17 이 `account_no` 칸에 실계좌를 실어도 안전하다(「다른 칸에 싣기」 우회 불필요). 다만 **누설 지점이 하나 더 있다** — 주문 펼침 타임라인 `dma_order_events_for_user`(`20260929190000_dma_gateway_identities.sql:266-269`)가 `account_no` + `order_no` 로 `dma_strategy_events` 를 조인하므로 kind 17 이 주문번호·계좌를 실으면 그 주문의 타임라인에 섞인다 → 같은 마이그레이션에서 `kind NOT IN (17,18)` 추가 필요. ② **D-01 논리 키 그대로면 A 프로파일 두 다리가 충돌할 수 있다** — A 의 09:00:27 KRX 매수와 09:00:30 NXT 매도는 같은 (날짜·서버·profile A·시장)이고 wire 가 다리마다 0 부터면 `(trade_date, gateway, profile, market, wire)` 가 겹친다. 키에 발사 기준(거래소)을 넣어야 한다(D-03 이 요구하는 열 그대로). ③ **Q16 「다음 오프셋」 은 `correction_after` 그 자체가 아니다** — gh-trade 문서상 발사 오프셋 = 보정치 − 편도(`Q {-151, 6, 201, …}` → step 5 반전 → −347µs, `gh-trade/docs/features/queued-order.md:154`). 지도의 세로 점선은 kind 18 에 **계산된 `next_offset_us`** 를 직접 실어 달라고 요구해야 한다.

경계·리본 계산은 첨부 `group()` 를 **shared 순수 함수 한 벌**로 이식해 relay 백필 도구(머리 계산)와 웹 지도(경계 띠·리본)가 같이 쓴다. 첨부 `pieces.json` 196행은 HTML 의 `ROWS` 와 순서까지 동일함을 이번 세션에 확인했고, 그 데이터에 대한 `group()` 결과(33발사 · 4패널 · 날짜별 lo/hi/분류)를 아래 「Code Examples」 에 기대값 표로 박았다 — D-10 자동 대조 테스트의 정답지다.

**Primary recommendation:** 마이그레이션 1(Wave A, 노트 불필요)에 표 2 · 조건부 upsert 헬퍼 2 · **no-op 투영 스텁 `launch_project_event(dma_strategy_events)`** · 포이즌 격리 + rows 제외로 재정의한 `dma_strategy_apply` · 재투영 `launch_reproject` · 백필 RPC · 어드민 RPC 2 · 가시성 3곳 제외를 넣고, 정식 인계 노트 도착 뒤 마이그레이션 2(Wave B)가 스텁만 `CREATE OR REPLACE` 하고 `launch_reproject` 로 그동안 쌓인 원문을 푼다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 적재 모델 (DB · kind 17·18 해석)
- **D-01: 표 2개 · 논리 키 · 최신 seq 우선 upsert.** `launch_pieces` 논리 키 `(trade_date, gateway, profile, market, wire)` · `launch_heads` 논리 키 `(trade_date, gateway, profile, market)` — 같은 키가 다시 오면(저널 재생 · 서버 재기동 재송신) **seq 가 큰 쪽이 이긴다**(멱등). 원문 `(gateway, journal_epoch, seq)` 를 풀린 행에 같이 보관(추적). 해석 위치(`dma_strategy_apply` 재정의 vs `dma_strategy_events` 트리거)는 리서치/플래너 재량(D-06 제약). — **Reversibility:** costly — 논리 키를 바꾸면 백필 스크립트 · 어드민 RPC · 자동 대조 테스트가 함께 바뀐다.
- **D-02: 계좌·사용자 열 그대로 저장 · 그대로 표시.** `account` · `user`(DMA 사용자) 를 마스킹 없이 저장하고 어드민 조각 표에 노출한다(어드민은 `app_users.role='admin'` 만 · Phase 29 `requireAdmin`). gh-trade 질문 ② 답.
- **D-03: 프로파일 Q16 · N · A 셋 다 받는다 — A 는 두 다리.** A 의 09:00:27 KRX 매수 조각은 **주문 내역에만**(지도 대상 아님). A 의 **09:00:30 NXT 매도 조각은 N 매수 조각과 같은 「09:00:30 NXT 발사」 지도에 합쳐** 그린다(매수 = 원 · 매도 = 마름모 · D-17). 그래서 조각 행은 `profile`(Q16/N/A) 과 별도로 **발사 기준 = 거래소 + 기준시각**(16:00 KRX · 09:00:27 KRX · 09:00:30 NXT) 과 `side` 를 가져야 한다 — 열 이름·표현(예: `fire_at_base` + `exchange` 또는 `leg`)은 플래너 재량이되 **gh-trade 정식 인계 노트의 kind 17 칸 매핑에 이 세 값(거래소 · 기준시각 · side)을 요구**한다(D-21). 지도 RPC 는 「09:00:30 NXT」 기준으로 profile 을 가로질러 묶는다. — **Reversibility:** one-way — gh-trade 와이어 칸 매핑에 들어가는 요구다. 빠지면 09:00:30 지도에서 매수/매도를 가를 수 없고 서버 재배포가 필요하다.
- **D-04: 머리는 kind 18 우선 · 백필만 조각에서 계산.** 라이브 `launch_heads` 행은 kind 18 값(n_pieces · n_accepted · n_101/n_515 · n_other · first_accept_idx · retries · abandoned · gate_lo/hi · nonmono · Q16 학습값 correction_before/after · step · last_dir · bracketed · same_dir_run · reject_span · jump · one_way · rtt_min) 그대로. 백필(D-07)은 머리 없이 조각만 오므로 **적재 스크립트가 조각에서 셀 수 있는 값만**(n_* · first_accept_idx · gate_lo = 101 조각 최대 rel · gate_hi = 접수 조각 최소 rel · offset_used = 첫 조각 rel · 기타 제외) 채우고 나머지는 null. 두 표 모두 `source` 열(`journal` | `backfill`) 로 출처를 구별한다. 라이브 kind 18 이 백필 행과 같은 키로 오면 D-01 규칙대로 최신이 덮는다.
- **D-05: 영구 보관 — 둘 다.** `launch_heads` · `launch_pieces` 와 `dma_strategy_events` 의 kind 17·18 원문 **모두 purge 없음**. `dma_strategy_events_purge_limit_feature` 의 `kind IN (15,16)` 은 그대로(17·18 추가 금지 · 단위 테스트로 고정). `dma_strategy_events_for_user_json` 에 `kind NOT IN (17,18)` 명시 추가, `isMarketStrategyEvent`(shared) 에는 17·18 을 넣지 않는다(사용자 전략 이벤트 · ws fan-out 에 새지 않게). `STRATEGY_EVENT_KIND` · fbs enum 주석은 정식 인계 노트 뒤 sync 만(와이어 무변경).
- **D-06: DB 쪽 해석의 제약.** relay 무변경 · 재생 멱등(D-01) · **kind 17 과 18 의 도착 순서 무관**(조각이 머리보다 먼저든 나중이든 두 표가 독립 upsert) · 한 배치(`p_events` 배열)에 17·18 이 섞여 와도 한 트랜잭션 · 해석 실패가 `dma_strategy_apply` 의 원문 INSERT 를 막지 않는다(원문은 항상 남는다 — 해석은 뒤에 재실행 가능). 칸 매핑은 정식 인계 노트가 정본 — 노트 도착 전에는 표 · RPC · 웹 · 백필을 먼저 만들고 해석 함수만 노트 뒤에 채운다(플래너가 웨이브를 그렇게 가른다).

#### 백필 (과거 발사 전부)
- **D-07: 범위 = 로그에 남은 전부 · 지금 바로 요청.** 사용자 지시 「지금까지 서버가 쐈던 데이터도 gh-trade 통해서 받아와서 저장」. 두 서버(KB120 사내망 로그 포함 — gh-trade 가 뽑는다) · 16:00 Q16 + 09:00:27 KRX(A 매수) + 09:00:30 NXT(N 매수 · A 매도) · 로그가 남은 가장 이른 날부터 가장 최근까지. **정식 인계 노트를 기다리지 않고** `scripts/trade-handoff.sh` 노트로 지금 요청한다(첫 플랜). 형식 = 풀린 필드명 ndjson(한 줄 = 조각 · 날짜 · 서버 · profile · 거래소 · 기준시각 · market · wire · queued_id/key · piece_idx · round · order_no · sent_rel_us · result · result_code · accept_time · retry · abandoned + 뽑히면 side · isin · price · qty). 첨부 `pieces.json`(10/12~10/26 16:00 196행)은 gh-trade 가 전체분을 줄 때까지의 1차 입력이자 자동 대조 기준(D-10).
- **D-08: 빈 열은 null · source='backfill'.** 로그 `[Launch] 조각` 줄에 없는 isin · side · 가격 · 수량 · 체결 · 계좌 · 사용자는 null 허용(조각 표 주문 속성 열 전부 nullable). 화면은 「—」. 09:00:30 매수/매도 구분은 gh-trade 가 로그에서 뽑을 수 있으면 넣어 달라고 요청 — 없으면 null 이고 그 날의 09:00:30 지도는 전부 원으로 그린다(범례에 「구분 없음」).
- **D-09: 적재 스크립트는 Claude 가 실행.** `scripts/` 에 tsx + supabase-js service role 스크립트(`scripts/export-accum-backfill.sh/.ts` 패턴 — relay 의 node_modules 로 실행 · env 파일 비출력 source) · 기본 dry-run(행 수 · 날짜별 집계 미리보기) → `--apply`. 머리는 조각에서 계산(D-04). 실행 전 명령을 사용자에게 보여 준다. 재실행은 D-01 upsert 로 멱등.
- **D-10: 적재 후 대조 = 자동 + 눈.** 단위 테스트가 첨부 `pieces.json` 196행을 넣었을 때 날짜·서버·시장별 조각 수 · 경계 lo/hi · 날짜 수 · 「전부 접수/전부 101/경계」 분류가 첨부 `launch-gate-map.html` 의 JS 계산(`group()`)과 일치함을 단언. 적재 뒤 어드민 지도(10/12~10/26)를 사용자가 첨부 지도와 나란히 보고 확인(UAT 항목).

#### 주문 내역 화면 (채택 목업 `reference/mockup-launch-orders.html` · 변형 A · 메뉴 1개+탭)
- **D-11: 사이드바 Admin 그룹에 항목 1개 「발사」.** `/admin/launch` · 「서버」 다음 · `item="admin-launch"`(e2e 선택자 `[data-sidebar-item^="admin-"]`) · `app-sidebar.test.tsx` 순서 배열 · `sidebar-tree.spec.ts` `TREE_LINKS` · `ADMIN_SUB_ITEMS` 갱신. 페이지 안 **탭 2개 「주문 내역 | 경계 지도」**(`?tab=orders|map` 딥링크 · 기본 orders · shadcn `tabs`). 어드민 접근 게이트는 기존 `ADMIN_PREFIX` 미들웨어 그대로.
- **D-12: 변형 A — 서버×시장 섹션.** 컨트롤 줄 = 날짜 알약(`LimitupDateNav` 재사용 · `?d=YYYYMMDD` · 날짜 목록 = `launch_pieces` 에 행 있는 날짜) + 세그먼트 「16:00 예약 | 09:00:30 개장차익」(`?fire=` 재량) + 출처 칩 「KB120 · KYOBO119 저널 80 · 16:00:01 / 09:00:31 적재」. 본문 = **머리 카드 4장**(순서 KB 코스닥 · KB 코스피 · 교보 코스닥 · 교보 코스피 — 첨부 ORDER 와 같다 · 발사 없는 조합은 「이 날 발사 없음」 빈 카드) → **서버·시장별 조각 표**(wire 순 · 발사 있는 조합만). 머리 카드 내용: 16:00 = 조각 수 · 결과(접수/101/기타 색) · 오프셋 · 경계(lo~hi / 전부 접수 · 첫 접수 µs / 전부 101) · 학습 → 다음 오프셋(step). 09:00:30 = 조각 수 · 결과(접수/거부/기타) · 오프셋(고정) · 재전송 합 · 다음 오프셋(고정). 09:00:30 탭에는 N · A 조각이 함께 실리고 A 09:00:27 KRX 매수 조각도 같은 표에 「발사」 열로 구별된다.
- **D-13: 조각 표 열 그대로.** wire · 예약·조각·라운드(Q16: `Q153015001 · j0 · R0` / N·A: `key · idx`) · 송신 µs(부호 · 천 단위) · 결과 알약(접수 초록 · 101/515 빨강 · 기타 회색) · 접수/응답 시각(HH:MM:SS.mmm) · 종목(이름 + 코드) · 구분(매수 `--up` / 매도 `--down`) · 가격 · 수량/체결 · 계좌 · 사용자 · 주문번호. 09:00:30 탭은 **발사**(N NXT / A 09:00:27 KRX→ / A NXT) · **재전송** 열 추가. null 은 「—」.
- **D-14: 폰 390 = 머리 카드 1열 + 조각 표 가로 스크롤.** 카드 행 배치 없음(어드민 도구 · 데스크톱 위주). 데스크톱 1280 은 카드 2열.

#### 경계 지도 화면 (채택 목업 `reference/mockup-launch-gate-map.html` · 프리셋 칩 · 리본 켬)
- **D-15: 날짜 범위 = 프리셋 칩.** 「최근 10일 · 20일 · 전체」(거래일 = `launch_pieces` 에 행 있는 날짜 기준 · 기본 최근 10일) + 실제 범위 텍스트 「10/12 ~ 10/26 · 11거래일」. 시작·끝 날짜 입력 부품은 만들지 않는다(사용자 결정 · 범위 입력은 deferred). 칩 옆 세그먼트 「16:00 예약 | 09:00:30 개장차익」. `?range=10d|20d|all` 딥링크 재량.
- **D-16: 첨부 지도 구성 전부 유지 · gh-radar 톤.** 범례 → **요약 카드 4장**(서버 시장 · N일 · 접수된 가장 이른 µs(초록) · 거부된 가장 늦은 µs(빨강) · 다음 첫 조각 µs(`--primary`)) → **서버×시장 4패널**(순서 KB 코스닥 · KB 코스피 · 교보 코스닥 · 교보 코스피) 각각: 패널 머리(경계 잡힌 날 n · 전부 접수 n · 전부 거부 n) · x = 발사 기준시각 대비 송신 µs(왼쪽이 이름 · 눈금 10/20µs) · 날짜 행마다 점(접수 `--ok` 채운 원 · 101/515 `--bad` 채운 원 · 기타 `--other` 빈 원 · 같은 µs 는 세로 4px 스태킹) · **그날 경계 띠**(마지막 101 ~ 첫 접수 · `--gate` · 전부 101 이면 빨강 띠 + 「경계는 이보다 뒤 →」 · 전부 접수면 초록 띠) · **다음 발사의 첫 조각 세로 점선**(`--primary` · 값 = 그 서버×시장 최신 `launch_heads` 의 다음 오프셋 — Q16 은 학습값 `correction_after`, N 은 고정) · **「쐈다면」 리본**(1µs 칸마다 날 수 비율 초록/회색/빨강 · 첨부 식 그대로) · 「날짜별 표 보기」 접힘(날짜 · 첫 조각 µs · 결과 알약 · 처음 접수 µs · 경계 µs · 조각 수). 경계 계산 규칙 = 첨부 `group()`: lo = 101(515) 조각 rel 최댓값 · hi = 접수 조각 rel 최솟값 · **기타 거부는 제외** · 둘 다 있으면 「경계」, hi 만 「전부 접수」, lo 만 「전부 거부」. 범위 안에 발사가 없는 조합은 패널 머리만 + 「이 범위에 발사 없음」. 푸터 한 줄(조각 간격 0/+10/+20µs → 10/22부터 0/+10/+30µs · 기타 거부 제외).
- **D-17: 09:00:30 지도 = 합패널.** 같은 4패널에 **N 매수 = 원 · A 매도 = 마름모**(채움 색은 결과 색 그대로) · 101 · 515 같은 `--bad` · 「다음 첫 조각」 선 = 고정 오프셋(119 −200 · 120 −245µs) · **재전송(515 ×3)은 첫 발 송신 시각만 점** · 재전송 횟수는 툴팁(「10/26 −20148µs · wire 0 · 매수 · 101 · 재전송 2」). 범례에 「마름모 = A 매도 · 동그라미 = N 매수」. x 축 폭이 좁으므로(µs 수십) 눈금 2µs · 리본 칸 0.2µs(목업 규칙). side 가 null 인 백필 날은 전부 원(D-08).
- **D-18: 폰 390 = SVG 640px 고정 폭 가로 스크롤 · 요약 카드 2열.** 축소 없음. 데스크톱은 패널 폭 100%(viewBox 760 비율 유지 · `useChartWidth` 1:1 여부는 플래너 재량 — 글자 11px 가 읽히면 됨).
- **D-19: 순수 SVG.** Phase 33 D-12 · Phase 34 결 그대로(lightweight-charts 아님). 상호작용은 `<title>` 툴팁뿐(확대/축소 · 드래그 없음).

#### 서버 (어드민 라우트 2개)
- **D-20: `requireAuth() → requireAdmin()` 라우트 2개 · RPC 1회씩.** ① 주문 내역 `GET /api/admin/launch/orders?d=YYYYMMDD` → `{dates[], date, heads[], pieces[]}`(그 날 전 프로파일 · 웹이 16:00/09:00:30 으로 가른다 · 행 없는 날 직접 진입은 빈 배열 · `d` 없으면 최신) ② 지도 `GET /api/admin/launch/map?range=10d|20d|all&fire=q16|n0930` → `{days[], heads[], pieces[]}`(범위 안 조각 전부 + 서버×시장별 최신 머리 — 경계 · 리본 계산은 웹 · 또는 RPC 가 날짜별 lo/hi 를 미리 계산 — 플래너 재량 · 왕복 1회 원칙 [[project_cloudrun_egress_roundtrip_cost]]). RPC 는 SECURITY INVOKER · `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` · `GRANT TO service_role` 명시 · `launch_*` 표는 RLS 켜고 정책 0개(service_role 전용 · Phase 33 D-06 결). 라우터는 `adminRouter`(`server/src/routes/admin.ts`) 에 합치거나 `admin-launch.ts` 신설 — 마운트 순서 주석(`app.ts:118-123`) 지킨다. 서버는 snake_case 통과.

#### 인박스 · gh-trade 회신 · 배포 · UAT
- **D-21: gh-trade 에 요청할 것(첫 플랜 · `scripts/trade-handoff.sh launch-gate-contract` 노트 + SendMessage 보조).** ① **백필 ndjson 지금**(D-07 형식 · 두 서버 · 로그 전부 · 09:00:30 side 포함 요청). ② 정식 인계 노트의 kind 17 칸 매핑에 **발사 기준(거래소 + 기준시각) · side · profile · market · wire · queued_id/key · piece_idx · round · order_no · sent_rel_us · result · result_code · accept_time · retry · abandoned · isin · price · qty · filled_qty · account · user** 가 실리게, kind 18 에 **다음 오프셋(Q16 correction_after · N 고정값) · gate_lo/hi · n_* · first_accept_idx · 학습값** 이 실리게 요구. ③ 서버 먼저 배포해도 안전함을 확인(relay 는 모르는 kind 도 원문 적재 · DB 해석 함수는 모르는 kind 무시). 회신은 인박스 노트 `## 회신` 에 적고, 정식 인계 노트 도착 → 해석 함수 구현 → 첫 실물 날짜 UAT 뒤 두 노트를 `status: done` · `done_commit` 경로 지정 커밋.
- **D-22: 배포 순서** = 로드맵 그대로: gh-trade 서버 먼저 배포 안전 → gh-radar DB 마이그레이션(표 · RPC · 해석 함수 · json 래퍼 제외 · purge 테스트) → 백필 적재(D-09) → server → webapp push(= 프로덕션). relay 재배포 없음(fbs enum · 주석 sync 만 · `sync-relay-schema.sh` 는 gh-trade 소유 [[reference_gh_trade_protocol_sync]]). 배포 · 적재 실행은 메인 세션([[feedback_subagent_deploy_classifier]]).
- **D-23: 라이브 UAT** = 첫 실물 날짜: 16:00:01 이후 relay 로그에 kind 17·18 적재 건수 · `launch_*` 행 · 어드민 주문 내역 당일 행 · 지도 「전체」 에 당일 행 + 다음 오프셋 선이 kind 18 값으로 바뀜. 09:00:31 도 같은 확인. 프로덕션 수동 주입 없음.

### Claude's Discretion
- 표 · 열 · RPC · 라우트 · 파일 · shared 타입 이름(`launch_pieces` · `launch_heads` · `launch_orders_for_admin` · `launch_map_for_admin` · `server/src/routes/admin-launch.ts` · `webapp/src/app/admin/launch/page.tsx` · `webapp/src/components/admin/launch-*.tsx` · `packages/shared/src/launch.ts` 류) · 발사 기준 열의 표현(D-03) · `source` 열 값 이름 · 해석 위치(apply 재정의 vs 트리거) · 해석 함수의 kind 17/18 칸 → 열 매핑 코드 구조(정식 노트 뒤).
- 탭 · 날짜 · 발사 · 범위 쿼리 파라미터 이름과 상태 보존(탭 전환 시 날짜 유지 여부) · 빈 상태 문구(「아직 적재된 발사가 없어요 · 첫 적재는 16:00:01」 · 「이 날은 발사가 없어요」 + 「최신 보기」) · 로딩 스켈레톤 · 오류 문구 · 문서 title.
- 차트 세부(패널 높이 · 행 높이 24px · 여백 · 눈금 규칙 · 스태킹 · 라벨 겹침 · 리본 높이 · 폰 터치) · 요약 카드 숫자 형식(µs 부호 · 천 단위 쉼표 여부 — 09:00:30 은 −20,148 처럼 쉼표).
- 백필 스크립트 인자(`--file` 복수 · `--date` 필터 · `--out` 미리보기) · dry-run 출력 모양 · 재실행 규칙 로그.
- E2E = `admin-servers.spec.ts` 동형(`page.route` 로 orders · map 두 경로 모킹 · 390 폰 · 탭 전환 · 세그먼트 · 프리셋 칩) · 단위 = 경계 계산(`group()` 이식) · 리본 비율 · 머리 계산(백필) · 열 포맷 · 날짜 목록 · 사이드바 순서 · SQL 테스트(upsert 멱등 · 도착 순서 무관 · 사용자 래퍼 제외 · purge 제외).

### Deferred Ideas (OUT OF SCOPE)
- **시작·끝 날짜 입력(범위 선택 부품).** 목업 B 로 보여 줬으나 프리셋 칩 채택. 임의 구간 비교가 필요해지면 후속(새 부품).
- **재전송 1·2·3회를 점으로.** 09:00:30 지도는 첫 발만 점. 서버가 재전송 시각을 kind 17 에 실어 주면 작은 점으로 잇는 안 — gh-trade 요청 필요.
- **머리 표 + 평탄 조각 표(변형 B) · 필터 칩.** 서버 간 비교·필터 요구가 생기면 후속.
- **계좌 마스킹 옵션.** 어드민 전용이라 그대로 노출(D-02). 캡처 공유가 잦아지면 토글.
- **kind 17·18 라벨(`strategy-event-labels.ts`) · fbs enum 주석.** 정식 인계 노트 뒤 sync — 이 phase 안이지만 노트 도착 조건부.
- **gh-trade 쪽 09:00:30 side 를 로그에서 못 뽑는 경우** 백필 09:00:30 지도는 전부 원(D-08) — 구분이 꼭 필요하면 gh-trade 가 예약 저장소 스냅샷에서 복원하는 별도 작업.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP 의 Requirements 는 `TBD` 다(`.planning/ROADMAP.md:324`). 아래 ID 는 Success Criteria 1~6 + CONTEXT 결정에서 **리서처가 도출한 제안**이다 — 플래너가 그대로 쓰거나 이름을 바꿔 REQUIREMENTS.md 에 올린다.

| ID | Description | Research Support |
|----|-------------|------------------|
| LAUNCH-01 | gh-trade 핸드오프 노트(백필 ndjson 지금 요청 + kind 17·18 칸 매핑 요구 + 서버 먼저 배포 안전 확인) · 상의 노트 `## 회신` (D-21 · SC1) | §「gh-trade 핸드오프」 — `scripts/trade-handoff.sh` 사용법 · 템플릿 · 요구 필드 목록(키 충돌 · next_offset_us 추가 요구 포함) |
| LAUNCH-02 | DB: `launch_pieces` · `launch_heads`(RLS 정책 0 · service_role) + 조건부 upsert(최신 seq · journal > backfill) + 도착 순서 무관 (D-01 · D-04 · SC2) | §「스키마」 · Pattern 2 · pgTAP 섹션 |
| LAUNCH-03 | DB 쪽 해석: `dma_strategy_apply` 재정의(포이즌 격리 · 17·18 rows 제외) + 투영 스텁 + 재투영 함수 — 원문 INSERT 는 해석 실패와 무관 (D-05 · D-06 · SC2) | Pattern 1 · Q1 비교표 |
| LAUNCH-04 | 가시성 제외: json 래퍼 `kind NOT IN (17,18)` · 주문 타임라인 RPC 제외 · purge `IN (15,16)` 고정 · `isMarketStrategyEvent` 무변경 (D-05 · SC2) | §「Q3 가시성」 |
| LAUNCH-05 | server: `GET /api/admin/launch/orders` · `GET /api/admin/launch/map` (requireAuth → requireAdmin · RPC 1회 · zod) (D-20 · SC3) | Pattern 4 · 5 |
| LAUNCH-06 | webapp: 사이드바 「발사」 · `/admin/launch` 탭 2화면 · 머리 카드 + 조각 표 · 순수 SVG 4패널 + 리본 · 폰 390 가로 스크롤 (D-11 ~ D-19 · SC4) | Pattern 6 · 7 · 사이드바 테스트 지점 |
| LAUNCH-07 | 백필: ndjson/`pieces.json` → `launch_pieces` + 조각에서 머리 계산 · dry-run → `--apply` · 첨부 `group()` 과 자동 대조 일치 (D-07 ~ D-10 · SC5) | Pattern 8 · 기대값 표 |
| LAUNCH-08 | 정식 인계 노트 뒤 해석 함수 칸 매핑 구현 + `launch_reproject` 실행 + 첫 실물 날짜 라이브 UAT + 두 인박스 노트 `status: done` (D-06 · D-22 · D-23 · SC6) | Wave B 설계 · Open Questions |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **gh-trade 인박스:** 세션 시작 때 `docs/inbox/from-gh-trade/` `status: open` 노트부터 읽는다. 처리하면 `status: done` + `done_commit` 을 채워 **경로 지정** 커밋(`git add -A` 금지). gh-trade 에 일 요청은 `scripts/trade-handoff.sh <slug>` → TODO 채우기 → SendMessage(보조). 노트 커밋은 gh-trade 세션이 한다.
- **GSD 워크플로 강제:** 파일 변경은 GSD 명령 경유(`/gsd-execute-phase`).
- **배포:** 프론트 Vercel(push = 프로덕션) · 백엔드 Cloud Run. 「배포는 relay 먼저 · push 나중」 — 백엔드가 막히면 push 금지(메모리). 이 phase 는 relay 무변경이므로 DB → server → push.
- **스크래핑/공식 API 규칙:** 이 phase 는 외부 크롤링·공식 API 호출이 없다(gh-trade 저널 관찰자 경로 · 사내 데이터) — 해당 없음.
- **Conventions:** 상따 화면 컨테이너 쿼리 규칙은 이 phase 무관(어드민 = 앱 셸 뷰포트 브레이크포인트).
- **사용자 전역 CLAUDE.md:** 커밋 메시지 한글 · 커밋 전 메시지 확인 · **Co-Authored-By 금지** · 단순함 우선 · 근본 원인.
- **메모리에서 이 phase 에 걸리는 것:** RPC 는 `REVOKE … FROM anon, authenticated` 명시 · 새 표 RLS · 서브에이전트는 배포 금지(executor 는 커밋까지) · vitest `--maxWorkers=2` · playwright `--workers=1` · 비밀 주입은 사용자 `!` 실행 · `.env` 직접 읽기는 훅이 막는다 · 목업 게이트(이미 통과) · security_enforcement=false(보안 검사 생략) · 사용자 대면 글은 한글 · 작업은 master.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| kind 17·18 원문 수신·적재 | relay(무변경) | DB `dma_strategy_apply` | relay 는 kind 를 모른다 — 43칸 원문만 넘긴다 |
| kind 17·18 → `launch_*` 해석 · upsert | Database (plpgsql) | — | D-06: relay 무변경. 같은 트랜잭션 · 포이즌 격리가 DB 에 있다 |
| ws fan-out 누설 차단 | Database (apply 반환 rows 에서 제외) | — | relay 는 rows 만 푸시 — rows 를 거르면 relay 무변경으로 막힌다 |
| REST 가시성(주문로그·타임라인) | Database (조회 RPC WHERE) | — | 가시성 정본은 조회 RPC 조인(`dma_strategy_events` 머리 주석) |
| 어드민 인가 | API(Express `requireAdmin`) | Frontend(`ADMIN_PREFIX` 미들웨어 · 사이드바 숨김) | 웹 숨김은 표시 장치, 차단은 Express + RPC 권한 |
| 날짜 목록 · 범위 절단 · 최신 머리 | Database(RPC 1회) | — | 왕복 1회 원칙 — 「최근 N 거래일」 은 DISTINCT 날짜 질의라 SQL 이 맞다 |
| 경계 lo/hi · 분류 · 리본 · 머리 계산(백필) | shared 순수 TS | Browser(렌더) · relay tools(백필) | 첨부 `group()` 한 벌 — SQL 에 두 번째 구현을 만들지 않는다 |
| 점 지도 · 띠 · 리본 그리기 | Browser(React 순수 SVG) | — | D-19 |
| 백필 적재 | 로컬 스크립트(Claude 실행) → DB RPC | — | D-09 · 조건부 upsert 는 DB 규칙 한 곳 |

## Standard Stack

### Core (전부 기존 저장소 의존 — 새 설치 없음)
| Library | Version (저장소) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL (Supabase) | 17.6 (pgTAP 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`) | 표 · plpgsql 해석 · RPC | 기존 저널 적재 경로 그대로 [VERIFIED: scripts/verify-dma-orders-price-check.sh:34] |
| pgTAP | 이미지 내장 extension | SQL 단위 테스트 | 기존 `supabase/tests/*.test.sql` 23개 패턴 [VERIFIED: supabase/tests 디렉터리] |
| Express + zod | server 기존 | 어드민 라우트 · 입력 검증 | `Ymd` 재사용 [VERIFIED: server/src/schemas/limitup-report.ts:10-20] |
| `@supabase/supabase-js` | ^2.103.0 (server) · relay node_modules | RPC 호출 · 백필 | [VERIFIED: server/package.json] |
| Next 15 · React 19 · radix-ui tabs | ^15.0.0 · ^19.0.0 · ^1.4.3 | 어드민 페이지 · shadcn `tabs` | `webapp/src/components/ui/tabs.tsx` 존재 · 5개 화면이 이미 사용 [VERIFIED: webapp/package.json · grep] |
| vitest | shared/relay/server ^4.1.4 · webapp ^2.1.9 | 단위 | [VERIFIED: package.json 들] |
| Playwright | ^1.59.1 | E2E(`page.route` 모킹) | [VERIFIED: webapp/package.json:39] |
| tsx | relay/node_modules/.bin/tsx | 백필 스크립트 실행 | [VERIFIED: ls relay/node_modules/.bin] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| apply 재정의 | `dma_strategy_events` AFTER INSERT 트리거 | Q1 비교표 — 실패 격리·errors 보고·rows 제외를 못 한다. 기각 |
| 경계 계산 shared TS | RPC 가 날짜별 lo/hi 미리 계산 | SQL·TS 두 구현(백필 머리 계산은 TS 가 필요) → 갈라짐 위험. 왕복 수는 같다(1회). 기각 |
| 백필 supabase-js `.upsert(onConflict)` | 백필 RPC(조건부 upsert) | supabase-js upsert 는 `ON CONFLICT … DO UPDATE … WHERE` 조건을 못 건다 → journal 행을 백필이 덮는다. RPC 채택 |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다(위 표 전부 기존 lockfile 의존).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 gh-trade 서버(KB120 · KYOBO119)
   16:00 Q16 / 09:00:27 A(KRX) / 09:00:30 N·A(NXT) 발사
        │ 전략 저널(80) StrategyEvent kind 17 LaunchPiece × N · kind 18 LaunchHead × 1  (와이어 무변경)
        ▼
 relay 관찰자 기록기 (무변경)  ── strategy-stream.ts → rpc dma_strategy_apply(gateway, epoch, events[])
        ▼
 ┌──────────────────────── dma_strategy_apply (재정의 · 한 트랜잭션 · advisory lock) ────────────────────────┐
 │ for ev in events (seq 오름차순):                                                                          │
 │   INSERT dma_strategy_events ON CONFLICT DO NOTHING ──(이미 있음)──► skipped (투영 안 함 = 재생 멱등)       │
 │        │ (새 행)                                                                                          │
 │        ├─ kind ∈ {17,18}? ──예──► BEGIN launch_project_event(v_row) EXCEPTION → errors[] END (savepoint)  │
 │        │                              │ 17 → launch_upsert_piece(json, 'journal')                        │
 │        │                              │ 18 → launch_upsert_head(json, 'journal')                         │
 │        │                              │ (Wave A = no-op 스텁 · Wave B = 칸 매핑)                         │
 │        └─ kind ∉ {17,18} ──► rows[] 에 추가 (17·18 은 rows 에 안 싣는다 → ws fan-out 0)                  │
 │ 커서 전진 → {applied, skipped, errors, last_seq, rows}                                                  │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        │ errors[] → relay warn 로그 + /healthz projectionErrors (기존 배선)
        │ rows[]   → relay fan-out journal.events (17·18 없음)
        ▼
 launch_pieces / launch_heads  ◄── launch_backfill_apply(pieces[], heads[])  ◄── scripts/launch-backfill.sh (Claude 실행)
        │                     ◄── launch_reproject(…)  (Wave B 뒤 1회 · 원문 재해석)            ▲ ndjson / pieces.json
        ▼                                                                                        │ heads = shared launchHeadOf(pieces)
 launch_orders_for_admin(p_date) / launch_map_for_admin(p_fire, p_days)   (service_role 전용 · jsonb 1값)
        ▼
 Express adminLaunchRouter  /api/admin/launch/{orders,map}  requireAuth → requireAdmin → zod → RPC 1회 → snake_case 통과
        ▼
 webapp /admin/launch?tab=orders|map&d=…&fire=…&range=…
   orders: LimitupDateNav + 세그먼트 + 머리 카드 4 + 조각 표(가로 스크롤)
   map:    프리셋 칩 + 세그먼트 → shared launchDaysOf()(=group) → 요약 카드 4 + SVG 4패널(점·띠·점선·리본) + 날짜별 표
```

### Recommended Project Structure
```
supabase/migrations/
  2026102xxxxxx_launch_gate.sql            # Wave A: 표 2 · 헬퍼 · 스텁 · apply 재정의 · reproject · backfill RPC · 어드민 RPC 2 · 가시성 3곳
  2026102yyyyyy_launch_project_mapping.sql # Wave B: launch_project_event 칸 매핑만 CREATE OR REPLACE
supabase/tests/
  launch_gate.test.sql                     # 새 pgTAP
packages/shared/src/
  launch.ts                                # 타입 · LAUNCH_ORDER · launchDaysOf(group) · ribbonAt · launchHeadOf · 포맷 중 순수 계산
  __fixtures__/launch-pieces-1012-1026.json # pieces.json 사본(D-10 정답 픽스처)
  __tests__/launch.test.ts
relay/src/tools/launch-backfill.ts         # 파싱 · 매핑 · 배치 · RPC 호출(순수 + sb 주입)
relay/tests/launch-backfill.test.ts
scripts/launch-backfill.ts / .sh           # 얇은 CLI + env 비출력 래퍼
server/src/routes/admin-launch.ts · schemas/admin-launch.ts · services/admin-launch.ts
server/tests/routes/admin-launch.test.ts
webapp/src/app/admin/launch/page.tsx       # 서버 컴포넌트 + Suspense
webapp/src/components/admin/launch-client.tsx · launch-orders.tsx · launch-map.tsx · launch-panel.tsx …
webapp/src/lib/launch-api.ts · launch-map.ts(축·눈금·스태킹·리본 칸 — 순수)
webapp/e2e/specs/admin-launch.spec.ts · e2e/fixtures/launch.ts
```

---

### Q1 답 — DB 쪽 해석 위치: `dma_strategy_apply` 재정의 (권장)

| 기준 | apply 재정의 + 서브블록 | AFTER INSERT 트리거 |
|------|------|------|
| relay 무변경 | ✓ 같은 RPC 이름·시그니처·반환 모양 | ✓ |
| 원문 INSERT 를 막지 않음 | ✓ INSERT 는 서브블록 **밖**, 투영만 `BEGIN … EXCEPTION WHEN OTHERS` 안 — PG: 「잡힌 오류는 그 블록 안의 영속 변경만 되돌린다」 [CITED: postgresql.org/docs/17/plpgsql-control-structures.html §Trapping Errors] | ✗ 기본은 트리거 오류 = INSERT 문 오류 → apply 의 INSERT(:66-119)는 예외 처리 밖이라 **배치 전체 실패 → 기록기 같은 배치 영구 재시도** [VERIFIED: 20260929180100_dma_strategy_apply.sql:65-119 — 주석 「필수 키 … 형식 오류 · 누락은 여기서 배치 전체를 실패시킨다」]. 트리거 안에서 EXCEPTION 을 걸면 막을 수는 있으나 아래 두 줄이 안 된다 |
| 실패 보고 | ✓ `errors[{seq, error}]` 로 반환 → relay 가 이미 warn 로그 + `/healthz` 계수(`projectionErrors`) [VERIFIED: relay/src/journal/writer.ts:616-622 · types.ts:319] | ✗ 반환값에 닿을 길이 없음 — 삼키거나 별도 표 |
| ws fan-out 누설 차단 | ✓ rows 에서 17·18 을 빼면 relay 가 푸시할 행이 없다 | ✗ rows 는 apply 가 만든다 — 트리거로 못 거른다 |
| 재생 멱등 | ✓ 이미 있는 seq 는 `IF NOT FOUND … CONTINUE`(투영 안 함) | ✓ ON CONFLICT DO NOTHING 이면 트리거 안 뜸 |
| 선례 | ✓ 주문 저널 「포이즌 격리(T-19-15)」 동형 | ✗ 이 저장소 `dma_strategy_events` 에 트리거 없음 |
| 비용 | 본문 43칸 INSERT 를 통째로 복사(드리프트 위험) → 기존 `dma_strategy_apply.test.sql`(30 단언) 회귀로 잠금 | 본문 무변경 |

선례 원문(포이즌 격리) — `supabase/migrations/20261004090100_dma_journal_apply_skipped_rows.sql:121-131` [VERIFIED]:
```sql
    -- 포이즌 격리(T-19-15): 투영 실패는 이 이벤트의 서브트랜잭션만 되돌리고 사유를 남긴다.
    BEGIN
      v_ids := v_ids || public.dma_journal_project(p_gateway, p_epoch, ev);
      v_applied := v_applied + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      UPDATE public.dma_journal_events
         SET apply_error = v_err
       WHERE gateway = p_gateway AND journal_epoch = p_epoch AND seq = v_seq;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('seq', v_seq, 'error', v_err));
    END;
```
**`dma_strategy_events` 에는 `apply_error` 칸이 없다**(20260929180000:43-91 칸 목록에 없음 [VERIFIED]) — 칸을 추가하면 `to_jsonb(e)` 공개 45키가 46키가 되어 `dma_strategy_apply.test.sql`(:172 `jsonb_object_keys` 단언) · relay/shared 행 타입이 깨진다. **칸 추가 금지 — `errors[]` 반환만 한다**(재해석은 `launch_reproject` 로).

**성능:** PG 문서 「EXCEPTION 절이 있는 블록은 들어가고 나오는 비용이 상당히 크다 … 필요 없으면 쓰지 마라」 [CITED: 같은 페이지 Tip]. kind 15 는 분당 수십 행이다 — **서브블록은 `kind IN (17,18)` 일 때만 들어간다.**

### Pattern 1: 재정의된 `dma_strategy_apply` (변경 3곳만)
**What:** 20260929180100 본문 그대로 + ⓐ 새 행이 17·18 이면 서브블록 투영 ⓑ rows 에는 17·18 을 싣지 않음 ⓒ `errors` 를 `'[]'` 고정에서 `v_errors` 로.
**Example:**
```sql
-- Source: 20260929180100_dma_strategy_apply.sql:118-132 (원문) 의 변경 지점만 — 나머지 본문·권한 3줄은 원문 그대로 복사
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_applied := v_applied + 1;

    IF v_row.kind IN (17, 18) THEN
      -- 발사 조각/머리 — 원문은 이미 남았다. 해석 실패는 이 이벤트의 서브트랜잭션만 되돌린다(T-19-15 동형).
      BEGIN
        PERFORM public.launch_project_event(v_row);
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('seq', v_seq, 'error', SQLERRM));
      END;
      CONTINUE;   -- rows 에 싣지 않는다 → relay journal.events 푸시 0 (사용자 전략 이벤트 아님)
    END IF;

    v_rows := v_rows || jsonb_build_array(
      to_jsonb(v_row) - 'dma_user_id' - 'applied_at'
        || jsonb_build_object('stock_code', (SELECT s.code FROM public.stocks s WHERE s.isin = v_row.isin LIMIT 1))
    );
```
원문 :129-132 의 rows 조립 식 [VERIFIED: 20260929180100_dma_strategy_apply.sql:129-132]:
```sql
    v_rows := v_rows || jsonb_build_array(
      to_jsonb(v_row) - 'dma_user_id' - 'applied_at'
        || jsonb_build_object('stock_code', (SELECT s.code FROM public.stocks s WHERE s.isin = v_row.isin LIMIT 1))
    );
```
권한 3줄 원문 [VERIFIED: 같은 파일 :165-167]: `REVOKE EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) FROM PUBLIC;` · `… FROM anon, authenticated;` · `GRANT EXECUTE … TO service_role;` — `CREATE OR REPLACE` 뒤에도 재명시(관례).

`v_errors jsonb := '[]'::jsonb;` 를 DECLARE 에 추가하고 반환의 `'errors', '[]'::jsonb` (:157) 를 `'errors', v_errors` 로 바꾼다. 기존 테스트 `(2,0,[],2)` 단언(dma_strategy_apply.test.sql:132-133)은 오류가 없으면 그대로 통과한다.

### Pattern 1b: 투영 스텁 · 재투영 (D-06 「해석 함수만 노트 뒤」)
```sql
-- Wave A: 칸 매핑 모름 → 아무것도 안 한다(모르는 kind 무시 = 서버 먼저 배포 안전 D-21 ③).
CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $$ BEGIN RETURN; END; $$;
-- Wave B: 같은 시그니처로 CREATE OR REPLACE — 17 → launch_upsert_piece(…, 'journal') · 18 → launch_upsert_head(…, 'journal')

-- 원문 재해석(멱등) — Wave B 배포 직후 1회, 이후 매핑 수정 때마다. 도착 순서 = applied_at, seq.
CREATE OR REPLACE FUNCTION public.launch_reproject(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE r public.dma_strategy_events%ROWTYPE; v_ok int := 0; v_err jsonb := '[]';
BEGIN
  FOR r IN SELECT * FROM public.dma_strategy_events
            WHERE kind IN (17, 18)
              AND (p_from IS NULL OR trade_date >= p_from) AND (p_to IS NULL OR trade_date <= p_to)
            ORDER BY gateway, applied_at, seq
  LOOP
    BEGIN PERFORM public.launch_project_event(r); v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err || jsonb_build_array(jsonb_build_object('gateway', r.gateway, 'seq', r.seq, 'error', SQLERRM));
    END;
  END LOOP;
  RETURN jsonb_build_object('projected', v_ok, 'errors', v_err);
END; $$;
```
**정렬을 `journal_epoch` 로 하지 말 것** — epoch 는 「저장소 신원(생성 시 1회)」 문자열이라 순서가 없다 [VERIFIED: relay/src/generated/StockDMA.fbs:1332 `journal_epoch: string;   // 저널 저장소 신원 (생성 시 1회, 파일 영속 — D-06)`]. `applied_at`(DB 도착 시각)이 실제 도착 순서다. 함수 이름·권한은 service_role 전용(REVOKE 3줄 동형). 실행은 메인 세션 `supabase db query` 또는 SQL 편집기(원격 쓰기 — 사용자에게 명령 먼저).

### Pattern 2: 조건부 upsert 헬퍼 (최신 seq · journal > backfill 규칙 한 곳)
**What:** 해석 함수(journal)와 백필 RPC(backfill)가 같은 헬퍼를 부른다 → 규칙이 한 곳.
```sql
-- 규칙: 기존이 backfill 이면 무엇이든 덮는다(재실행 멱등 · 라이브가 백필을 덮음 D-04)
--       기존이 journal 이면 들어오는 journal 만 — 같은 epoch 는 seq 가 클 때, 다른 epoch 는 새로 온 쪽
--       기존 journal 을 backfill 이 덮지 않는다
INSERT INTO public.launch_pieces AS t (…) VALUES (…)
ON CONFLICT (trade_date, gateway, profile, fire_exchange, market, wire) DO UPDATE SET
  … = EXCLUDED.…, updated_at = now()
WHERE t.source = 'backfill'
   OR (EXCLUDED.source = 'journal'
       AND (t.journal_epoch IS DISTINCT FROM EXCLUDED.journal_epoch OR EXCLUDED.seq > t.seq));
```
- 재생(같은 `(gateway, epoch, seq)`)은 apply 가 이미 투영을 건너뛰므로 여기까지 오지 않는다 — 이 WHERE 는 **서버 재송신(같은 논리 키 · 다른 seq)** 과 **백필 공존**만 다룬다.
- 「다른 epoch → 새로 온 쪽」 근거: relay 는 epoch 가 바뀌면 새 epoch 의 oldest 부터만 받는다(옛 epoch 행이 나중에 다시 오지 않는다) [VERIFIED: StockDMA.fbs:1336-1338 resync 주석]. `launch_reproject` 는 `applied_at` 순이라 같은 결론.
- 헬퍼 입력은 jsonb(열 이름 = 표 열 이름)로 두면 해석 함수(Wave B)는 「43칸 → jsonb 만들기」 만 하면 된다.

### 스키마 (Q2 답) — 제안 열 목록

**키 결정 필요(아래 Pitfall 1):** D-01 키에 발사 거래소를 더한 `(trade_date, gateway, profile, fire_exchange, market, wire)` 를 권장한다.

`launch_pieces`
| 열 | 형 | 비고 |
|----|----|------|
| trade_date | date NOT NULL | `dma_strategy_events.trade_date` 와 같은 형 [VERIFIED: 20260929180000:47 `trade_date date NOT NULL`] |
| gateway | text NOT NULL | `'KB120'` · `'KYOBO119'` [VERIFIED: supabase/migrations/20261007200000_gateway_key_rename.sql:3-4 `'KB'    → 'KB120'` · `'KYOBO' → 'KYOBO119'`] |
| profile | text NOT NULL | `'Q16'` · `'N'` · `'A'` (인박스 표) |
| fire_exchange | text NOT NULL | `'KRX'` · `'NXT'` — 기존 `exchange` 칸 값과 같은 어휘 [VERIFIED: 20260929180000:51 `exchange text NOT NULL DEFAULT '', -- KRX/NXT`] |
| fire_base | time NOT NULL | 16:00:00 · 09:00:27 · 09:00:30 (D-03 「기준시각」) |
| market | text NOT NULL | `'K'` · `'Q'` — 로그 `market=K` [VERIFIED: pieces120.txt 1행] (표시 코스피/코스닥은 웹) |
| wire | integer NOT NULL | 시장 송신 순번 |
| side | text NULL | `'buy'` · `'sell'` (백필 null 허용 D-08) |
| queued_id | text NULL | Q16 `Q153027001` / N·A `key`(로그 `key=N`) |
| piece_idx · round | integer · smallint NULL | j / idx · 0/1/2 |
| probe | boolean NULL | 로그 `probe=0` — 탐침도 한 조각(gh-trade 게이트 정의) |
| order_no | text NULL | 로그 `ordno=` |
| sent_rel_us | integer NOT NULL | 첫 발 송신 − 기준시각 |
| result | text NOT NULL | `접수` · `101` · `515` · `기타` · `무응답` — **CHECK 걸지 않는다**(아래 Pitfall 6) |
| result_code | integer NULL | |
| accept_time | integer NULL | HHMMSSmmm — **앞 0 이 빠져 온다**(`accept_time=90029979`) → 웹이 9자리 0 패딩 |
| retry · abandoned | smallint · boolean NULL | |
| isin · price · qty · filled_qty | text · integer · integer · integer NULL | |
| account · dma_user_id | text NULL | D-02 그대로 노출(아래 Pitfall 9) |
| source | text NOT NULL CHECK (source IN ('journal','backfill')) | |
| journal_epoch · seq · gw_time_ms | text · bigint · bigint NULL | `CHECK (source = 'backfill' OR (journal_epoch IS NOT NULL AND seq IS NOT NULL))` |
| created_at · updated_at | timestamptz NOT NULL DEFAULT now() | |

`launch_heads` — 키 `(trade_date, gateway, profile, fire_exchange, market)` + `fire_base` · `offset_used_us` · `fire_at_us`(첫 송신 rel 또는 epoch µs — 노트 뒤) · `n_pieces` · `n_accepted` · `n_reject`(101 또는 515 — profile 이 뜻을 정함) · `n_other` · `first_accept_idx` · `retries` · `abandoned` · `gate_lo_us` · `gate_hi_us` · `nonmono` · Q16 학습 `correction_before_us` · `correction_after_us` · `step_us` · `last_dir` · `bracketed` · `same_dir_run` · `reject_span_us` · `jump` · `one_way_us` · `rtt_min_us` · **`next_offset_us`**(Pitfall 3) — Q16 외/백필은 null · `source` · 추적 3열 · 시각 2열.

권한 4줄(표) — 기존 표와 같은 구성 [VERIFIED: supabase/migrations/20261020200000_limitup_accum_flow.sql:118-121]:
```sql
ALTER TABLE public.launch_pieces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.launch_pieces FROM PUBLIC;
REVOKE ALL ON TABLE public.launch_pieces FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.launch_pieces TO service_role;
```
(RLS 켜고 POLICY 0개 = 기본 거부 · 메모리 「RLS 새 표는 TO anon, authenticated 둘 다」 는 **정책을 만들 때** 규칙이다 — 이 표는 정책을 만들지 않는다.)

### Q3 답 — 가시성 제외 지점 (4곳 · relay 무변경)

| # | 지점 | 현재 | 조치 |
|---|------|------|------|
| ① | relay ws fan-out | `rows.filter((row) => isMarketStrategyEvent(row.kind) \|\| accounts.has(row.accountNo))` [VERIFIED: relay/src/ws/fanout.ts:3314 · :3340] — kind 17 이 실계좌 `account_no` 를 실으면 **그 계좌 사용자에게 간다**. 웹은 모르는 kind 를 주문로그 목록에 넣는다(`else orderRows.push(row)` [VERIFIED: webapp/src/lib/use-relay-socket.ts:1071-1074]) | **apply 반환 rows 에서 17·18 제외**(Pattern 1). relay 는 rows 만 푸시한다: `p.strategyWriter.on("applied", (rows) => fanout.deliverStrategyEvents(rows, …))` [VERIFIED: relay/src/index.ts:501]. → **「계좌를 다른 칸에 싣기」 우회도, relay 가드도 불필요.** `isMarketStrategyEvent` 무변경(D-05) |
| ② | 주문로그 REST 복원 `dma_strategy_events_for_user_json` | `WHERE (p_include_limit_feature OR (t.ev->>'kind')::int <> 15) AND (t.ev->>'kind')::int <> 16;` [VERIFIED: 20261018120000_dma_strategy_events_accum_signal.sql:84-85] | `AND (t.ev->>'kind')::int NOT IN (17, 18)` 추가(D-05 명시) |
| ③ | SETOF `dma_strategy_events_for_user` | 시장 집합 밖 kind 는 `account_no` 가시 계좌 매칭이면 반환 — `(e.kind NOT IN (1, 2, 10, 15, 16) AND EXISTS (…v.account_no = e.account_no))` [VERIFIED: 같은 파일 :52-56] | 선택: 원천에서 `AND e.kind NOT IN (17, 18)` 도 추가(이 함수를 쓰는 `dma_accum_signals_for_user_json` 은 kind 16 만 읽으므로 영향 없음). ② 와 둘 다 두면 이중 방어 |
| ④ | **주문 펼침 타임라인 `dma_order_events_for_user`** (CONTEXT 에 없던 지점) | `JOIN k ON e.gateway = k.gateway AND e.trade_date = k.trade_date AND e.account_no = k.account_no … WHERE e.order_no <> '' AND e.order_no = ANY (k.nos)` [VERIFIED: 20260929190000_dma_gateway_identities.sql:266-269] — kind 17 이 계좌 + 주문번호(D-21 요구)를 실으면 **그 주문 타임라인에 원문 행이 섞인다** | 그 함수 재정의(20260929190000 :219~ 본문 그대로) + `AND e.kind NOT IN (17, 18)`. 최신 정의는 이 파일이 마지막 [VERIFIED: grep — 두 파일만 정의] |
| ⑤ | purge `dma_strategy_events_purge_limit_feature` | `WHERE kind IN (15, 16)` [VERIFIED: 같은 파일 :102-104] | **변경 금지** + pgTAP 로 「kind 17·18 옛날짜 행이 purge 뒤 남는다」 단언 |

①을 apply 에서 막으면 kind 17·18 원문의 `account_no`·`dma_user_id` 에 무엇이 실려도 사용자 화면으로 새지 않는다 — **정식 노트 매핑에 제약을 걸 필요가 없다**(플래너 결정 항목 해소). 단 ④는 반드시 같은 마이그레이션에.

### Pattern 4: 어드민 RPC (Q4 답)
틀 = `accum_report_for_user` [VERIFIED: supabase/migrations/20261020200100_accum_report_rpc.sql:39-85] 에서 **DMA 게이트를 뺀** 모양(인가는 Express `requireAdmin`):
```sql
-- 날짜 목록 = 행 있는 날짜 내림차순 · 형식 YYYYMMDD 텍스트(웹 LimitupDate = string · LimitupDateNav 재사용)
CREATE FUNCTION public.launch_orders_for_admin(p_date text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_dates text[]; v_date text;
BEGIN
  v_dates := ARRAY(SELECT DISTINCT to_char(p.trade_date, 'YYYYMMDD') FROM public.launch_pieces p ORDER BY 1 DESC);
  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('dates','[]'::jsonb,'date',NULL,'heads','[]'::jsonb,'pieces','[]'::jsonb);
  END IF;
  v_date := coalesce(p_date, v_dates[1]);
  RETURN jsonb_build_object('dates', to_jsonb(v_dates), 'date', v_date,
    'heads',  (SELECT coalesce(jsonb_agg(… ORDER BY gateway, market, fire_base, profile), '[]') FROM public.launch_heads WHERE trade_date = to_date(v_date,'YYYYMMDD')),
    'pieces', (SELECT coalesce(jsonb_agg(… ORDER BY gateway, market, fire_base, fire_exchange, wire), '[]') FROM public.launch_pieces WHERE trade_date = to_date(v_date,'YYYYMMDD')));
END; $$;

-- 지도: p_fire 'q16' = (KRX, 16:00:00) · 'n0930' = (NXT, 09:00:30 — profile 가로질러 N+A). p_days NULL = 전체.
CREATE FUNCTION public.launch_map_for_admin(p_fire text, p_days integer DEFAULT NULL) RETURNS jsonb …
--  days   = 그 발사 기준에 조각이 있는 날짜 내림차순 LIMIT p_days
--  pieces = 그 날짜들의 지도용 열만(trade_date, gateway, market, profile, side, wire, piece_idx, sent_rel_us, result, retry)
--  heads  = 서버×시장별 그 발사 기준 최신 머리 1행(DISTINCT ON (gateway, market) ORDER BY … trade_date DESC) — 다음 오프셋 선
```
- **권장: 경계·리본은 웹(shared TS) 계산** — 백필 머리 계산이 어차피 TS(`group()` 이식)라 SQL 에 두 번째 구현을 두면 갈라진다. 왕복은 어느 쪽이든 1회. 크기: 16:00 은 서버×시장×날 ≈ 3~18조각(pieces.json 33발사 196행 [VERIFIED]) → 「전체」 1년 ≈ 1만 행 × 지도용 10열 — jsonb 1값으로 충분(서버 쪽 SETOF max_rows 절단 회피와 같은 이유로 jsonb 스칼라 [VERIFIED: 20261020200100:13-14 주석]).
- 「최근 10일」 은 **발사 기준별** 거래일이다 — N 은 개장차익 가동일만 있으므로 q16 의 날짜 목록으로 자르면 안 된다.
- 권한 3줄 + `NOTIFY pgrst, 'reload schema';`(기존 RPC 마이그레이션 끝 [VERIFIED: 20261020200100:117]).

### Pattern 5: 서버 라우트 (Q4 답 계속)
- **`server/src/routes/admin-launch.ts` 신설 + 경로 한정 관문 + adminRouter 앞 마운트** — `admin-servers.ts` 동형. 근거 원문 [VERIFIED: server/src/app.ts:118-122]:
  ```ts
  // 서버 레지스트리(D-17)를 먼저 — 그 라우터는 관문을 `/servers` 경로에만 건다. adminRouter 는 라우터 전체에 관문을
  // 걸므로 순서가 반대면 /servers 요청이 역할 조회를 두 번 한다(Cloud Run → Supabase 왕복 +1).
  app.use("/api/admin", adminServersRouter);
  app.use("/api/admin", adminRouter);
  ```
  그리고 [VERIFIED: server/src/routes/admin-servers.ts:50] `adminServersRouter.use("/servers", requireAuth(), requireAdmin());` · [VERIFIED: server/src/routes/admin.ts:84] `adminRouter.use(requireAuth(), requireAdmin());`.
  → `adminLaunchRouter.use("/launch", requireAuth(), requireAdmin());` 를 `adminServersRouter` 와 `adminRouter` **사이**(또는 앞)에 마운트. adminRouter **뒤**에 두면 adminRouter 의 `use` 관문이 먼저 역할을 조회하고, 매칭 없이 넘어온 뒤 또 조회한다(왕복 +1). `admin.ts` 에 합치는 안은 파일이 이미 크고 relay 프록시 위주라 비권장.
- 요청당 왕복 = 역할 조회 1 + RPC 1 (D-20 「RPC 1회」 충족).
- zod: `LaunchOrdersQuery = z.object({ d: Ymd.optional() })` · `LaunchMapQuery = z.object({ fire: z.enum(['q16','n0930']).default('q16'), range: z.enum(['10d','20d','all']).default('10d') })` → `p_days = {10d:10, 20d:20, all:null}`. `Ymd` 원문 [VERIFIED: server/src/schemas/limitup-report.ts:10-20 — `.regex(/^\d{8}$/, "YYYYMMDD 형식이어야 합니다.")` + `Date.UTC` 재전개 refine].
- 서비스 = `server/src/services/accum-report.ts` 의 `DbError` · `causeOf` · `shapeCause` · `isObject` 복제(「헬퍼는 공용화하지 않고 복제」 규약 [VERIFIED: accum-report.ts:9]) — `access` 분기는 없음. 모양 검사: `dates`/`heads`/`pieces`(orders) · `days`/`heads`/`pieces`(map) 배열 아니면 500.
- 응답 타입 = `packages/shared/src/launch.ts` 의 `LaunchOrdersResponse` · `LaunchMapResponse` 를 server `res.json` 과 webapp `authFetch<T>` 가 **같이** 쓴다(lessons 2026-06-10 응답 계약 드리프트).
- 테스트 하네스: `server/tests/fixtures/admin-supabase.ts` 의 `makeAdminSupabase({ rpc: {…} })` + `ADMIN_TOKEN`/`TRADER_TOKEN` + supertest [VERIFIED: server/tests/routes/admin-servers.test.ts:1-16].

### Pattern 6: shared 경계 계산 (첨부 `group()` 이식 · Q5)
정본 [VERIFIED: docs/inbox/from-gh-trade/261027-launch-gate-admin-attach/launch-gate-map.html:91-112]:
```js
    const rej=ps.filter(p=>p.res==="101").map(p=>p.rel);
    const acc=ps.filter(p=>p.res==="접수").map(p=>p.rel);
    const lo=rej.length?Math.max(...rej):null, hi=acc.length?Math.min(...acc):null;
    const first=Math.min(...ps.map(p=>p.rel));
    let kind;
    if(lo!==null&&hi!==null) kind="경계";
    else if(hi!==null) kind="전부 접수";
    else if(lo!==null) kind="전부 101";
    else kind="판단 불가";
```
목업 확장 [VERIFIED: reference/mockup-launch-gate-map.html:146-149] — 거부에 515 포함: `const rej=ps.filter(p=>p.res==="101"||p.res==="515")` · 분류 이름 `"전부 거부"`.
리본 [VERIFIED: launch-gate-map.html:178-187]: `for(let v=xmin; v<xmax; v+=1){ let ok=0,bad=0; for(const d of days){ if(d.hi!==null&&v>=d.hi) ok++; else if(d.lo!==null&&v<=d.lo) bad++; } …}` · 목업은 `const stepR = span>100?1:0.2;` [VERIFIED: mockup :207].
축 [VERIFIED: mockup :170-182]: `const pad = span>100?8:3, unit = span>100?10:1;` · `const step=(xmax-xmin)>200?20:(xmax-xmin)>40?10:2;` · `const W=760, L=58, R=14, T=22, RH=24, ribbonH=ribbon?40:0, gapR=ribbon?32:10;`.

shared 로 옮길 순수 함수(이름 재량): `launchDaysOf(pieces)`(=group, 515 포함 · `판단 불가` 유지) · `launchRibbonAt(days, v)` · `launchHeadOf(pieces)`(백필 D-04: n_* · first_accept_idx · lo · hi · offset_used = 첫 조각 rel · nonmono = lo>hi) · `LAUNCH_ORDER = [[KB120,'Q'],[KB120,'K'],[KYOBO119,'Q'],[KYOBO119,'K']]`(첨부 `ORDER = [["KB","코스닥"],["KB","코스피"],["교보","코스닥"],["교보","코스피"]]` [VERIFIED: launch-gate-map.html:87]). 관계: relay 백필 도구와 webapp 이 둘 다 `@gh-radar/shared` 를 쓴다 → **shared dist 빌드 순서**(Pitfall 10).

### Pattern 7: 웹 페이지 · 사이드바 (Q5)
- **페이지 = 서버 컴포넌트 + `Suspense`** — 본문이 `useSearchParams()`(`?tab`·`?d`·`?fire`·`?range`)를 쓰므로 Next 15 가 Suspense 경계를 요구한다. 선례 원문 [VERIFIED: webapp/src/app/analytics/accum/page.tsx]: `<AppShell sidebar={<AppSidebar />}><Suspense fallback={null}><AccumReport /></Suspense></AppShell>`. 기존 `/admin/servers/page.tsx` 는 `'use client'` + Suspense 없음(쿼리 안 씀) — **그대로 베끼면 빌드 경고/오류**.
- 데이터 = `authFetch<T>`(`webapp/src/lib/auth-fetch.ts`) — `admin-api.ts` 에 함수 2개를 더하거나 `launch-api.ts` 신설. (참고: CONTEXT 가 말한 `apiFetch` 는 `authFetch` 가 감싸는 하위 함수다 [VERIFIED: auth-fetch.ts:13 `import { apiFetch, ApiClientError, type ApiFetchInit } from "./api";`]).
- `?d=` 진실 원본 · `router.replace/push` 배선 = `accum-report.tsx:49-99` 그대로 [VERIFIED]: `parseYmdParam(raw)` · 형식 오류면 `router.replace(BASE)` · `dateNavOf(dates, shown)` · `go = (to) => router.push(\`${BASE}?d=${to}\`)`. 탭/세그먼트 전환은 다른 쿼리를 보존하며 `router.replace`.
- `LimitupDateNav` 의 aria-label 은 「이전 보고서」/「다음 보고서」 고정이다 [VERIFIED: limitup-date-nav.tsx] — 어드민 발사 화면에서도 그대로 써도 되나, E2E 에서 그 이름으로 찾는다.
- 브로커 라벨 `{ KB: "KB", KYOBO: "교보" }` [VERIFIED: webapp/src/components/admin/servers-client.tsx:62 `export const SERVER_BROKER_LABEL`] + `brokerOfServerKey`(shared · `SERVER_KEY_RE = /^(KB|KYOBO)[0-9]{1,3}$/` [VERIFIED: packages/shared/src/admin.ts:28-34]) 재사용.
- **사이드바** [VERIFIED: webapp/src/components/layout/app-sidebar.tsx:196-198 · :744-753]:
  ```ts
  const NAV_ADMIN_USERS = { href: "/admin/users", label: "사용자" } as const;
  const NAV_ADMIN_SERVERS = { href: "/admin/servers", label: "서버" } as const;
  ```
  → `NAV_ADMIN_LAUNCH = { href: "/admin/launch", label: "발사" }` + `<SubNavLink … item="admin-launch" …/>` 를 「서버」 `<li>` 다음에. `item` 은 `string` 이라 타입 변경 없음 [VERIFIED: :383 `item: string;`].
- 순서 단언 갱신 지점 [VERIFIED]:
  - `webapp/src/components/layout/__tests__/app-sidebar.test.tsx:1499-1513` 배열 `… "Admin", "사용자", "서버", "My page"` → 「서버」 뒤 「발사」. 같은 it 의 `for (const a of [admin()!, users()!, servers()!])` · describe 제목(「사용자 · 서버」)도 갱신.
  - `webapp/e2e/specs/sidebar-tree.spec.ts:88-101` `TREE_LINKS` `'Admin', '사용자', '서버', 'My page'` → 「발사」 삽입. `:429` `toHaveCount(TREE_LINKS.length + CHASERS.length)` 는 길이로 자동 따라옴. `ADMIN_SUB_ITEMS = '[data-sidebar-item^="admin-"]'`(:121)는 접두 선택자라 그대로 맞는다.
- **E2E 모킹 주의:** `mockAdminApi` 는 `page.route('**/api/admin/**', …)` 로 모르는 경로에 404 를 준다 [VERIFIED: webapp/e2e/fixtures/admin.ts:376 · :566]. 발사 spec 은 `mockAdminApi` 를 쓰지 말고 `**/api/admin/launch/**` 전용 route 만 건다(같이 쓰면 Playwright 는 **나중에 등록한 route 가 먼저** 매칭 — 등록 순서 의존 [ASSUMED]).

### Pattern 8: 백필 스크립트 (Q6)
- 틀 = 「로직은 `relay/src/tools/*.ts`(순수 + sb 주입 · 테스트), 스크립트는 인자·env·출력만」 [VERIFIED: scripts/export-accum-backfill.ts:4-6 주석 · :24-25 `import { exportAccumBackfillDay } from "../relay/src/tools/accum-backfill.js"; import { createRelaySupabase } from "../relay/src/store/supabase.js";`].
- 실행 [VERIFIED: export-accum-backfill.sh:70] `exec pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts "$@"` · env 기본 `workers/master-sync/.env`(:39) · `set -a; source; set +a` 비출력 · 빈 키는 **이름만** 출력(:52-59) · 호출 cwd 보존 `ACCUM_BACKFILL_CWD`(:29) → 같은 모양 `LAUNCH_BACKFILL_CWD`/`LAUNCH_BACKFILL_ENV_FILE`.
- dry-run 기본 / `--apply` [VERIFIED: scripts/migrate-dma-users.ts:9-11]. dry-run 출력 = 파일·행 수 · 날짜×서버×시장 조각 수 · 계산된 머리 수(pieces.json 이면 **33**) · 거부 사유.
- **쓰기 = 백필 RPC `launch_backfill_apply(p_pieces jsonb, p_heads jsonb)`** — Pattern 2 헬퍼를 `source='backfill'` 로 부른다. supabase-js `.upsert({onConflict})` 는 조건부 WHERE 를 못 걸어 라이브(journal) 행을 덮는다 → 쓰지 않는다. 배치 500행/호출(lessons 2026-06-10 청크 규율).
- 입력 어댑터 2개: ① D-07 ndjson(풀린 필드명 · 한 줄 = 조각) ② 첨부 `pieces.json` 배열 `{date, broker("KB"|"교보"), market("코스피"|"코스닥"), wire, q, j, rel, result}` [VERIFIED: 첫 원소 `{'date': '2026-10-12', 'broker': 'KB', 'market': '코스피', 'wire': 0, 'q': 'Q153027001', 'j': 0, 'rel': -305, 'result': '101'}`] → gateway `KB→KB120 · 교보→KYOBO119`, market `코스피→K · 코스닥→Q`, profile `Q16`, fire `KRX 16:00:00`, side/round/order_no/accept_time null.
- 참고: 원본 로그 줄에는 pieces.json 에 없는 `ordno` · `probe` · `accept_time` 이 있다 [VERIFIED: pieces120.txt 1행 `ordno=3404000288 probe=0 sent_rel_us=-305 result=101 accept_time=155959999`] — gh-trade 전체 ndjson 이 이 값을 싣게 요구(D-21 ①).
- 테스트 선례: 가짜 Supabase 클라이언트가 체인/rpc 호출을 기록 [VERIFIED: relay/tests/accum-backfill.test.ts:1-10 주석].
- **실행은 메인 세션** — executor 는 `--help` · 단위 테스트까지. env 파일 읽기는 훅이 막는다(34-RESEARCH Pitfall 18 [VERIFIED: .planning/phases/34-accum/34-RESEARCH.md:427-429]). 원격 쓰기라 명령을 사용자에게 먼저 보인다(D-09).

### Anti-Patterns to Avoid
- **트리거로 해석:** 실패 = 배치 전체 실패, rows 제외 불가(Q1).
- **`dma_strategy_events` 에 칸 추가:** 공개 45키 계약이 깨진다.
- **모든 이벤트에 EXCEPTION 블록:** kind 15 분당 수십 행에 savepoint 비용. 17·18 만.
- **경계 계산을 SQL·TS 두 벌로:** 백필 머리(TS)와 지도(SQL)가 갈라진다.
- **N 「다음 오프셋」 을 상수로 박기:** 고정값이 바뀐다(10/24 −200 → 10/26 −350·−250 → 10/27 −200/−245 [CITED: gh-trade/docs/strategy/open-arb.md:218-220]). 늘 최신 kind 18 에서.
- **`isMarketStrategyEvent` 에 17·18 추가:** 시세 이벤트로 공개돼 **전원에게** 퍼진다(D-05 금지).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 날짜 알약 · 앞뒤 날짜 | 새 날짜 부품 | `LimitupDateNav` · `dateNavOf` · `parseYmdParam` · `fmtYmdShort` | [VERIFIED: webapp/src/lib/limitup-report.ts:355-385] 적재 날짜 사이 이동 · 실재 날짜 검증 |
| 탭 | 직접 버튼 탭 | shadcn `tabs`(radix) | [VERIFIED: components/ui/tabs.tsx] 키보드·ARIA |
| 차트 폭 측정 | ResizeObserver 직접 | `useChartWidth` | [VERIFIED: hooks/use-chart-width.ts] 폴백 640 · jsdom 0 흡수 |
| 어드민 인가 | 라우트별 role 조회 | `requireAuth() → requireAdmin()` 경로 관문 | [VERIFIED: require-admin.ts] 매 요청 DB 조회 · 강등 즉시 |
| 실패 보고 | 새 로깅/표 | apply `errors[]` → relay 기존 warn + `/healthz` | [VERIFIED: writer.ts:616-622] |
| env 주입 | 스크립트 안 dotenv | 래퍼 `set -a; source` 비출력 | 비밀 가드 · 출력 위생 |
| 날짜 검증(서버) | 새 regex | `Ymd` | [VERIFIED] 웹 `parseYmdParam` 과 같은 판정 |
| SQL 테스트 러너 | 원격 DB | `bash scripts/verify-dma-orders-price-check.sh --test …` | 일회용 컨테이너 · 원격 접촉 0 |

**Key insight:** 이 phase 의 위험은 새 기술이 아니라 **기존 계약 4곳(apply 반환 모양 · 공개 45키 · 가시성 kind 집합 · 사이드바 순서)을 건드리면서 깨뜨리지 않는 것**이다 — 그래서 각 지점에 이미 있는 회귀 테스트를 그대로 돌리는 것이 핵심 검증이다.

## Runtime State Inventory

(리네임 phase 는 아니지만 apply 재정의 · 투영 지연 때문에 런타임 상태를 점검했다.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Wave A 배포 ~ Wave B 배포 사이 gh-trade 가 먼저 배포하면 kind 17·18 **원문만** `dma_strategy_events` 에 쌓이고 `launch_*` 는 비어 있다(스텁 no-op) | Wave B 마이그레이션 뒤 `SELECT public.launch_reproject();` 1회(데이터 재해석 — 코드 편집과 별개 태스크) |
| Live service config | 없음 — relay 설정 · Cloud Run env 무변경(새 env 없음) | 없음 |
| OS-registered state | 없음 — 새 잡/스케줄러 없음(적재는 relay 상시 경로) | 없음 |
| Secrets/env vars | 백필은 기존 `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`(`workers/master-sync/.env`) 재사용 — 새 키 없음 | 없음 |
| Build artifacts | `packages/shared/dist` — 새 export(`launch.ts`)는 shared 빌드 전엔 relay/server/webapp 이 못 본다 | 각 플랜 verify 앞에 `pnpm --filter @gh-radar/shared build` |

## Common Pitfalls

### Pitfall 1: A 두 다리가 D-01 키에서 충돌
**What goes wrong:** A 의 09:00:27 KRX 매수 다리와 09:00:30 NXT 매도 다리가 같은 `(trade_date, gateway, 'A', market, wire)` 를 쓰면 뒤에 온 다리가 앞 다리 행을 덮는다. 머리 키 `(trade_date, gateway, profile, market)` 도 같다.
**Why:** 인박스 노트의 wire 정의는 「시장 송신 순번」 이고 발사(다리)마다 0 부터인지, 프로파일을 가로질러 한 줄인지 미정이다(노트 「발사 1회 = (날짜, 서버, 프로파일, 시장) 단위」 — A 는 한 프로파일 안 두 발사).
**How to avoid:** 두 키에 `fire_exchange`(또는 `fire_base`)를 더한다 — D-03 이 이미 이 열을 요구하므로 새 정보가 아니다. 이것은 D-01(「Reversibility: costly」) 의 확장이라 **플래너가 사용자 확인 1회**(또는 「D-03 의 자연스러운 귀결」 로 직접 결정하고 한 줄 보고 — lessons 2026-10-05 「원문으로 풀기」). gh-trade 노트에도 「wire 가 다리별 0 부터인가」 질문.
**Warning signs:** 09:00:30 표에 A 매도 조각이 안 보이는데 A 매수만 있다.

### Pitfall 2: 해석 실패가 배치를 깨뜨림 / 너무 많은 savepoint
위 Q1. 서브블록은 17·18 에만.

### Pitfall 3: Q16 「다음 오프셋」 ≠ `correction_after`
**What goes wrong:** 지도의 점선을 `correction_after` 로 그리면 편도(one_way ≈ 200µs)만큼 어긋난다.
**Why:** gh-trade 문서 — 「보정치는 편도 기준 위의 값」 [CITED: gh-trade/docs/features/queued-order.md:223], 실서버 대입 「Q {-151, 6, 201, −1, bracketed, run 3} … 반전 step 5 · −347µs」 [CITED: 같은 파일 :154] → −151+5 = −146, −146 − 201 = −347 (발사 오프셋 = 보정치 − 편도).
**How to avoid:** kind 18 에 **`next_offset_us`(다음 첫 조각 rel 목표)** 를 계산값으로 직접 실어 달라고 D-21 ② 요구에 추가. 웹은 그 값만 쓴다. 백필 머리에는 없음(null → 점선 생략 또는 「—」).

### Pitfall 4: 09:00:30 이상치가 축을 수천 배로 늘림
**What goes wrong:** 10/26 N 은 휴장 중 오발로 −20,148µs 에 나갔다(정상 −200 근처) [CITED: gh-trade/docs/strategy/open-arb.md:225 「09:00:29.98 송신」] [VERIFIED: pieces120.txt `sent_rel_us=-20148`]. 범위에 정상 날과 이 날이 섞이면 x 폭 ≈ 20,000µs → 첨부 식은 눈금 `step 20` 으로 **1,000개 선**, 리본 `v+=1` 로 **2만 칸 × rect 3** = 6만 SVG 노드.
**How to avoid:** 눈금은 「목표 8~12개 nice step」 함수로, 리본 칸 수는 `min(span/stepR, 그림 폭 px)` 로 상한. 이상치 표시(축 끊기 · 「← 범위 밖」 표식)는 UI-SPEC 재량 — Open Question 2.

### Pitfall 5: `판단 불가` 날이 실제로 있다
**What:** 첨부 데이터 KB 코스피 10/16 = 조각 3개 전부 「기타」 → lo·hi 둘 다 null(`판단 불가`) [VERIFIED: 이번 세션 group() 재계산]. D-16 의 3분류만 구현하면 이 날이 깨진다. 패널 머리 집계(경계·전부 접수·전부 거부)에는 안 세고, 표에는 회색 알약 「판단 불가」(첨부·목업 그대로), 리본에서는 그날이 늘 「모름」.

### Pitfall 6: 투영 표 CHECK 로 인한 조용한 유실
`result` 어휘는 이미 `무응답`(문서) · `515` · 교보 `E127`(515 로 접힘 [CITED: open-arb.md:228]) 처럼 늘어 왔다. 원문 표는 CHECK 를 일부러 안 건다 [VERIFIED: 20260929180000:18-21 주석]. 투영 표에서 CHECK 위반은 포이즌 격리로 **그 조각만 조용히 빠진다**(errors 로그만). → `result`·`profile`·`market` 에 CHECK 금지(`source` 만 CHECK). 모르는 값은 웹이 회색 「기타」 로.

### Pitfall 7: `accept_time` 앞 0 유실
로그 `accept_time=90029979` [VERIFIED: pieces119.txt] — 09시대는 8자리. `HH:MM:SS.mmm` 변환 전 `padStart(9,'0')`. 16시대(`155959999`)는 9자리라 16:00 만 테스트하면 놓친다.

### Pitfall 8: 날짜 형식 두 벌
DB `trade_date date` vs 웹 `LimitupDate = string`(YYYYMMDD) [VERIFIED: packages/shared/src/limitup-report.ts:13 `export type LimitupDate = string;`]. RPC 가 `to_char(…,'YYYYMMDD')` 로 내보내고 `p_date` 는 `to_date(p_date,'YYYYMMDD')` 로 받는다. 피스 행의 `trade_date` 도 같은 형식으로 낼지(권장: 봉투 날짜와 같게) 한 번에 정한다.

### Pitfall 9: `dma_user_id` 노출은 의도된 예외
원문 표 머리 주석: 「`dma_user_id` 는 감사 칸이다 — 적재만 하고 적용 · 조회 RPC 어디에서도 반환하지 않는다(T-19-08)」 [VERIFIED: 20260929180000:22]. D-02 가 어드민에 한해 이를 뒤집는다 → 마이그레이션 주석과 어드민 RPC 주석에 「D-02 · 어드민 전용 예외」 를 명시(나중 리뷰가 T-19-08 위반으로 오판하지 않게). 사용자 경로(rows · 래퍼)로는 여전히 안 나간다(Q3).

### Pitfall 10: shared dist 직렬화 · 동시 세션 메모리
`packages/shared` 를 고치는 플랜과 그 dist 를 소비하는 플랜이 같은 웨이브에서 병렬로 빌드하면 경합(Phase 34 가 웨이브를 나눈 이유 [VERIFIED: 34-03-PLAN.md:64]). vitest `--maxWorkers=2` · playwright `--workers=1`(메모리 10-10 고갈).

### Pitfall 11: 페이지가 Suspense 없이 `useSearchParams`
Pattern 7. `/admin/servers/page.tsx` 를 복사하면 걸린다.

### Pitfall 12: 마운트 순서
Pattern 5 — adminRouter 뒤에 두면 역할 조회 2회.

### Pitfall 13: 핸드오프 노트는 저장소 밖에 쓴다
`scripts/trade-handoff.sh` 는 `<gh-trade>/docs/inbox/from-gh-radar/` 에 파일을 만든다 [VERIFIED: trade-handoff.sh:11 · ⑥] — 작업 디렉터리 밖 쓰기라 샌드박스/권한에 걸릴 수 있다. 첫 플랜(노트 작성)은 메인 세션이 하거나 실패 시 사용자 안내. 노트 커밋은 gh-trade 세션 몫(이 스크립트는 커밋 안 함 [VERIFIED: :13]).

### Pitfall 14: 동시 세션
현재 트리에 다른 세션의 미커밋 변경(`relay/src/generated/StockDMA.fbs` 외 3 · `.planning/phases/36-account-budget/`)이 있다(gitStatus). 커밋은 경로 지정만, 긴 execute 는 전용 worktree(메모리).

## Code Examples

### D-10 자동 대조 기대값 (첨부 `pieces.json` 196행 → `group()` · 이번 세션 재계산)
입력 검증: `pieces.json` 196행 = HTML `ROWS` 196행, **순서까지 동일** [VERIFIED: 파이썬으로 `[date[5:], broker, market, wire, j, rel, result]` 변환 후 비교 `equal ordered True`]. 결과 집계 `접수 132 · 101 47 · 기타 17` · 날짜 11개(10/12~10/26 거래일) · 발사(날짜×서버×시장) **33** · wire 0 의 rel = 그 발사 최소 rel(33/33) · nonmono 0건.

| 패널 | 조각 | 날 | 경계 | 전부 접수 | 전부 101 | 판단 불가 | 접수 최소 | 101 최대 | 첨부 NEXT | 축(첨부 식) |
|------|-----|----|-----|---------|--------|---------|---------|--------|---------|-----|
| KB 코스닥 | 87 | 10 | 4 | 5 | 1 | 0 | −347 | −322 | −337 | −360 ~ −280 |
| KB 코스피 | 31 | 6 | 2 | 1 | 2 | 1 | −291 | −275 | −285 | −320 ~ −250 |
| 교보 코스닥 | 53 | 11 | 0 | 7 | 4 | 0 | −521 | −497 | −526 | −560 ~ −460 |
| 교보 코스피 | 25 | 6 | 0 | 2 | 4 | 0 | −395 | −384 | −400 | −430 ~ −350 |

날짜별(date, 조각, lo, hi, first, 분류) — 단위 테스트 정답:
```
KB 코스닥  10-12 6 null -342 -342 전부접수 | 10-13 6 null -347 -347 전부접수 | 10-14 5 -350 -342 -352 경계
           10-15 6 -337 -327 -347 경계   | 10-16 6 null -342 -342 전부접수 | 10-20 15 -347 -345 -347 경계
           10-21 3 -322 null -342 전부101 | 10-22 16 -335 -334 -337 경계   | 10-23 6 null -327 -327 전부접수
           10-26 18 null -332 -332 전부접수
KB 코스피  10-12 3 -302 null -305 전부101 | 10-14 10 -291 -291 -301 경계   | 10-16 3 null null -290 판단불가
           10-19 6 null -290 -290 전부접수 | 10-21 3 -275 null -295 전부101 | 10-23 6 -280 -260 -290 경계
교보 코스닥 10-12 6 null -476 -476 전부접수 | 10-13 3 null -498 -498 전부접수 | 10-14 2 -537 null -547 전부101
           10-15 3 -512 null -522 전부101 | 10-16 6 null -510 -510 전부접수 | 10-19 3 -497 null -517 전부101
           10-20 9 null -511 -511 전부접수 | 10-21 3 null -516 -516 전부접수 | 10-22 6 null -521 -521 전부접수
           10-23 3 -501 null -531 전부101 | 10-26 9 null -521 -521 전부접수
교보 코스피 10-12 3 -415 null -415 전부101 | 10-14 4 -399 null -410 전부101 | 10-16 3 -384 null -404 전부101
           10-19 6 null -394 -394 전부접수 | 10-21 3 -390 null -400 전부101 | 10-23 6 null -395 -395 전부접수
```
리본 표본(v = 첨부 NEXT, 식 `v>=hi → ok; else v<=lo → bad`): KB 코스닥 −337 → ok 5 · bad 3 · 모름 2 / KB 코스피 −285 → 2·2·2 / 교보 코스닥 −526 → 0·3·8 / 교보 코스피 −400 → 0·3·3.
첨부 NEXT 원문 [VERIFIED: launch-gate-map.html:85] `const NEXT = {"KB|코스피":-285,"KB|코스닥":-337,"교보|코스피":-400,"교보|코스닥":-526};` — 라이브에서는 kind 18 `next_offset_us` 가 대신한다(테스트에서는 주입값).

### 핀 박기 테스트 모양(shared)
```ts
// packages/shared/src/__tests__/launch.test.ts — 픽스처는 pieces.json 사본, 기대값은 위 표(첨부 group() 출력)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { launchDaysOf, launchHeadOf } from '../launch';

const raw = JSON.parse(readFileSync(path.resolve(__dirname, '../__fixtures__/launch-pieces-1012-1026.json'), 'utf8'));
// adapter: {broker:'KB'|'교보', market:'코스피'|'코스닥', rel, result} → {gateway, market:'K'|'Q', sent_rel_us, result}
it('KB 코스닥 10일 — 경계 4 · 전부 접수 5 · 전부 101 1', () => { /* … */ });
it('KB 코스피 10/16 — 전부 기타 → 판단 불가(lo·hi null)', () => { /* … */ });
it('백필 머리 33발사 — n_pieces 합 196 · first_accept_idx · offset_used = wire 0 rel', () => { /* … */ });
```

### pgTAP 틀 (Q7)
[VERIFIED: supabase/tests/dma_strategy_accum_signal.test.sql:1-40 · :166 `SELECT plan(31);` · :355-356 `SELECT * FROM finish(); ROLLBACK;`] — `BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path = public, extensions;` · 픽스처(auth.users · dma_users · app_users · `dma_journal_sync_access`) · `t_setup` 임시표에 `dma_strategy_apply(...)` 결과 저장 · 날짜는 **KST 오늘 기준 상대값**(purge 가 now() 기준). 단언 설명에 튜플.
Wave A 에서 칸 매핑이 없어도 apply 배선을 증명하는 법: **테스트 트랜잭션 안에서 `launch_project_event` 를 테스트용 매핑으로 `CREATE OR REPLACE`**(ROLLBACK 으로 사라짐) — 예: `price → sent_rel_us`, `entry_round → wire` 같은 가짜 매핑으로 upsert 헬퍼 호출, 또 하나는 `RAISE EXCEPTION` 하는 버전으로 포이즌 격리 확인.

단언 목록(제안):
1. 헬퍼: journal seq 5 → seq 3 재송신은 무시 · seq 7 은 덮음 · 다른 epoch 는 덮음 · backfill 행을 journal 이 덮음 · journal 행을 backfill 이 못 덮음 · backfill 재실행 멱등(행 수 불변).
2. apply: 17·18·1 섞인 한 배치 → applied 3 · rows 길이 1(kind 1 만) · 원문 3행 · `launch_*` 각 1행.
3. 도착 순서: 18 먼저 → 17 나중, 그 반대 — 결과 동일.
4. 포이즌: 스텁이 RAISE → applied 그대로 · errors 1 · 원문 남음 · 같은 배치의 다른 이벤트 정상 · 커서 전진.
5. 재생: 같은 배치 2회 → skipped · 투영 0회(헬퍼 호출 계수 또는 updated_at 불변).
6. 가시성: 실계좌 `account_no`+`order_no` 를 실은 kind 17 → `dma_strategy_events_for_user_json` 0행 · `dma_order_events_for_user` 0행.
7. purge: `kind 17·18 · 오늘−31일` 행이 `dma_strategy_events_purge_limit_feature(30)` 뒤 남는다(그 함수 반환 수에 안 셈).
8. `launch_reproject`: 스텁 상태에서 쌓인 원문 → 매핑 교체 → reproject → 행 생김 · 2회 실행 멱등.
9. 어드민 RPC: 빈 표 `{dates:[], date:null, …}` · `p_date` 없는 날 빈 배열 · `p_days 10` 절단 · `n0930` 이 N+A 를 묶음 · 날짜 형식 YYYYMMDD.
10. 권한: 표 4개 동작 · 함수 전부 anon/authenticated EXECUTE 불가 · service_role 가능 · `pg_policies` 0개(`has_function_privilege` · `pg_policies` 패턴 — accum_report.test.sql 선례 [VERIFIED: 34-05-PLAN acceptance 「`has_function_privilege` · `pg_policies`」]).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 전략 이벤트 = 원문 보존 · 투영 없음 | kind 17·18 만 투영(첫 DB 쪽 해석) | 이 phase | apply 재정의 · `errors[]` 가 처음으로 비어 있지 않을 수 있다 |
| 첨부 지도 = 로그 손작업 HTML | DB 정본 + 어드민 | 이 phase | 서버는 하루치만 → gh-radar 가 유일한 이력 |
| N 오프셋 −150 기본 | 서버별 고정값(119 −200 · 120 −245) — 수시 변경 | 2026-10-27 [CITED: open-arb.md:218-220] | 상수 금지, kind 18 값 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A 의 두 다리 wire 가 다리마다 0 부터 매겨져 D-01 키가 충돌한다 | Pitfall 1 | 반대(프로파일 가로 한 줄 순번)면 키에 fire_exchange 를 넣어도 무해 — 위험 없음. 넣지 않았는데 충돌하면 A 행 유실 |
| A2 | kind 18 이 `next_offset_us` 를 실을 수 있다(gh-trade 가 학습 결과 계산 시점에 앎) | Pitfall 3 | 못 싣으면 `correction_after − one_way_us` 를 웹이 계산(공식은 문서로 확인됨) |
| A3 | Playwright 는 나중에 등록한 route 를 먼저 매칭한다 | Pattern 7 | 틀리면 발사 spec 에서 mockAdminApi 와 섞을 때 404 — 발사 spec 이 전용 route 만 쓰면 무관 |
| A4 | 「최근 10일」 은 발사 기준(q16 / n0930)별 거래일 | Pattern 4 | 사용자 의도가 「공통 거래일」 이면 n0930 지도가 비는 날이 생김 — UI-SPEC 에서 확인 |
| A5 | gw_time_ms/재송신의 epoch 규칙(다른 epoch = 새로 온 쪽 이김)이 gh-trade 재송신 동작과 맞다 | Pattern 2 | gh-trade 가 옛 epoch 로 재송신하면 옛 값이 이길 수 있음 — 핸드오프 노트 질문 |
| A6 | `dma_user_id` 를 kind 17 원문 `dma_user_id` 칸에 실어도 됨(사용자 경로로 안 나감) | Q3 · Pitfall 9 | 없음 — rows · 래퍼 모두 제외됨 |

## Open Questions

1. **A 두 다리의 키 (Pitfall 1)**
   - 아는 것: D-03 이 발사 기준 열을 요구 · A 는 한 프로파일 두 발사.
   - 모르는 것: wire 가 다리별인지 · 머리가 다리별 2행인지 1행인지.
   - 권장: 키에 `fire_exchange` 포함으로 플래너가 확정(사용자 한 줄 보고) + 핸드오프 노트에 질문.
2. **09:00:30 이상치 표시 (Pitfall 4)**
   - 권장: UI-SPEC 단계에서 「축 밖 표식」 안 결정 · 구현은 눈금/리본 칸 상한부터.
3. **정식 인계 노트 도착 시점**
   - Wave B(매핑 · reproject · 라벨 sync · 라이브 UAT)는 노트 조건부 — 플래너는 Wave B 를 `checkpoint` 로 막고 Wave A 만으로 백필 · 어드민 화면 · UAT(백필 데이터 대조)까지 끝낼 수 있게 가른다.
4. **`n_101`/`n_515` 를 한 열(`n_reject`)로?** 권장 한 열 + profile 로 뜻. 노트 매핑 뒤 확정.
5. **핸드오프 노트 slug** — D-21 은 `launch-gate-contract`. 그대로.

## gh-trade 핸드오프 (Q8 — 첫 플랜 산출물)

- 명령: `scripts/trade-handoff.sh launch-gate-contract` → `<gh-trade>/docs/inbox/from-gh-radar/261027-launch-gate-contract.md`(날짜는 실행일 YYMMDD) 생성 · 템플릿 4토큰 치환 · 이미 있으면 거부 · 커밋 안 함 [VERIFIED: scripts/trade-handoff.sh:7-13].
- 템플릿 섹션 [VERIFIED: docs/inbox/trade-handoff-template.md]: `## 요청 내용` · `## gh-trade 가 할 일` · `## 배포 순서 제약`(「gh-radar 먼저 배포가 안전한가: TODO」) · `## 확인 방법` · `## 질문`. TODO 전부 채운다.
- 채울 내용(D-21 + 이 리서치 추가분):
  1. **백필 ndjson 지금** — 한 줄 = 조각, 키: `date · gateway(KB120|KYOBO119) · profile · fire_exchange · fire_base · market(K|Q) · wire · queued_id · piece_idx · round · probe · order_no · sent_rel_us · result · result_code · accept_time · retry · abandoned` + 가능하면 `side · isin · price · qty · filled_qty · account · user`. 두 서버 · 로그 전부 · 16:00 + 09:00:27 + 09:00:30.
  2. **kind 17 칸 매핑**에 위 필드 전부(발사 기준 · side 필수 — D-03 one-way). **kind 18** 에 `next_offset_us`(다음 첫 조각 rel — **계산값**, Pitfall 3) · `offset_used_us` · gate_lo/hi · nonmono · n_* · first_accept_idx · retries · abandoned · 학습값(correction_before/after · step · last_dir · bracketed · same_dir_run · reject_span · jump · one_way · rtt_min).
  3. 질문: A 다리별 wire 시작(0부터?) · A 머리 1행/2행 · 재송신 시 seq/epoch/gw_time_ms 규칙 · kind 18 은 조각 뒤에 오는가(순서 무관하게 설계했음을 알림) · `account_no`/`dma_user_id` 칸에 실어도 됨(gh-radar 가 사용자 경로에서 17·18 을 막음).
  4. 배포 순서: 「gh-trade 먼저 배포 안전 — relay 는 모르는 kind 도 원문 적재, DB 해석은 매핑 전 no-op, 매핑 뒤 원문 재해석」.
- 그 뒤 상의 노트 `docs/inbox/from-gh-trade/261027-launch-gate-admin.md` 에 `## 회신`(질문 ①③ 로드맵 때 회신 · ② = D-02 그대로 노출 · 채널 A 확정 · 위 요구 링크)을 적는다. `status: done` 은 phase 끝(D-21).
- SendMessage 보조 — 메인 세션이 ListAgents 로 gh-trade 세션을 찾는다(CLAUDE.md).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + 로컬 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP 러너 | ✓ | 이미지 eefa6c87e0fa(로컬 보유) | 없음 — exit 3 = 미실행(통과 아님) |
| Node | 전 워크스페이스 | ✓ | v24.21.0 | — |
| pnpm | 필터 실행 | ✓ | 11.15.1 | — |
| tsx (relay node_modules) | 백필 스크립트 | ✓ | relay/node_modules/.bin/tsx | — |
| Playwright | E2E | ✓ | ^1.59.1 | — |
| Supabase CLI | `supabase db push --linked --yes`(메인 세션) | ✓ | 2.75.0 (2.122.0 있음 — 업데이트 불필요) | — |
| gh-trade 저장소 `../gh-trade` | 핸드오프 노트 | ✓ | /Users/alex/repos/gh-trade | `TRADE=` 지정 |
| 정식 인계 노트(kind 17·18 칸 매핑) | Wave B | ✗ | — | Wave A 는 무관하게 진행 · Wave B 체크포인트 |
| gh-trade 전체 백필 ndjson | 백필 전체분 | ✗ | — | 첨부 `pieces.json`(16:00 196행)로 먼저 적재·대조 |

**Missing dependencies with no fallback:** 없음(Wave B 만 외부 대기).
**Missing dependencies with fallback:** 정식 노트 · 전체 ndjson.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pgTAP(SQL) · vitest 4.1(shared · relay · server) · vitest 2.1(webapp) · Playwright 1.59(e2e) |
| Config file | `packages/shared/vitest.config.ts` · relay/server 기존 · `webapp/playwright.config.ts`(baseURL 3100 · webServer 자동) |
| Quick run command | 아래 표의 파일 단위 `exec vitest run <file> --maxWorkers=2` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/launch-backfill.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-launch.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1` + pgTAP 4줄(아래) |

(Phase 34 전체 회귀 명령의 모양 그대로 [VERIFIED: 34-*-PLAN.md `<automated>`]. config 의 `test_command` 는 relay·webapp 만 돈다 — server·shared 는 위처럼 명시.)

pgTAP(일회용 컨테이너 · 원격 접촉 0):
```
bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql
bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql        # apply 재정의 회귀
bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_accum_signal.test.sql # 래퍼 · purge 회귀
bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql         # 주문 타임라인 회귀
```
(추가로 `dma_strategy_limit_feature.test.sql` · `dma_gateway_identities.test.sql` 도 apply 를 부른다 [VERIFIED: grep] — 마이그레이션 플랜 최종 verify 에 포함 권장.) 판정: exit 0 이고 출력에 `not ok` · `Looks like you planned` 없음. **exit 3 = 이미지/도커 없음 = 미실행(통과 아님)** [VERIFIED: verify-dma-orders-price-check.sh:85-88].

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAUNCH-01 | 핸드오프 노트 존재 · TODO 없음 · 회신 섹션 | smoke(grep) | `f=$(ls ../gh-trade/docs/inbox/from-gh-radar/*-launch-gate-contract.md) && ! grep -q 'TODO' "$f" && grep -q 'next_offset_us' "$f" && grep -q '^## 회신' docs/inbox/from-gh-trade/261027-launch-gate-admin.md` | ❌ 산출물 |
| LAUNCH-02 | 표 · 권한 · 조건부 upsert · 도착 순서 무관 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql` | ❌ Wave 0 |
| LAUNCH-03 | apply 포이즌 격리 · rows 제외 · 재생 멱등 · 기존 계약 | pgTAP | 위 + `dma_strategy_apply.test.sql` | ❌ / ✅ 회귀 |
| LAUNCH-04 | json 래퍼 · 타임라인 제외 · purge 15/16 고정 | pgTAP | `launch_gate.test.sql` + `dma_strategy_accum_signal.test.sql` + `dma_strategy_read.test.sql` | ❌ / ✅ |
| LAUNCH-05 | 401/403/400(zod)/RPC 1회/모양 위반 500/snake_case 통과 · 마운트 순서(역할 조회 1회) | unit(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-launch.test.ts --maxWorkers=2` | ❌ Wave 0 |
| LAUNCH-06a | 경계 · 분류 · 리본 · 머리 = 첨부 group() | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch.test.ts --maxWorkers=2` | ❌ Wave 0 |
| LAUNCH-06b | 축 · nice 눈금 상한 · 리본 칸 상한 · 스태킹 · 마름모 · µs/시각 포맷(9자리 패딩) | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/launch-map.test.ts src/lib/__tests__/launch-format.test.ts --maxWorkers=2` | ❌ Wave 0 |
| LAUNCH-06c | 사이드바 순서 「서버 → 발사」 | unit + e2e | `pnpm --filter @gh-radar/webapp exec vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ 갱신 |
| LAUNCH-06d | 토큰 라이트/다크 둘 다 · oklch 없음 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/styles/__tests__/tds-tokens.test.ts --maxWorkers=2` | ✅ 갱신(`THEME_COLOR_TOKENS` 에 추가) |
| LAUNCH-06e | 탭 · 날짜 알약 · 세그먼트 · 프리셋 칩 · 4패널 · 폰 390 가로 스크롤 · 빈 상태 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-launch.spec.ts --workers=1` | ❌ Wave 0 |
| LAUNCH-07 | ndjson/pieces.json 파싱 · 매핑 · 머리 33 · 배치 RPC 페이로드 · dry-run 무쓰기 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/launch-backfill.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay exec tsx ../scripts/launch-backfill.ts --help` | ❌ Wave 0 |
| LAUNCH-07b | 적재 뒤 원격 대조(날짜 11 · 행 196 · 머리 33) | manual(메인 세션) | dry-run 출력 → `--apply` → 어드민 지도 10/12~10/26 vs 첨부 지도 나란히(UAT) | manual |
| LAUNCH-08 | 실물 날짜 kind 17·18 적재 · 다음 오프셋 선 = kind 18 | manual UAT | 16:00:01 · 09:00:31 이후 relay 로그 + 어드민 화면(D-23) | manual |

### Sampling Rate
- **Per task commit:** 그 태스크 파일 단위 vitest/pgTAP 1~2개(`--maxWorkers=2`).
- **Per wave merge:** 그 웨이브가 건드린 워크스페이스 typecheck + 해당 vitest 전체 + 마이그레이션 웨이브는 pgTAP 4~6개.
- **Phase gate:** 위 Full suite + pgTAP 전부 green 뒤 `/gsd-verify-work`. 전체 회귀는 한 세션만(메모리 10-10).

### Wave 0 Gaps
- [ ] `supabase/tests/launch_gate.test.sql` — LAUNCH-02/03/04
- [ ] `packages/shared/src/__fixtures__/launch-pieces-1012-1026.json`(pieces.json 사본) + `packages/shared/src/__tests__/launch.test.ts` — LAUNCH-06a · LAUNCH-07 공용 정답
- [ ] `relay/tests/launch-backfill.test.ts` — LAUNCH-07
- [ ] `server/tests/routes/admin-launch.test.ts` — LAUNCH-05
- [ ] `webapp/src/lib/__tests__/launch-map.test.ts` · `launch-format.test.ts` — LAUNCH-06b
- [ ] `webapp/e2e/specs/admin-launch.spec.ts` + `webapp/e2e/fixtures/launch.ts` — LAUNCH-06e
- 프레임워크 설치: 없음(전부 존재)

## Security Domain

`security_enforcement: false`(`.planning/config.json` [VERIFIED]) · 메모리 「보안검사 안 함」 — 섹션 생략. 단, 인가 경로(Express `requireAdmin` · RPC REVOKE · 표 RLS 정책 0)와 사용자 경로 누설 차단(Q3 4곳)은 기능 요구로서 위 pgTAP·supertest 에 이미 들어 있다.

## Sources

### Primary (HIGH confidence — 이번 세션 실독)
- `supabase/migrations/20260929180000_dma_strategy_events.sql` · `20260929180100_dma_strategy_apply.sql` · `20261004090100_dma_journal_apply_skipped_rows.sql` · `20261018120000_dma_strategy_events_accum_signal.sql` · `20260929190000_dma_gateway_identities.sql` · `20261020200000_limitup_accum_flow.sql` · `20261020200100_accum_report_rpc.sql` · `20261007200000_gateway_key_rename.sql`
- `relay/src/journal/strategy-stream.ts` · `writer.ts` · `types.ts` · `relay/src/ws/fanout.ts:3290-3345` · `relay/src/index.ts:500-501` · `relay/src/dma/envelope.ts:330-352` · `relay/src/generated/StockDMA.fbs:1300-1440`
- `server/src/app.ts` · `routes/admin.ts` · `routes/admin-servers.ts` · `routes/accum-report.ts` · `services/accum-report.ts` · `schemas/accum-report.ts` · `schemas/limitup-report.ts` · `middleware/require-admin.ts` · `tests/routes/admin-servers.test.ts`
- `webapp/src/components/layout/app-sidebar.tsx` · `__tests__/app-sidebar.test.tsx:1478-1520` · `e2e/specs/sidebar-tree.spec.ts:80-121` · `e2e/specs/admin-servers.spec.ts` · `e2e/fixtures/admin.ts` · `app/admin/servers/page.tsx` · `app/analytics/accum/page.tsx` · `components/analytics/accum-report.tsx` · `limitup-date-nav.tsx` · `lib/limitup-report.ts` · `lib/admin-api.ts` · `lib/auth-fetch.ts` · `lib/accum-api.ts` · `hooks/use-chart-width.ts` · `components/ui/tabs.tsx` · `styles/globals.css` · `styles/__tests__/tds-tokens.test.ts` · `lib/use-relay-socket.ts:1064-1080`
- `packages/shared/src/strategy-event.ts` · `strategy-event-labels.ts` · `admin.ts` · `accum-report.ts` · `index.ts`
- `scripts/export-accum-backfill.ts/.sh` · `scripts/migrate-dma-users.ts` · `scripts/verify-dma-orders-price-check.sh` · `scripts/trade-handoff.sh` · `docs/inbox/trade-handoff-template.md` · `relay/tests/accum-backfill.test.ts` · `supabase/tests/dma_strategy_accum_signal.test.sql` · `dma_strategy_apply.test.sql`
- 첨부 `launch-gate-map.html` · `pieces.json` · `pieces120.txt` · `pieces119.txt` · 목업 2개 · 인박스 노트 · `.planning/phases/34-accum/*-PLAN.md` · `34-RESEARCH.md` · `tasks/lessons.md`

### Secondary (MEDIUM — 공식 문서 / 형제 저장소 문서)
- PostgreSQL 17 문서 §PL/pgSQL Trapping Errors (예외 블록 롤백 범위 · 비용 팁)
- `gh-trade/docs/strategy/open-arb.md`(§5 N 고정 오프셋 · 10/26 오발 · E127) · `gh-trade/docs/features/queued-order.md`(보정치 = 편도 기준 · 게이트 정의 · 로그 형식) · `gh-trade/docs/inbox/from-gh-radar/README.md`

### Tertiary (LOW)
- Playwright route 등록 순서 우선(A3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 없음, 전부 기존 파일 확인.
- Architecture: HIGH — apply 재정의 · 누설 4곳 · 마운트 순서 모두 원문 확인. 칸 매핑만 미정(설계로 격리).
- Pitfalls: HIGH(1·3·4·5·7 은 데이터/문서로 실증) / MEDIUM(A1 의 실제 wire 규칙).

**Research date:** 2026-10-27
**Valid until:** 정식 인계 노트 도착 시(칸 매핑 · 키 질문 답으로 Pattern 1b · Pitfall 1 · 3 재확인) — 그 외 30일.
