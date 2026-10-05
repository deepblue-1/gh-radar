# Phase 28: 상한가 특징 연동 — gh-trade Phase 27 계약 반영 - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade Phase 27 「실시간 상한가 특징 + 밤 export」 계약(인박스 `docs/inbox/from-gh-trade/261005-limitup-feature-85.md`)을 gh-radar 가 받아 **장중에는 상한가 특징을 실시간으로, 밤에는 그날 상한가 사건 보고서를 웹에서** 볼 수 있게 한다. 세 갈래 + 배포.

1. **(A) 와이어 85 `LimitFeature`** — relay 가 quote 관찰자 연결의 85(S→C Broadcast · FULL 구독 키마다 1초 스로틀 · Envelope 슬롯 90 · 32필드)를 받아 그 키를 FULL 구독한 브라우저에 1초·키당 1프레임 중계(드롭 허용). 85 는 Phase 27(gh-radar) 에서 `OUT_OF_SCOPE`(debug 드롭)에 들어가 있으므로 이 phase 가 `INBOUND` 로 올리고 hub `#onFrame` case 를 만든다. 웹은 **작업대 상따 카드의 새 탭 「상한가」** 에 WinForms 3줄 9칸 표 동형으로 그린다(D-01~D-05).
2. **(B) 관찰자 저널 `StrategyEventKind` 15** — `dma_strategy_events` 에 이미 숫자 그대로 적재된다(CHECK 없음). 이 phase 는 RPC `dma_strategy_events_for_user` 의 시세 집합을 `(1, 2, 10, 15)` 로 재정의하고 shared `isMarketStrategyEvent` 를 같은 집합으로 맞춘다 → relay 저널 푸시·조회 모두 게이트웨이 매핑 사용자 전원 가시. shared 문장 조립기 kind 15 분기(슬롯 매핑표대로 85 필드 이름으로 되돌림 · `message` 파싱 `buy:…;sell:…|m=N`). 주문로그 표면에는 **기본 숨김 + 「상한가 특징」 체크** 로 노출(D-06~D-07). kind 15 만 30일 purge(D-08).
3. **(C) 119 밤 export 적재** — Supabase 표 6개(`limitup_entries` · `limitup_locks` · `limitup_jumps` · `limitup_member_alloc` · `limitup_facts(values jsonb)` · `limitup_touches`, 열·PK = 노트 표, `schema_version` 행마다) + Storage 비공개 버킷 `limitup-grid`(`grid/<date>/<isin>.json.gz`, server 가 인증 뒤 단기 서명 URL). radar-gw 타이머(평일 21:00 KST)는 **rsync + GCS 업로드만**, 새 Cloud Run Job 워커 `workers/limitup-sync`(Scheduler 21:20)가 GCS 를 읽어 manifest sha256 대조·`schema_version` 검사·**날짜 단위 교체** 적재 + 격자 업로드(D-13~D-15). 보존은 표·격자 전부 90일(D-16). 웹 보고서는 **최상위 「분석」 메뉴 › 「상한가 보고서」(`/analytics/limitup`)**, DMA 연결 사용자만, 한 페이지 세로 흐름(D-09~D-12).
4. **배포** — DB(마이그레이션·버킷) → GCS 버킷·워커 → radar-gw 타이머(119 키 등록은 gh-trade 사용자) → relay → webapp(push = 프로덕션). 인박스 노트 `status: done` + `done_commit` 경로 지정 커밋.

**분담:** gh-trade = 서버·와이어·WinForms·119 export(완료 — 85 는 서버 Phase 27 미배포, export 는 119 에 4일치 실데이터 존재). gh-radar = relay·shared·webapp·Supabase·GCS·radar-gw 타이머·워커 전부.

**밖:** 종목상세 호가 탭(Phase 21 D-31 로 삭제됨 — 85 표면 아님) · 격자 라벨(`break_within_n` 등)의 실시간 표시 · 확률 모델·TOML(gh-trade 몫) · 원본 pcap GCS 보관(gh-trade quick-261005-fxh) · 패턴 판정기(gh-trade D-02 — gh-radar 도 만들지 않는다).

</domain>

<decisions>
## Implementation Decisions

### 이미 확정된 것 (인박스 노트 · ROADMAP · gh-trade 정본 — 다시 묻지 않는다)
- 85 32필드·`MemberDelta`·`TeamSim` 스키마, 슬롯 90, Broadcast·1초 스로틀·FULL 구독 범위 — fbs `2404509b`(master blob `68679e9a`, Phase 27 동기화에 생성물 포함).
- kind 15 슬롯 매핑표(특징 사전 ③) · `message` 형식 · 분당 1건/키 · 82/81 에 없음 · 계좌 없음.
- 표 6개 이름·열·PK·타입 제안, `facts.values` jsonb, `date` = `"YYYYMMDD"` 문자열, bp 없음(소수) · `*_ms` epoch ms, `foreign` 예약어 따옴표.
- 격자 파일 구조(coarse 10초 2,340점 + fine 1초 창 0~1개, cols 24키), 비공개 버킷 + 서명 URL.
- radar-gw pull: rrsync 읽기 전용 키 1개(공개키는 gh-radar 가 radar-gw 에서 생성해 인박스로 전달, 119 등록은 gh-trade 사용자) · `rsync -az --delete --exclude='*.tmp' smok95@10.16.207.119:/` · manifest 있는 날짜만 · sha256 대조 · 아는 `schema_version` 만 · manifest 바뀐 날짜 재적재(D+1 보충으로 어제 export 가 다시 쓰인다 → 날짜 단위 삭제 후 삽입).
- 보고서 내용 구성 = gh-trade D-20 「B 하루 격자(머리) → A 사건 카드(본문) → C 창구 지문표(꼬리) → 어제 결과」. `facts.text` 완성 문장 그대로, `values` 는 근거, `source`(실측/추정(분 단위)/모형) 표기 유지. `limit_up_events(code, date)` 조인 키 = `short_code` + `date`(형식 변환).
- 실시간 표시 산술은 WinForms D-19(단위 변환·비율만, 새 판정값 금지, 주문 판단에 쓰지 않음). 신호등 색(초록·노랑·주황) 금지 — 빨강·파랑은 매수·매도 관례색, 「잠김」 빨강, 확률 값 무채색, 「관찰 중」 회색.

### 실시간 85 표시 — 작업대 상따 카드 (목업 `reference/mockup-limit-feature-85.html`, A 채택)
- **D-01: 표면 = 작업대 상따 카드 하나.** 종목상세 호가 탭은 Phase 21 D-31 로 사라졌다 — ROADMAP 의 「종목상세 호가 탭」 문구는 폐기.
- **D-02: 자리 = 카드 탭 「상한가」** — 「정보 | 미체결 | 잔고」 옆 네 번째 탭(`card-tabs.tsx`). 탭 본문 공통 고정 높이(정보 탭 3줄 ≈ 72px) 안에 3줄 표가 들어가 **카드 높이가 변하지 않는다**. 호가 아래(WinForms 위치)·전폭 띠 변형은 기각.
- **D-03: 표 = WinForms `tblLimitFeature` 9칸 규칙 동형** — 행 머리 「지금 · 10초 · 창구」 + 값 3칸. 칸 문구는 `docs/features/limitup-feature.md` ⑥ 표 그대로(「잠김 N초째」·「대기 X.X억」·「소진 N초/—」·「깨짐」·「미도달 (+R.R%)」·「매도벽 X.X억(+)」·「상한가 13,000」·「매수/매도 우세 NN%」·「잔량 신규 +N」·「잔량 취소 -N」·「매수 {창구} +X.X만」·「깨짐확률 NN.N%/관찰 중」). 단일가면 지금 행 첫 칸 앞 「단일가 · 」. 폰 밴드(카드 폭 < 685)에서는 10초 행의 「잔량 」 접두를 떼고 수량을 만 단위(「신규 +1.2만」)로 줄여 잘림을 막는다(목업 `i.w`). 85 가 아직 안 왔거나 구 서버·대상 밖 키면 9칸 전부 「—」.
- **D-04: 탭 자동 전환 없음** — 사용자 클릭만. 알림의 탭 요청 통로(`alertTabFor`)도 이 탭을 열지 않는다. 대신 **탭 제목이 상태를 말한다**: 잠김 중 「상한가 · 잠김 43초」(잠김 부분 빨강, 1초 갱신) · lock_state 2 「상한가 · 깨짐」 · 그 밖 「상한가」. 미체결 건수 괄호와 같은 자리 문법.
- **D-05: 접힌 카드 헤더** — 잠김 중에만 요약 칩(「미체결 N」·「잔고 N주」) 옆에 「잠김 43초」 칩(빨강 테두리·글자). 깨짐·미도달은 칩 없음. 헤더 요약은 계좌 상태만 말한다는 규칙의 **명시적 예외**(여러 카드를 접어 두고 어느 종목이 잠겼는지 펼치지 않고 보기 위함).
- relay: 85 를 `INBOUND_MSG_TYPES` 로 올리고 `OUT_OF_SCOPE` 에서 뺀다(Phase 27 이 넣어 둔 것을 되돌림 · `envelope.test.ts` 단언 갱신). 브라우저 프레임 이름·캐시 여부(키별 마지막 1프레임을 FULL 구독 직후 스냅샷으로 줄지 — 83 `unf.progress` 선례)는 플래너 재량. 팬아웃은 hub `"market"` 경로의 `#keyConns` 색인으로 **그 키를 FULL 로 잡은 소켓에만**(tape 와 같은 규칙).

### kind 15 웹 노출 (목업 `reference/mockup-kind15-orderlog.html`, A 채택)
- **D-06: 가시성 = 시세 집합에 15 추가.** `dma_strategy_events_for_user` 를 `(1, 2, 10, 15)` 로 재정의하는 마이그레이션 1개(20261003120000 본문 그대로 · kind 조건만 교체) + shared `isMarketStrategyEvent` 에 `LimitFeature: 15` — 두 곳이 같아야 한다는 기존 규약 유지. 그 게이트웨이에 가시 계좌가 있는 사용자 전원에게 보인다(계좌 없음). relay 저널 라이브 푸시도 같은 판정으로 분당·키당 1행이 간다. — **Reversibility:** reversible — RPC 재정의 1개와 상수 1줄.
- **D-07: 주문로그 노출 = 기본 숨김 + 「상한가 특징」 체크.** 주문로그 세그먼트(전체/매수/매도/시세) 옆 체크 칩. 꺼짐(기본)이면 kind 15 줄을 거른다, 켜면 「전체」·「시세」 뷰에 분당 줄이 섞인다. 카드 주문로그 팝업 · `/trading/order-log` 창 · 공용 패널 모두 같은 필터 컴포넌트(`order-log-filters.tsx`)를 쓴다. 줄 모양: 구분 칩 「상한가특징」(중립 회색 칩) · 행위 빈칸 · 주문번호 빈칸(시세 이벤트처럼 칸 없음) · 내용 = 「잠김 43초 · 잔량 17.3억 · 매도벽 0억 · 소진 — · 10초 매수 우세 63% · 신규 +12,400 / 취소 -2,300 · 창구 매수 키움 +5.2만 / 매도 신한 +1.8만 · 깨짐확률 관찰 중」 꼴(잠김 부분 빨강, 나머지 보조색) · 누적 = `cum_volume`. 체크 상태 기억 여부(`readPanelsPref` 선례)는 플래너 재량.
- **D-08: 보존 = kind 15 만 30일.** `trade_date` 기준 30일 지난 kind 15 행을 지우는 정리 잡(주문 이벤트·시세 1/2/10 은 그대로 — 감사 기록). 실행 주체(pg_cron vs 워커)·부분 인덱스(`WHERE kind = 15`)는 플래너 재량. 같은 값이 밤 export 격자에 1초 해상도로 남으므로 손실 없음.

### 보고서 페이지 (목업 `reference/mockup-limitup-report.html`, A·중립색 채택)
- **D-09: 위치 = 최상위 「분석」 메뉴 신설(트레이딩 다음) › 「상한가 보고서」, 라우트 `/analytics/limitup`.** 사이드바 그룹 제목 「분석」 + 하위 항목 1개(향후 분석 페이지가 늘 수 있는 자리). 모바일 탭바에는 넣지 않는다(드로어 사이드바로 진입).
- **D-10: 접근 = DMA 연결 사용자만**(`tradingVisible` 과 같은 조건). 메뉴 자체가 DMA 없는 계정에는 보이지 않고, 페이지는 트레이딩과 같은 게이트. 격자 서명 URL 은 server 가 `requireAuth` 뒤 발급.
- **D-11: 탐색 = 한 페이지 세로 흐름.** 상단 날짜 ‹ MM/DD (요일) › 하나(URL `?d=YYYYMMDD`, 기본 = manifest 가 있는 최신 날짜), 내용 순서 KPI 띠(탐지 종목 · 잠김 수 · 종가까지 유지 · 25%↑ 미도달 · 어제 D+1) → **하루 격자**(종목 행: 이름·코드 · 잔량 스파크라인(잠김 음영 · 깨짐 ● · 기준선 10억) · 첫 잠김 · 잠김 수 · 최대 잔량 · +60초 매도 비중 · 결과 태그 · 진입 매수 창구(출처 배지)) → 행을 누르면 아래 **사건 카드**로 스크롤(진입 10분 가격+매도벽 레인 · 잠김 전 구간 잔량 레인(큰 매도 ▼ · 취소 ✕ · 깨짐 ●) · 사실 문장 목록(시각 + `facts.text` + `source` 배지) · 창구 막대 진입 1분 매수/깨짐 전 1분 매도) → **창구 지문표**(10건 미만 「관찰 중」 회색 행) → **어제 결과**(D+1 시가 표). 폰은 격자 행이 2단 카드형(이름/결과 · 스파크라인 · 메타 2줄), 데스크톱은 8열 표. 2단계 상세 페이지·상단 탭 변형은 기각.
- **D-12: 시각 규칙 — 잔량 곡선은 중립색(`--fg`), 잠김 음영은 연한 회색면.** 매수·매도 관례색(`--up`/`--down`)은 창구 막대(매수 빨강 · 매도 파랑) · 깨짐 ● 빨강 · 큰 매도 ▼ 파랑 · 결과 태그(깨짐 `--up-bg`/`--up` · 유지 `--down-bg`/`--down`)에만. 기준선 10억 = 주황 점선(`--led-latent` 계열). 출처 배지 「실측 · 추정 · 모형」 = 작은 회색 칩, 사실 문장 줄 끝과 창구 열에 항상. SVG 는 inline, 라이브러리 없이(차트 라이브러리 oklch 함정 회피 — 토큰은 hex). 빈 날(manifest 행 0 · export 없음)·로딩 상태 모양은 플래너 재량.

### 적재 파이프라인
- **D-13: radar-gw 타이머 = rsync + GCS 업로드만.** systemd timer(평일 21:00 KST, `netcut-daily.timer`/`tick-archive.timer` 선례) → oneshot: `rsync -az --delete --exclude='*.tmp' smok95@10.16.207.119:/ <local>/export/` → `gcloud storage rsync <local>/export gs://gh-radar-limitup-export/export`(relay SA 메타데이터 자격 · 버킷은 프로젝트 gh-radar · asia-northeast3 · 공개 접근 방지). radar-gw 에 Node 런타임·Supabase 키를 올리지 않는다. 키: radar-gw 에서 ed25519 1개 생성(`radar-gw-limitup-pull`), 공개키는 인박스 노트 추기로 gh-trade 에 전달, 119 등록 전까지 타이머 disabled. — **Reversibility:** costly — radar-gw 호스트 유닛·GCS 버킷·119 키가 걸린다.
- **D-14: 적재기 = 새 Cloud Run Job 워커 `workers/limitup-sync`**(Scheduler 평일 21:20 KST, 기존 워커 한 벌: `scripts/deploy-limitup-sync.sh` · `setup-…-iam.sh` · `smoke-…` · `ops/alert-limitup-sync-failure.yaml`). GCS 의 `<D>/manifest.json` 이 있는 날짜만 · 파일마다 sha256 대조(불일치면 그 날짜 건너뛰고 로그) · `schema_version` 이 아는 값(지금 1)이 아니면 건너뛰고 로그 · 적재 이력 표(날짜별 manifest sha256)로 **바뀐 날짜만** 재적재 · 재적재는 **날짜 단위 삭제 후 삽입**(트랜잭션). 격자는 Storage `limitup-grid/grid/<date>/<isin>.json.gz` 로 업로드(기존 객체 덮어쓰기). 전송 형식(`Content-Encoding: gzip` vs 브라우저 해제)은 플래너 재량 — 서명 URL 응답에 상한이 없고 종목당 최대 수백 KB 라 어느 쪽도 된다.
- **D-15: Supabase 표 6개 = 노트 표 그대로.** `facts.values` 에 GIN 인덱스는 **두지 않는다**(행 표시용 — 웹이 근거 키로 검색·필터하지 않는다). 읽기 RPC 는 기존 관행(`REVOKE anon/authenticated` 명시 · `TO anon, authenticated` 둘 다)을 따르되, 페이지가 DMA 게이트 뒤라 server 경유 읽기(`requireAuth`)로 통일한다. — **Reversibility:** costly — 표 6개·버킷·적재 이력 표가 걸린다.
- **D-16: 보존 = 표 6개 · Storage 격자 전부 90일**(119 원본과 같은 창). 정리는 적재 워커가 run 끝에 `date` < 오늘−90일 행·객체를 지운다. GCS 사본은 지우지 않아 재적재 가능.

### 인박스 질문 5건 답 (노트에 추기)
1. **grid 객체 한도** — Supabase Storage 객체 상한(기본 50MB)·서명 URL 응답 상한 모두 현재 최대 376KB·하루 2.5MB 와 자릿수가 다르다. 잠김이 장 끝까지 가서 fine 창이 하루 전체(23,400초 × 24열)가 되어도 gzip 수 MB 수준 — 문제 없음. 27-17 UAT 뒤 최대치 추기는 참고로만.
2. **보존 기간** — 표·격자 90일(D-16). 119 `--delete` 미러는 radar-gw 로컬에만 적용되고 GCS 사본은 남긴다.
3. **kind 15 저장 경로** — 옛 relay 도 kind 를 거르지 않고 숫자 그대로 넣는다(`dma_strategy_events.kind` CHECK 없음 · 저널 포맷 무변경). 현재 RPC 는 `kind NOT IN (1,2,10)` → 계좌 조인이라 계좌 없는 15 는 **아무에게도 안 보인 채 적재**된다 — 이 phase 가 시세 집합에 15 를 넣어 전원 가시로 바꾼다(D-06). 보존 30일(D-08). 인덱스는 기존 `(trade_date, gateway, account_no)` 로 조회 충분, purge 용 부분 인덱스는 플래너 재량.
4. **85 수신 로그** — Phase 27(gh-radar) 이 85 를 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 에 넣어 **debug 레벨 드롭**(warn 아님, `envelope.ts:547`)이다. Phase 28 이 INBOUND 로 올리면 드롭 자체가 없다. 서버 Phase 27 선배포는 안전.
5. **`facts.values` GIN** — 없음(D-15). 행 표시용만.

### Claude's Discretion
- 85 브라우저 프레임 이름·스냅샷 캐시·1초 갱신 깜빡임 방지(바뀐 칸만 갱신) · 관측 시각 표기 위치(툴팁 또는 탭 본문 끝).
- kind 15 체크 상태 기억 · purge 실행 주체 · 부분 인덱스.
- 보고서 빈 날·로딩 모양 · 날짜 선택 컴포넌트(‹ › + 달력 여부) · 사건 카드 SVG 축 눈금 · 종목명 → 종목상세 링크 여부.
- 격자 전송 형식(gzip 그대로/해제) · 적재 이력 표 이름 · GCS 버킷 이름 · 워커 알림 정책 문구.
- 공개키 생성·전달 절차의 실행 세부(메인 세션이 radar-gw 에서 생성, 인박스 노트 추기).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 계약 (gh-trade → gh-radar)
- `docs/inbox/from-gh-trade/261005-limitup-feature-85.md` — 이 phase 의 계약 정본: 85 32필드 표 · kind 15 슬롯 매핑표 · export 파일 6종 열·PK · 격자 JSON 구조 · manifest · 멱등 규칙 · 질문 5건(답은 이 CONTEXT 와 노트 추기).
- `/Users/alex/repos/gh-trade/docs/features/limitup-feature.md` — 기능 정본. ⑥ 「클라 3줄 표」 9칸 규칙·색 규칙·툴팁(웹 탭 「상한가」 의 문구 정본), ⑤ 저널 kind 15, ⑦ 알려진 한계.
- `/Users/alex/repos/gh-trade/docs/analysis/feature-dictionary.md` — 특징 사전 v1: 이름·식·단위·85 필드·kind 15 슬롯·격자 열. 표시 라벨과 단위 변환의 근거.
- `/Users/alex/repos/gh-trade/server/tools/analysis/tickana/export.py` — export 열의 코드 정본(노트 표는 여기서 뽑았다).
- `/Users/alex/repos/gh-trade/.planning/phases/27-limitup-lock-report/27-CONTEXT.md` — D-20(보고서 구성 정본) · D-21(전달 경로) · D-11(지문표 관찰 중 규칙).
- `/Users/alex/repos/gh-trade/.planning/phases/27-limitup-lock-report/27-MOCKUP-v2.html` — gh-trade 보고서 목업(A/B/C 탭) — 사건 카드 레인·사실 문장·지문표의 원형.
- `relay/src/generated/StockDMA.fbs` — 동기화된 fbs(Phase 27 동기화 뒤 85·슬롯 90·kind 15 포함 확인).

### 이 phase 목업 (사용자 채택 상태 — UI-SPEC·플랜의 시각 정본)
- `.planning/phases/28-limitup-feature-ingest/reference/mockup-limit-feature-85.html` — 작업대 상따 카드 탭 「상한가」(A 채택 · 탭 제목 · 접힘 칩 · 9칸 · 폰 축약).
- `.planning/phases/28-limitup-feature-ingest/reference/mockup-kind15-orderlog.html` — 주문로그 kind 15 줄(A 기본 숨김 + 체크).
- `.planning/phases/28-limitup-feature-ingest/reference/mockup-limitup-report.html` — `/analytics/limitup` 한 페이지 세로 흐름 · 중립색 곡선 · 폰/데스크톱.

### 기존 결정·규약
- `.planning/phases/27-auto-sell-integration/27-CONTEXT.md` · `27-RESEARCH.md` — relay 생성물 동기화·수기 사본 3곳(`msg-type.ts` · `envelope.ts` · `subscription-hub.ts`) 갱신 형태 · 85 OUT_OF_SCOPE(Pitfall 7) · kind 15 Deferred 메모.
- `supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql` — 시세 kind 집합 재정의 선례(본문 그대로 · kind 조건만 교체).
- `packages/shared/src/strategy-event.ts` `isMarketStrategyEvent` · `strategy-event-text.ts` `orderLogLineText` — 집합 동기 규약과 kind 분기 자리.
- `webapp/src/styles/globals.css` §2.2b — 카드 폭 밴드(685 · 830 · 992) 정본. 탭 「상한가」 폰 축약 경계 = 685.
- `docs/relay-operations.md` 「radar-gw 호스트 공유」 — tick-archive 유닛·relay SA·GCS 버킷 선례, radar-gw 변경 전 gh-trade 알림 규칙.
- `infra/relay/netcut-daily.timer` · `.service` — radar-gw systemd timer 선례.
- `scripts/deploy-limit-up-sync.sh` · `ops/alert-*.yaml` — 워커 한 벌 선례.
- `CLAUDE.md` 「gh-trade 인박스」 · `docs/inbox/from-gh-trade/README.md` — 노트 done 처리 형식.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webapp/src/components/trading/card/card-tabs.tsx` — 탭 줄 + 고정 높이 본문(`CARD_TABS_BODY_H`) · 탭 제목 건수 괄호 · 접힘 저장 — 「상한가」 탭이 들어갈 자리.
- `webapp/src/components/trading/card/card-header.tsx` — 접힘 요약 칩(`l2`) — 「잠김 N초」 칩 자리.
- `webapp/src/components/trading/order-log/order-log-filters.tsx` · `order-log-list.tsx` — 필터 칩(네이티브 select)과 시세 이벤트 줄 렌더(`isMarketStrategyEvent`) — 체크 칩과 kind 15 줄.
- `packages/shared/src/strategy-event-text.ts` — kind 별 본문 조립 분기(10 버스트 상한가 선례) — kind 15 분기.
- `relay/src/ws/fanout.ts` `#keyConns` 색인 · tape(full 소켓만) 규칙 — 85 팬아웃 경로. `relay/src/dma/envelope.ts:547` OUT_OF_SCOPE debug 드롭.
- `webapp/src/components/stock/stock-limit-up-section.tsx` · `lib/limit-up-format.ts` — 상한가 이력 표·태그 색 규칙(D-13 색) — 결과 태그·어제 결과 표 재사용 후보.
- `workers/limit-up-sync` — 워커 구조(config · logger · services · rebuild)·Dockerfile·vitest 틀 — `limitup-sync` 복제 원형.
- `infra/relay/netcut-daily.{timer,service}` — radar-gw oneshot 타이머 틀.

### Established Patterns
- 카드 반응형은 `@container/lc` 카드 폭만(뷰포트 금지, §2.2b) — 탭 「상한가」 폰 축약도 같은 쿼리.
- 수기 사본 3곳 동기(`msg-type.ts` MSG/INBOUND/OUT_OF_SCOPE 주석-상수 짝 · `envelope.ts` 파서 · `subscription-hub.ts` `#onFrame`).
- 시세 kind 집합은 RPC 와 shared 두 곳이 같아야 한다(마이그레이션 주석 규약).
- Supabase RPC 는 `REVOKE anon/authenticated` 명시, 새 공개 표는 `TO anon, authenticated` 둘 다 — 이 phase 표는 server 경유라 anon 정책 자체를 두지 않는 쪽이 단순.
- 워커 = Cloud Run Job + Scheduler SA 바인딩 + 알림 정책 yaml + smoke 스크립트, 배포 스크립트 env 는 `GCP_PROJECT_ID`·`SUPABASE_URL` 필수.
- radar-gw 변경은 gh-trade 에 먼저 알린다(호스트 공유) — 타이머 추가는 relay 무접촉이라 알림만.

### Integration Points
- relay `msg-type.ts`(85 INBOUND 승격) → `envelope.ts` 파서 → `subscription-hub.ts` `#onFrame` case → `fanout.ts` market 경로 → webapp `use-relay-socket` 프레임 → 카드 상태 훅 → `card-tabs.tsx` 새 탭.
- 저널 kind 15: relay `journal/strategy-stream.ts`(변경 없음) → `dma_strategy_events` → RPC 재정의 → server `routes/strategy-events.ts` → webapp 주문로그 필터.
- 보고서: `workers/limitup-sync` → Supabase 표·Storage → server 새 라우트(`/api/limitup/...`, 서명 URL 포함) → webapp `app/analytics/limitup/page.tsx` + 사이드바 「분석」 그룹(`app-sidebar.tsx`).
- radar-gw: `infra/relay/limitup-pull.{timer,service}` + `startup.sh` 설치 줄 · relay-operations.md 운영 절.

</code_context>

<specifics>
## Specific Ideas

- 「WinForms 상따창과 같은 모양·같은 단어」 — 웹 탭 9칸은 `limitup-feature.md` ⑥ 표를 글자 그대로 옮긴다. 밤 보고서 숫자와 장중 숫자가 같아야 한다는 D-16(gh-trade) 취지.
- 탭 제목 「상한가 · 잠김 43초」 — 자동 전환 대신 제목이 알린다. 접힌 카드도 「잠김 43초」 칩으로 같은 정보.
- 주문로그에서 kind 15 는 「체크를 켜야 보이는 보조 줄」 — 분당 줄이 주문 줄을 묻지 않게.
- 보고서는 「날짜 하나에 긴 한 장」 — 트레이더가 밤에 하루를 위에서 아래로 훑는 용도. 곡선은 중립색, 색은 의미(매수/매도/깨짐)에만.
- 적재는 기존 워커 관행 그대로 — radar-gw 는 운반만, 판단·적재·알림은 Cloud Run.

</specifics>

<deferred>
## Deferred Ideas

- 「분석」 메뉴의 다른 하위 페이지(향후) — 이 phase 는 「상한가 보고서」 하나만.
- 보고서 종목 행 → 종목상세 링크, 종목상세 「상한가 다음날 이력」 섹션에 사건 카드 요약 노출 — 별도 phase.
- kind 15 노출 확대(카드 「상한가」 탭에 오늘 분 단위 이력 표시) — 데이터가 쌓인 뒤.
- 격자 fine 창 최대치(27-17 UAT 뒤 gh-trade 추기) 반영 — 노트 갱신 시 참고만.
- 원본 pcap GCS 보관(gh-trade quick-261005-fxh)과 radar-gw 트래픽 — gh-trade 몫, 이 phase 밖.

</deferred>

---

*Phase: 28-limitup-feature-ingest*
*Context gathered: 2026-10-05*
