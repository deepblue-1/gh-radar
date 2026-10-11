# Phase 28: 상한가 특징 연동 — gh-trade Phase 27 계약 반영 - Research

**Researched:** 2026-10-05
**Domain:** relay 85 중계(FlatBuffers · 공개 시세 팬아웃) · shared 문장 조립기 kind 15 · Supabase 표/RPC/Storage · Cloud Run Job 적재 워커 · radar-gw systemd 운반 · Next.js 작업대 카드 탭 + 보고서 페이지(inline SVG)
**Confidence:** HIGH (relay·webapp·DB 삽입 자리와 gh-trade 정본은 이번 세션에 원문을 열어 확인 · 실 export 4일치를 로컬에서 직접 열어 확인) / 일부 MEDIUM (GCS·Supabase Storage 운영 세부 · 아래 Open Questions 8건)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 이미 확정된 것 (인박스 노트 · ROADMAP · gh-trade 정본 — 다시 묻지 않는다)
- 85 32필드·`MemberDelta`·`TeamSim` 스키마, 슬롯 90, Broadcast·1초 스로틀·FULL 구독 범위 — fbs `2404509b`(master blob `68679e9a`, Phase 27 동기화에 생성물 포함).
- kind 15 슬롯 매핑표(특징 사전 ③) · `message` 형식 · 분당 1건/키 · 82/81 에 없음 · 계좌 없음.
- 표 6개 이름·열·PK·타입 제안, `facts.values` jsonb, `date` = `"YYYYMMDD"` 문자열, bp 없음(소수) · `*_ms` epoch ms, `foreign` 예약어 따옴표.
- 격자 파일 구조(coarse 10초 2,340점 + fine 1초 창 0~1개, cols 24키), 비공개 버킷 + 서명 URL.
- radar-gw pull: rrsync 읽기 전용 키 1개(공개키는 gh-radar 가 radar-gw 에서 생성해 인박스로 전달, 119 등록은 gh-trade 사용자) · `rsync -az --delete --exclude='*.tmp' smok95@10.16.207.119:/` · manifest 있는 날짜만 · sha256 대조 · 아는 `schema_version` 만 · manifest 바뀐 날짜 재적재(D+1 보충으로 어제 export 가 다시 쓰인다 → 날짜 단위 삭제 후 삽입).
- 보고서 내용 구성 = gh-trade D-20 「B 하루 격자(머리) → A 사건 카드(본문) → C 창구 지문표(꼬리) → 어제 결과」. `facts.text` 완성 문장 그대로, `values` 는 근거, `source`(실측/추정(분 단위)/모형) 표기 유지. `limit_up_events(code, date)` 조인 키 = `short_code` + `date`(형식 변환).
- 실시간 표시 산술은 WinForms D-19(단위 변환·비율만, 새 판정값 금지, 주문 판단에 쓰지 않음). 신호등 색(초록·노랑·주황) 금지 — 빨강·파랑은 매수·매도 관례색, 「잠김」 빨강, 확률 값 무채색, 「관찰 중」 회색.

#### 실시간 85 표시 — 작업대 상따 카드 (목업 `reference/mockup-limit-feature-85.html`, A 채택)
- **D-01: 표면 = 작업대 상따 카드 하나.** 종목상세 호가 탭은 Phase 21 D-31 로 사라졌다 — ROADMAP 의 「종목상세 호가 탭」 문구는 폐기.
- **D-02: 자리 = 카드 탭 「상한가」** — 「정보 | 미체결 | 잔고」 옆 네 번째 탭(`card-tabs.tsx`). 탭 본문 공통 고정 높이(정보 탭 3줄 ≈ 72px) 안에 3줄 표가 들어가 **카드 높이가 변하지 않는다**. 호가 아래(WinForms 위치)·전폭 띠 변형은 기각.
- **D-03: 표 = WinForms `tblLimitFeature` 9칸 규칙 동형** — 행 머리 「지금 · 10초 · 창구」 + 값 3칸. 칸 문구는 `docs/features/limitup-feature.md` ⑥ 표 그대로(「잠김 N초째」·「대기 X.X억」·「소진 N초/—」·「깨짐」·「미도달 (+R.R%)」·「매도벽 X.X억(+)」·「상한가 13,000」·「매수/매도 우세 NN%」·「잔량 신규 +N」·「잔량 취소 -N」·「매수 {창구} +X.X만」·「깨짐확률 NN.N%/관찰 중」). 단일가면 지금 행 첫 칸 앞 「단일가 · 」. 폰 밴드(카드 폭 < 685)에서는 10초 행의 「잔량 」 접두를 떼고 수량을 만 단위(「신규 +1.2만」)로 줄여 잘림을 막는다(목업 `i.w`). 85 가 아직 안 왔거나 구 서버·대상 밖 키면 9칸 전부 「—」.
- **D-04: 탭 자동 전환 없음** — 사용자 클릭만. 알림의 탭 요청 통로(`alertTabFor`)도 이 탭을 열지 않는다. 대신 **탭 제목이 상태를 말한다**: 잠김 중 「상한가 · 잠김 43초」(잠김 부분 빨강, 1초 갱신) · lock_state 2 「상한가 · 깨짐」 · 그 밖 「상한가」. 미체결 건수 괄호와 같은 자리 문법.
- **D-05: 접힌 카드 헤더 — 폐기(2026-10-05 ui-phase).** 원안은 잠김 중 요약 칩 옆 「잠김 43초」 칩이었으나, 접힌 카드는 price 구독(quick-261001-dyi)이고 85 는 FULL 구독에만 오므로 지금 구독 모델에서는 칩이 나타날 수 없다(UI-SPEC 전제 P-1). 사용자 결정: 칩을 만들지 않고 접힌 헤더는 바꾸지 않는다 — 접힌 카드에서는 잠김을 보지 않으며, 펼쳐야 탭 제목 「상한가 · 잠김 N초」(D-04)로 본다. 헤더 요약은 계좌 상태만 말한다는 규칙에 예외를 두지 않는다. 접힌 카드 구독 정책·relay 팬아웃 「FULL 소켓에만」 은 그대로.
- relay: 85 를 `INBOUND_MSG_TYPES` 로 올리고 `OUT_OF_SCOPE` 에서 뺀다(Phase 27 이 넣어 둔 것을 되돌림 · `envelope.test.ts` 단언 갱신). 브라우저 프레임 이름·캐시 여부(키별 마지막 1프레임을 FULL 구독 직후 스냅샷으로 줄지 — 83 `unf.progress` 선례)는 플래너 재량. 팬아웃은 hub `"market"` 경로의 `#keyConns` 색인으로 **그 키를 FULL 로 잡은 소켓에만**(tape 와 같은 규칙).

#### kind 15 웹 노출 (목업 `reference/mockup-kind15-orderlog.html`, A 채택)
- **D-06: 가시성 = 시세 집합에 15 추가.** `dma_strategy_events_for_user` 를 `(1, 2, 10, 15)` 로 재정의하는 마이그레이션 1개(20261003120000 본문 그대로 · kind 조건만 교체) + shared `isMarketStrategyEvent` 에 `LimitFeature: 15` — 두 곳이 같아야 한다는 기존 규약 유지. 그 게이트웨이에 가시 계좌가 있는 사용자 전원에게 보인다(계좌 없음). relay 저널 라이브 푸시도 같은 판정으로 분당·키당 1행이 간다. — **Reversibility:** reversible — RPC 재정의 1개와 상수 1줄.
- **D-07: 주문로그 노출 = 기본 숨김 + 「상한가 특징」 체크.** 주문로그 세그먼트(전체/매수/매도/시세) 옆 체크 칩. 꺼짐(기본)이면 kind 15 줄을 거른다, 켜면 「전체」·「시세」 뷰에 분당 줄이 섞인다. 카드 주문로그 팝업 · `/trading/order-log` 창 · 공용 패널 모두 같은 필터 컴포넌트(`order-log-filters.tsx`)를 쓴다. 줄 모양: 구분 칩 「상한가특징」(중립 회색 칩) · 행위 빈칸 · 주문번호 빈칸(시세 이벤트처럼 칸 없음) · 내용 = 「잠김 43초 · 잔량 17.3억 · 매도벽 0억 · 소진 — · 10초 매수 우세 63% · 신규 +12,400 / 취소 -2,300 · 창구 매수 키움 +5.2만 / 매도 신한 +1.8만 · 깨짐확률 관찰 중」 꼴(잠김 부분 빨강, 나머지 보조색) · 누적 = `cum_volume`. 체크 상태 기억 여부(`readPanelsPref` 선례)는 플래너 재량.
- **D-08: 보존 = kind 15 만 30일.** `trade_date` 기준 30일 지난 kind 15 행을 지우는 정리 잡(주문 이벤트·시세 1/2/10 은 그대로 — 감사 기록). 실행 주체(pg_cron vs 워커)·부분 인덱스(`WHERE kind = 15`)는 플래너 재량. 같은 값이 밤 export 격자에 1초 해상도로 남으므로 손실 없음.

#### 보고서 페이지 (목업 `reference/mockup-limitup-report.html`, A·중립색 채택)
- **D-09: 위치 = 최상위 「분석」 메뉴 신설(트레이딩 다음) › 「상한가 보고서」, 라우트 `/analytics/limitup`.** 사이드바 그룹 제목 「분석」 + 하위 항목 1개(향후 분석 페이지가 늘 수 있는 자리). 모바일 탭바에는 넣지 않는다(드로어 사이드바로 진입).
- **D-10: 접근 = DMA 연결 사용자만**(`tradingVisible` 과 같은 조건). 메뉴 자체가 DMA 없는 계정에는 보이지 않고, 페이지는 트레이딩과 같은 게이트. 격자 서명 URL 은 server 가 `requireAuth` 뒤 발급.
- **D-11: 탐색 = 한 페이지 세로 흐름.** 상단 날짜 ‹ MM/DD (요일) › 하나(URL `?d=YYYYMMDD`, 기본 = manifest 가 있는 최신 날짜), 내용 순서 KPI 띠(탐지 종목 · 잠김 수 · 종가까지 유지 · 25%↑ 미도달 · 어제 D+1) → **하루 격자**(종목 행: 이름·코드 · 잔량 스파크라인(잠김 음영 · 깨짐 ● · 기준선 10억) · 첫 잠김 · 잠김 수 · 최대 잔량 · +60초 매도 비중 · 결과 태그 · 진입 매수 창구(출처 배지)) → 행을 누르면 아래 **사건 카드**로 스크롤(진입 10분 가격+매도벽 레인 · 잠김 전 구간 잔량 레인(큰 매도 ▼ · 취소 ✕ · 깨짐 ●) · 사실 문장 목록(시각 + `facts.text` + `source` 배지) · 창구 막대 진입 1분 매수/깨짐 전 1분 매도) → **창구 지문표**(10건 미만 「관찰 중」 회색 행) → **어제 결과**(D+1 시가 표). 폰은 격자 행이 2단 카드형(이름/결과 · 스파크라인 · 메타 2줄), 데스크톱은 8열 표. 2단계 상세 페이지·상단 탭 변형은 기각.
- **D-12: 시각 규칙 — 잔량 곡선은 중립색(`--fg`), 잠김 음영은 연한 회색면.** 매수·매도 관례색(`--up`/`--down`)은 창구 막대(매수 빨강 · 매도 파랑) · 깨짐 ● 빨강 · 큰 매도 ▼ 파랑 · 결과 태그(깨짐 `--up-bg`/`--up` · 유지 `--down-bg`/`--down`)에만. 기준선 10억 = 주황 점선(`--led-latent` 계열). 출처 배지 「실측 · 추정 · 모형」 = 작은 회색 칩, 사실 문장 줄 끝과 창구 열에 항상. SVG 는 inline, 라이브러리 없이(차트 라이브러리 oklch 함정 회피 — 토큰은 hex). 빈 날(manifest 행 0 · export 없음)·로딩 상태 모양은 플래너 재량.

#### 적재 파이프라인
- **D-13: radar-gw 타이머 = rsync + GCS 업로드만.** systemd timer(평일 21:00 KST, `netcut-daily.timer`/`tick-archive.timer` 선례) → oneshot: `rsync -az --delete --exclude='*.tmp' smok95@10.16.207.119:/ <local>/export/` → `gcloud storage rsync <local>/export gs://gh-radar-limitup-export/export`(relay SA 메타데이터 자격 · 버킷은 프로젝트 gh-radar · asia-northeast3 · 공개 접근 방지). radar-gw 에 Node 런타임·Supabase 키를 올리지 않는다. 키: radar-gw 에서 ed25519 1개 생성(`radar-gw-limitup-pull`), 공개키는 인박스 노트 추기로 gh-trade 에 전달, 119 등록 전까지 타이머 disabled. — **Reversibility:** costly — radar-gw 호스트 유닛·GCS 버킷·119 키가 걸린다.
- **D-14: 적재기 = 새 Cloud Run Job 워커 `workers/limitup-sync`**(Scheduler 평일 21:20 KST, 기존 워커 한 벌: `scripts/deploy-limitup-sync.sh` · `setup-…-iam.sh` · `smoke-…` · `ops/alert-limitup-sync-failure.yaml`). GCS 의 `<D>/manifest.json` 이 있는 날짜만 · 파일마다 sha256 대조(불일치면 그 날짜 건너뛰고 로그) · `schema_version` 이 아는 값(지금 1)이 아니면 건너뛰고 로그 · 적재 이력 표(날짜별 manifest sha256)로 **바뀐 날짜만** 재적재 · 재적재는 **날짜 단위 삭제 후 삽입**(트랜잭션). 격자는 Storage `limitup-grid/grid/<date>/<isin>.json.gz` 로 업로드(기존 객체 덮어쓰기). 전송 형식(`Content-Encoding: gzip` vs 브라우저 해제)은 플래너 재량 — 서명 URL 응답에 상한이 없고 종목당 최대 수백 KB 라 어느 쪽도 된다.
- **D-15: Supabase 표 6개 = 노트 표 그대로.** `facts.values` 에 GIN 인덱스는 **두지 않는다**(행 표시용 — 웹이 근거 키로 검색·필터하지 않는다). 읽기 RPC 는 기존 관행(`REVOKE anon/authenticated` 명시 · `TO anon, authenticated` 둘 다)을 따르되, 페이지가 DMA 게이트 뒤라 server 경유 읽기(`requireAuth`)로 통일한다. — **Reversibility:** costly — 표 6개·버킷·적재 이력 표가 걸린다.
- **D-16: 보존 = 표 6개 · Storage 격자 전부 90일**(119 원본과 같은 창). 정리는 적재 워커가 run 끝에 `date` < 오늘−90일 행·객체를 지운다. GCS 사본은 지우지 않아 재적재 가능.

#### 인박스 질문 5건 답 (노트에 추기)
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

### Deferred Ideas (OUT OF SCOPE)

- 「분석」 메뉴의 다른 하위 페이지(향후) — 이 phase 는 「상한가 보고서」 하나만.
- 보고서 종목 행 → 종목상세 링크, 종목상세 「상한가 다음날 이력」 섹션에 사건 카드 요약 노출 — 별도 phase.
- kind 15 노출 확대(카드 「상한가」 탭에 오늘 분 단위 이력 표시) — 데이터가 쌓인 뒤.
- 격자 fine 창 최대치(27-17 UAT 뒤 gh-trade 추기) 반영 — 노트 갱신 시 참고만.
- 원본 pcap GCS 보관(gh-trade quick-261005-fxh)과 radar-gw 트래픽 — gh-trade 몫, 이 phase 밖.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 이 phase 로 매핑된 ID 는 **없다**(ROADMAP `TBD`). 아래 가칭은 CONTEXT D-01~D-16 을 묶은 것이다 — 플래너는 플랜 `requirements:` 칸에 이 가칭을 쓰지 말고 D 번호로 추적한다.

| 가칭 | 설명 (CONTEXT 결정) | Research Support |
|------|---------------------|------------------|
| G-A | 85 relay 중계 + 작업대 카드 탭 「상한가」 (D-01~D-05) | §A — 85 는 **dirty 때만** 오므로 relay 키별 마지막 1프레임 캐시가 사실상 필수(Pitfall 1) · 공개 시세 `"market"` 경로 확장 자리 · 깨지는 단언 5곳 · WinForms 9칸 함수 원문과 숫자 반올림 함정(Pitfall 6) |
| G-B | kind 15 가시성 · 조립기 · 주문로그 체크 · 30일 purge (D-06~D-08) | §B — **PostgREST `max_rows = 1000` 침묵 절단**이 kind 15 로 확정 사고가 된다(Pitfall 2) · 웹 `MAX_STRATEGY_EVENTS` 5000 축출(Pitfall 3) · `matchesSide` 가 tone 으로 거른다(Pitfall 4) |
| G-C | Supabase 표 6 + Storage + 적재 워커 + radar-gw 타이머 + 보존 (D-13~D-16) | §C·§D·§E — PostgREST 는 트랜잭션을 못 잇는다 → **stage 표 + commit RPC** 로 날짜 원자 교체 · GCS 는 Cloud Run Job **볼륨 마운트**(새 의존성 0) · relay SA 는 덮어쓰기에 `storage.objects.delete` 가 필요 |
| G-D | 보고서 `/analytics/limitup` + 사이드바 「분석」 + server 라우트 (D-09~D-12) | §F·§G — 한 요청 = RPC 1회(jsonb) · 지문표 · +60초 매도 · 스파크라인은 export 표에 **열이 없다** → 적재 시 파생(Open Q2) · `values`/`foreign` 예약어 |
| G-E | 배포 + 인박스 done + 공개키 추기 | §H — server 배포가 순서에 빠져 있다(Open Q5) · 키 주석 불일치(Open Q1) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 사용자 대면·산출물은 **한글**, 코드 식별자·경로·프로토콜 이름은 영어. 커밋 메시지 한글 · **Co-Authored-By 넣지 않음**(사용자 전역 규칙이 시스템 attribution 보다 우선).
- **GSD 워크플로우 필수** — 편집은 `/gsd-execute-phase` 안에서. 작업은 **master** 에서(`branching_strategy: none`).
- **gh-trade 인박스 규약** — 처리한 노트는 `status: done` + `done_commit` 을 채워 **경로를 지정해** 커밋(`git add -A` 금지). 형식 정본 `docs/inbox/from-gh-trade/README.md`.
- **배포는 relay 먼저 → 검증 → push**(push 가 곧 webapp 프로덕션 배포). 백엔드가 막히면 push 하지 않는다. relay 컨테이너 교체는 장 시간(08:00~20:00 KST) 밖.
- **서브에이전트(executor)는 배포 · smoke · push · Secret 쓰기 · radar-gw 원격 조작을 하지 않는다** — 메인 세션 `checkpoint:human-action`(메모리 「서브에이전트 배포는 분류기 차단」 · 「비밀 주입은 사용자 `!` 실행」).
- 상따 카드 반응형은 **카드 폭 컨테이너 쿼리 `@container/lc`**(`globals.css` §2.2b 정본 — 표 복사 금지). 앱 셸·보고서 페이지는 뷰포트 브레이크포인트.
- **UI 는 HTML 목업 먼저** — 이미 3장 채택 + UI-SPEC 승인(7/7). 손보는 표면 안의 시각 결함은 묻지 말고 고치고 한 줄 보고.
- **WinForms 동형 기본** — 리서치가 웹≠WinForms 를 밝히면 플래너 전에 한 건씩 묻고 권고는 WinForms 동형(메모리 2026-10-05).
- 동시 세션 커밋 경합 — 커밋·relay 배포 직전 `git status -sb` 재확인(지금 working tree 에 Phase 27 executor 의 미커밋 테스트 3파일이 있다).
- Supabase RPC 는 `REVOKE … FROM PUBLIC` + `REVOKE … FROM anon, authenticated` 명시 + `GRANT … TO service_role`. 공개 표 RLS 정책은 `TO anon, authenticated` 둘 다 — 이 phase 표는 **정책 0개(server 전용)**.
- Cloud Run → Supabase 왕복이 지연을 지배 — 다중 쿼리 집계는 **RPC 1회**.
- 워커 배포 스크립트는 `GCP_PROJECT_ID` + `SUPABASE_URL` 필수, 알림 정책 단계는 `NOTIFICATION_CHANNEL_ID`. server 배포는 `CORS_ALLOWED_ORIGINS` 도 필수(라이브 Cloud Run env 에서 추출).
- 보안검사 생략(`workflow.security_enforcement: false`) · Nyquist 검증 유지(`nyquist_validation: true`).
- 「무로그 fail-safe 금지」 — 워커 catch 는 사유를 남기고 비영 종료(알림이 잡게).

## Summary

이 phase 는 세 갈래가 서로 다른 계층을 친다. **(A) 85 중계**는 Phase 26 이 만든 「공개 시세 = quote 관찰자 연결 1개 → hub `"market"` → fanout `#keyConns`」 경로에 tape 와 같은 「FULL 소켓만」 규칙으로 한 종류를 더하는 일이다. 생성물(`relay/src/generated/stock-dma/limit-feature.ts` 등)은 이미 동기화돼 있고(SYNC MARKER `2404509b` · gh-trade master fbs blob `68679e9a` 와 바이트 동일 확인), 바꿀 곳은 수기 사본 3곳 + fanout + shared 계약 타입 + 테스트 단언 5곳이다. 결정적 발견: gh-trade 서버는 85 를 **값이 바뀐 키만** 보내고 구독 직후 재송신이 없다(`LimitFeature.cpp:325-334` — 잠김 중·10초 유량 중이 아니면 **분 경계에만** dirty). 새로 펼친 카드의 조용한 키는 최대 60초 「—」 로 남으므로, relay 키별 마지막 1프레임 캐시 + FULL 구독/승격 직후 스냅샷 송신은 「재량」이 아니라 사실상 필수다.

**(B) kind 15** 는 SQL 한 줄과 상수 한 줄로 보이지만 두 개의 **확정 사고**를 품고 있다. ① `dma_strategy_events_for_user` 는 SETOF 함수라 PostgREST `max_rows = 1000`(`supabase/config.toml:18`)에 **조용히** 잘린다 — 지금도 `dma_strategy_events` 가 5거래일 8,510행(≈1,700/일)이고, kind 15 가 하루 수천~1만 행을 더하면 오름차순 정렬의 **오후 주문 이벤트부터** 화면에서 사라진다(같은 함정을 19-REVIEW WR-06 이 `dma_journal_orders_for_user_json` 으로 고친 선례가 있다). ② 웹 relay 스토어의 `MAX_STRATEGY_EVENTS = 5000` 은 오래된 것부터 버리므로, 전원에게 분당 수십 행씩 푸시되는 kind 15 가 **당일 푸시로만 받은 주문 이벤트를 밀어낸다**. 권고: kind 15 는 기본 응답·기본 스토어에서 분리하고(체크가 켜질 때만 조회·보관), RPC 는 jsonb 래퍼로 바꾼다(Open Q3).

**(C) 밤 적재**는 새 기계가 가장 많다. 실 export 4일치가 맥 `~/ticks/research/export/2026092{9,30}…20261002` 에 있어(15MB · 공개 시세 파생물) 워커 테스트 픽스처·로컬 실행 원천으로 바로 쓸 수 있다. 세 가지가 설계를 정한다: ① PostgREST 호출은 서로 다른 트랜잭션이라 「날짜 단위 삭제 후 삽입(트랜잭션)」(D-14)은 **stage 표 + commit RPC 1회**로만 원자적이 된다. ② GCS 읽기는 Cloud Run Job 의 **Cloud Storage 볼륨 마운트**(읽기 전용)로 하면 워커가 순수 파일 읽기가 되고 새 npm 의존성이 0 이다(`@google-cloud/storage` 는 legitimacy 검사에서 `SUS — too-new`). ③ UI-SPEC 의 「+60초 매도 비중」·「창구 지문표」·스파크라인은 export 표에 **해당 열이 없다**(gh-trade 가 `locks.sell_share_60s` 를 export 에서 뺐고, 지문표는 90일치 `member_alloc` 겹침 가중 집계다) — 요청마다 계산하면 Cloud Run egress·수백만 행이 걸리므로 **적재 시 파생 표**로 미리 만든다(Open Q2 — D-15 「표 6개」 에 더하는 파생 표라 사용자 확인).

**Primary recommendation:** Phase 27 실행·배포가 끝난 뒤 시작한다(같은 파일 다수 — Pitfall 13). 순서: DB(kind 15 RPC·jsonb 래퍼·purge · limitup 표 6 + stage/이력/파생 + 보고서 RPC + 버킷) → shared(계약 타입·조립기·회원사 표·9칸 순수 함수) → relay 85 → webapp 카드 탭 · 주문로그 체크 → 워커 `limitup-sync` → radar-gw 설치기 → server `/api/limitup` → 보고서 페이지 → 배포 체크포인트(DB push → GCS/IAM/워커 → radar-gw 키·타이머 → relay → server → push) → 인박스 done.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 85 값 계산 · 대상 키 · 1초 스로틀 · kind 15 저널 | gh-trade 서버(범위 밖) | — | 「클라는 표시만」(limitup-feature.md ①). D-19 산술(단위 변환·비율)만 웹 |
| 85 디코드 · 키별 마지막 1프레임 캐시 · FULL 소켓 팬아웃 | relay (`envelope.ts` · `subscription-hub.ts` · `fanout.ts`) | 생성물 `generated/` | FlatBuffers 는 relay 만 안다. 공개 시세라 계좌 필터 없음, `#keyConns` 키 단위 |
| 9칸 문구 · 숫자 표기 · 회원사명 | shared 순수 함수(권고) 또는 webapp lib | webapp 카드 탭 | 같은 숫자 함수를 kind 15 조립기(shared)도 쓴다 — shared 에 두면 한 벌 |
| kind 15 가시성 | Database (RPC `dma_strategy_events_for_user`) | shared `isMarketStrategyEvent`(relay 라이브 푸시) | 두 곳이 같은 집합이어야 한다(마이그레이션 주석 규약) |
| kind 15 기본 숨김 · 체크 | webapp (`order-log-feed.ts` · `order-log-filters.tsx`) | server 조회 파라미터(권고) | 볼륨 때문에 「숨김」 은 화면이 아니라 조회·보관 단계에서 해야 한다(Pitfall 2·3) |
| kind 15 30일 purge · limitup 90일 정리 | 적재 워커 `limitup-sync` (RPC 호출) | Database RPC | pg_cron 사용 이력 0(마이그레이션에 `cron.schedule` 없음) — 워커가 이미 밤마다 돈다 |
| 119 → GCS 운반 | radar-gw systemd oneshot (rsync + `gcloud storage rsync`) | GCS 버킷 | D-13 — radar-gw 에 Node·Supabase 키 없음 |
| manifest 대조 · 날짜 원자 교체 · 격자 업로드 · 파생 표 | Cloud Run Job `limitup-sync` | Database commit RPC · Supabase Storage | PostgREST 는 트랜잭션을 못 잇는다 → DB 안 RPC 가 교체를 한 트랜잭션으로 |
| 보고서 데이터 · DMA 게이트 · 서명 URL | server (`/api/limitup/*`, `requireAuth`) | Database 보고서 RPC(jsonb 1회) · Storage `createSignedUrls` | 웹 `DmaGate` 는 권한 장치가 아니다(dma-gate.tsx 머리 주석) — 실제 게이트는 server/RPC |
| 보고서 화면 · inline SVG · gzip 해제 | webapp (`app/analytics/limitup`) | — | 차트 라이브러리 금지(D-12) · `DecompressionStream('gzip')` |

## Standard Stack

신규 npm 패키지 **없음**(권고 경로 기준). 모든 자리에 기존 스택이 있다.

### Core (이미 설치 — 이번 세션 실측)
| Library / Tool | Version | Purpose | 비고 |
|---------|---------|---------|------|
| flatbuffers (npm, relay) | ^25.9.23 | 85 디코드 | 생성물 이미 동기화 `[VERIFIED: relay/src/generated/StockDMA.fbs:3 「server-repo-commit: 2404509b」 + cmp 로 gh-trade master fbs 와 바이트 동일]` |
| @supabase/supabase-js | workers ^2.49.0 · server ^2.103.0 (registry 최신 2.117.2) | 워커 적재 · Storage 업로드 · server RPC · `createSignedUrls` | `[VERIFIED: npm view · workers/limit-up-sync/package.json]` |
| pino | ^9 (workers) | 워커 로그 | limit-up-sync 와 같음 |
| vitest | relay ^4.1.4 · workers ^3 · server · webapp · shared | 단위·통합 | 기존 |
| Playwright | ^1.59.1 | webapp e2e(로컬 relay + 스텁 게이트웨이) | `webapp/e2e/fixtures/relay.ts` |
| Node | v22.22.0 | 런타임 | `[VERIFIED: node --version]` |
| pnpm | 11.15.1 | 워크스페이스(`workers/*` 자동 포함) | `[VERIFIED: pnpm-workspace.yaml]` |
| Supabase CLI | 2.75.0 (linked `ivdbzxgaapbmrxreyuht`) | `supabase db push` | `[VERIFIED: supabase --version · supabase/.temp/project-ref]` |
| gcloud | 558.0.0 | 배포 · 버킷 · IAM · Scheduler | `[VERIFIED: gcloud --version]` |
| Docker | 29.4.0 | 워커 이미지(amd64) | `[VERIFIED: docker --version]` |

### Supporting (플랫폼 기능 — 패키지 아님)
| 기능 | 용도 | 근거 |
|------|------|------|
| Cloud Run Jobs Cloud Storage volume mount (`--add-volume …type=cloud-storage,bucket=…,readonly=true`) | 워커가 GCS export 를 파일로 읽는다 | `[CITED: docs.cloud.google.com/run/docs/configuring/jobs/cloud-storage-volume-mounts]` — 읽기 전용은 SA 에 `roles/storage.objectViewer` |
| Supabase Storage 비공개 버킷 + `createSignedUrls(paths[], expiresIn)` | 격자 서명 URL 일괄 발급(요청 1회) | `[CITED: supabase.com/docs/reference/javascript/storage-from-createsignedurls]` |
| `DecompressionStream('gzip')` | 브라우저 격자 해제 | `[CITED: developer.mozilla.org — Baseline since May 2023]` |
| `gcloud storage rsync` (`--recursive` · `--exclude` Python 정규식 · `--checksums-only`) | radar-gw → GCS | `[CITED: docs.cloud.google.com/sdk/gcloud/reference/storage/rsync]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GCS 볼륨 마운트 | `@google-cloud/storage` 8.x | 공식 · 22M/주지만 latest 8.2.0 이 2026-09-17 게시라 legitimacy `SUS(too-new)` → human-verify 체크포인트 필요 · 이미지 비대. 볼륨 마운트는 코드 0 줄·로컬은 같은 코드로 `LIMITUP_EXPORT_DIR=~/ticks/research/export` |
| GCS 볼륨 마운트 | GCS JSON API `fetch` + 메타데이터 토큰 | 의존성 0 이지만 목록·다운로드·토큰 코드 ~60줄과 로컬 인증 분기가 생긴다 |
| stage 표 + commit RPC | jsonb 한 번에 RPC 1회(`limitup_replace_day(p_date, p_payload)`) | member_alloc 62K행 ≈ 15MB 한 요청 — 게이트웨이·statement 시간 위험 `[ASSUMED]` |
| stage 표 + commit RPC | 워커 직접 Postgres 연결(`pg`, 트랜잭션·COPY) | DB 접속 URL 비밀이 저장소·Secret Manager 어디에도 없다(`scripts/smoke-relay.sh:226` 「psql 접속정보(SUPABASE_DB_URL)는 이 저장소 어디에도 없기 때문이다」) — 새 비밀 주입(사용자 `!`) + 의존성 |
| 적재 시 파생 표(지문·스파크) | 요청 시 RPC 계산 | 지문은 90일 `member_alloc`(≈62K행/일 × 약 63거래일 ≈ 390만 행) 겹침 가중 집계 — 페이지마다 수 초 `[ASSUMED]` |

**Installation:** 없음(권고 경로). 대안으로 `@google-cloud/storage` 를 택하면 `pnpm --filter @gh-radar/limitup-sync add @google-cloud/storage@8.1.0` 전에 checkpoint:human-verify.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @google-cloud/storage (대안 경로에서만) | npm | latest 8.2.0 = 2026-09-17 (18일) | 22,320,842/주 | github.com/googleapis/google-cloud-node | [SUS] (reason `too-new`, postinstall 없음) | 권고 경로에서 **쓰지 않음**. 대안을 택하면 Flagged — 플래너가 설치 전 `checkpoint:human-verify` |

`[VERIFIED: gsd-tools query package-legitimacy check --ecosystem npm @google-cloud/storage]` 원문: `"verdict": "SUS"` · `"reasons": ["too-new"]` · `"weeklyDownloads": 22320842` · `"postinstall": null`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** @google-cloud/storage (대안 경로 한정)

## Architecture Patterns

### System Architecture Diagram

```
        ┌──────────────── gh-trade KB 120 (Phase 27 서버 — 미배포, 배포 시점은 gh-trade) ────────────────┐
        │ LimitFeature::Tick (100ms 틱 · 대상 키 = 상한 근접 ∪ rate_cross 이상)                           │
        │   ├─ dirty 키만 · 키당 ≥1초 → 85 (그 키 FULL 구독 연결에만, Broadcast)                          │
        │   └─ 분 경계 → kind 15 저널(대상 키 전부, 구독 무관) → 80 JournalBatch                          │
        └───────┬───────────────────────────────────────────────┬────────────────────────────────────────┘
       quote 관찰자 연결(role 1, FULL∪PRICE 합집합 구독)          │ 관찰자 저널(80)
                ▼                                                ▼
 relay  tryParseEnvelope ─ INBOUND(85 승격) ─▶ hub #onFeedFrame   journal/strategy-stream → dma_strategy_apply
        case 85: parseLimitFeature → #refs 없으면 버림            → dma_strategy_events (kind 15 그대로)
                 → #limitFeatures.set(key) → emit("market",       → fanout journal.events
                   {key, msg:{t:"limit.feature"…}, full, price:false})   (isMarketStrategyEvent(15)=true → 게이트웨이 사용자 전원)
        fanout #deliverMarket: limit.feature 는 lv==="full" 소켓만
        fanout sub(full 신규 · price→full 승격): q 캐시 → tape 캐시 → **85 캐시**
                ▼ wss JSON
 webapp use-relay-socket: 시장 배치(100ms) → limitFeatures Map(키) ─▶ useRelaySubscription → 카드(level full 일 때만)
        CardTabs 「상한가」 탭: limitFeatureCells(9칸 순수 함수 · MemberCodes) · 탭 제목 「상한가 · 잠김 N초」
        journal.events: kind 15 는 별도 소 스토어(권고) ─▶ 주문로그 「상한가 특징」 체크 켜짐일 때만 섞임

 ── 밤 ───────────────────────────────────────────────────────────────────────────────────────────────
 119 20:30 export → ~/ticks/export/<D>/{6×ndjson.gz, grid/*.json.gz, manifest.json(마지막 rename)}
      │ rrsync -ro (키 1개, 사용자 등록)
      ▼
 radar-gw 21:00 KST limitup-pull.timer → oneshot: rsync -az --delete --exclude='*.tmp' → /var/lib/<user>/export
      → gcloud storage rsync (데이터 먼저 · manifest.json 마지막) → gs://gh-radar-limitup-export/export/
      ▼ (Cloud Run Job GCS 볼륨 마운트, 읽기 전용)
 limitup-sync 21:20 KST (Scheduler 평일)
   날짜마다: manifest 있음? → schema_version==1? → 파일별 sha256 대조 → 적재 이력 sig 와 비교(바뀐 날짜만)
     → stage 표에 청크 삽입 → commit RPC(한 트랜잭션: 행 수 대조 · 6표 날짜 삭제 · 삽입 · 파생 표 · 이력 upsert)
     → 격자 Storage upload(upsert) limitup-grid/grid/<D>/<isin>.json.gz
   끝: 90일 정리(표 · 격자) · kind 15 30일 purge RPC
      ▼
 server GET /api/limitup/report?d=  (requireAuth → RPC 1회: 게이트 + 날짜 목록 + 그날 표 + 파생 + 어제 결과)
        GET /api/limitup/grid-urls?d= (requireAuth → 게이트 → createSignedUrls 1회)
      ▼
 webapp /analytics/limitup (사이드바 「분석」 · DmaGate) — KPI · 하루 격자(파생 스파크) · 사건 카드(격자 지연 로드 · gzip 해제) · 지문표 · 어제 결과
```

### 권장 플랜 분해 (config `parallelization: false` — 순차 · Phase 27 완료 뒤)

| # | 플랜 | 핵심 파일 | 선례 |
|---|------|-----------|------|
| 28-01 | DB ①: kind 15 가시성 RPC 재정의 + jsonb 래퍼(kind 15 포함 여부 인자) + kind 15 purge RPC + 부분 인덱스 | `supabase/migrations/2026100?…_dma_strategy_events_limit_feature.sql` | `20261003120000` · `20261004090000_dma_journal_orders_for_user_json.sql` |
| 28-02 | DB ②: limitup 표 6 · stage · 적재 이력 · 파생 2 · commit/정리/보고서 RPC · Storage 버킷 | `supabase/migrations/…_limitup_tables.sql` · `…_limitup_rpcs.sql` | `20260929180000_dma_strategy_events.sql`(잠금 4줄) |
| 28-03 | shared: `RelayLimitFeatureMsg` 계약 · `isMarketStrategyEvent` 15 · 라벨 · 회원사 표 · 9칸/숫자 순수 함수 · 조립기 kind 15 · `message` 파서 | `packages/shared/src/{relay,strategy-event,strategy-event-labels,strategy-event-text}.ts` + 신규 `limit-feature.ts` · `member-codes.ts` | `dc439352`(kind 10) |
| 28-04 | relay 85: msg-type 승격 · 파서 · hub 캐시/case · fanout 규칙 · 테스트 헬퍼 | `relay/src/dma/{msg-type,envelope}.ts` · `hub/subscription-hub.ts` · `ws/fanout.ts` · `tests/helpers/frames.ts` | 17-03(76) · 25-06(83) · 26(tape full 규칙) |
| 28-05 | webapp 85: 스토어(market 배치) · 구독 레벨 정리 · 카드 탭 「상한가」 · 탭 제목 | `lib/use-relay-socket.ts` · `lib/relay-provider.tsx` · `components/trading/card/{card-tabs,strategy-card}.tsx` · 신규 `limit-feature-table.tsx` | quick-261001-dyi(level) |
| 28-06 | webapp kind 15: 별도 스토어 · 체크 칩 · 필터 · 배지 미가산 · 줄 색 · server 조회 파라미터 | `lib/order-log-feed.ts` · `lib/use-order-log-feed.ts` · `order-log-{filters,list}.tsx` · `card-log-popups.tsx` · `lib/trading-layout.ts` · `server/src/routes/strategy-events.ts` | Phase 25 |
| 28-07 | 워커 `workers/limitup-sync` 한 벌 + `scripts/{deploy,setup-…-iam,smoke}-limitup-sync.sh` + `ops/alert-limitup-sync-failure.yaml` | 신규 | `limit-up-sync` · `deploy-intraday-sync.sh:163-185`(알림) |
| 28-08 | radar-gw 운반기: 스크립트 · service · timer · 설치기 · relay-operations 절 | 신규 `infra/relay/limitup-pull/` | gh-trade `server/tools/archive/{tick-archive.sh,.service,.timer,install.sh}` |
| 28-09 | server `/api/limitup/{report,grid-urls}` | 신규 `server/src/routes/limitup-report.ts` · `services/limitup.ts` · `schemas` | `routes/strategy-events.ts` |
| 28-10 | webapp 보고서: 라우트 · 사이드바 「분석」 · DmaGate surface · 날짜 탐색 · KPI · 하루 격자 | `app/analytics/limitup/page.tsx` · `components/layout/app-sidebar.tsx` · `components/trading/dma-gate.tsx` · 신규 `components/analytics/*` | `app/trading/page.tsx` |
| 28-11 | webapp 보고서: 사건 카드(레인 2 · 사실 문장 · 창구 막대) · 지문표 · 어제 결과 · e2e | `components/analytics/*` · `e2e/specs/limitup-report.spec.ts` | — |
| 28-12 | 배포 체크포인트(사용자/메인 세션) + 인박스 done · 공개키 추기 | `docs/inbox/from-gh-trade/261005-limitup-feature-85.md` · `docs/relay-operations.md` | `25-12-PLAN.md` |

---

### §A. 85 relay 중계 (G-A)

**A-1. 생성물 — 동기화 불필요.** `relay/src/generated/StockDMA.fbs` 머리 「server-repo-commit: 2404509b」, gh-trade `git rev-parse master:server/src/protocol/StockDMA.fbs` = `68679e9adf7b3cfe8719d86289a333ff1bbea21f`, `tail -n +8` 사본과 `git show master:…` 가 `cmp` 동일 `[VERIFIED: 이번 세션 실행]`. 생성 접근자(`relay/src/generated/stock-dma/limit-feature.ts`) `[VERIFIED: Read 29-203행]`: `isin()` · `exchange()` · `gwTimeMs():bigint` · `featureSchema()` · `upperPx()` · `lastPx()` · `rateBp()` · `basePx()` · `listShares():bigint` · `qQty():bigint` · `qKrw():bigint` · `wallKrwVisible():bigint` · `wallQtyHidden():bigint` · `wallTruncated()` · `sellLed10s():bigint` · `buyLed10s():bigint` · `cancel10s():bigint` · `new10s():bigint` · `auctionFill10s():bigint` · `drainS()` · `lockState()` · `lockElapsedS()` · `burstUpperLimit()` · `auction()` · `memberBuy(i)`/`memberBuyLength()` · `memberSell(i)`/`memberSellLength()` · `memberDeltaPartial()` · `modelState()` · `modelSchemaVersion()` · `pBreakBp()` · `pHorizonS()` · `teamSim(i)`/`teamSimLength()`. `member-delta.ts`: `memberNo()` · `dQty():bigint` · `dValue():bigint` · `shareBp()`. Envelope 접근자 `limitFeature(obj?)`(`stock-dma/envelope.ts:274`), 빌더 `addLimitFeature` → `builder.addFieldOffset(43, …)`(= vtable 90). `MsgType` enum 은 fbs `enum MsgType : byte` — 85 는 int8 범위 안.

**A-2. 수기 사본 3곳 + 단언 (PC-12 — 화이트리스트와 명시 case 는 한 커밋).**

| 자리 | 지금 원문 `[VERIFIED: Read]` | 바꿀 것 |
|------|------|---------|
| `relay/src/dma/msg-type.ts:77-79` 「하지 않는 것」 | `- 85 \`LimitFeature\`(gh-trade Phase 27 — 상한가 특징 · Envelope 슬롯 90)는 중계 · 표시가 범위 밖이다` | 이 줄을 지우고 「유입 집합」 블록에 28-0x 단락 추가(하류 = `parseLimitFeature` + `#onFeedFrame` 명시 case + 키별 캐시 + FULL 소켓 팬아웃 · 사용자 세션 `#onFrame` 명시 warn case) |
| `msg-type.ts:97-224` `MSG` | 85 키 없음 | `LimitFeature: 85` 추가(주석: Broadcast · 키당 1초 · dirty 만 · FULL 연결만) — `codec.test.ts:239` `expect(Object.keys(MSG)).not.toContain("LimitFeature")` 뒤집힘 |
| `msg-type.ts:246-274` `INBOUND_MSG_TYPES` | 27종 · 끝 `MSG.UserSettingsResp,` | `MSG.LimitFeature` 추가 → **28종**, 머리 주석 계수 갱신 |
| `msg-type.ts:297-299` `OUT_OF_SCOPE_INBOUND_MSG_TYPES` | `68, 70, 74, 75, 81, 82, 85,` | `68, 70, 74, 75, 81, 82,` + 위 주석 목록(:284-293)에서 85 줄 삭제 |
| `envelope.ts:529-562` `tryParseEnvelope` | 85 는 `:550-551` `drop("out-of-scope-msg-type", msgType, payload, "debug")` | 코드 무변경(집합만 바뀜). 새 `parseLimitFeature(env)` — `parseQueueProgress`(:818-870) 문법: 슬롯 null → `dropField`, `isValidIsin`/`isValidExchange`, bigint 는 `toNum(v, label)`(:291), 벡터는 `takeCount` 상한(3) |
| `hub/subscription-hub.ts:1964-2017` `#onFeedFrame` | 85 case 없음(default 계수) | `case MSG.LimitFeature:` → parse → `#onLimitFeature(msg)` |
| `subscription-hub.ts:1661-1820` `#onFrame` | 85 case 없음 | 사용자 세션은 종목을 구독하지 않는다(Phase 26 D-08) → 58/59/69/71 과 같은 명시 warn case(`:1666-1673` 문법) |
| 헤더 `#onFeedFrame` 표(:101-108) | 85 줄 없음 | `85 LimitFeature → 전역 키 캐시 + "market" (full 소켓만)` 줄 추가 |

**A-3. 공개 시세 경로 확장 (hub → fanout).**
- `HubMarketEvent.msg` 는 `RelayQuote | RelayTape` 로 **좁혀 선언**돼 있고 주석이 「넓히지 말 것」(`subscription-hub.ts:352-360`)이다. 그 이유는 「사용자 데이터가 이 경로를 못 타게」(T-26-01)다 — 85 는 계좌·주문자가 없는 **공개 시세 파생값**이라 규칙 안이다. 유니온을 `RelayQuote | RelayTape | RelayLimitFeatureMsg` 로 넓히고 주석에 이유를 적는다.
- 캐시 수명은 `#quotes` 와 같게: `#onQuote`(:2027-2039)처럼 `#refs` 에 키가 없으면 버림(해제 뒤 늦은 프레임이 캐시를 되살리지 않게) · `#releaseKey`(:1135-1150)에서 `#quotes.delete`/`#tapes.delete` 옆에 삭제 · `closeAll`(:1620-1655)에서 clear · (선택) `stats()` 에 계수.
- 방출은 `{ key, msg, full: true, price: false }` — tape `#flush`(:2470-2483)와 같은 플래그.
- `fanout.ts:1814-1824` `#deliverMarket`: 지금 `if (e.msg.t === "tape" && lv !== "full") continue;` — 85 도 같은 줄에 넣는다(`price` 소켓 금지 — 접힌 카드는 price 구독, UI-SPEC P-1).
- `fanout.ts:1048-1114` sub 분기: **새 키 full**(:1109-1112 `getSnapshot` → `#sendTapeSnapshot`)과 **price→full 승격**(:1082-1091) 두 자리에 `#hub.getLimitFeature(isin, ex)` 스냅샷 송신을 붙인다. 순서 q → tape → 85.
- **왜 캐시가 필수인가** `[VERIFIED: gh-trade server/src/market/publish/LimitFeature.cpp:316-334]`: 분 경계에만 `st.dirty = true; // 증분이 0 으로 돌아갔다`, 그 밖은 `if (!st.dirty && (st.atLimit || HasFlowNear(st, nowSec))) st.dirty = true;` 그리고 `if (!st.dirty || tickSeq - st.lastSentTick < kLimitFeatureMinIntervalTicks) continue;` — 구독 직후 재송신 경로가 없다(`MarketPublisher.cpp:850-852` 는 FULL 구독자가 없으면 빌더 전에 끝낼 뿐). 조용한 키(깨진 뒤 유량 없음 · 미도달)는 다음 분 경계까지 최대 60초 프레임이 없다.

**A-4. 브라우저 프레임 (재량 — 권고).** 이름 `t: "limit.feature"`(기존 `rate.cross` · `unf.progress` · `user.settings` 점 표기), 키 `i`/`x`(q · tape 와 같음), 나머지 camelCase 숫자. P-2 필드 + 표시 완결성 필드:

```ts
// packages/shared/src/relay.ts (권장 모양 — 이름은 플래너 확정)
export type RelayLimitFeatureMember = { memberNo: string; dQty: number; dValue: number; shareBp: number };
export type RelayLimitFeatureMsg = {
  t: "limit.feature";
  i: string; x: RelayExchange;
  gwTimeMs: number; featureSchema: number;
  upperPx: number; lastPx: number; rateBp: number; basePx: number;
  qQty: number; qKrw: number; wallKrwVisible: number; wallQtyHidden: number; wallTruncated: boolean;
  sellLed10s: number; buyLed10s: number; cancel10s: number; new10s: number; auctionFill10s: number;
  drainS: number;            // −1 = ∞
  lockState: number;         // 0 미도달 · 1 잠김 · 2 도달 뒤 비잠김
  lockElapsedS: number; burstUpperLimit: boolean; auction: boolean;
  memberBuy: RelayLimitFeatureMember[]; memberSell: RelayLimitFeatureMember[]; memberDeltaPartial: boolean;
  modelState: number; modelSchemaVersion: number; pBreakBp: number; pHorizonS: number;
  // team_sim 은 승격 전 빈 벡터 — 표시 자리가 없다(싣지 않거나 빈 배열)
};
// RelayOutbound 유니온(relay.ts:1549-1573)에 추가. 모르는 t 는 옛 webapp 리듀서가 무시한다.
```

### §B. 웹 카드 탭 「상한가」 (G-A)

**B-1. 데이터 경로.** 시세는 `use-relay-socket.ts` 의 100ms 시장 배치(`isMarketFrame` :766-768 = `frame.t === "q" || frame.t === "tape"`, `applyMarketFrames` :1157-1191 — copy-on-write Map)로 들어간다. 85 도 이 배치에 넣어 `limitFeatures: Map<relayQuoteKey, RelayLimitFeatureMsg>` 를 같은 방식으로 갱신하면 키 수 × 1Hz 리렌더가 100ms 배치 1회로 접힌다(권고). `useRelaySubscription`(`relay-provider.tsx:524-608`)이 `quote`/`tape` 처럼 **자기 키 값만** `limitFeature` 로 돌려주고, `useStrategyCardState`(`strategy-card.tsx:257-276`)가 이를 카드 상태에 싣는다.

**B-2. 「얼린 값」 방지(UI-SPEC ①-2 마지막 불릿).** 카드 level 은 `open ? "full" : "price"`(`strategy-card.tsx:884-889`). 두 겹으로 막는다:
1. 카드는 자기 level 이 `"full"` 일 때만 `limitFeature` 를 쓴다(아니면 null → 9칸 「—」 · 제목 「상한가」).
2. 소켓의 그 키 와이어 level 이 full 에서 내려가거나(`flushSubscriptions` :1485-1545 가 price sub / unsub 를 보낼 때) 키를 놓으면 `limitFeatures` 에서 그 키를 지운다 — 다시 펼치면 relay 캐시 스냅샷(§A-3)이 즉시 채운다(WinForms `ShowCachedLimitFeature` 동형).

**B-3. 탭 자리.** `card-tabs.tsx:78` `export type CardTab = "info" | "unfilled" | "holdings";` → `"limit"` 추가 `[VERIFIED: Read]`. 트리거 문법 `CARD_TAB_TRIGGER`(:112-115) 그대로, 본문 높이 `CARD_TABS_BODY_H = "h-[calc(3*(11px*var(--lh-normal)+6px)+4px)]"`(:121) 안에 3행 표(행 ≈ 본문 ÷ 3). `CountBadge`(:124-131)가 「(N)」 자리 문법의 선례 — 탭 제목 접미 「 · 잠김 43초」 를 같은 자리에. `alertTabFor`(`lib/trading-alerts.ts:364-377`)는 반환 유니온이 `CardTab` 이라 `"limit"` 를 **반환하지 않음**을 테스트로 고정(D-04). `CardTabs` props 에 `limitFeature` 와 `stale` 를 더한다(호출부 `strategy-card.tsx:1002-1018`).

**B-4. 9칸 순수 함수 — WinForms 원문** `[VERIFIED: gh-trade client/Forms/Trading/LimitChaserForm.cs:3738-3864 Read]`. 웹은 이것을 글자 단위로 옮긴다(UI-SPEC ①-2 표가 같은 내용). 숫자 함수 원문:

```csharp
private static string FormatDuration(int s) { if (s >= 60) return (s / 60) + "분 " + (s % 60) + "초"; return s + "초"; }
private static string FormatManQty(long qty) { if (qty >= 10000 || qty <= -10000) return (qty / 10000.0).ToString("+0.0;-0.0") + "만"; return qty.ToString("+#,0;-#,0;0"); }
private static string FormatEok(ulong krw) { if (krw == 0) return "0"; return (krw / 100000000.0).ToString("N1") + "억"; }
// 지금 행 미도달: "미도달 (" + (e.RateBp / 100.0).ToString("+0.0;-0.0;0.0") + "%)"
// 10초: Math.Round(e.SellLed10s * 100.0 / led).ToString("0")   ← .NET 기본 = MidpointRounding.ToEven
// 잠김: "잔량 신규 " + (e.New10s > 0 ? "+" + e.New10s.ToString("N0") : "0") · "잔량 취소 " + (e.Cancel10s > 0 ? "-" + e.Cancel10s.ToString("N0") : "0")
// 창구: "매수 " + MemberCodes.GetMemberName(buy.MemberNo) + " " + FormatManQty(buy.DQty)   (FirstMember = 회원번호 있는 첫 원소)
// 깨짐확률: e.ModelState == 1 && e.PBreakBp >= 0 ? "깨짐확률 " + (e.PBreakBp / 100.0).ToString("0.0") + "%" : "깨짐확률 관찰 중"
```
클라 타깃은 .NET Framework 4.0(`GHTrade.csproj` `TargetFrameworkVersion v4.0`) — 반올림 함정은 Pitfall 6.

**B-5. 회원사 표.** gh-radar 에 회원번호 → 회원사명 표가 **없다**(shared·webapp·server 에서 「키움증권」 문자열 0건). `gh-trade client/Services/Data/MemberCodes.cs`(145행 · 회원 약 60개 · `GetMemberName`: 6자리면 앞 5자리, 없으면 코드 그대로)를 shared `member-codes.ts` 로 이식한다 — 카드 탭 · kind 15 조립기 · 보고서(entries `entry_buy_member1` 은 **회원번호** `"00050"` — 실데이터 확인)가 같이 쓴다.

### §C. kind 15 (G-B)

**C-1. 가시성 두 곳.** RPC 원문 `[VERIFIED: supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql:37-44]`: `(e.kind NOT IN (1, 2, 10) AND EXISTS (…v.account_no = e.account_no))` / `(e.kind IN (1, 2, 10) AND EXISTS (…v.gateway = e.gateway))`. shared `isMarketStrategyEvent`(`packages/shared/src/strategy-event.ts:76-82`) = `kind === STRATEGY_EVENT_KIND.LimitExposed || … LimitEntered || … BurstLimit`, 주석 :36-37 「15 LimitFeature(gh-trade Phase 27)는 Deferred — 키를 두지 않는다」. 마이그레이션은 이 본문을 그대로 두고 두 조건만 `(1, 2, 10, 15)` 로, shared 는 `LimitFeature: 15` 키 + 판정 추가. relay 는 shared 를 import 해서 라이브 푸시를 거른다(`relay/src/ws/fanout.ts:1737,1763` `isMarketStrategyEvent(row.kind) || accounts.has(row.accountNo)`) → **relay 재배포가 있어야** 라이브 푸시가 바뀐다.

**C-2. 볼륨이 만드는 두 사고(Pitfall 2·3) → 권고 설계 (Open Q3).**
- DB: 새 함수 `dma_strategy_events_for_user_json(p_user_id uuid, p_trade_date date, p_include_limit_feature boolean)` → `coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.gw_time_ms, r.gateway, r.seq), '[]')` FROM SETOF 함수 `WHERE p_include_limit_feature OR (r->>'kind')::int <> 15`(SETOF 가 jsonb 를 돌려주므로 `r` 은 jsonb) — 선례 `20261004090000`(스칼라 jsonb 라 max_rows 에 안 잘린다). 가시성 정본은 여전히 SETOF 함수 한 곳.
- server: `GET /api/strategy-events?date=&lf=1`(zod `StrategyEventsQuery` 확장) — 기본은 kind 15 제외. 체크가 켜질 때만 웹이 kind 15 를 조회(공용 피드 1회 — 카드 수와 무관).
- webapp: `journal.events` 리듀서(`use-relay-socket.ts:913-922`)가 kind 15 를 **별도 상한 스토어**(예: 2,000 · 오래된 것부터)로 보낸다 → `strategyEvents`(상한 5000)는 주문·시세 1/2/10 만. `strategyEventsBatch`(새 줄 강조·배지 원천)에도 kind 15 는 체크가 켜졌을 때만.

**C-3. 조립기.** `strategyEventParts`(`strategy-event-text.ts:100-171`) switch 에 `case 15`. 반환 타입 `StrategyEventParts`(:84-97)는 `tone: "buy" | "sell" | "market" | "unknown"` 이고 본문이 평문 하나다. UI-SPEC ②-2 는 「잠김 N초」 조각만 `--up` 600, 나머지 `--muted-fg` → **본문을 두 조각으로 줄 수 있는 필드**가 필요하다(예: `lead?: { text: string; tone: "up" }` + `body`, 또는 `emphasis` 범위). `orderLogLineText`(:429-438)는 평문 이어붙임을 유지(`title`·골든). tone 은 새 값 `"feature"`(→ `--muted-fg`) 권고 — `"unknown"` 재사용은 D-10 폴백과 의미가 섞인다.
**슬롯 → 85 이름**(인박스 표 = 특징 사전 ③ `[VERIFIED: gh-trade docs/analysis/feature-dictionary.md ③ Read]`): `price=last_px · evPrice=upper_px · limitBidQty=q_qty · evQtyBefore=q_krw · evQtyAfter=wall_krw_visible · askQtyAtLimit=wall_qty_hidden · openAtLimit=wall_truncated · evTradeQty=sell_led_10s · immediateFillQty=buy_led_10s · aheadQty=cancel_10s · baseCum=new_10s · expectedCum=auction_fill_10s · condThreshold=drain_s(−1=∞) · condActual=rate_bp · entryRound=lock_state · qty=lock_elapsed_s · hasRemaining=auction · resultCode=p_break_bp(model_state 0 → −1) · snapLen=model_state` · `message="buy:<member>=<share_bp>,…;sell:<member>=<share_bp>,…|m=<model_state>"`. 이 매핑을 `StrategyEventRow` → `RelayLimitFeatureMsg` 모양으로 되돌리는 순수 함수 1개를 두면 9칸 함수(§B-4)와 kind 15 문장이 같은 숫자 표기를 공유한다. WinForms `StrategyEventFormatter` 에는 kind 15 분기가 **없다**(그 파일의 `LimitFeature` 언급 0 — 81/82 로 안 오므로) `[VERIFIED: grep gh-trade client]` → kind 15 줄 형식은 UI-SPEC ②-2 가 정본(WinForms 동형 대상 없음).

**C-4. `message` 파서.** `;` 로 buy/sell, `,` 로 회원, `=` 뒤 bp, `|m=` 뒤 model_state. 256B 경계라 잘린 꼬리(마지막 원소 `=` 없음 · `|m=` 없음)를 total 하게 처리(버리기, 지어내지 않기). 예 `buy:00047=7407,00046=2222,00048=370;sell:00003=10000|m=0`.

**C-5. 주문로그 표면.**
- 구분 select(`ORDER_LOG_KIND_FILTERS` · `order-log-feed.ts:48-57`) + 카드 팝업 세그먼트(`ORDER_LOG_SIDE_FILTERS` :152-157). 카드 팝업 `matchesSide`(:160-166)는 **`strategyEventParts(row,'log').tone === side`** 로 거른다 → tone 을 `"feature"` 로 두면 「시세」 에서 kind 15 가 빠진다(Pitfall 4). `side === 'market'` 는 `isMarketStrategyEvent(row.kind)` 로 판정하도록 바꾼다.
- `matchesKind`(:114-119)의 `'market'` 는 `isMarketStrategyEvent` → 15 포함 자동(체크 꺼짐 필터를 앞단에).
- 체크 상태 기억(재량 — UI-SPEC 제안): `readPanelsPref` 는 **키를 화이트리스트로 하나씩 파싱**한다(`lib/trading-layout.ts:149-162` 예 `if (typeof p.cardTabsFolded === "boolean") out.cardTabsFolded = p.cardTabsFolded;`) — 새 키 `orderLogLimitFeature` 는 타입 + 파서 줄 둘 다 추가해야 읽힌다.
- 배지: `useUnseenOrderLogCount`(card-log-popups 가 쓰는 훅)와 공용 패널 새 로그 배지가 kind 15 를 체크 켜짐일 때만 센다(UI-SPEC ②-1 마지막 불릿). `orderLogSummary`(:192-205)의 「누적」 은 마지막 행 `cumVolume` — kind 15 제외 뒤의 행으로 계산.

**C-6. purge(D-08) · 인덱스.** pg_cron 사용 이력 없음(`grep cron.schedule supabase/migrations` 0건) → 적재 워커가 밤마다 RPC 1회: `DELETE FROM dma_strategy_events WHERE kind = 15 AND trade_date < (now() AT TIME ZONE 'Asia/Seoul')::date - p_keep_days`. 부분 인덱스 `ON dma_strategy_events (trade_date) WHERE kind = 15` 는 싸고 purge 가 쓴다(권고). 기존 인덱스 `idx_dma_strategy_events_day ON (trade_date, gateway, account_no)`(DDL :94-96). 용량: 현재 8,510행 = 3.2MB(≈370B/행) `[VERIFIED: supabase inspect db table-stats --linked]` → kind 15 1만 행/일 × 30일 ≈ 110MB.

### §D. Supabase 스키마 (G-C)

**D-1. 표 6개 = 인박스 표 그대로**(열 순서 · 타입 · PK). 실데이터로 키 확인 `[VERIFIED: ~/ticks/research/export/20261002/*.ndjson.gz 첫 행]`: entries 35키(`entry_buy_member1:"00050"` 회원번호 · `max_rate`·`close_ret` 소수), locks 22키(`outcome:"깨짐"`/`"유지"` · `data_end:"15:30:22.000944"`), jumps(`kind` 실분포 20261002: `new 2770 · wall_eat 3326 · cancel 1958 · auction_fill 848 · burst_sell 307 · burst_buy 22`), member_alloc(`"foreign":false` · `name:"신한증권"`), facts(`"values":{…}` 객체 · `source:"실측"|"추정(분 단위)"`), touches. **예약어 두 개**: `"foreign"`(인박스 명시) **와 `"values"`**(PostgreSQL 예약어 VALUES — 인박스가 언급 안 함) — DDL · RPC 본문 모두 따옴표(Pitfall 7).
- 잠금: `20260929180000_dma_strategy_events.sql` 의 4줄 그대로 — `ENABLE ROW LEVEL SECURITY` · `REVOKE ALL … FROM PUBLIC` · `REVOKE ALL … FROM anon, authenticated` · `GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role`, **정책 0개**(D-15 server 경유).
- `date text` 정렬·범위 비교는 `YYYYMMDD` 문자열 비교로 정확(90일 정리 `date < to_char((now() AT TIME ZONE 'Asia/Seoul')::date - 90, 'YYYYMMDD')`).
- 용량 추정 `[ASSUMED]`: member_alloc ≈ 200B/행(인덱스 포함) × 62K ≈ 13MB/일 → 90일(≈63거래일) ≈ 0.8GB + jumps ≈ 0.1GB. 현재 DB 3,818MB `[VERIFIED: supabase inspect db db-stats --linked]` → 약 4.7GB. 유료 플랜(8GB 포함) 가정 안이지만 사용자에게 알린다(Open Q6).

**D-2. 날짜 원자 교체 — stage + commit (권고).** PostgREST 호출마다 별도 트랜잭션이라 「삭제 후 삽입」 을 여러 요청으로 하면 중간 상태(그날 행 일부만)가 보고서에 보인다.
```sql
-- 단일 stage 표 (모든 표 공용 — 행은 export 원문 jsonb)
CREATE TABLE public.limitup_stage (date text NOT NULL, tbl text NOT NULL, seq int NOT NULL, row jsonb NOT NULL,
  PRIMARY KEY (date, tbl, seq));
-- 적재 이력 (D-14 「날짜별 manifest sha256」)
CREATE TABLE public.limitup_loads (date text PRIMARY KEY, manifest_sha256 text NOT NULL, files_sig text NOT NULL,
  schema_version int NOT NULL, rows jsonb NOT NULL, loaded_at timestamptz NOT NULL DEFAULT now());
-- commit: 한 트랜잭션 — stage 행 수 == 기대 행 수(manifest) 확인 → 6표 그날 DELETE → INSERT … SELECT (jsonb_populate_record(NULL::public.limitup_member_alloc, row)).* … → 파생 표 → 이력 upsert → stage 삭제
CREATE FUNCTION public.limitup_commit_day(p_date text, p_manifest_sha256 text, p_files_sig text, p_expected jsonb, …) RETURNS jsonb …
```
`jsonb_populate_record` 는 키 이름 = 열 이름으로 채우므로 `"foreign"`·`"values"` 키도 그대로 맞는다 `[ASSUMED: PG 표준 동작]`. 워커는 commit 전에 그날 stage 를 비우는 RPC(또는 commit 실패 시 다음 run 이 시작에서 비움)를 부른다. stage 삽입 청크는 1,000행(≈250KB) 권고 `[ASSUMED]` → member_alloc 62회 + jumps 10회 + 나머지 6회 ≈ 80요청/날짜.

**D-3. 파생 표 (Open Q2 — 사용자 확인 후).** UI-SPEC P-5 의 원천을 export 에서 찾은 결과:

| UI 값 | export 에 열이 있나 | 원천 · 정의(gh-trade 정본) |
|---|---|---|
| 최대 잔량 | locks 에 없음(`q_max_*` 「만들지 않았다」 — 인박스) | gh-trade 보고서는 `SELECT isin, max(q_krw) FROM grid … GROUP BY isin`(`report.py:973`) — export 에서는 격자 coarse∪fine `q_krw` 최대 또는 facts `template_id='q_max'` values `{lock_id, qty, krw}`(잠김마다) |
| +60초 매도 비중 | locks `sell_share_60s` 는 export 제외(`events.py` LOCKS_DDL 에는 있으나 `LOCKS_EXPORT_COLS` 에 없음) | `_sell_share_after(fine, s0)` = 첫 잠김 시작 초 s0 뒤 `sec = s0+10, s0+20 … s0+60` 의 `sell_led_10s` 합 ÷ (sell+buy) (`report.py:398-405`) — 격자 fine 필요 |
| 진입 1분 매수 상위 / 깨짐 전 1분 매도 상위 | facts `member_entry_buy` / `member_prebreak_sell` values `{m1, m1_code, s1(%), …}` | 그대로 표시 가능(서버 집계 불필요) |
| 창구 지문표 | 없음 | `fingerprint_agg`(`report.py:758-818`): 진입 anchor 1분 전 매수 비중 · 잠김 구간 매수/매도 비중 · 깨짐 전 1분 매도 · 선행(top_pre) — `member_top` 겹침 길이 가중(`facts.py:90-108`). 10건 게이트 `MIN_FINGERPRINT_EVENTS = 10` |
| 스파크라인 | 없음 | 격자 coarse `q_krw`(10초 · 2,340점) |

권고: 워커가 그날 파일을 메모리에 가진 김에 **(가) `limitup_grid_summary(date, isin, step_s, q_krw bigint[], q_max_krw, q_max_ms, sell_share_60s double precision, PK(date, isin))`** — 스파크(coarse 그대로) + 최대 + +60초, **(나) `limitup_member_daily(date, member, name, n, entry_sum, entry_cnt, lock_buy_sum, lock_buy_cnt, pre_sell_sum, pre_sell_cnt, lead, n_broke, n_lock, n_held, PK(date, member))`** — 날짜별 기여분. 지문표 = 90일 창 `GROUP BY member` 의 합·평균(`mean = sum/cnt`) — 요청 시 가볍다. 둘 다 commit 트랜잭션 안에서 날짜 단위 교체·90일 정리 대상. gh-trade 정의를 TS 로 옮길 때 `lock_buy` 는 매도만 한 창구도 `0.0` 으로 센다(`buy.get(m, 0.0)`) 등 세부가 있으니 Python 원문을 픽스처 골든과 대조한다(Pitfall 11).

**D-4. 보고서 RPC (Cloud Run 왕복 1회).** `limitup_report_for_user(p_user_id uuid, p_date text) RETURNS jsonb`: ① 게이트 `EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id))`(정의 `20260929190000_dma_gateway_identities.sql:113-129`) — 없으면 `{"access": false}` → server 403 · ② `dates` = `limitup_loads.date` 내림차순 · ③ 그날 entries · locks · facts · grid_summary · 레인 마커 jumps(`kind IN ('burst_sell','cancel')` 를 종목마다 `krw` 큰 순 상위 40 — 윈도 함수, 하루 2,265행을 다 보내지 않는다) · ④ 이전 적재 날짜의 locks/entries `d1_*`(어제 결과) · ⑤ 지문 90일 집계. 모두 jsonb 스칼라라 max_rows 무관. service_role 전용 잠금 3줄.

**D-5. Storage 버킷.** 마이그레이션에서 `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('limitup-grid', 'limitup-grid', false, …)` `[CITED: supabase docs creating-buckets / GitHub discussion #3528]`. 정책 0개(서비스롤만 업로드 · server 가 서명 URL). 전송 형식(재량): `upload(path, gzipBytes, { contentType: 'application/gzip', upsert: true })` 그대로 두고 브라우저가 `DecompressionStream('gzip')` — supabase-js 문서는 `Content-Encoding` 지정 옵션을 밝히지 않는다(`cacheControl · contentType · upsert · metadata` 만) `[CITED: supabase.com/docs/reference/javascript/storage-from-upload]`.

### §E. 적재 워커 `workers/limitup-sync` (G-C)

**E-1. 한 벌 복제 원형** `[VERIFIED: Read]`: `workers/limit-up-sync/{package.json, src/config.ts, src/index.ts, src/logger.ts, src/services/supabase.ts, Dockerfile, vitest.config.ts, tsconfig.json, tests/config.test.ts}` — CLI 진입 가드(`process.argv[1].endsWith("index.js")`), `dispatch()` 반환 결과 로그 + `process.exit(0/1)`, pino redact `*.supabaseServiceRoleKey`, Dockerfile 2단(pnpm deploy · shared dist 복사). 이름 함정: 기존 `limit-up-sync`(하이픈) vs 새 `limitup-sync` — Pitfall 12.

**E-2. run 흐름(권고).**
1. `LIMITUP_EXPORT_DIR`(Cloud Run = 볼륨 마운트 경로 · 로컬 = `~/ticks/research/export`)의 `YYYYMMDD/manifest.json` 이 있는 날짜만(`.tmp` 이름은 무시 — rsync 단계에서도 제외).
2. manifest `schema_version !== 1` → 그 날짜 skip + warn(원문 값).
3. `files[]` 각각 sha256(파일 바이트) 대조 — 하나라도 불일치 → 그 날짜 skip + warn(운반 중 반쯤 올라온 날짜를 여기서 거른다).
4. `files_sig` = `files[]` 의 (name, sha256) 정렬 연결의 sha256. **manifest 자체 sha 는 `finished_at`(재처리마다 바뀜)을 포함**하므로 「바뀐 날짜만」 판정은 `files_sig` 로(Pitfall 9). 이력과 같으면 skip.
5. ndjson.gz 해제 → stage 청크 삽입 → `limitup_commit_day` → 격자 업로드(`grid/<D>/<isin>.json.gz` upsert) — 격자는 표 commit 뒤에(표가 가리키는 파일이 없을 수는 있어도 반대는 없게). 파생 (가)(나)는 이때 계산해 commit 인자/stage 로.
6. 끝: 90일 정리(표 · 이력 · 파생 = RPC 1회, Storage = `list('grid/<D>')` → `remove(paths)`) · kind 15 30일 purge RPC.
7. 결과 요약 1줄(`loaded`, `skipped{reason}`, `purged`) — skip 이 있으면 비영 종료할지는 재량(권고: sha·schema 불일치는 warn + 종료 0, 예외는 1 — 알림은 실패 실행만 잡는다).
- 첫 run 은 GCS 의 전 날짜(지금 4일 + 이후)를 한 번에 적재한다 — task-timeout 은 limit-up-sync 의 180s 가 아니라 넉넉히(예 1800s) · 메모리 1Gi `[ASSUMED]`.

**E-3. 배포 스크립트(복제 + 차이).** `scripts/deploy-limit-up-sync.sh` 를 틀로: `deploy_job` 에 `--add-volume=name=export,type=cloud-storage,bucket=gh-radar-limitup-export,readonly=true --add-volume-mount=volume=export,mount-path=/mnt/export` `[CITED: Cloud Run 문서 — jobs update 의 --add-volume mount-path=… 축약형도 있음]`, env `LIMITUP_EXPORT_DIR=/mnt/export/export`, Scheduler `"20 21 * * 1-5"` Asia/Seoul, 알림 정책 단계는 `deploy-intraday-sync.sh:163-185` 문법(`NOTIFICATION_CHANNEL_ID` 정규화 · `gcloud alpha monitoring policies create/update`) + `ops/alert-limitup-sync-failure.yaml`(`ops/alert-intraday-sync-failure.yaml` 의 `run.googleapis.com/job/completed_execution_count result="failed"` 조건). IAM 스크립트: 새 SA `gh-radar-limitup-sync-sa` + `gh-radar-supabase-service-role` accessor + **버킷 단위** `roles/storage.objectViewer`(`gcloud storage buckets add-iam-policy-binding gs://gh-radar-limitup-export …`). 버킷 생성(asia-northeast3 · 균일 액세스 · 공개 접근 방지 · STANDARD)도 이 스크립트에 멱등으로. smoke: `smoke-limit-up-sync.sh` 의 INV(Job execute --wait · 로그 complete · failed 0 · 행 수 > 0 · Scheduler cron) + 「날짜별 행 수 == manifest rows」 대조.

### §F. radar-gw 운반기 (G-C · D-13)

**F-1. 선례 = gh-trade `tick-archive` 한 벌**(radar-gw 에 이미 설치 · 같은 호스트) `[VERIFIED: Read gh-trade server/tools/archive/{tick-archive.sh, tick-archive.service, tick-archive.timer, install.sh}]`:
- 전용 시스템 사용자(nologin) · `.ssh` 700 · ed25519 키는 **없을 때만** 생성 · 119 호스트키 지문 대조 후 known_hosts 고정 · `StrictHostKeyChecking=yes · BatchMode=yes · IdentitiesOnly=yes`.
- 유닛: `Type=oneshot` · `Nice=19` · `IOSchedulingClass=idle` · `MemoryMax=600M` · `OOMScoreAdjust=500`(relay 보다 먼저 죽는다 — radar-gw 는 e2-small 2GB).
- gcloud 고정: `CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False` · `PROCESS_COUNT=1` · `THREAD_COUNT=2` · `CLOUDSDK_CORE_DISABLE_PROMPTS=1`.
- 타이머: **radar-gw 시스템 시간대는 UTC** — `OnCalendar=… Asia/Seoul` 접미사 필수(tick-archive.timer 주석). 평일 21:00 KST = `OnCalendar=Mon..Fri 21:00:00 Asia/Seoul`. `Persistent=` 없음(재부팅 뒤 장중 몰아 돌리기 방지).
- 설치기 `install.sh --host-fp SHA256:… [--enable-timer]`(키 등록 전에는 enable 안 함 = D-13 「119 등록 전까지 disabled」).
**F-2. 차이.**
- rrsync 루트는 `~/ticks/export`(rsync 원격 경로 `smok95@10.16.207.119:/`). 키 주석: **CONTEXT D-13 「radar-gw-limitup-pull」 ≠ gh-trade 문서 「radar-gw-pull」**(`gh-trade server/tools/analysis/README.md:273,281,284` — 사용자 확인 절차가 `grep -c 'radar-gw-pull'`) → Open Q1.
- GCS 업로드 2단: `gcloud storage rsync --recursive --checksums-only --exclude='.*manifest\.json$' <local> gs://gh-radar-limitup-export/export` 뒤 manifest 만 2차 — 워커가 「새 manifest + 옛 데이터」 를 보는 창을 줄인다(sha 대조가 최종 방어). `--delete-unmatched-destination-objects` 는 쓰지 않는다(GCS 사본 보존 — D-16).
- **권한: 덮어쓰기 = `storage.objects.delete` 필요.** gh-trade 실측: 「relay SA 로는 불가 — 2026-10-05 실측: 같은 경로 재업로드·`gcloud storage rm` 모두 `storage.objects.delete` 403」 `[CITED: gh-trade server/tools/archive/README.md:42]`. D+1 보충으로 어제 파일이 **다시 쓰이므로** relay SA(`gh-radar-relay-sa`)에 이 버킷 한정 `roles/storage.objectUser`(objectCreator+objectViewer 로는 실패) — Pitfall 8.
- 로컬 미러 증가: 119 는 export 디렉터리를 지우지 않는다(인박스) → `--delete` 미러도 하루 ~4MB 씩 무한 증가(15MB/4일 실측). radar-gw 디스크 여유 점검 + 필요 시 정리 정책(재량).
- `docs/relay-operations.md` 「radar-gw 호스트 공유」 에 이 운반기 절 추가(gh-trade 소유물 절과 나란히) · radar-gw 변경은 gh-trade 에 알린다(그 절 규칙 — 인박스 노트 추기로 갈음).
- 실행 주체: radar-gw 접속은 `gcloud compute ssh radar-gw --zone asia-northeast3-a --tunnel-through-iap`(gh-trade README :88) — 설치·키 생성·공개키 출력은 **메인 세션/사용자 `!`**(executor 금지). 공개키 본문은 비밀이 아니지만 커밋·로그에는 지문만, 본문은 인박스 노트 추기 1회.

### §G. server 라우트 (G-D)

- 등록: `server/src/app.ts:96-99` 옆 `app.use("/api/limitup", limitupRouter)`. 기존 `/api/stocks/:code/limit-up`(`routes/limitUp.ts`)과 이름이 비슷하니 파일명 `limitup-report.ts` 권고.
- `requireAuth()`(`middleware/require-auth.ts`) → `req.userId` 만 RPC 에(T-19-17 문법 — `routes/strategy-events.ts:35-48`). `?d=` 는 zod `^\d{8}$` + 실재 날짜(없으면 최신). 게이트 실패 → 403 `{error:{code:"DMA_UNMAPPED"}}` → 웹은 `DmaGate`(UI-SPEC ④-0 「401/403 도 같은 게이트」).
- `GET /api/limitup/grid-urls?d=` → 같은 게이트(가벼운 RPC 또는 보고서 RPC 결과 재사용 불가하므로 `dma_visible_accounts` 존재 RPC 1회) → 그날 isin 목록 → `supabase.storage.from('limitup-grid').createSignedUrls(paths, 600)` 1회 → `{isin: url}`. 웹은 만료 전까지 캐시, 실패 시 「다시 시도」.
- 응답 압축은 이미 켜져 있다(`app.ts:68-78` compression) — 보고서 jsonb(추정 수백 KB)에 유효.
- CORS·body 한도 변경 없음(GET). server 는 **배포가 필요**(새 라우트) — Open Q5.

### §H. 보고서 페이지 (G-D)

- 라우트: `app/analytics/limitup/page.tsx` — `app/trading/page.tsx` 문법(`AppShell` + `AppSidebar` + `Suspense fallback={null}` — `useSearchParams` 때문). 미인증은 middleware 가 막는다(공개 whitelist `isPublicPath` 밖이면 기본 차단 — 새 경로 추가 작업 없음).
- 사이드바: `useTradingVisible()`(`app-sidebar.tsx:368-385`)과 같은 조건, `GroupHeading`(:210-260) 링크 문법, 새 아이콘 `ChartLine`(lucide import :6 줄에 추가). 활성 = `pathname.startsWith("/analytics")`.
- `DmaGateSurface` 유니온(`dma-gate.tsx:31` `export type DmaGateSurface = "상따 전략" | "VI 자동매수" | "전략·잔고·미체결" | "트레이딩";`) 에 `"상한가 보고서"` 추가 — 조사 판정 `topicParticle`(「서」 받침 없음 → 「는」).
- inline SVG 선례: `components/stock/sparkline.tsx`(`stroke={'var(--up)'}` 표현 속성에 CSS 변수 — 프로덕션에서 동작 중). UI-SPEC 규칙: 선·면만 SVG(`preserveAspectRatio="none"` · `vector-effect="non-scaling-stroke"`), 글자·점 마커는 HTML 오버레이.
- `fmtRet(v)`(`lib/limit-up-format.ts`)는 **퍼센트 값**(2.8 → 「+2.8%」)을 받는다 — export `d1_ret`·`close_ret` 는 **소수**(−0.115 = −11.5%) → `fmtRet(d1_ret * 100)` (Pitfall 10).
- 격자 로드: 서명 URL fetch → `res.body.pipeThrough(new DecompressionStream('gzip'))` → JSON. 가장 큰 파일 383KB gz(20261002 `KR7217590009` · fine 창 21,194점) `[VERIFIED: ls -l · 해제 실측]` — 사건 카드가 화면 가까이 올 때(IntersectionObserver) 로드(UI-SPEC 제안).
- 「+60초 매도」·최대·스파크는 파생 표(§D-3)에서 오므로 하루 격자 구역은 격자 파일 없이 그려진다(권고안 기준).

### Anti-Patterns to Avoid
- **85 를 `"fanout"`(사용자 경로)으로 보내기** — 사용자마다 같은 공개 프레임을 N번 조립. `"market"` 키 경로가 정답(Phase 26).
- **웹에서 85 경과 초를 로컬 타이머로 증가시키기** — D-19(새 판정값 금지). 서버 값 그대로, 1초 갱신은 서버가 준다(잠김 중 dirty).
- **kind 15 를 기존 `strategyEvents` 스토어·기본 REST 응답에 그대로 섞기** — Pitfall 2·3.
- **PostgREST 여러 요청으로 「삭제 → 삽입」** — 중간 상태 노출. stage + commit.
- **manifest.json 파일 sha 로 변경 판정** — `finished_at` 때문에 매 재처리마다 바뀐다.
- **SETOF RPC 를 새로 만들기** — 보고서·kind 15 조회 모두 jsonb 스칼라.
- **radar-gw 유닛을 relay 메타데이터 startup 에 섞기** — gh-trade tick-archive 처럼 독립 설치기(재생성 시 재실행 절차를 relay-operations 에 적는다).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GCS 읽기 | 토큰·목록·다운로드 클라이언트 | Cloud Run Job GCS 볼륨 마운트(읽기 전용) | 코드 0 줄 · 로컬 디렉터리와 같은 코드 경로 |
| 브라우저 gzip 해제 | pako 등 라이브러리 | `DecompressionStream('gzip')` | Baseline 2023-05, 의존성 0 |
| 서명 URL N개 | 종목마다 `createSignedUrl` | `createSignedUrls(paths, expiresIn)` 1회 | Storage 왕복 1회 |
| 회원사명 | 새 매핑 수집 | gh-trade `MemberCodes.cs` 이식 | WinForms 와 같은 단어(R-3) |
| 9칸 · 숫자 표기 | 화면마다 포맷 | shared 순수 함수 1벌(카드 탭 · kind 15 · 보고서) | WinForms 동형 숫자를 한 곳에서 보증 |
| 날짜 원자 교체 | 워커 쪽 보상 로직 | DB commit RPC 1트랜잭션 | PostgREST 는 트랜잭션을 못 잇는다 |
| 지문 집계 | 요청마다 90일 `member_alloc` 집계 | 날짜별 기여분 파생 표 + GROUP BY | 수백만 행 · Cloud Run egress |
| 공개 시세 팬아웃 | 85 전용 구독 색인 | 기존 `#keyConns` + `"market"` | 소켓 level 규칙·linger·한도가 이미 있다 |
| radar-gw 설치 | 수동 명령 나열 | tick-archive `install.sh` 문법(멱등 · 지문 대조) | 재생성 · 재설치 안전 |

**Key insight:** 이 phase 의 새 기계 대부분은 gh-radar(Phase 26 시세 경로 · 19-REVIEW jsonb 래퍼 · 워커 한 벌)와 gh-trade(tick-archive · report.py 정의)에 **이미 정본이 있다**. 새로 「설계」해야 하는 것은 stage/commit 과 파생 표 두 가지뿐이다.

## 운영 상태 인벤토리 (이 phase 가 새로 만드는 것 — 코드 밖)

| 범주 | 항목 | 작업 |
|------|------|------|
| 저장 데이터 | Supabase 표 6 + stage + 이력 + 파생 2 · Storage `limitup-grid` · `dma_strategy_events` kind 15 행(서버 Phase 27 배포 뒤부터) | 마이그레이션(사용자 `supabase db push`) · 첫 적재는 워커 첫 실행 |
| 클라우드 설정 | GCS `gs://gh-radar-limitup-export`(asia-northeast3 · 균일 · 공개 방지) · relay SA 버킷 IAM `objectUser` · 워커 SA + `objectViewer` + secret accessor · Cloud Run Job + 볼륨 · Scheduler 21:20 · 알림 정책 | IAM/배포 스크립트(메인 세션) |
| OS 등록 상태 | radar-gw: 시스템 사용자 · `~/.ssh` 키 · known_hosts · `/usr/local/lib/limitup-pull/*` · `limitup-pull.{service,timer}`(설치 직후 disabled) | 설치기(사용자/메인 세션) — **VM 재생성 시 재실행**(relay 메타데이터 밖) |
| 비밀 · 키 | radar-gw ed25519 개인키(호스트 밖으로 안 나감) · 119 `authorized_keys` 1줄(gh-trade 사용자) | 공개키 → 인박스 추기 |
| 빌드 산출물 | 워커 이미지 `…/gh-radar/limitup-sync:<sha>` · relay 이미지 · server revision | 배포 체크포인트 |

## Common Pitfalls

### Pitfall 1: 85 가 「조용한 키」에는 오지 않는다 — 새로 펼친 카드가 최대 60초 「—」
**What goes wrong:** 캐시 없이 중계만 하면, 잠김이 아니고 10초 유량도 없는 키는 다음 분 경계 전까지 프레임이 없다.
**Why:** 서버는 dirty 키만 보내고 구독 직후 재송신이 없다(`LimitFeature.cpp:325-334` · §A-3 원문).
**How to avoid:** hub 키별 마지막 1프레임 캐시 + FULL 신규 구독·승격 직후 스냅샷(§A-3). 웹도 키 단위 Map 으로 보관.
**Warning signs:** e2e 에서 85 를 한 번 보낸 뒤 카드를 접었다 펼치면 「—」.

### Pitfall 2: SETOF RPC + `max_rows = 1000` 이 오후 이벤트를 조용히 지운다
**What goes wrong:** `dma_strategy_events_for_user` 에 15 를 넣는 순간 사용자당 하루 행 수가 1,000 을 크게 넘고, 오름차순이라 **늦은 시각 행이 응답에서 빠진다**(주문 이벤트 포함). 오류 없음.
**Why:** `supabase/config.toml:18` `max_rows = 1000` `[VERIFIED: Read]` 이 SETOF RPC 응답에도 적용 — 이 저장소가 이미 겪었다: `server/src/services/dma-orders.ts:57-60` 「SETOF 함수(`dma_journal_orders_for_user`)는 PostgREST `max_rows`(1000)에 **조용히** 잘려」. 현재 `dma_strategy_events` 8,510행/5거래일.
**How to avoid:** jsonb 래퍼(`20261004090000` 선례) + kind 15 기본 제외 인자(§C-2). 이 phase 에서 기존 절단 잠재 결함도 함께 닫힌다.
**Warning signs:** 주문로그 REST 복원 행 수가 정확히 1000.

### Pitfall 3: 웹 스토어 상한 5000 이 주문 이벤트를 밀어낸다
**What goes wrong:** kind 15 라이브 푸시(게이트웨이 사용자 전원 · 분당 대상 키 수만큼)가 `strategyEvents` 에 쌓여, 상한(`MAX_STRATEGY_EVENTS = 5000` · `use-relay-socket.ts:147`)을 넘으면 「가장 오래된 쪽부터 버린다」(:1121-1127 주석) — 마운트 뒤 푸시로만 받은 주문 이벤트가 화면에서 사라진다.
**How to avoid:** kind 15 별도 스토어(§C-2). 배지·새 줄 강조 원천(`strategyEventsBatch`)에서도 분리.

### Pitfall 4: 카드 팝업 「시세」 세그먼트는 tone 으로 거른다
**What goes wrong:** kind 15 tone 을 중립(`"feature"`/`"unknown"`)으로 두면 `matchesSide(row,'market')`(`order-log-feed.ts:160-166` — `strategyEventParts(row, 'log').tone === side`)에서 빠져 D-07 「켜면 전체·시세 뷰에 섞인다」 가 깨진다.
**How to avoid:** `side === 'market'` 판정을 `isMarketStrategyEvent(row.kind)` 로. 색(tone)과 분류를 분리.

### Pitfall 5: 단언 5곳이 85 범위 밖을 못박고 있다
`[VERIFIED: grep + Read]` — `relay/src/dma/__tests__/codec.test.ts:233-239`(85 가 INBOUND 아님 · `MSG` 에 `LimitFeature` 없음), `:263-270`(`INBOUND_MSG_TYPES.size).toBe(27)` · 상한 `toBeLessThanOrEqual(84)`), `src/dma/__tests__/envelope.test.ts:276-291`(85 debug 드롭 · OUT_OF_SCOPE `[68, 70, 74, 75, 81, 82, 85]`), `tests/hub.test.ts:808-817`(85 화이트리스트 밖). 같은 커밋에서 뒤집고 85 수신 · 캐시 · full 전용 · 스냅샷 · 해제 정리 · 사용자 세션 warn 케이스를 새로 단다.

### Pitfall 6: .NET 반올림과 JS `toFixed` 가 갈린다
**What goes wrong:** `FormatEok` 의 `ToString("N1")` 은 .NET Framework 4.0 에서 15자리 근사 후 **0 에서 먼 쪽** 반올림이다. JS `(krw/1e8).toFixed(1)` 은 이진 근사값으로 반올림한다 — 예 `115,000,000원 = 1.15` 는 이진값이 1.1499…라 JS 「1.1억」, WinForms 「1.2억」 `[ASSUMED: .NET Framework 숫자 서식 동작 — 단위 테스트로 확정]`. 등락률 `"+0.0;-0.0;0.0"` 은 음수가 0 으로 반올림되면 **세 번째 구역 「0.0」**(−0.04% → 「0.0%」). 우세 % 는 `Math.Round` 기본 = **짝수 반올림**.
**How to avoid:** 정수 산술로: 억 = `Math.round(krw / 1e7)` 십분위(정수 /1e7 의 .5 는 정확히 표현됨) · 부호 있는 값은 `sign × Math.round(|x|)`(0 에서 먼 쪽) · 우세 % 는 `q = floor(100·big / led)`, `r = 100·big − q·led`, `2r > led → q+1`, `2r == led → q 가 홀수면 q+1`. 결과 0 이면 「0.0」. UI-SPEC 검증 훅(「매도벽 0」·「1분 3초」·짝수 반올림)을 골든으로.

### Pitfall 7: `values` 도 예약어다
**What goes wrong:** 인박스는 `foreign` 만 따옴표 필요하다고 적었지만 `values`(facts) 도 PostgreSQL 예약어 — 따옴표 없는 DDL/RPC 본문은 구문 오류.
**How to avoid:** `"values" jsonb`, RPC 의 `f."values"`. supabase-js `.select("values")`/insert 키는 PostgREST 가 인용한다 `[ASSUMED]`. events.py 도 `"values" JSON` 으로 인용한다(`events.py:102`).

### Pitfall 8: GCS 덮어쓰기에 delete 권한이 필요하다
**What goes wrong:** relay SA 에 tick-archive 와 같은 `objectCreator`+`objectViewer` 만 주면, D+1 보충으로 바뀐 어제 파일 업로드가 403 — 「어제 결과」 가 영원히 null.
**How to avoid:** 이 버킷 한정 `roles/storage.objectUser`. smoke 에서 같은 경로 재업로드 1회 시험.

### Pitfall 9: manifest 파일 sha 는 매 재처리마다 바뀐다
`manifest.json` 에는 `finished_at`(실행 시각)이 있다(`export.py` `write_manifest`). 데이터가 같아도 재처리(`--force` · D+1 보충)면 파일 sha 가 바뀐다 → 「바뀐 날짜만」 은 `files[]` sha 목록 서명으로. (재적재 자체는 멱등이라 무해하지만 매일 밤 두 날짜(D · D−1)를 다시 넣게 된다 — 정상 동작으로 받아들이고 이력에 남긴다.)

### Pitfall 10: 비율 단위 — export 는 소수, `fmtRet` 은 퍼센트
`close_ret: -0.11538…`(실데이터) · `d1_ret` 소수 vs `fmtRet(v)` 「v 는 %」. 그대로 넣으면 「−0.1%」. `share`·`entry_buy_share*` 도 소수, facts `s1` 은 이미 % 숫자(`round(sh * 100, 1)`), 85·kind 15 는 bp.

### Pitfall 11: 지문 정의 이식 세부
`fingerprint_agg`(`report.py:758-818`): 진입 anchor 는 `first_upper_ns` → 없으면 `t{detect_rate_pct}_ns` → `t25/t20/t15` → 첫 잠김 시작(`_anchor_ns` :552-560) · 잠김마다 `buy`/`during_sell` 합집합 창구를 세고 `lock_buy` 에 0.0 포함 · 선행 = 깨짐 전 1분 매도 최대 창구(동률은 키 큰 쪽 — `max(…, key=(kv[1], kv[0]))`) · 겹침 가중은 `ov / max(e − s, 1)`. 로컬 실데이터 4일로 Python(gh-trade `report.py`) 결과와 TS 결과를 대조하는 골든 테스트를 둔다.

### Pitfall 12: `limit-up-sync` 와 `limitup-sync` 혼동
기존 워커(하이픈)와 새 워커 이름이 한 글자 차이다. 스크립트 복제 후 `sed` 치환이 기존 SA·Job·Scheduler 이름을 건드리면 **기존 야간 rebuild 를 덮는다**. 치환 뒤 `grep -n "limit-up-sync" scripts/*limitup-sync*` 0건 · 반대 방향도 0건을 검증 줄에.

### Pitfall 13: Phase 27 이 아직 실행 중이다
STATE: Phase 27 「Plan 4 of 9」. 27-04~09 가 `msg-type.ts` · `envelope.ts` · `subscription-hub.ts` · `fanout.ts` · shared 조립기 · `order-log-feed.ts`(「자동매도」 필터 값 추가 — 27-08) · 카드 파일을 고친다. Phase 28 실행은 Phase 27 배포(27-09) 뒤 — 단언 계수(INBOUND 27→28)와 필터 목록이 그 결과 위에서 정해진다. 플래닝 자체는 지금 해도 되지만 줄 번호는 실행 시점에 다시 본다.

### Pitfall 14: 서버 Phase 27 미배포 — 85 · kind 15 는 아직 0건
120 가동본은 85 를 보내지 않는다(인박스). 장중 실 85 · kind 15 검증은 gh-trade 서버 배포 뒤에만 가능 → 이 phase 검증은 단위·e2e(스텁 게이트웨이)로 닫고, 실데이터 확인은 「배포 뒤 첫 장중」 수동 항목으로 분리.

### Pitfall 15: 알림 정책 단계와 env
배포 스크립트는 `GCP_PROJECT_ID`·`SUPABASE_URL` 없으면 시작부터 실패, `NOTIFICATION_CHANNEL_ID` 없으면 알림 단계만 실패(메모리). server 재배포는 `CORS_ALLOWED_ORIGINS` 를 라이브 env 에서 추출해 넘긴다.

## Code Examples

### relay — 85 파서 (권장 모양 · `parseQueueProgress` 문법)
```ts
// relay/src/dma/envelope.ts — 생성 접근자 이름은 limit-feature.ts / member-delta.ts 원문 그대로
const MAX_LIMIT_FEATURE_MEMBERS = 3;
export function parseLimitFeature(env: Envelope): RelayLimitFeatureMsg | null {
  const msgType = MSG.LimitFeature;
  const lf = env.limitFeature();
  if (lf === null) return dropField("slot-null", msgType, { slot: "limit_feature" });
  const isin = lf.isin() ?? "";
  const exchange = lf.exchange() ?? "";
  if (!isValidIsin(isin)) return dropField("bad-isin", msgType, { isin });
  if (!isValidExchange(exchange)) return dropField("bad-exchange", msgType, { isin, exchange });
  const members = (len: number, at: (i: number, o: MemberDelta) => MemberDelta | null) => {
    const out: RelayLimitFeatureMember[] = [];
    const scratch = new MemberDelta();
    for (let i = 0; i < takeCount(len, MAX_LIMIT_FEATURE_MEMBERS, "상한가 특징 창구"); i += 1) {
      const m = at(i, scratch);
      if (m === null) continue;
      out.push({ memberNo: m.memberNo() ?? "", dQty: toNum(m.dQty(), "limit_feature.d_qty"),
                 dValue: toNum(m.dValue(), "limit_feature.d_value"), shareBp: m.shareBp() });
    }
    return out;
  };
  return {
    t: "limit.feature", i: isin, x: exchange,
    gwTimeMs: toNum(lf.gwTimeMs(), "limit_feature.gw_time_ms"), featureSchema: lf.featureSchema(),
    upperPx: lf.upperPx(), lastPx: lf.lastPx(), rateBp: lf.rateBp(), basePx: lf.basePx(),
    qQty: toNum(lf.qQty(), "limit_feature.q_qty"), qKrw: toNum(lf.qKrw(), "limit_feature.q_krw"),
    wallKrwVisible: toNum(lf.wallKrwVisible(), "limit_feature.wall_krw_visible"),
    wallQtyHidden: toNum(lf.wallQtyHidden(), "limit_feature.wall_qty_hidden"), wallTruncated: lf.wallTruncated(),
    sellLed10s: toNum(lf.sellLed10s(), "limit_feature.sell_led_10s"), buyLed10s: toNum(lf.buyLed10s(), "limit_feature.buy_led_10s"),
    cancel10s: toNum(lf.cancel10s(), "limit_feature.cancel_10s"), new10s: toNum(lf.new10s(), "limit_feature.new_10s"),
    auctionFill10s: toNum(lf.auctionFill10s(), "limit_feature.auction_fill_10s"),
    drainS: lf.drainS(), lockState: lf.lockState(), lockElapsedS: lf.lockElapsedS(),
    burstUpperLimit: lf.burstUpperLimit(), auction: lf.auction(),
    memberBuy: members(lf.memberBuyLength(), (i, o) => lf.memberBuy(i, o)),
    memberSell: members(lf.memberSellLength(), (i, o) => lf.memberSell(i, o)),
    memberDeltaPartial: lf.memberDeltaPartial(),
    modelState: lf.modelState(), modelSchemaVersion: lf.modelSchemaVersion(), pBreakBp: lf.pBreakBp(), pHorizonS: lf.pHorizonS(),
  };
}
```

### relay — hub 수신 · 캐시 (권장 모양)
```ts
// #onFeedFrame 에 추가
case MSG.LimitFeature: {
  const lf = parseLimitFeature(e.env);
  if (lf === null) return;            // 파서가 사유·계수를 남겼다
  this.#onLimitFeature(lf);
  return;
}
// 새 메서드 — #onQuote 와 같은 수명 규칙
#onLimitFeature(msg: RelayLimitFeatureMsg): void {
  const key = marketKey(msg.i, msg.x);
  if (!this.#refs.has(key)) {           // 해제 뒤 늦은 프레임 — 캐시를 되살리지 않는다
    logger.debug({ isin: msg.i, exchange: msg.x }, "[HUB] 구독 없는 키의 상한가 특징 — 버림");
    return;
  }
  this.#limitFeatures.set(key, msg);
  this.emit("market", { key, msg, full: true, price: false });   // 85 는 FULL 소켓 전용
}
// fanout #deliverMarket: if ((e.msg.t === "tape" || e.msg.t === "limit.feature") && lv !== "full") continue;
```

### SQL — kind 15 가시성 + jsonb 래퍼 (요지)
```sql
-- ① 20261003120000 본문 그대로, 두 조건만:  e.kind NOT IN (1, 2, 10, 15)  /  e.kind IN (1, 2, 10, 15)
-- ② 래퍼 (max_rows 무관 · kind 15 기본 제외)
CREATE OR REPLACE FUNCTION public.dma_strategy_events_for_user_json(
  p_user_id uuid, p_trade_date date, p_include_limit_feature boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'gw_time_ms')::bigint, r->>'gateway', (r->>'seq')::bigint), '[]'::jsonb)
    FROM public.dma_strategy_events_for_user(p_user_id, p_trade_date) r
   WHERE p_include_limit_feature OR (r->>'kind')::int <> 15;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) TO service_role;
-- ③ purge (워커 호출)
CREATE OR REPLACE FUNCTION public.dma_strategy_events_purge_limit_feature(p_keep_days int)
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH d AS (DELETE FROM public.dma_strategy_events
              WHERE kind = 15 AND trade_date < (now() AT TIME ZONE 'Asia/Seoul')::date - p_keep_days RETURNING 1)
  SELECT count(*)::int FROM d;
$$;   -- + 같은 REVOKE 2줄 + GRANT service_role
CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_limit_feature_day
  ON public.dma_strategy_events (trade_date) WHERE kind = 15;
```

### WinForms 동형 숫자 함수 (shared · 정수 반올림)
```ts
const GROUP = new Intl.NumberFormat("en-US");                 // 「1,234」 — ko-KR 도 같은 쉼표
/** .NET "N1" + 「억」. 0 → 「0」. 정수 십분위로 0 에서 먼 쪽 반올림(Pitfall 6). */
export function formatEok(krw: number): string {
  if (krw === 0) return "0";
  const tenths = Math.round(krw / 1e7);                      // krw ≥ 0
  return `${GROUP.format(Math.trunc(tenths / 10))}.${tenths % 10}억`;
}
export function formatDuration(s: number): string { return s >= 60 ? `${Math.trunc(s / 60)}분 ${s % 60}초` : `${s}초`; }
/** .NET Math.Round 기본(짝수 반올림)으로 100·big/led. */
export function roundPctEven(big: number, led: number): number {
  const num = big * 100; const q = Math.floor(num / led); const r = num - q * led;
  if (2 * r > led) return q + 1;
  if (2 * r === led) return q % 2 === 1 ? q + 1 : q;
  return q;
}
```

### 워커 — 날짜 판정 (요지)
```ts
// files_sig = manifest 의 files[] 를 name 정렬 → "name:sha256\n" 연결 → sha256. finished_at 무시(Pitfall 9).
for (const date of datesWithManifest(exportDir)) {
  const m = readManifest(date);
  if (m.schema_version !== KNOWN_SCHEMA_VERSION) { log.warn({ date, schema: m.schema_version }, "알 수 없는 schema_version — 건너뜀"); continue; }
  const bad = m.files.filter((f) => sha256File(join(exportDir, date, f.name)) !== f.sha256);
  if (bad.length > 0) { log.warn({ date, bad: bad.map((f) => f.name) }, "sha256 불일치 — 건너뜀"); continue; }
  if (loadedSig.get(date) === filesSig(m)) continue;          // 바뀐 날짜만
  await stageDay(date, m);  await commitDay(date, m);  await uploadGrids(date, m);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 85 = `OUT_OF_SCOPE`(debug 드롭) | INBOUND + 공개 시세 경로 + 캐시 | 이 phase | 단언 5곳 뒤집힘 |
| 시세 kind {1, 2, 10} | {1, 2, 10, 15} | 이 phase | SETOF RPC 절단이 확정 사고 → jsonb 래퍼 |
| 사용자 세션별 시세 구독 | quote 관찰자 1연결 + `#keyConns` | Phase 26 | 85 는 사용자 세션이 아니라 quote 연결로 온다 |
| SETOF 조회 RPC | jsonb 스칼라 래퍼 | 19-REVIEW WR-06(`20261004090000`) | 같은 처방을 전략 이벤트에 |
| gh-trade 119 HTML 보고서 | gh-radar `/analytics/limitup` 정본 | gh-trade D-21 | 119 HTML 은 보조 |

**Deprecated/outdated:** ROADMAP 의 「종목상세 호가 탭」 문구(Phase 21 D-31 로 탭 삭제 — D-01) · CONTEXT D-05 접힌 헤더 칩(UI-SPEC 에서 폐기).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `jsonb_populate_record` 가 `"foreign"`·`"values"` 키를 같은 이름 열에 채운다 | §D-2 | 낮음 — commit RPC 단위 테스트(로컬 supabase 또는 실 push 뒤 smoke)가 잡는다 |
| A2 | stage 청크 1,000행(≈250KB)이 PostgREST/게이트웨이 한도 안이다 | §D-2 | 중간 — 실패 시 500행으로 · 첫 적재 smoke 로 확인 |
| A3 | .NET Framework 4.0 `ToString("N1")` 은 15자리 근사 후 0 에서 먼 쪽 반올림 | Pitfall 6 | 중간 — 경계값 몇 개는 WinForms 실화면/VM 빌드로 대조 권장 |
| A4 | Cloud Run Job GCS 볼륨 읽기 전용에 `roles/storage.objectViewer` 면 충분(버킷 메타 권한 불요) | §E-3 | 낮음 — 공식 문서가 그렇게 말한다, 첫 실행이 확인 |
| A5 | Supabase Storage 서명 URL 은 브라우저 `fetch` CORS 를 허용한다 | §H | 중간 — 막히면 server 가 프록시(왕복 증가) |
| A6 | 용량 추정(member_alloc ≈200B/행 → 90일 ≈0.8GB) | §D-1 | 낮음~중간 — 첫 주 `supabase inspect db table-stats` 로 실측 |
| A7 | 워커 첫 실행(4일+) 은 1800s·1Gi 안에 끝난다 | §E-2 | 낮음 — 날짜별 독립이라 다음 run 이 잇는다 |
| A8 | supabase-js `.select`/insert 가 예약어 열을 인용한다 | Pitfall 7 | 낮음 — 보고서는 RPC 경유라 영향 작음 |

## Open Questions

**플래닝 전에 사용자에게 물을 것:**

1. **radar-gw 키 주석 — `radar-gw-limitup-pull`(D-13) vs `radar-gw-pull`(gh-trade 문서).**
   - What we know: gh-trade `server/tools/analysis/README.md:273,281,284` 의 등록 줄과 확인 명령이 `radar-gw-pull` 이다(`grep -c 'radar-gw-pull'` — `radar-gw-limitup-pull` 에는 매치되지 않는다).
   - Recommendation: gh-trade 문서대로 **`radar-gw-pull`**(WinForms/gh-trade 동형 기본 규칙과 같은 방향 — 상대 문서를 고치게 하지 않는다). D-13 문구를 바꾸든지, D-13 을 유지하면 인박스 추기에 「주석이 다르다 — grep 은 이 문자열로」 를 명시.

2. **파생 표 2개(+ stage · 적재 이력) — D-15 「표 6개」 에 더하는 것.**
   - What we know: UI-SPEC 의 지문표 · +60초 매도 · 스파크라인은 export 표에 열이 없다(§D-3 표). 요청 시 계산은 90일 `member_alloc` 수백만 행 또는 종목마다 격자 다운로드.
   - Recommendation: 워커가 적재 때 `limitup_grid_summary`·`limitup_member_daily` 를 같은 트랜잭션으로 채운다(6표는 노트 그대로 유지 · 파생은 언제든 다시 계산 가능 — reversible). 대안: 지문표를 「그날 사건만」 으로 축소하고 스파크는 격자 파일 다운로드(페이지당 ~2.5MB).

3. **kind 15 를 기본 조회·기본 스토어에서 분리 (D-06/D-07 보강).**
   - What we know: Pitfall 2·3 — 그대로 넣으면 주문로그가 조용히 잘리거나 밀려난다.
   - Recommendation: RPC 재정의(15 가시성)는 D-06 그대로 + jsonb 래퍼(기본 제외 인자) + server `lf=1` + 웹 별도 스토어. 사용자에게는 「체크를 켤 때 오늘 분량을 한 번 더 불러온다」 는 동작 차이만 알린다.

4. **85 브라우저 캐시 — 재량이 아니라 필수로 격상.** (정보성 — 근거 §A-3 · Pitfall 1). 권고: relay 키별 캐시 + 스냅샷. 사용자 확인보다는 플래너가 그대로 반영.

5. **배포 순서에 server 가 빠져 있다.**
   - What we know: CONTEXT 순서 「DB → GCS/워커 → radar-gw → relay → webapp」. 보고서·kind 15 조회 파라미터는 server 라우트 변경이다.
   - Recommendation: **DB → GCS·IAM·워커 → radar-gw(키 등록 뒤 타이머) → relay → server → webapp(push)**. server 는 relay 와 독립이라 relay 다음 · push 전.

6. **DB 용량 +약 1GB(90일).** 현재 3,818MB. 유료 플랜 포함 용량 안이지만 알린다. member_alloc 보존을 90일보다 짧게(지문 파생이 있으면 원표는 30일로도 충분) 하는 선택지가 있다.

7. **「+60초 매도」 정의.** gh-trade 보고서 정의(첫 잠김 시작 뒤 60초, 10초 창 6개 합) 그대로 옮길지 — 권고: 그대로(같은 숫자 원칙 D-16 gh-trade).

8. **워커 skip 의 종료 코드.** sha·schema 불일치를 실패(알림)로 볼지 warn 으로 둘지 — 권고: warn + 종료 0, 단 같은 날짜가 3일 연속 skip 이면 비영 종료(알림)로. 단순화하려면 warn 만.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node · pnpm | 전 워크스페이스 | ✓ | v22.22.0 · 11.15.1 | — |
| Supabase CLI (linked) | 마이그레이션 push · inspect | ✓ | 2.75.0 (최신 2.119.0 — 업데이트 권고, 필수 아님) | — |
| gcloud | 버킷 · IAM · Job · Scheduler · radar-gw ssh(IAP) | ✓ | 558.0.0 | — |
| Docker | 워커 이미지 amd64 | ✓ | 29.4.0 | — |
| 로컬 실 export(4일) | 워커 테스트 픽스처 · 로컬 실행 | ✓ | `~/ticks/research/export/2026092{9,30} · 2026100{1,2}` 15MB | — |
| radar-gw: rsync · gcloud · flock | 운반기 | ✓(tick-archive 설치기가 확인) | — | — |
| radar-gw → 119:22 | rsync pull | ✓ (2026-10-05 gh-trade 확인 · 인박스) | — | — |
| 119 `authorized_keys` 등록 | 첫 pull | ✗ (gh-trade 사용자 작업 대기) | — | 타이머 disabled 로 설치, 등록 뒤 enable |
| gh-trade 서버 Phase 27 배포 | 실 85 · kind 15 | ✗ (미배포) | — | 스텁 게이트웨이 e2e · 단위 테스트, 실데이터 확인은 배포 뒤 |
| pg_cron | kind 15 purge | ✗ (사용 이력 없음) | — | 워커가 RPC 로 purge |
| DB 접속 URL 비밀 | (직접 PG) | ✗ | — | stage + commit RPC(권고) |

**Missing dependencies with no fallback:** 없음(119 키 등록 · 서버 배포는 외부 대기로, 설치·코드 진행은 막지 않는다).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest(relay 4 · shared · webapp jsdom · server node · workers 3) + Playwright 1.59(webapp e2e — 로컬 relay + 스텁 게이트웨이) |
| Config file | `relay/vitest.config.ts` · `webapp/vitest.config.ts` · `server/vitest.config.ts`(include `tests/**`, `src/**`) · `workers/limit-up-sync/vitest.config.ts`(복제) · `webapp/playwright.config.ts` |
| Quick run command | 아래 「표면별」 |
| Full suite command (config 원문) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` 그리고 `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` + 이 phase 추가: `pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run` · `pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync run test` |

**표면별 quick 명령:**
- shared: `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts src/__tests__/limit-feature.test.ts src/__tests__/member-codes.test.ts && pnpm --filter @gh-radar/shared build`(shared `test` 는 watch 라 `exec vitest run`)
- relay: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/codec.test.ts src/dma/__tests__/envelope.test.ts tests/hub.test.ts tests/fanout.test.ts tests/quote-feed.test.ts tests/journal-push.test.ts`
- webapp unit: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/relay-socket.test.ts src/lib/__tests__/order-log-feed.test.ts src/components/trading/card/__tests__ src/components/trading/order-log/__tests__ src/components/analytics/__tests__`
- webapp e2e: `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/order-log.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/limitup-report.spec.ts`(`.next` 캐시 타임아웃이면 `rm -rf webapp/.next` — 메모리)
- server: `pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/strategy-events.test.ts tests/routes/limitup-report.test.ts`
- worker: `pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync run test`
- worker 로컬 실데이터 dry-run(쓰기 없음 플래그 권장): `LIMITUP_EXPORT_DIR=~/ticks/research/export pnpm --filter @gh-radar/limitup-sync exec tsx src/index.ts --dry-run`
- radar-gw 스크립트: `bash infra/relay/limitup-pull/limitup-pull.sh --self-test`(tick-archive `--self-test` 문법 — 순수 함수 단언, 네트워크 없음) · `bash -n` · `systemd-analyze verify` 는 radar-gw 에서
- SQL: 마이그레이션은 원격 미적용 커밋 → [BLOCKING] 사용자 `supabase db push` 체크포인트 → 직후 smoke(`supabase inspect db table-stats --linked` · RPC 호출 1회).

### Phase Requirements → Test Map
| D | Behavior | Test Type | Automated Command / 파일 | File Exists? |
|---|----------|-----------|-------------------|-------------|
| A-2 | 85 INBOUND(28종 · 상한 85) · OUT_OF_SCOPE 에서 제거 · MSG 대조 | unit | `relay/src/dma/__tests__/codec.test.ts` · `envelope.test.ts`(단언 갱신) | ✅ |
| A-2 | `parseLimitFeature` 32필드 · 벡터 상한 · 잘못된 isin/exchange 드롭 · bigint 경계 | unit | `envelope.test.ts` + `tests/helpers/frames.ts` `buildLimitFeatureFrame` | ✅ (헬퍼 ❌ Wave 0) |
| A-3 | feed 85 → 캐시 → market(full only) · `#refs` 없으면 버림 · release/closeAll 삭제 · 사용자 세션 85 warn · unhandled 0 | integration | `tests/hub.test.ts`(:808 블록 교체) | ✅ |
| A-3 | full 소켓만 수신 · price 소켓 0 · 새 full 구독/승격 직후 스냅샷 순서 q→tape→85 | integration | `tests/fanout.test.ts` | ✅ |
| D-03 | 9칸 문자열(lock 0/1/2 × auction × model × 창구 없음 × 85 없음 × 폰/넓은 밴드) · 「매도벽 0」·「1분 3초」·짝수 반올림 · −0.0 → 「0.0」 | unit(골든) | 신규 `packages/shared/src/__tests__/limit-feature.test.ts` | ❌ Wave 0 |
| D-03 | 회원사명(6자리 → 5자리 · 미매핑 코드) | unit | 신규 `member-codes.test.ts` | ❌ Wave 0 |
| D-02/04 | 탭 4번째 · 제목 접미(잠김 빨강 · 깨짐) · 카드 높이 불변 · `alertTabFor` 가 limit 미반환 · 자동 전환 없음 | component | `components/trading/card/__tests__/card-tabs.test.tsx` · `lib/__tests__/trading-alerts.test.ts` | ✅/확인 |
| B-2 | level price 면 null · 와이어 level 하강 시 Map 삭제 · 키 전환 즉시 「—」 | unit | `lib/__tests__/relay-socket.test.ts` · `relay-provider.test.tsx` | ✅ |
| D-06 | `isMarketStrategyEvent(15)` true · RPC 집합 주석 대조 | unit | `packages/shared/src/__tests__/strategy-event.test.ts` | ✅ |
| D-06 | relay 라이브 푸시: 계좌 없는 15 가 게이트웨이 사용자 전원에 | integration | `relay/tests/journal-push.test.ts` | ✅ |
| D-07 | 조립기 kind 15 본문(잠김/깨짐/미도달 · 창구 bp · 관찰 중 · 단일가 · message 잘림) · `orderLogLineText` | unit(골든) | `packages/shared/src/__tests__/strategy-event-text.test.ts` | ✅ |
| D-07 | 체크 꺼짐 = kind 15 0줄 · 켜짐 + 전체/시세 표시 · 매수 미표시 · 팝업 세그먼트 「시세」 포함 · 배지 미가산 · 빈 문구 판정 · pref 파싱 | unit/component | `lib/__tests__/order-log-feed.test.ts` · `order-log/__tests__/order-log-filters.test.tsx` · `card-log-popups` 테스트 | ✅ |
| C-2 | 스토어 분리: kind 15 가 `strategyEvents` 상한을 소비하지 않음 | unit | `lib/__tests__/relay-socket.test.ts` | ✅ |
| C-2 | server `?lf` 파라미터 · 기본 제외 · jsonb 배열 아니면 500 | integration | `server/tests/routes/strategy-events.test.ts` | ✅ |
| D-14 | manifest 없음/schema≠1/sha 불일치 skip · files_sig 변경 시만 적재 · 청크 · commit 인자 · 격자 경로 · 90일 정리 · purge 호출 | unit | 신규 `workers/limitup-sync/tests/*.test.ts`(픽스처 = 실 export 1일 축소본) | ❌ Wave 0 |
| D-3 | 파생: +60초 매도 · 최대 잔량 · 지문 기여분 — gh-trade Python 결과 골든 대조 | unit(골든) | 신규 `workers/limitup-sync/tests/derive.test.ts` | ❌ Wave 0 |
| D-15 | 표 6 + stage/이력/파생 DDL · 잠금 4줄 · `"values"`/`"foreign"` 인용 · RPC REVOKE 2줄 | static(grep) + smoke | 플랜 verify 의 grep 줄 + push 뒤 RPC 호출 | — |
| D-10/11 | `/api/limitup/report` 401/403/200 · `?d=` 검증 · RPC 1회 · grid-urls 1회 | integration | 신규 `server/tests/routes/limitup-report.test.ts` | ❌ Wave 0 |
| D-09~12 | 사이드바 「분석」 노출 조건 · 활성 · 게이트 · 날짜 ‹ › disabled · 빈/에러 상태 · 행 클릭 → 카드 스크롤+포커스 · SVG 색 감사 | component + e2e | `components/layout/__tests__/app-sidebar.test.tsx` · 신규 `components/analytics/__tests__/*` · 신규 `e2e/specs/limitup-report.spec.ts`(`page.route('**/api/limitup/**')` 목) | ❌ Wave 0 |
| D-13 | 운반 스크립트 순수 함수(날짜 선별 · 장중 가드 · manifest 마지막) | unit(bash self-test) | `limitup-pull.sh --self-test` | ❌ Wave 0 |
| 배포 | DB push · 버킷/IAM · 워커 smoke(행 수 == manifest) · radar-gw dry-run · relay smoke FAIL 0 · server smoke · push · 인박스 done | manual(checkpoint) | `bash scripts/smoke-limitup-sync.sh` · `bash scripts/smoke-relay.sh` · `bash scripts/smoke-server.sh` | — |

### Sampling Rate
- **Per task commit:** 해당 표면 quick 명령.
- **Per wave merge:** config `build_command` + `test_command` + server · worker 스위트.
- **Phase gate:** 전체 + e2e 4 spec + 워커 로컬 실데이터 dry-run(4일 행 수 == manifest: entries 99 · locks 39 · jumps 40,626 · member_alloc 253,247 · facts 542 · touches 216 — 인박스 「확인 방법」) — `/gsd-verify-work` 전 그린.

### Wave 0 Gaps
- [ ] `packages/shared/src/__tests__/limit-feature.test.ts` · `member-codes.test.ts` — 9칸 · 숫자 골든
- [ ] `relay/tests/helpers/frames.ts` — `buildLimitFeatureFrame`(32필드 · 벡터) · fake-gateway quote 관찰자 경로로 85 송신
- [ ] `webapp/e2e/fixtures/relay.ts` — `pushLimitFeatureFixture`(`pushQuoteFixture` 옆)
- [ ] `workers/limitup-sync/` 전체(+ `tests/fixtures/` — 실 export 1일 축소본: 종목 2~3개 · 잠김 깨짐/유지 각 1)
- [ ] `server/tests/routes/limitup-report.test.ts`
- [ ] `webapp/src/components/analytics/__tests__/` · `e2e/specs/limitup-report.spec.ts`
- [ ] `infra/relay/limitup-pull/limitup-pull.sh --self-test`

## Security Domain

`.planning/config.json` `workflow.security_enforcement: false` — 이 섹션 생략(메모리 「보안검사 안 함」). 기능상 방어선은 본문에 포함: server 게이트(`dma_visible_accounts`) · RPC service_role 전용 잠금 · Storage 비공개 + 단기 서명 URL · 119 키 `restrict,command="rrsync -ro …"` · 85 공개 시세 경로가 사용자 데이터를 싣지 못하는 타입 제약 유지.

## 배포 순서 (플랜 28-12 — 메인 세션 · 사용자)

1. 전체 게이트 그린 · `git status -sb` 로 남의 커밋/미커밋 확인(지금 Phase 27 테스트 3파일 미커밋).
2. **[BLOCKING] DB**: 사용자 `supabase db push`(원격 미적용으로 커밋된 마이그레이션) → RPC 호출 smoke.
3. **GCS·IAM·워커**: `GCP_PROJECT_ID=gh-radar bash scripts/setup-limitup-sync-iam.sh`(버킷 생성 · relay SA `objectUser` · 워커 SA `objectViewer`) → `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-limitup-sync.sh` → 맥에서 `gcloud storage rsync ~/ticks/research/export gs://gh-radar-limitup-export/export --recursive` 로 4일 시드(선택) → `bash scripts/smoke-limitup-sync.sh`.
4. **radar-gw**: 설치기(타이머 disabled) → 공개키를 인박스 노트에 추기(지문만 커밋 메시지·로그) → gh-trade 사용자 119 등록 → `rsync -avz --dry-run` 확인 → `systemctl enable --now limitup-pull.timer`.
5. **relay**(20:00 KST 뒤): `deploy-relay.sh` → `smoke-relay.sh` FAIL 0.
6. **server**: `deploy-server.sh`(CORS_ALLOWED_ORIGINS 라이브 env 추출) → `smoke-server.sh`.
7. **webapp**: `git push origin master`(마지막 커밋이 docs 만이면 Vercel ignoreCommand 가 건너뛸 수 있음 — 메모리).
8. 인박스 `261005-limitup-feature-85.md` frontmatter `status: done` · `done_commit` — **경로 지정** 커밋.
9. 배포 뒤 첫 장중(gh-trade 서버 Phase 27 배포 이후): 카드 탭 1초 갱신 · kind 15 분당 행 · 첫 밤 21:20 적재 행 수.

## Sources

### Primary (HIGH — 이번 세션에 원문을 열어 확인)
- gh-radar relay: `src/dma/msg-type.ts`(전문) · `src/dma/envelope.ts:440-600, 780-870` · `src/hub/subscription-hub.ts:30-130, 330-420, 1130-1160, 1440-1500, 1585-1660, 1661-1820, 1955-2120, 2440-2490` · `src/ws/fanout.ts:1040-1160, 1790-1840` · `src/generated/{StockDMA.fbs:1491-1536, stock-dma/limit-feature.ts, member-delta.ts, envelope.ts:274,447}` · 테스트 `codec.test.ts:225-270` · `envelope.test.ts:276-291` · `hub.test.ts:800-817`
- gh-radar shared: `relay.ts:895-1010, 1500-1575` · `strategy-event.ts:1-135` · `strategy-event-text.ts:1-200, 420-452`
- gh-radar webapp: `lib/use-relay-socket.ts`(발췌) · `lib/relay-provider.tsx:480-608` · `card/card-tabs.tsx:76-311` · `card/strategy-card.tsx:190-330, 870-1030` · `card/card-log-popups.tsx:290-370` · `lib/order-log-feed.ts:30-220` · `lib/trading-alerts.ts:355-377` · `lib/trading-layout.ts:137-172` · `layout/app-sidebar.tsx:85-104, 210-260, 340-470` · `trading/dma-gate.tsx:1-120` · `lib/limit-up-format.ts` · `stock/sparkline.tsx` · `app/trading/page.tsx` · `lib/strategy-events-api.ts`
- gh-radar server: `app.ts:40-110` · `middleware/require-auth.ts` · `routes/strategy-events.ts` · `services/dma-orders.ts:45-128`
- gh-radar DB: `supabase/config.toml:18` · `migrations/20261003120000…sql` · `20260929180000…sql` · `20261004090000…sql` · `20260929190000…sql:113-129` · `20260628120000_limit_up_tables.sql:59-72`
- gh-radar 운영: `workers/limit-up-sync/*` · `scripts/deploy-limit-up-sync.sh` · `setup-limit-up-sync-iam.sh` · `smoke-limit-up-sync.sh` · `deploy-intraday-sync.sh:163-185` · `ops/alert-intraday-sync-failure.yaml` · `infra/relay/{netcut-daily.*, startup.sh:30-60, 700-757}` · `docs/relay-operations.md:101-110`
- gh-trade: `docs/features/limitup-feature.md`(전문) · `docs/analysis/feature-dictionary.md`(전문) · `server/tools/analysis/tickana/{export.py 전문, facts.py:1-135, report.py:395-415, 495-560, 743-830, 973, events.py LOCKS_DDL·entry 배분}` · `server/src/market/publish/{LimitFeature.cpp:295-365, MarketPublisher.cpp:845-880}` · `client/Forms/Trading/LimitChaserForm.cs:3640-3864` · `client/Services/Data/MemberCodes.cs` · `server/tools/archive/{README.md, tick-archive.sh, .service, .timer, install.sh}` · `server/tools/analysis/README.md:265-289` · `.planning/phases/27-limitup-lock-report/27-CONTEXT.md` D-11 · D-20 · D-21
- 실데이터: `~/ticks/research/export/20261002/{manifest.json, *.ndjson.gz 첫 행, grid/KR7217590009.json.gz}`
- 도구 실측: `supabase inspect db db-stats/table-stats --linked` · `gsd-tools package-legitimacy` · `npm view @google-cloud/storage` · `git rev-parse master:…StockDMA.fbs` + `cmp`

### Secondary (MEDIUM — 공식 문서)
- [Configure Cloud Storage volume mounts for jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/cloud-storage-volume-mounts)
- [gcloud storage rsync](https://docs.cloud.google.com/sdk/gcloud/reference/storage/rsync)
- [Supabase createSignedUrls](https://supabase.com/docs/reference/javascript/storage-from-createsignedurls) · [Supabase upload](https://supabase.com/docs/reference/javascript/storage-from-upload)
- [MDN DecompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream)
- [Supabase creating buckets (GitHub docs)](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/storage/buckets/creating-buckets.mdx) · [Discussion #3528 — SQL bucket 생성](https://github.com/orgs/supabase/discussions/3528)

### Tertiary (LOW)
- .NET Framework 4.0 숫자 서식 반올림 세부(A3) — 학습 지식, 단위 테스트·WinForms 대조로 확정 필요

## Metadata

**Confidence breakdown:**
- relay / webapp 삽입 자리: HIGH — 파일:줄 원문 확인, 선례(76·83·tape) 존재
- kind 15 함정(max_rows · 스토어 상한): HIGH — 설정 원문 · 저장소 내 동일 사고 기록 · 실측 행 수
- DB 설계(stage/commit · 파생): MEDIUM — 패턴은 표준이나 이 저장소 첫 적용, 청크·용량은 가정
- 워커 GCS 읽기(볼륨 마운트): MEDIUM — 공식 문서 확인, 이 프로젝트 첫 사용
- radar-gw: HIGH — 같은 호스트의 gh-trade 설치기가 실측 근거(덮어쓰기 403 포함)
- 숫자 표기 동형: MEDIUM — .NET 반올림 세부는 테스트로 확정

**Research date:** 2026-10-05
**Valid until:** 2026-10-12 (Phase 27 실행이 같은 파일을 바꾸는 중 — 실행 직전 단언 계수·줄 번호 재확인 · gh-trade master fbs blob `68679e9a` 유지 확인)

## 사용자 답 (2026-10-05 plan-phase · CONTEXT.md D-17~D-23 으로 승격)

| Q | 답 |
|---|---|
| 1 키 주석 | `radar-gw-pull`(D-21) |
| 2 파생 표 | 추가 — `limitup_grid_summary` · `limitup_member_daily` + stage · 적재 이력(D-17) |
| 3 kind 15 분리 | 분리 — jsonb 래퍼(기본 제외) · server `?lf=1` · 웹 별도 스토어(D-18) |
| 4 85 캐시 | 필수(D-23) |
| 5 배포 순서 | server 포함(D-22) |
| 6 용량 | `member_alloc` 만 30일, 나머지 90일(D-19) |
| 7 +60초 매도 | gh-trade 정의 그대로 |
| 8 워커 skip | warn + 0, 같은 날짜 3일 연속 skip 이면 비영 종료(D-20) |
