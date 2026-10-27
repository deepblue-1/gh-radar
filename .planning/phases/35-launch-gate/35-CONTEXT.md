# Phase 35: 발사 경계 지도 어드민 - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade 서버(KB120 · KYOBO119)의 매일 **16:00 예약 발사(Q16)** 와 **09:00:30 개장차익 발사(N · A)** 결과가 조각(1행/주문 조각)·머리(1행/발사) 단위로 gh-radar DB 에 쌓인다(서버 쪽은 하루치만 남으므로 gh-radar DB 가 유일한 이력 저장소). 채널은 관찰자 저널(80) StrategyEvent **kind 17 LaunchPiece · 18 LaunchHead** — relay 는 kind 를 해석하지 않고 43칸 원문을 `dma_strategy_events` 에 넣으므로 **relay 무변경**, 해석·upsert 는 DB 쪽이 `launch_pieces` · `launch_heads` 로 푼다. 웹 **어드민 메뉴 「발사」**(Admin 그룹 · 항목 1개)에서 탭 ① 날짜별 발사 주문 내역(머리 카드 + 조각 표 · 16:00 / 09:00:30 전환) ② 날짜 범위 프리셋의 **발사 경계 지도**(서버 × 시장 4패널 순수 SVG · 첨부 지도 구성 그대로)를 본다. 서버 로그에 남은 **모든 과거 발사**를 gh-trade 가 ndjson 으로 넘기고 1회 적재 스크립트로 백필한다.

**이 discuss 에서 확정된 전제(2026-10-27):**
- gh-trade 상의 노트 `docs/inbox/from-gh-trade/261027-launch-gate-admin.md` 의 질문 ①(채널 A) ③(백필 스크립트 가능)은 로드맵 확정 때 gh-trade-cc 에 회신됐다. 질문 ②(계좌·사용자 열)는 이 discuss 에서 **그대로 노출**로 결정(D-02).
- **A 프로파일은 두 다리**다(`gh-trade/docs/strategy/open-arb.md` §5 · §7): 09:00:27 KRX 매수 IOC(경계 아님) → **09:00:30 NXT 매도**(N 프리빌드와 같은 순간 NXT 로 송신). 사용자 결정: **09:00:30 경계 지도는 NXT 로 쏜 조각 전부(N 매수 + A 매도)를 한 지도에 합치고 매수/매도를 구별**한다. 따라서 조각은 「발사 기준(거래소 + 기준시각)」 과 side 로 식별돼야 하며, 이는 gh-trade 정식 인계 노트의 칸 매핑에 요구한다(D-03 · D-21).
- `dma_strategy_apply` 는 현재 INSERT … ON CONFLICT DO NOTHING + 커서 upsert 뿐이고 `dma_strategy_events` 에는 트리거가 없다. kind 16 도 다른 표로 투영되지 않는다(`dma_accum_signals_for_user_json` 이 읽기만). **kind 17·18 → launch_* 투영이 이 표의 첫 DB 쪽 해석**이다.
- 사용자 래퍼 `dma_strategy_events_for_user` 의 시장 kind 집합 {1,2,10,15,16} 밖이라 17·18 은 `account_no ''` 인 한 이미 숨겨진다 — 그래도 json 래퍼에 `kind NOT IN (17,18)` 을 명시한다(D-05). relay ws fan-out 도 같은 집합이라 소켓으로 새지 않는다.
- 웹에 날짜 **범위** 선택 부품은 없다(단일 날짜 알약 `LimitupDateNav` 만). 사용자 결정: 범위 입력 부품을 만들지 않고 프리셋 칩(D-15).

</domain>

<decisions>
## Implementation Decisions

### 적재 모델 (DB · kind 17·18 해석)
- **D-01: 표 2개 · 논리 키 · 최신 seq 우선 upsert.** `launch_pieces` 논리 키 `(trade_date, gateway, profile, market, wire)` · `launch_heads` 논리 키 `(trade_date, gateway, profile, market)` — 같은 키가 다시 오면(저널 재생 · 서버 재기동 재송신) **seq 가 큰 쪽이 이긴다**(멱등). 원문 `(gateway, journal_epoch, seq)` 를 풀린 행에 같이 보관(추적). 해석 위치(`dma_strategy_apply` 재정의 vs `dma_strategy_events` 트리거)는 리서치/플래너 재량(D-06 제약). — **Reversibility:** costly — 논리 키를 바꾸면 백필 스크립트 · 어드민 RPC · 자동 대조 테스트가 함께 바뀐다.
- **D-02: 계좌·사용자 열 그대로 저장 · 그대로 표시.** `account` · `user`(DMA 사용자) 를 마스킹 없이 저장하고 어드민 조각 표에 노출한다(어드민은 `app_users.role='admin'` 만 · Phase 29 `requireAdmin`). gh-trade 질문 ② 답.
- **D-03: 프로파일 Q16 · N · A 셋 다 받는다 — A 는 두 다리.** A 의 09:00:27 KRX 매수 조각은 **주문 내역에만**(지도 대상 아님). A 의 **09:00:30 NXT 매도 조각은 N 매수 조각과 같은 「09:00:30 NXT 발사」 지도에 합쳐** 그린다(매수 = 원 · 매도 = 마름모 · D-17). 그래서 조각 행은 `profile`(Q16/N/A) 과 별도로 **발사 기준 = 거래소 + 기준시각**(16:00 KRX · 09:00:27 KRX · 09:00:30 NXT) 과 `side` 를 가져야 한다 — 열 이름·표현(예: `fire_at_base` + `exchange` 또는 `leg`)은 플래너 재량이되 **gh-trade 정식 인계 노트의 kind 17 칸 매핑에 이 세 값(거래소 · 기준시각 · side)을 요구**한다(D-21). 지도 RPC 는 「09:00:30 NXT」 기준으로 profile 을 가로질러 묶는다. — **Reversibility:** one-way — gh-trade 와이어 칸 매핑에 들어가는 요구다. 빠지면 09:00:30 지도에서 매수/매도를 가를 수 없고 서버 재배포가 필요하다.
- **D-04: 머리는 kind 18 우선 · 백필만 조각에서 계산.** 라이브 `launch_heads` 행은 kind 18 값(n_pieces · n_accepted · n_101/n_515 · n_other · first_accept_idx · retries · abandoned · gate_lo/hi · nonmono · Q16 학습값 correction_before/after · step · last_dir · bracketed · same_dir_run · reject_span · jump · one_way · rtt_min) 그대로. 백필(D-07)은 머리 없이 조각만 오므로 **적재 스크립트가 조각에서 셀 수 있는 값만**(n_* · first_accept_idx · gate_lo = 101 조각 최대 rel · gate_hi = 접수 조각 최소 rel · offset_used = 첫 조각 rel · 기타 제외) 채우고 나머지는 null. 두 표 모두 `source` 열(`journal` | `backfill`) 로 출처를 구별한다. 라이브 kind 18 이 백필 행과 같은 키로 오면 D-01 규칙대로 최신이 덮는다.
- **D-05: 영구 보관 — 둘 다.** `launch_heads` · `launch_pieces` 와 `dma_strategy_events` 의 kind 17·18 원문 **모두 purge 없음**. `dma_strategy_events_purge_limit_feature` 의 `kind IN (15,16)` 은 그대로(17·18 추가 금지 · 단위 테스트로 고정). `dma_strategy_events_for_user_json` 에 `kind NOT IN (17,18)` 명시 추가, `isMarketStrategyEvent`(shared) 에는 17·18 을 넣지 않는다(사용자 전략 이벤트 · ws fan-out 에 새지 않게). `STRATEGY_EVENT_KIND` · fbs enum 주석은 정식 인계 노트 뒤 sync 만(와이어 무변경).
- **D-06: DB 쪽 해석의 제약.** relay 무변경 · 재생 멱등(D-01) · **kind 17 과 18 의 도착 순서 무관**(조각이 머리보다 먼저든 나중이든 두 표가 독립 upsert) · 한 배치(`p_events` 배열)에 17·18 이 섞여 와도 한 트랜잭션 · 해석 실패가 `dma_strategy_apply` 의 원문 INSERT 를 막지 않는다(원문은 항상 남는다 — 해석은 뒤에 재실행 가능). 칸 매핑은 정식 인계 노트가 정본 — 노트 도착 전에는 표 · RPC · 웹 · 백필을 먼저 만들고 해석 함수만 노트 뒤에 채운다(플래너가 웨이브를 그렇게 가른다).

### 백필 (과거 발사 전부)
- **D-07: 범위 = 로그에 남은 전부 · 지금 바로 요청.** 사용자 지시 「지금까지 서버가 쐈던 데이터도 gh-trade 통해서 받아와서 저장」. 두 서버(KB120 사내망 로그 포함 — gh-trade 가 뽑는다) · 16:00 Q16 + 09:00:27 KRX(A 매수) + 09:00:30 NXT(N 매수 · A 매도) · 로그가 남은 가장 이른 날부터 가장 최근까지. **정식 인계 노트를 기다리지 않고** `scripts/trade-handoff.sh` 노트로 지금 요청한다(첫 플랜). 형식 = 풀린 필드명 ndjson(한 줄 = 조각 · 날짜 · 서버 · profile · 거래소 · 기준시각 · market · wire · queued_id/key · piece_idx · round · order_no · sent_rel_us · result · result_code · accept_time · retry · abandoned + 뽑히면 side · isin · price · qty). 첨부 `pieces.json`(10/12~10/26 16:00 196행)은 gh-trade 가 전체분을 줄 때까지의 1차 입력이자 자동 대조 기준(D-10).
- **D-08: 빈 열은 null · source='backfill'.** 로그 `[Launch] 조각` 줄에 없는 isin · side · 가격 · 수량 · 체결 · 계좌 · 사용자는 null 허용(조각 표 주문 속성 열 전부 nullable). 화면은 「—」. 09:00:30 매수/매도 구분은 gh-trade 가 로그에서 뽑을 수 있으면 넣어 달라고 요청 — 없으면 null 이고 그 날의 09:00:30 지도는 전부 원으로 그린다(범례에 「구분 없음」).
- **D-09: 적재 스크립트는 Claude 가 실행.** `scripts/` 에 tsx + supabase-js service role 스크립트(`scripts/export-accum-backfill.sh/.ts` 패턴 — relay 의 node_modules 로 실행 · env 파일 비출력 source) · 기본 dry-run(행 수 · 날짜별 집계 미리보기) → `--apply`. 머리는 조각에서 계산(D-04). 실행 전 명령을 사용자에게 보여 준다. 재실행은 D-01 upsert 로 멱등.
- **D-10: 적재 후 대조 = 자동 + 눈.** 단위 테스트가 첨부 `pieces.json` 196행을 넣었을 때 날짜·서버·시장별 조각 수 · 경계 lo/hi · 날짜 수 · 「전부 접수/전부 101/경계」 분류가 첨부 `launch-gate-map.html` 의 JS 계산(`group()`)과 일치함을 단언. 적재 뒤 어드민 지도(10/12~10/26)를 사용자가 첨부 지도와 나란히 보고 확인(UAT 항목).

### 주문 내역 화면 (채택 목업 `reference/mockup-launch-orders.html` · 변형 A · 메뉴 1개+탭)
- **D-11: 사이드바 Admin 그룹에 항목 1개 「발사」.** `/admin/launch` · 「서버」 다음 · `item="admin-launch"`(e2e 선택자 `[data-sidebar-item^="admin-"]`) · `app-sidebar.test.tsx` 순서 배열 · `sidebar-tree.spec.ts` `TREE_LINKS` · `ADMIN_SUB_ITEMS` 갱신. 페이지 안 **탭 2개 「주문 내역 | 경계 지도」**(`?tab=orders|map` 딥링크 · 기본 orders · shadcn `tabs`). 어드민 접근 게이트는 기존 `ADMIN_PREFIX` 미들웨어 그대로.
- **D-12: 변형 A — 서버×시장 섹션.** 컨트롤 줄 = 날짜 알약(`LimitupDateNav` 재사용 · `?d=YYYYMMDD` · 날짜 목록 = `launch_pieces` 에 행 있는 날짜) + 세그먼트 「16:00 예약 | 09:00:30 개장차익」(`?fire=` 재량) + 출처 칩 「KB120 · KYOBO119 저널 80 · 16:00:01 / 09:00:31 적재」. 본문 = **머리 카드 4장**(순서 KB 코스닥 · KB 코스피 · 교보 코스닥 · 교보 코스피 — 첨부 ORDER 와 같다 · 발사 없는 조합은 「이 날 발사 없음」 빈 카드) → **서버·시장별 조각 표**(wire 순 · 발사 있는 조합만). 머리 카드 내용: 16:00 = 조각 수 · 결과(접수/101/기타 색) · 오프셋 · 경계(lo~hi / 전부 접수 · 첫 접수 µs / 전부 101) · 학습 → 다음 오프셋(step). 09:00:30 = 조각 수 · 결과(접수/거부/기타) · 오프셋(고정) · 재전송 합 · 다음 오프셋(고정). 09:00:30 탭에는 N · A 조각이 함께 실리고 A 09:00:27 KRX 매수 조각도 같은 표에 「발사」 열로 구별된다.
- **D-13: 조각 표 열 그대로.** wire · 예약·조각·라운드(Q16: `Q153015001 · j0 · R0` / N·A: `key · idx`) · 송신 µs(부호 · 천 단위) · 결과 알약(접수 초록 · 101/515 빨강 · 기타 회색) · 접수/응답 시각(HH:MM:SS.mmm) · 종목(이름 + 코드) · 구분(매수 `--up` / 매도 `--down`) · 가격 · 수량/체결 · 계좌 · 사용자 · 주문번호. 09:00:30 탭은 **발사**(N NXT / A 09:00:27 KRX→ / A NXT) · **재전송** 열 추가. null 은 「—」.
- **D-14: 폰 390 = 머리 카드 1열 + 조각 표 가로 스크롤.** 카드 행 배치 없음(어드민 도구 · 데스크톱 위주). 데스크톱 1280 은 카드 2열.

### 경계 지도 화면 (채택 목업 `reference/mockup-launch-gate-map.html` · 프리셋 칩 · 리본 켬)
- **D-15: 날짜 범위 = 프리셋 칩.** 「최근 10일 · 20일 · 전체」(거래일 = `launch_pieces` 에 행 있는 날짜 기준 · 기본 최근 10일) + 실제 범위 텍스트 「10/12 ~ 10/26 · 11거래일」. 시작·끝 날짜 입력 부품은 만들지 않는다(사용자 결정 · 범위 입력은 deferred). 칩 옆 세그먼트 「16:00 예약 | 09:00:30 개장차익」. `?range=10d|20d|all` 딥링크 재량.
- **D-16: 첨부 지도 구성 전부 유지 · gh-radar 톤.** 범례 → **요약 카드 4장**(서버 시장 · N일 · 접수된 가장 이른 µs(초록) · 거부된 가장 늦은 µs(빨강) · 다음 첫 조각 µs(`--primary`)) → **서버×시장 4패널**(순서 KB 코스닥 · KB 코스피 · 교보 코스닥 · 교보 코스피) 각각: 패널 머리(경계 잡힌 날 n · 전부 접수 n · 전부 거부 n) · x = 발사 기준시각 대비 송신 µs(왼쪽이 이름 · 눈금 10/20µs) · 날짜 행마다 점(접수 `--ok` 채운 원 · 101/515 `--bad` 채운 원 · 기타 `--other` 빈 원 · 같은 µs 는 세로 4px 스태킹) · **그날 경계 띠**(마지막 101 ~ 첫 접수 · `--gate` · 전부 101 이면 빨강 띠 + 「경계는 이보다 뒤 →」 · 전부 접수면 초록 띠) · **다음 발사의 첫 조각 세로 점선**(`--primary` · 값 = 그 서버×시장 최신 `launch_heads` 의 다음 오프셋 — Q16 은 학습값 `correction_after`, N 은 고정) · **「쐈다면」 리본**(1µs 칸마다 날 수 비율 초록/회색/빨강 · 첨부 식 그대로) · 「날짜별 표 보기」 접힘(날짜 · 첫 조각 µs · 결과 알약 · 처음 접수 µs · 경계 µs · 조각 수). 경계 계산 규칙 = 첨부 `group()`: lo = 101(515) 조각 rel 최댓값 · hi = 접수 조각 rel 최솟값 · **기타 거부는 제외** · 둘 다 있으면 「경계」, hi 만 「전부 접수」, lo 만 「전부 거부」. 범위 안에 발사가 없는 조합은 패널 머리만 + 「이 범위에 발사 없음」. 푸터 한 줄(조각 간격 0/+10/+20µs → 10/22부터 0/+10/+30µs · 기타 거부 제외).
- **D-17: `09:00:30` 지도 = 합패널.** 같은 4패널에 **N 매수 = 원 · A 매도 = 마름모**(채움 색은 결과 색 그대로) · 101 · 515 같은 `--bad` · 「다음 첫 조각」 선 = 고정 오프셋(119 −200 · 120 −245µs) · **재전송(515 ×3)은 첫 발 송신 시각만 점** · 재전송 횟수는 툴팁(「10/26 −20148µs · wire 0 · 매수 · 101 · 재전송 2」). 범례에 「마름모 = A 매도 · 동그라미 = N 매수」. x 축 폭이 좁으므로(µs 수십) 눈금 2µs · 리본 칸 0.2µs(목업 규칙). side 가 null 인 백필 날은 전부 원(D-08).
- **D-18: 폰 390 = SVG 640px 고정 폭 가로 스크롤 · 요약 카드 2열.** 축소 없음. 데스크톱은 패널 폭 100%(viewBox 760 비율 유지 · `useChartWidth` 1:1 여부는 플래너 재량 — 글자 11px 가 읽히면 됨).
- **D-19: 순수 SVG.** Phase 33 D-12 · Phase 34 결 그대로(lightweight-charts 아님). 상호작용은 `<title>` 툴팁뿐(확대/축소 · 드래그 없음).

### 서버 (어드민 라우트 2개)
- **D-20: `requireAuth() → requireAdmin()` 라우트 2개 · RPC 1회씩.** ① 주문 내역 `GET /api/admin/launch/orders?d=YYYYMMDD` → `{dates[], date, heads[], pieces[]}`(그 날 전 프로파일 · 웹이 16:00/09:00:30 으로 가른다 · 행 없는 날 직접 진입은 빈 배열 · `d` 없으면 최신) ② 지도 `GET /api/admin/launch/map?range=10d|20d|all&fire=q16|n0930` → `{days[], heads[], pieces[]}`(범위 안 조각 전부 + 서버×시장별 최신 머리 — 경계 · 리본 계산은 웹 · 또는 RPC 가 날짜별 lo/hi 를 미리 계산 — 플래너 재량 · 왕복 1회 원칙 [[project_cloudrun_egress_roundtrip_cost]]). RPC 는 SECURITY INVOKER · `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` · `GRANT TO service_role` 명시 · `launch_*` 표는 RLS 켜고 정책 0개(service_role 전용 · Phase 33 D-06 결). 라우터는 `adminRouter`(`server/src/routes/admin.ts`) 에 합치거나 `admin-launch.ts` 신설 — 마운트 순서 주석(`app.ts:118-123`) 지킨다. 서버는 snake_case 통과.

### 인박스 · gh-trade 회신 · 배포 · UAT
- **D-21: gh-trade 에 요청할 것(첫 플랜 · `scripts/trade-handoff.sh launch-gate-contract` 노트 + SendMessage 보조).** ① **백필 ndjson 지금**(D-07 형식 · 두 서버 · 로그 전부 · 09:00:30 side 포함 요청). ② 정식 인계 노트의 kind 17 칸 매핑에 **발사 기준(거래소 + 기준시각) · side · profile · market · wire · queued_id/key · piece_idx · round · order_no · sent_rel_us · result · result_code · accept_time · retry · abandoned · isin · price · qty · filled_qty · account · user** 가 실리게, kind 18 에 **다음 오프셋(Q16 correction_after · N 고정값) · gate_lo/hi · n_* · first_accept_idx · 학습값** 이 실리게 요구. ③ 서버 먼저 배포해도 안전함을 확인(relay 는 모르는 kind 도 원문 적재 · DB 해석 함수는 모르는 kind 무시). 회신은 인박스 노트 `## 회신` 에 적고, 정식 인계 노트 도착 → 해석 함수 구현 → 첫 실물 날짜 UAT 뒤 두 노트를 `status: done` · `done_commit` 경로 지정 커밋.
- **D-22: 배포 순서** = 로드맵 그대로: gh-trade 서버 먼저 배포 안전 → gh-radar DB 마이그레이션(표 · RPC · 해석 함수 · json 래퍼 제외 · purge 테스트) → 백필 적재(D-09) → server → webapp push(= 프로덕션). relay 재배포 없음(fbs enum · 주석 sync 만 · `sync-relay-schema.sh` 는 gh-trade 소유 [[reference_gh_trade_protocol_sync]]). 배포 · 적재 실행은 메인 세션([[feedback_subagent_deploy_classifier]]).
- **D-23: 라이브 UAT** = 첫 실물 날짜: 16:00:01 이후 relay 로그에 kind 17·18 적재 건수 · `launch_*` 행 · 어드민 주문 내역 당일 행 · 지도 「전체」 에 당일 행 + 다음 오프셋 선이 kind 18 값으로 바뀜. 09:00:31 도 같은 확인. 프로덕션 수동 주입 없음.

### Claude's Discretion
- 표 · 열 · RPC · 라우트 · 파일 · shared 타입 이름(`launch_pieces` · `launch_heads` · `launch_orders_for_admin` · `launch_map_for_admin` · `server/src/routes/admin-launch.ts` · `webapp/src/app/admin/launch/page.tsx` · `webapp/src/components/admin/launch-*.tsx` · `packages/shared/src/launch.ts` 류) · 발사 기준 열의 표현(D-03) · `source` 열 값 이름 · 해석 위치(apply 재정의 vs 트리거) · 해석 함수의 kind 17/18 칸 → 열 매핑 코드 구조(정식 노트 뒤).
- 탭 · 날짜 · 발사 · 범위 쿼리 파라미터 이름과 상태 보존(탭 전환 시 날짜 유지 여부) · 빈 상태 문구(「아직 적재된 발사가 없어요 · 첫 적재는 16:00:01」 · 「이 날은 발사가 없어요」 + 「최신 보기」) · 로딩 스켈레톤 · 오류 문구 · 문서 title.
- 차트 세부(패널 높이 · 행 높이 24px · 여백 · 눈금 규칙 · 스태킹 · 라벨 겹침 · 리본 높이 · 폰 터치) · 요약 카드 숫자 형식(µs 부호 · 천 단위 쉼표 여부 — 09:00:30 은 −20,148 처럼 쉼표).
- 백필 스크립트 인자(`--file` 복수 · `--date` 필터 · `--out` 미리보기) · dry-run 출력 모양 · 재실행 규칙 로그.
- E2E = `admin-servers.spec.ts` 동형(`page.route` 로 orders · map 두 경로 모킹 · 390 폰 · 탭 전환 · 세그먼트 · 프리셋 칩) · 단위 = 경계 계산(`group()` 이식) · 리본 비율 · 머리 계산(백필) · 열 포맷 · 날짜 목록 · 사이드바 순서 · SQL 테스트(upsert 멱등 · 도착 순서 무관 · 사용자 래퍼 제외 · purge 제외).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 계약 · 데이터 정본 (gh-trade)
- `docs/inbox/from-gh-trade/261027-launch-gate-admin.md` — 상의 노트(성격 · 첨부 · 프로파일 표 · 머리/조각 필드 목록 · 채널 제안 A · 질문 3건). phase 끝에 `## 회신` + `status: done` · `done_commit`. **정식 인계 노트(kind 17·18 칸 매핑 표)는 아직 미도착** — 도착하면 이 목록 맨 위에 추가하고 D-06 해석 함수를 그 표로 구현.
- `docs/inbox/from-gh-trade/261027-launch-gate-admin-attach/launch-gate-map.html` — 첨부 지도(:84 `ROWS` 196행 · :85 `NEXT` · :91-112 `group()` 경계 계산 규칙 · :128-205 패널 그리기 · :174-191 리본 식). **경계 · 리본 계산의 정본**(D-10 자동 대조 기준 · D-16).
- `docs/inbox/from-gh-trade/261027-launch-gate-admin-attach/pieces.json` — 10/12~10/26 16:00 196행 `{date, broker, market, wire, q, j, rel, result}` — 백필 1차 입력 + 테스트 픽스처.
- `docs/inbox/from-gh-trade/261027-launch-gate-admin-attach/pieces120.txt` · `pieces119.txt` — 원본 `[Launch] 조각` 로그 줄(16:00 꼴 `q= j= probe=` · 09:00:30 꼴 `key=N idx= retry= rc_rejects=`) — gh-trade 가 넘길 ndjson 의 필드 출처 · 로그에 없는 열(D-08) 근거.
- `/Users/alex/repos/gh-trade/docs/strategy/open-arb.md` §5(발사 — 'A' 와 'N' · 레인 K/Q · 'A' = KRX 매수 IOC 09:00:27 · 'N' = NXT 09:00:30 · 515 재전송) · §7(되팔기 · 'A' 의 NXT 매도) — **A 두 다리(D-03) 근거**.
- `/Users/alex/repos/gh-trade/docs/features/queued-order.md` — Q16 예약 발사 · `LaunchPieceTable` · 학습(correction · step) — 머리 학습값 뜻.
- `docs/inbox/from-gh-trade/README.md` · `CLAUDE.md` 「gh-trade 인박스」 · `scripts/trade-handoff.sh` — 인박스 닫기 · gh-trade 에 요청하는 경로(D-21).

### 채택 목업 (화면 정본 — 사용자 검토 완료 2026-10-27)
- `.planning/phases/35-launch-gate/reference/mockup-launch-orders.html` — **변형 A · 메뉴 1개+탭** 채택(머리 카드 4장 내용 · 조각 표 열 · 결과 알약 · 09:00:30 발사·재전송 열 · 폰 표 스크롤). 변형 B · 메뉴 2개는 기각. 종목·구분·가격·수량·계좌·사용자·주문번호 값은 **합성**(모양 확인용) · 09:00:30 A 매도 2행 합성.
- `.planning/phases/35-launch-gate/reference/mockup-launch-gate-map.html` — **프리셋 칩 · 리본 켬 · 09:00:30 합패널(원/마름모)** 채택(`ROWS`/`NEXT` 는 첨부에서 복사 · 패널 JS = 첨부 이식 + 마름모 · 좁은 축 눈금 규칙). 시작·끝 날짜 입력(B)은 기각(deferred).

### Phase 33 · 34 승계 (보고서 틀 · RPC · 순수 SVG · 표기)
- `.planning/phases/34-accum/34-CONTEXT.md` — D-06(RPC 2개 · RPC 안 게이트 · REVOKE 명시) · D-07(표 접근 RLS 정책 0개 · 날짜 목록 = 행 있는 날짜 · 빈 날 `rows: []`) · D-13(표기 규칙) · D-25(배포 순서 틀) · D-23(소급 스크립트 Claude 실행 패턴). `.planning/phases/33-teamflow/33-CONTEXT.md` D-12(순수 SVG 결).
- `supabase/migrations/20261020200100_accum_report_rpc.sql` — 목록 RPC 틀(dates · 날짜 선택 · 게이트 · REVOKE/GRANT) → 어드민 RPC 는 DMA 게이트 대신 service_role 전용(서버가 `requireAdmin` 으로 막는다).

### kind 17·18 적재 경로 (relay → DB)
- `relay/src/journal/strategy-stream.ts`(:22 43칸 → snake_case · :169-176 `STRATEGY_STREAM` rpc `dma_strategy_apply`) · `relay/src/dma/envelope.ts:342`(seq · trade_date 만 검사 — kind 화이트리스트 없음) · `relay/src/registry/pipelines.ts:47` — **relay 무변경 근거**.
- `supabase/migrations/20260929180000_dma_strategy_events.sql`(:43-91 43칸 + `applied_at` · PK `(gateway, journal_epoch, seq)` · 전부 NOT NULL default) — kind 17·18 이 재해석할 칸 목록(`price int · qty int · order_no text · account_no text · dma_user_id text · reason_code text · result_code int · message text · queue_case smallint · entry_round int · snap_qty/snap_cum bigint[] · accept_latency_us int · isin text · exchange text` 등).
- `supabase/migrations/20260929180100_dma_strategy_apply.sql`(:32 시그니처 · :118 INSERT ON CONFLICT DO NOTHING RETURNING · :138-145 커서) — 재정의 또는 트리거 추가 지점(D-06).
- `supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql`(:36-59 `dma_strategy_events_for_user` 시장 kind 집합 {1,2,10,15,16} · :72-90 `dma_strategy_events_for_user_json` 의 `kind <> 15/16` — **17·18 제외 명시 지점** · :94-103 `dma_strategy_events_purge_limit_feature` `kind IN (15,16)` — **17·18 추가 금지** · :115 부분 인덱스) · `20261024230000_dma_accum_signals_closed_companion.sql:20`(kind 16 읽기 RPC 최신 — 투영 없음의 선례) · `supabase/tests/dma_strategy_accum_signal.test.sql:294`(purge 테스트 틀).
- `workers/limitup-sync/src/purge.ts:88` — purge 호출자(변경 없음 · 17·18 무관 확인).
- `packages/shared/src/strategy-event.ts`(:56 `STRATEGY_EVENT_KIND` · :79 kind 16 JSDoc 칸 재해석 예 · :110 `isMarketStrategyEvent` — 17·18 넣지 않음) · `strategy-event-labels.ts:36-38` · `relay/src/generated/StockDMA.fbs:1406-1435`(`StrategyEventKind` enum — 정식 노트 뒤 sync) · `relay/src/ws/fanout.ts:3314,3340`(집합 밖 kind 는 계좌 매칭 없으면 드롭 — 17·18 `account_no ''` 면 안 샌다 · **kind 17 에 account 를 `account_no` 칸으로 싣는다면 fan-out 이 그 계좌 사용자에게 흘릴 수 있으므로 fan-out 에 `kind NOT IN (17,18)` 을 명시하거나 계좌를 다른 칸에 싣는다 — 플래너가 정식 노트 매핑을 보고 결정**) · `webapp/src/lib/use-relay-socket.ts:1071-1074`.
- `supabase/migrations/20261007200000_gateway_key_rename.sql`(:3-4 `'KB120'` · `'KYOBO119'`) · `20261006200100_dma_registry_intent.sql:38-66`(`dma_servers` — key · broker · enabled) — gateway 키 · 브로커 라벨(KB / 교보) 출처.

### 어드민 (인증 · 라우트 · 사이드바 · 페이지)
- `server/src/middleware/require-admin.ts:20`(`requireAdmin` — `app_users.role` 조회) · `server/src/types/express.d.ts:12` · `supabase/migrations/20261006200000_app_access.sql:38-40`.
- `server/src/routes/admin.ts:84`(`adminRouter.use(requireAuth(), requireAdmin())` · :250-343 users · :429-538 dma-users) · `server/src/routes/admin-servers.ts:50,105-232` · `server/src/app.ts:118-123`(마운트 순서 주석) · `server/src/schemas/admin.ts:29`(`ServerKeySchema`) · `server/src/services/accum-report.ts:48-58`(RPC 1회 · `DbError`) · `server/src/routes/accum-report.ts:26-50` · `server/src/schemas/accum-report.ts:13`(`Ymd`).
- `webapp/src/lib/supabase/access-gate.ts:30,52`(`ADMIN_PREFIX` 리다이렉트) · `webapp/src/lib/supabase/middleware.ts:22` · `webapp/src/hooks/use-app-role.ts:28`.
- `webapp/src/components/layout/app-sidebar.tsx`(:189-198 `NAV_ADMIN*` · :596 `adminVisible` · :604 `inAdmin` · :726-758 Admin 그룹 렌더 — 「서버」 다음에 「발사」) · `__tests__/app-sidebar.test.tsx:1478-1520`(순서 배열 :1499-1513 · href :1492-1494) · `webapp/e2e/specs/sidebar-tree.spec.ts:88-101,121`(`TREE_LINKS` · `ADMIN_SUB_ITEMS`).
- `webapp/src/app/admin/servers/page.tsx` · `webapp/src/components/admin/servers-client.tsx`(:7,136 `PageHeader`) · `webapp/src/lib/admin-api.ts:96+`(`apiFetch`) · `webapp/e2e/specs/admin-servers.spec.ts` — 페이지 껍데기 · API 클라이언트 · E2E 틀.

### 차트 · 날짜 · 표 부품 (Phase 34)
- `webapp/src/components/analytics/accum-chart.tsx:56,94`(순수 SVG 방법) · `teamflow-band-chart.tsx` · `limitup-lane.tsx` · `webapp/src/hooks/use-chart-width.ts:15`.
- `webapp/src/components/analytics/limitup-date-nav.tsx:25`(`LimitupDateNav`) · `webapp/src/lib/limitup-report.ts`(:355 `dateNavOf` · :371 `parseYmdParam` · `fmtYmdShort`) · `accum-report.tsx:49-134`(`?d=` 진실 원본 · `router.replace/push` 배선).
- `accum-kpi-strip.tsx:21` · `accum-day-grid.tsx:118` · `accum-cycle-table.tsx:22` — 카드 · 표 치수 참고(복제 · 일반화 안 함). `webapp/src/styles/globals.css`(:76-93 라이트 · :237-251 다크 토큰 — `--ok/--bad/--gate` 류는 **새 토큰**이 필요하면 거기에 추가 · 목업 값 참조).

### 백필 스크립트 패턴
- `scripts/export-accum-backfill.ts`(:8-11,30 relay node_modules 로 tsx · :35 env) · `scripts/export-accum-backfill.sh`(:40-59 env 비출력 source · :70 exec) · `scripts/migrate-dma-users.ts`(:9-14 dry-run/`--apply` · :81-87 env → gcloud secrets) · `scripts/dma-credentials.sh:54-85` · `relay/tests/accum-backfill.test.ts:15,286`(스크립트 테스트 선례). [[feedback_secret_injection_user_bang]] — 쓰기 스크립트지만 사용자 결정 D-09 로 Claude 가 실행(키 쓰기 아님 · 행 적재).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- relay 적재 경로 전체(strategy-stream → `dma_strategy_apply`) — 손대지 않는다. kind 17·18 은 이미 원문으로 들어온다.
- `requireAdmin` · `adminRouter` · `app.ts` 마운트 · `apiFetch` · 어드민 페이지 껍데기(`AppShell` + `AppSidebar` + `*Client`) — 라우트 2개 · 페이지 1개 추가만.
- `LimitupDateNav` · `parseYmdParam` · `dateNavOf` · `fmtYmd*` · `PageHeader` · `useChartWidth` · shadcn `tabs` · `skeleton` — 재사용. KPI 카드 · 표 치수는 Phase 34 부품을 본떠 복제.
- 첨부 `launch-gate-map.html` JS(`group()` · `drawPanel()` · 리본) 와 두 목업의 JS — React/SVG 이식 원본(경계 · 리본 · 눈금 · 스태킹 · 마름모).
- `export-accum-backfill.sh/.ts` · `migrate-dma-users.ts` — 백필 스크립트 틀(dry-run → `--apply` · env 비출력).
- SQL 테스트 틀 `supabase/tests/dma_strategy_accum_signal.test.sql` — upsert 멱등 · purge 제외 · 래퍼 제외 단언.

### Established Patterns
- 표 접근 = RLS 정책 0개 + service_role + 서버 RPC(SECURITY INVOKER · REVOKE 명시 · [[feedback_supabase_rpc_revoke]]). PostgREST 직접 읽기 없음.
- 어드민 = 서버 `requireAuth → requireAdmin`(DB role) + 웹 `ADMIN_PREFIX` 미들웨어 + 사이드바 `adminVisible`. 어드민 RPC 에는 DMA 게이트 없음.
- 서버 snake_case 통과 · 웹 표시층 변환 · null 「—」 · 보고서 UI = 날짜 알약 → 카드 → 표 · `?d=` 진실 원본 · E2E `page.route` 모킹.
- 순수 SVG 차트(Phase 33 D-12 · 34) · 다크/라이트 토큰 · Cloud Run 왕복 1회([[project_cloudrun_egress_roundtrip_cost]]).
- 사용자 전략 이벤트 가시성 = 시장 kind 집합 + 계좌 매칭(DB 래퍼 · relay fan-out 두 곳 동기).

### Integration Points
- `dma_strategy_apply`(재정의) 또는 `dma_strategy_events` 트리거 — 첫 DB 쪽 해석. 마이그레이션 1개에 표 2 · 해석 · RPC 2 · 래퍼 제외 · purge 테스트.
- `server/src/app.ts` 어드민 라우터 마운트(순서 주석) · `packages/shared` 타입 재export.
- `app-sidebar.tsx` Admin 그룹(「서버」 다음) + 단위/E2E 링크 순서 단언 · `webapp/src/app/admin/launch/page.tsx`.
- `scripts/` 백필 스크립트 · gh-trade 핸드오프 노트(`scripts/trade-handoff.sh`) · 인박스 `## 회신`.
- 정식 인계 노트 도착 → 해석 함수 칸 매핑 · fbs enum/주석 sync(gh-trade 소유 스크립트).

</code_context>

<specifics>
## Specific Ideas

- 「매도할 때의 경계 지도를 알아야지 — N 의 매수주문과 A 의 매도주문이 동시에 NXT 에 쏠 거니까 합쳐서 같이 봐야 해」 — 09:00:30 지도의 단위는 프로파일이 아니라 **「09:00:30 NXT 송신」** 이다(D-03 · D-17). 매수/매도는 모양(원/마름모)으로만 가르고 한 패널에 둔다.
- 첨부 지도는 사용자가 로그로 손수 만든 것 — 어드민 지도는 그 읽기(요약 카드 → 4패널 → 리본 → 표)를 그대로 잇되 gh-radar 톤(Pretendard · 토큰 · 카드 반경)으로 다시 그린다(D-16). 「쐈다면」 리본은 유지.
- 어드민 도구라 **데스크톱 위주** — 폰은 가로 스크롤로 깨지지만 않으면 된다(D-14 · D-18). Phase 34 식 폰 카드 배치는 만들지 않는다.
- 이력은 **지금까지 쏜 것 전부** — gh-radar DB 가 유일한 저장소가 되므로 백필 범위를 10/12 에 가두지 않는다(D-07). 백필 행은 주문 속성이 비어도 경계 지도에는 완전하다(D-08).

</specifics>

<deferred>
## Deferred Ideas

- **시작·끝 날짜 입력(범위 선택 부품).** 목업 B 로 보여 줬으나 프리셋 칩 채택. 임의 구간 비교가 필요해지면 후속(새 부품).
- **재전송 1·2·3회를 점으로.** 09:00:30 지도는 첫 발만 점. 서버가 재전송 시각을 kind 17 에 실어 주면 작은 점으로 잇는 안 — gh-trade 요청 필요.
- **머리 표 + 평탄 조각 표(변형 B) · 필터 칩.** 서버 간 비교·필터 요구가 생기면 후속.
- **계좌 마스킹 옵션.** 어드민 전용이라 그대로 노출(D-02). 캡처 공유가 잦아지면 토글.
- **kind 17·18 라벨(`strategy-event-labels.ts`) · fbs enum 주석.** 정식 인계 노트 뒤 sync — 이 phase 안이지만 노트 도착 조건부.
- **gh-trade 쪽 09:00:30 side 를 로그에서 못 뽑는 경우** 백필 09:00:30 지도는 전부 원(D-08) — 구분이 꼭 필요하면 gh-trade 가 예약 저장소 스냅샷에서 복원하는 별도 작업.

</deferred>

---

*Phase: 35-launch-gate*
*Context gathered: 2026-10-27*
