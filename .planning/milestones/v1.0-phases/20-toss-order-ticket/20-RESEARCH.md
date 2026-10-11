# Phase 20: 호가주문 토스식 재구성 (실험 브랜치) - Research

**Researched:** 2026-09-25
**Domain:** React 19 / Next 15 프론트 — 상따 설정 폼 표현층 교체(리스트 + 바텀시트 키패드 + 인라인 편집), 즉시 반영 상태 기계, KRX 호가 단위 입력 보조
**Confidence:** HIGH (코드베이스 사실 전부 이번 세션 Read · 포인터 판정은 Playwright 실측) / MEDIUM (NXT 호가 단위 = KRX — 증권사 안내 출처)

> 작업 디렉터리는 **worktree** `/Users/alex/repos/gh-radar/.claude/worktrees/toss-b`(브랜치 `theme/toss-b`)다. 이 문서의 모든 경로·명령은 이 루트 기준이다. `webapp/e2e/specs/zz-theme-gallery.spec.ts` 는 추적되지 않는 임시 파일이다 — **건드리지 않는다**(커밋·수정·삭제 금지).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 상따 설정 표현 (스케치 002 채택안 · 사전 결정)
- **D-01:** 상따 옵션 4그룹(매수주문·한방체결·매도주문·매수취소)의 필드를 「라벨 ─ 값+단위 ›」 **리스트 행**으로 표시한다(TDS ListRow 톤: 라벨 t6 15 보조색 · 값 15~16 medium 주 텍스트). 그룹은 둥근 면(카드색) + 제목줄 우측 **스위치**(기존 게이트 체크박스 대체, 즉시 전송 규칙은 Phase 16 D-05 그대로) + 상태 문구(감시 중/대기/꺼짐). 꺼진 그룹의 행은 흐리게. 필드 목록·의미는 기존 `limit-chaser-form` 그대로. — **Reversibility:** costly — 폼 트리·테스트(limit-chaser-form.test 등)·e2e 셀렉터 전면 교체.
- **D-02:** 「감시대상(매도잔량/매수잔량)」은 시트를 열지 않는 **행 안 토글**(즉시 반영)이며 **폭에 따라 두 모양** — 본문 <700(폰): 라벨 없이 행 전체 폭 세그먼트 [매도잔량 | 매수잔량] (변형 목업 B) · 본문 ≥700: 왼쪽 「감시대상」 라벨 + 오른쪽 토글. 중립 선택색(260924-vj1 유지, 260912-gyz 방향색은 소멸). 데스크톱 인라인 편집 대상이 아니다. (2026-09-25 목업 검토에서 확정 — 변형 A~F 비교는 `watch-target-variants.html`)
- **D-03:** 레이아웃 밴드는 기존 그대로: 본문 <700 은 호가 42% | 패널에서 매수/매도 한쪽씩(D-19 탭), ≥700 은 매수 | 매도 목록 나란히(기존 옵션 2열 자리).

#### 값 저장 방식
- **D-04:** 시트/인라인의 「확인」(Enter) = **즉시 서버 반영**. 기존 더티 누적 + 하단 「수정/되돌리기」 액션 바(DirtyActionBar) 일괄 반영은 상따 설정에서 **폐기**한다. 한 필드 확정 = 전략 1회 전송. — **Reversibility:** costly — DirtyActionBar·포털 규율(Phase 18 D-28)·더티 표시·관련 테스트/e2e(E15 더티 바 겹침)를 걷어낸다. 서버 프로토콜은 불변(여전히 전략 전체 전송).
- **D-05:** 그룹이 「감시 중」이어도 **추가 확인 없음**. 시트에 「감시 중 — 확인하면 바로 적용돼요」 한 줄 안내만. 전송 중에는 시트를 「반영 중…」으로 잠그고, 서버 에코가 오면 닫는다.
- **D-06:** 반영 실패·지연 시 **시트 유지 + 입력값 보존 + 「반영하지 못했어요 · 다시 시도」**. 자동 재시도 없음. 목록 행은 서버 값 그대로.
- **D-07:** 시트가 열린 사이 같은 전략 에코가 도착하면 **입력값은 유지**하고 시트의 참고값(「지금 ○○」)을 새 서버 값으로 갱신 + 「다른 단말에서 바뀌었어요」 표시. 확인하면 내 값이 반영된다. 목록 행은 에코 값(Phase 18 D-27 「에코가 이긴다」는 목록 표시에 적용).

#### 수동주문 (Phase 18 D-19~D-23 유지)
- **D-08:** 수동주문 기능은 **D-20 유지** — ±버튼·비율(%) 버튼 없음, 가격 · 수량 · (조건부) 조각 수 · 주문금액 · 매수/매도/정정/취소. 토스 티켓 구조(매수/매도 세그먼트 + 단일 CTA)는 채택하지 않는다. 스타일만 토스(가격·수량 **상자**: 라벨 위 · 값 17 semibold · TDS float 면 · radius 16).
- **D-09:** 진입은 **D-19 그대로** — 본문 <700 「매수 | 매도 | 수동」 3탭, ≥700 옵션 우상단 「수동주문」 버튼이 옵션을 덮고 ✕로 닫음. 스케치 002 의 「자동(상따) | 직접 주문」 2단 세그먼트는 채택하지 않는다.
- **D-10:** 가격·수량·조각 수 **상자를 누르면 상따 설정과 같은 키패드 시트**(터치) / 데스크톱은 상자에 직접 타이핑(인라인). 수동주문 시트의 확인은 **값만 채운다** — 주문은 오직 매수/매도(정정/취소) 버튼 + 기존 `order-confirm-dialog` 로만 나간다. 호가 사다리 클릭으로 가격 채우기 유지.
- **D-11:** 버튼 배치: **매수(빨강 `--up`)·매도(파랑 `--down`) 48px 2열**(TDS large, radius 14, 600) + 그 아래 **정정·취소 38px 회색**(TDS medium, 미체결 선택 시에만 활성 — D-21 조건 그대로). 예약구간·장전 라벨(「예약매수/예약매도」)·시간외종가 규칙(D-22·D-23)은 그대로 적용. `lc` 가로 증가 0 규칙 때문에 좁은 폭에서 글자 크기를 키우지 않는다.

#### 시트 vs 인라인
- **D-12:** 편집 방식은 **입력 장치로 나눈다** — 터치(coarse pointer)면 폭과 무관하게 바텀시트 + 자체 키패드, 마우스/트랙패드(fine pointer)면 인라인 편집. 판정은 `(pointer: coarse)`/`(any-pointer: fine)` 미디어 쿼리 류(구체 판정식·하이브리드 기기 처리는 리서치/플래너 재량). 레이아웃(목록 1열/2열)은 기존처럼 컨테이너 폭 기준.
- **D-13:** 넓은 터치 화면(태블릿·아이패드 가로)에서도 시트는 **화면 하단 가운데 폭 440px**(TDS BottomSheet: radius 28, 좌우 여백 10, dim). 폰은 좌우 10px 여백 전폭.
- **D-14:** 인라인 편집 키보드: **Enter/Tab/포커스 이탈 저장(=즉시 반영) · Esc 취소 · ↑/↓ 한 호가(가격) 또는 1(수량·%·건) · Tab = 저장 후 같은 그룹 다음 항목 편집**. 반영 중·실패 표시 규칙은 D-05/D-06 과 같다.
- **D-14a:** 인라인 편집은 **행 높이를 바꾸지 않는다** — 행 안의 값 자리만 입력칸으로 바뀌고 파란 테두리(1.5px inset)만 생긴다. 「Enter 저장 · Esc 취소」 같은 안내 문구와 「저장」 버튼은 두지 않는다.
- **D-14b:** 편집 중 다른 행을 클릭하면 **한 번의 클릭으로** 이전 값이 저장되고 그 행이 편집 모드가 된다(blur 재렌더 때문에 클릭이 사라지는 함정 — pointerdown 에서 대상을 기록해 저장 후 이어받는다).
- **D-14c:** 입력칸에 포커스가 가면(데스크톱 타이핑 · 인라인 편집) **값 전체가 선택된 상태**라 첫 입력이 값을 덮어쓴다. 키패드 시트도 열리자마자 현재 값이 선택 상태(강조 표시)이며 첫 키가 값을 통째로 바꾼다.

#### 리스트 구성 (2026-09-25 목업 검토 확정)
- **D-19:** 매수 탭 그룹 순서 = **[매수가격 · 주문금액] 가격 섹션(제목·스위치 없음) → 매수주문(비교가격 · 감시대상 · 잔량) → 한방체결(호가변경 · 한방가격)**. 매도 탭 = **[매도가격 · 매도비율] 가격 섹션(제목 없음) → 매도주문(비교가격 · 호가잔량 · 잔량추적) → 매수취소(취소잔량 · 체결 · 잔량추적)**. 매수취소는 매수 탭이 아니라 **매도 탭 맨 아래**에 둔다. 필드 의미·전송 계약은 기존 `limit-chaser-form` 그대로(표현만 재배치).
- **D-21:** 「매수취소」 그룹 헤더의 **스위치 = `cancelQtyEnabled`(취소잔량 체크)** 다 — 서버에 그룹 on/off 필드가 없으므로 목업의 스위치를 취소잔량 켜기에 매핑한다. 스위치가 꺼져 있어도 아래 「체결」「잔량추적」 체크는 켤 수 있다(quick-260912-u58 ④ 유지, 무장 판정은 `lib/limit-chaser.ts` 그대로). 그래서 「취소잔량」 행은 값(주)만 있는 일반 행이다. (UI-SPEC 가정 A1 → 사용자 결정 2026-09-25)
- **D-22:** 체크박스가 달린 필드는 **「○ 라벨 ─ 값 ›」 행** — 왼쪽 원형 체크(탭 = 켜기/끄기, 즉시 반영) + 오른쪽 값(탭 = 시트/인라인 수정). 대상: 매수주문 「체결」(`buyTradeQtyEnabled` + `buyMinTradeQty` 주) · 매도주문 「체결」(`sellTradeQtyEnabled` + 수량) · 매수취소 「체결」(`cancelTradeEnabled`, 값 없음) · 「잔량추적」(`cancelQtyTrackEnabled`, 값 없음). 값 없는 항목은 체크 + 라벨만. 이 행들은 목업 8차에 빠져 있었지만 D-01/D-19 「필드 목록은 기존 폼 그대로」에 따라 각 그룹 끝에 둔다. (UI-SPEC 가정 A2·A3 → 사용자 결정 2026-09-25)
- **D-23:** 시트의 확정 버튼 문구는 일반어 「확인」이 아니라 **「{필드명} 적용」**(상따 설정 — 즉시 반영을 버튼이 말한다) / **「{필드명} 입력」**(수동주문 상자 — 값만 채움). 시트 제목에서 자동 조합하므로 컴포넌트는 하나. 닫기는 「닫기」 그대로. (UI 검사 Dimension 1 지적 → 사용자 결정 2026-09-25)
- **D-20:** 모든 리스트 행은 **높이 44px 고정**(min-height, 내용 세로 가운데) — 토글 행·값 행·인라인 편집 행 모두 같다. 그래서 ≥700 2열에서 매수주문·매도주문 카드 높이가 같다. 폰의 풀폭 세그먼트(32px)도 44px 행 안에 든다.

#### 키패드 세부
- **D-15:** 가격 입력이 **호가 단위에 안 맞거나 상한가를 넘으면 확인 버튼을 잠그고 이유를 표시**한다(예: 「100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200」). 자동 보정하지 않는다. 호가 단위 표는 KRX(코스피·코스닥 통합 2023 개정) 기준 — NXT 동일 여부는 리서치 확인. (서버 판정을 대체하지 않는다 — 입력 보조일 뿐, D-27 계열 위반 아님.)
- **D-16:** 키패드 배열 3×4: 1–9, **「00」**, 0, ⌫. 시트 구성: 제목(필드명) · 설명 한 줄 · 값 표시 상자(큰 숫자 + 단위 + 「지금 ○○」) · 단축 칩 · 키패드 · 「닫기 | 확인」 56px 버튼 2개.
- **D-17:** 단축 칩 = 스케치 002 구성 그대로 — 가격(원): −1호가 · +1호가 · 현재가 · 상한가 / 수량(주): +100 · +1,000 · +10,000 · 지우기 / 비율(%): 10 · 30 · 50 · 100 / 금액(만원): +10 · +50 · +100 · 지우기 / 건: 1 · 3 · 5 · 지우기. 매도가격도 「상한가」 칩 유지.
- **D-18:** 시트 「확인」 후에는 **닫기만** 하고, 반영된 행을 잠깐(≈0.9s) 강조한다. 「다음」 자동 이동 없음(데스크톱 Tab 만 다음 항목).

### Claude's Discretion
- 시트/키패드 컴포넌트 구조(공용 `NumberPadSheet` 류), 포커스 트랩·스크롤 잠금·접근성(aria) 구현, 애니메이션.
- 하이브리드 기기(터치+마우스) 판정 세부.
- 상단 상태줄 1줄 압축의 구체 배치(스케치 002 strip 참고, 정보 손실 없이).
- 데스크톱 인라인 편집 상자의 세부 모양(스케치 002 `.ied` 참고).

### Deferred Ideas (OUT OF SCOPE)
- 수동주문 토스 티켓화(±·%·단일 CTA) — 이번엔 D-20 유지로 기각, 필요 시 별도 논의.
- 상따 전용 단축 칩(상한가−1호가 · 현재 잔량) — 이번엔 목업 구성 유지.
- 시트 「다음」 연속 편집 — 이번엔 닫기만.

### UI-SPEC 로 이미 확정된 재량 행사 (20-UI-SPEC.md, status: approved)
- 상단 상태줄 1줄 압축은 **이번 phase 에서 하지 않는다**(UI-SPEC 가정 A7).
- 판정식 = `matchMedia('(pointer: coarse)')` → sheet, 아니면 inline · 하이브리드는 「주 입력 장치가 정한다」(UI-SPEC §7).
- Shift+Tab = 이전 값 행(A5) · 인라인 위반 값 + 포커스 이탈 = 취소(A6) · 수동주문 최대 폭 400 미사용(A8) · 다크 `--group-bg` = #2c2c35(A9) · 반영 지연 = `ACK_TIMEOUT_MS`(A10).
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP 에 매핑된 요구사항 ID 는 **없다**(TBD). 이 phase 는 실험 브랜치 전용 표현층 재구성이라 새 요구사항을 만들지 않는다. 대신 아래 기존 요구사항의 **불변식**을 깨지 않아야 한다.

| ID | 관련 불변식 (이 phase 가 지켜야 할 것) | Research Support |
|----|----------|------------------|
| TRADE-01 (Phase 16) | 스위치 즉시 전송(crud "C") · 게이트 전부 OFF = 삭제(crud "D") · 32필드 전송 · S→C 전용 4필드 미송신. ※ 원문의 「값 변경은 「수정」 버튼」 문장은 **이 브랜치에서만** D-04 로 뒤집힌다 | §즉시 반영 상태 기계 · §Pitfall 1~4 |
| TRADE-07 (Phase 18) | 수동주문 wss 단일 경로 · 결과 모름 잠금 · 확인 다이얼로그 · 77 힌트 라벨 규칙 · 정정/취소 조건 — **무변경** | §수동주문 · §Validation 회귀 목록 |
| TRADE-09 (Phase 18) | 카드 본문 = 호가 탭 본문(같은 `CardBody`) · §2.2b 밴드 · `@container/lc` | §컨테이너 쿼리 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **커뮤니케이션·커밋:** 한글. 커밋 전 메시지 확인 후 진행, Co-Authored-By 넣지 않기(사용자 전역 규칙). 이 브랜치는 **push 하지 않는 실험 브랜치**다 — `theme/toss-b` 는 미병합이 전제(push = webapp 프로덕션 배포라는 메모리 규칙과 별개로 브랜치 자체가 master 에 가지 않음).
- **GSD 워크플로우 필수:** 모든 편집은 `/gsd-execute-phase` 안에서.
- **§2.2b 밴드 표는 `webapp/src/styles/globals.css` 상단 주석이 정본** — 표를 다른 곳에 복사하지 않는다. 새 경계 숫자·뷰포트 브레이크포인트 신설 금지(컨테이너 쿼리만).
- **UI 는 목업 먼저 · 목업 검토 게이트:** 채택 목업 = `.planning/sketches/002-toss-order-ticket/index.html`(8차). 목업과 코드가 다르면 목업이 이긴다(Phase 18 D-26 패턴).
- **손보는 표면 안의 시각 결함(줄바꿈·잘림·겹침)은 묻지 말고 수정 후 한 줄 보고.**
- **무로그 fail-safe 금지:** 실패 경로는 반드시 화면에 문구로 남긴다(토스트 없음, 인라인 `role="alert"/"status"`).
- **dev 포트 3100**(webapp `dev.sh`/playwright `baseURL`) — 3000 가정 금지.
- **동시 세션 커밋 경합:** `git add -A` 전 `git status -sb` 재확인. 병렬 wave 는 worktree 분리(이미 worktree 안이므로 이 phase 는 순차 실행 권장 — config `parallelization: false`).

## Summary

이 phase 는 **서버 프로토콜·주문 경로를 한 줄도 바꾸지 않고** `CardBody` 우측 패널의 표현과 입력 방식만 교체한다. 핵심 난점은 UI 그 자체보다 **D-04(한 필드 확정 = 즉시 전송)가 기존 「더티 누적 → 수정」 모델의 전송·응답 상관 로직을 대체해야 한다는 점**이다. 기존 폼은 `send()`(소켓 수락 boolean) · `onSent(cfg)`(카드 3초 타이머) · `serverAnswerSeq`(답 신호) · `server` prop(에코) 네 신호로 「수정」 버튼 잠금을 풀었다. 이 네 신호는 그대로 쓸 수 있고, 새로 필요한 것은 **필드 단위 in-flight 1건 + 대기 1건 직렬화 상태 기계**(`useLcFieldCommit`) 하나다. 성공 판정은 「답이 왔다」가 아니라 **「에코의 그 필드 값 = 내가 보낸 값」**으로 해야 거부(에코 없는 답)·다른 단말 에코·늦은 에코를 모두 올바르게 가른다.

바텀시트는 새 패키지 없이 **이미 설치된 Radix Dialog(`radix-ui@1.4.3`, dialog 1.1.15)** 로 충분하다 — 포털(body)·포커스 트랩·`aria-modal`·스크롤 잠금·`hideOthers` 가 내장이다. 단 트리거 없이 제어형으로 열면 **닫힐 때 포커스 복귀가 없다**(소스 확인)이므로 `onCloseAutoFocus` 에서 연 행으로 수동 복원해야 한다. 키패드 시트에는 `<input>` 을 두지 않고 `<output>` 표시 + 버튼 키패드 + 콘텐츠 `onKeyDown` 물리 키 처리로 가면 `inputMode="none"`/`readOnly` 같은 소프트 키보드 억제 트릭 자체가 필요 없다. 편집 방식 판정은 `useSyncExternalStore` + `matchMedia('(pointer: coarse)')` 이고, **Playwright `hasTouch: true` 가 Chromium 에서 `(pointer: coarse)` 를 참으로 만든다는 것을 이번 세션에 실측**했다 — e2e 에서 시트 모드를 그대로 검증할 수 있다.

호가 단위 표는 코드에 이미 두 벌 있다(`order-panel.tsx` `TICK_TABLE`, `packages/shared/src/limitUp.ts` if-체인). 7구간 값은 KRX 2023-01-25 개정표와 일치하고, 증권사 안내상 NXT 도 동일하다(MEDIUM). 상한가는 `quote.ul`(실시간) → `upperLimit` 폴백으로 `CardBody` 가 이미 계산한다. 가장 큰 숨은 위험은 **가로 폭 예산** — 뷰포트 360(본문 344) 폰 밴드에서 행 안쪽 폭이 약 155px 로 계산되어 7자리 가격(「1,274,000원 ›」)·「잔량추적 기준선 100,000주」 행이 넘칠 가능성이 높다(추정). UI-SPEC 의 backstop 순서(패딩 → 간격 → 폰 밴드 쉐브런 숨김)를 **Wave 0 실측으로 먼저 확정**할 것을 권한다.

**Primary recommendation:** 필드 스펙 배열 1개(렌더·시트 문구·Tab 순서·e2e id 의 단일 원천) + `useLcFieldCommit` 상태 기계 1개 + Radix Dialog 기반 `NumberPadSheet` 1개 + 순수 함수 모듈(`krxTickSize`·키패드 리듀서·칩 연산) 으로 쪼개고, 워크벤치 더티 배관(`strategy-card`·`trading-workbench`·`shared-panels`)은 **건드리지 않고 0 으로 비활성화**한다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 상따 설정 리스트 렌더 · 44px 행 · 그룹 스위치 | Browser / Client (`limit-chaser-form.tsx` 표현층) | — | 순수 표현. 서버 상태는 `server` prop(에코)에서만 읽는다 |
| 필드 1회 확정 → `lc.set` 전송 · in-flight 잠금 · 성공/실패 판정 | Browser / Client (새 훅 `useLcFieldCommit`) | relay wss(불변) | 판정 입력은 기존 4신호(`send` 반환 · `onSent` · `serverAnswerSeq` · `server`) + 카드 `unacked`. 서버·relay 무변경 |
| 편집 방식 판정(sheet/inline) | Browser / Client (`useEditMode`) | — | 입력 장치 미디어 쿼리 — 폭 분기 아님. SSR 스냅샷 = inline |
| 바텀시트 · 자체 키패드 · 포커스/스크롤 잠금 | Browser / Client (Radix Dialog → `document.body` 포털) | — | `container-type` 조상 아래 `position:fixed` 컨테이닝 블록 함정 → body 포털 필수 |
| 호가 단위 · 상한가 입력 검증 | Browser / Client (순수 함수, 입력 보조) | API/Backend(gh-trade 게이트웨이가 최종 판정) | D-15/D-27 — 서버 판정을 대체하지 않는다 |
| 수동주문 전송 · 결과 모름 잠금 · 확인 다이얼로그 | Browser / Client (`manual-order-form.tsx`, 기존) | relay wss `sendOrder` | **무변경** — 입력 방식과 스타일만 교체 |
| 레이아웃 1열/2열 · 폰 3탭 | CSS 컨테이너 쿼리 `@container/lc` | — | JS 로 폭을 재지 않는다(§2.2b) |

## Standard Stack

### Core (전부 설치됨 — 새 설치 0)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `radix-ui` (Dialog 1.1.15 · Switch · Popover) | 1.4.3 `[VERIFIED: webapp/package.json · node_modules/.pnpm/@radix-ui+react-dialog@1.1.15]` | 바텀시트(Dialog) · 그룹 스위치(Switch primitive 직접) · 인라인 실패 말풍선(Popover) | 이미 `sheet.tsx`·`order-confirm-dialog`·`popover.tsx` 가 쓰는 통합 패키지. 포커스 트랩·aria·스크롤 잠금 내장 |
| React | ^19.0.0 `[VERIFIED: webapp/package.json]` | `useSyncExternalStore`(매체 쿼리 구독) | SSR 안전 · 하이드레이션 불일치 없음(`card-grid.tsx:117` 가 같은 패턴 사용) |
| Tailwind CSS | 4.2.2 `[VERIFIED: webapp/node_modules/tailwindcss/package.json]` | `@container/lc` 변형 · 내장 `pointer-fine:`/`pointer-coarse:` 변형 | `pointer-fine:` 는 이미 `command.tsx:86`·`manual-order-form.tsx:718` 이 사용 |
| lucide-react | ^1.8.0 | ⌫ 자리 `Delete` 아이콘 1개 | UI-SPEC 인벤토리 |

### Supporting (테스트)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^2.1.9 (webapp) | 단위·컴포넌트 테스트(jsdom) | 모든 순수 함수·폼 동작 |
| @testing-library/react / user-event | ^16.3.2 / ^14.6.1 | 컴포넌트 상호작용 | 시트·인라인·스위치 |
| @playwright/test | ^1.59.1 (Chromium 147 실측) | 폭별 잘림·시트 기하·터치 모드 | `hasTouch: true` 로 시트 모드 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Radix Dialog 직접 조립 | `vaul` 드로어 | 새 의존성 + 드래그 제스처는 요구사항에 없음. **쓰지 않는다** |
| `ui/switch.tsx` + className 덮기 | `radix-ui` 의 `Switch` primitive 를 `SettingGroup` 안에서 직접 사용 | `ui/switch.tsx` 의 thumb 는 `size-4 … translate-x-4` 가 Thumb 요소에 하드코딩(`switch.tsx:31`)이라 Root `className` 으로 20px thumb·16px 이동을 못 준다. 자손 선택자 특이도 싸움 대신 **primitive 직접 사용**(컴포넌트 파일 무수정 원칙도 지킨다) |
| 이벤트별 `pointerType` 로 sheet/inline 결정 | 미디어 쿼리 1개 | 하이브리드에 더 정확하지만 Safari `click` 이 `PointerEvent` 가 아닐 수 있고, 수동주문 상자는 렌더 시점에 `<input>`/`<button>` 을 정해야 해 정적 판정이 어차피 필요. UI-SPEC §7 이 미디어 쿼리로 확정 |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다(모든 기능이 설치된 `radix-ui`·React·Tailwind 로 구현 가능).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## 핵심 질문 8개에 대한 답

### Q1. 터치 vs 마우스 판정 (D-12)

- **판정식:** `window.matchMedia('(pointer: coarse)').matches` → `'sheet'`, 아니면 `'inline'`. UI-SPEC §7 확정값. `(any-pointer: fine)` 은 쓰지 않는다 — 트랙패드 달린 아이패드가 inline 으로 넘어가 버린다(주 입력 장치 원칙 위반).
- **Playwright 실측 (이번 세션, Chromium 147.0.7727.15):** `[VERIFIED: 로컬 probe]`
  - 기본 컨텍스트: `(pointer: coarse)=false (pointer: fine)=true (any-pointer: coarse)=false (any-pointer: fine)=true (hover: hover)=true (hover: none)=false`
  - `{hasTouch:true}`: `(pointer: coarse)=true (pointer: fine)=false (any-pointer: coarse)=true (any-pointer: fine)=false (hover: hover)=false (hover: none)=true`
  - → e2e 기본 프로젝트(`devices['Desktop Chrome']`)는 **inline**, `test.use({ hasTouch: true })` 블록은 **sheet**. 이미 `trading-workbench.spec.ts:1971-1981` 이 `hasTouch` describe 를 쓰는 선례가 있다.
- **하이브리드:** 아이패드+매직 키보드(주 포인터 coarse) = sheet, 터치 노트북(주 포인터 fine) = inline. iPadOS 가 트랙패드 연결 시에도 `pointer: coarse` 를 유지한다는 것은 `[ASSUMED]`(실기 미확인) — 틀려도 inline 으로 떨어질 뿐 기능 손실은 없다.
- **SSR:** `useSyncExternalStore(subscribe, getSnapshot, () => false)` — 서버/하이드레이션 첫 렌더는 `false`(= inline)로 그리고 클라이언트 스냅샷으로 재렌더한다. React 가 하이드레이션 불일치로 보지 않는다. 리스트 행은 두 모드 모두 `<button>` 이라 깜빡임이 없고, 수동주문 상자만 `<input>` ↔ `<button>` 이 바뀐다(터치 기기 첫 페인트 한 번).
- **기존 훅:** 포인터 판정 훅은 **없다**. `useSyncExternalStore` 선례는 `webapp/src/components/trading/workbench/card-grid.tsx:115-122`(`useIsClient`)뿐이고, `matchMedia` 선례는 `alert-toasts.tsx:46-47`(일회성 읽기, 구독 없음). → 새 파일 `webapp/src/lib/use-edit-mode.ts`.
- **jsdom:** `webapp/tests/setup.ts:36-47` 의 폴리필이 `matches: false` 를 돌려준다 `[VERIFIED: tests/setup.ts:40 "matches: false,"]` → 단위 테스트 기본 = inline. 시트 테스트는 `window.matchMedia` 를 테스트 안에서 교체하고 `afterEach` 에서 원복해야 한다(폴리필은 「없을 때만」 설치되므로 교체가 파일 내 다음 테스트로 샌다).
- **CSS 쪽:** hover 스타일은 `pointer-fine:hover:` 로만(Tailwind 4 내장 변형 — 이미 사용 중).

### Q2. KRX 호가 단위 · NXT · 상한가 (D-15)

**7구간 표** — 코드 두 곳이 같은 값을 갖는다:
- `webapp/src/components/orderbook/order-panel.tsx:104-111` `[VERIFIED]`:
  ```
  const TICK_TABLE: readonly [limit: number, tick: number][] = [
    [2_000, 1],
    [5_000, 5],
    [20_000, 10],
    [50_000, 50],
    [200_000, 100],
    [500_000, 500],
  ];
  ```
  + `tickFromTable`(`:114-120`) 이 표 밖은 `return 1_000;`, `price <= 0` 이면 `return 1;`.
- `packages/shared/src/limitUp.ts:84-93` `limitUpPrice` 의 if-체인 `[VERIFIED]`: `if (tgt < 2000) unit = 1;` … `else unit = 1000;` (2000/5000/20000/50000/200000/500000 경계 동일).
- 외부 근거: KRX 2023-01-25 개정으로 코스피·코스닥·코넥스 호가 단위가 통일·세분화됐고 7단계(2천 미만 1 · 5천 미만 5 · 2만 미만 10 · 5만 미만 50 · 20만 미만 100 · 50만 미만 500 · 50만 이상 1,000) `[CITED: hanwhawm.com/main/center/info/CS181_3p.cmd · businesspost.co.kr 303760 · samsungpop.com 공지 19236]`.

**NXT:** 한화투자증권 호가가격단위 안내가 같은 표를 「유가증권·코스닥·넥스트레이드」에 공통 적용한다고 하고, 증권사 NXT 안내들이 「호가가격단위·기준가격 동일」, 가격제한폭 「전일 종가 대비 ±30%」 동일이라고 적는다 `[CITED: hanwhawm.com CS181_3p · open.shinhansec.com NXTPolicyGuide_v2 (가격제한폭)]`. 넥스트레이드 공식 거래제도 페이지 본문은 이번 세션에 추출하지 못했다(메뉴만 반환) — **관측 없음**이지 부정 증거가 아니다. → 같은 헬퍼를 NXT 에도 쓴다(MEDIUM). 어긋나면 게이트웨이 거부 문구가 그대로 전달되는 기존 경로가 최종 방어선이다(`order-panel.tsx:97-103` 주석과 같은 입장).

**ETF/ETN:** 호가 단위가 주식과 다를 수 있다 `[ASSUMED]`. 상따 대상은 사실상 주권이고 검증은 입력 보조일 뿐이라(서버가 판정) 이번 범위에서 분기하지 않는다 — 오판 시 「단위 불일치」로 확인이 잠기는 불편이 생길 수 있음을 Open Question 에 둔다.

**권장 헬퍼 위치:** UI-SPEC 검증 훅 「호가 단위 헬퍼 1곳(중복 표 0)」을 지키려면 `packages/shared/src/krxTick.ts` 에 `krxTickSize(price)` 를 두고 (1) `limitUpPrice` 가 그것을 호출하도록, (2) `order-panel.tsx` `tickFromTable` 이 그것을 호출하도록 바꾸고, (3) 새 입력 검증이 그것을 쓴다. `limitUpPrice` 는 `workers/intraday-sync/src/pipeline/upsertQuotes.ts` 가 소비하므로 **행동 보존 리팩터**여야 하며 기존 `packages/shared/src/limitUp.test.ts` 경계 케이스(1538→1999 · 1539→2000 · 386000→501000 등)가 회귀 가드다. webapp 은 shared 를 **dist** 로 소비하므로(`packages/shared/package.json` `"main": "./dist/index.cjs"`) shared 수정 뒤 `pnpm --filter @gh-radar/shared build` 를 먼저 돌려야 webapp 테스트·타입체크가 새 export 를 본다.
- 대안(더 작은 영향): webapp `src/lib/krx-tick.ts` 에만 두고 `order-panel` 만 흡수, `limitUpPrice` 는 그대로(서버 RPC 미러라 별개 도메인). UI-SPEC 「중복 표 0」과 충돌하므로 **권하지 않는다**.

**경계 연산(모두 순수 함수, 경계에서 정확):**
- `+1호가 = v + tick(v)` · `−1호가 = max(0, v − tick(v − 1))` — 예: 2,000 → −1호가 = 2,000 − tick(1,999)=1 → 1,999 (UI-SPEC 칩 표와 동일).
- 단위 불일치 제시값: `lower = floor(v / t) * t`, `upper = lower + t` (t = tick(v)). 각 구간 시작값(2,000/5,000/20,000/50,000/200,000/500,000)은 그 구간 tick 의 배수라 `lower` 가 구간 밖으로 떨어지지 않는다.
- 검증 순서(UI-SPEC): ① `upperLimit > 0 && v > upperLimit` → 상한가 문구 ② `v % tick(v) !== 0` → 단위 문구. 빈 값/0 은 검증하지 않는다(빈 값은 확인 비활성, 0 은 명시 허용).

**상한가·현재가 출처:** `RelayQuote` `p`(현재가, `packages/shared/src/relay.ts:663-664` `/** 현재가. */ p: number;`) · `ul`(상한가, `:687-688` `/** 상한가 / 하한가 / 기준가(전일 종가). */ ul: number;`) `[VERIFIED]`. `CardBody` 가 이미 `const upperLimit = quote !== null && quote.ul > 0 ? quote.ul : (upperLimitFallback ?? 0);`(`card-body.tsx:248`) 로 계산해 `LimitChaserForm` 에 `upperLimit` 으로 넘긴다. **현재가는 아직 폼·수동주문 어디에도 내려가지 않는다** → `CardBody` 가 `currentPrice={quote?.p ?? 0}` 을 `LimitChaserForm` 과 `ManualOrderForm` 양쪽에, `upperLimit` 을 `ManualOrderForm` 에 추가로 넘겨야 한다(칩 「현재가」「상한가」 · 수동주문 가격 검증). 값이 0 이면 해당 칩 비활성(UI-SPEC).

### Q3. 바텀시트 구현 (D-13 · Sheet)

- **`ui/sheet.tsx` 를 그대로 쓰지 않는다.** `SheetContent` 가 내부에서 `SheetOverlay`(`fixed inset-0 z-50 bg-[oklch(0_0_0/0.55)] backdrop-blur-[4px]`, `sheet.tsx:46`)와 `showCloseButton = true`(`:60`)·`data-[side=bottom]:inset-x-0 …`(`:76`) 을 강제한다 `[VERIFIED]`. oklch 스크림·blur·전폭 bottom 은 UI-SPEC(`--dim`·blur 없음·`width: min(440px, 100vw - 20px)` 가운데)과 다르다. 오버레이는 `className` 으로 덮을 수 있지만 `SheetContent` 의 `SheetPortal/SheetOverlay` 조합이 고정이라 오버레이 클래스를 바꿀 길이 없다.
  → **`NumberPadSheet` 는 `radix-ui` 의 `Dialog` 를 직접 조립한다**(`Dialog.Root`(제어형) → `Dialog.Portal` → `Dialog.Overlay` + `Dialog.Content` + `Dialog.Title` + `Dialog.Description`). `sheet.tsx`·`dialog.tsx` 파일은 무수정.
- **포털:** `Dialog.Portal` 기본 컨테이너 = `document.body` → `container-type` 조상(`@container/lc`, layout containment) 밖이라 `position:fixed` 가 뷰포트 기준이 된다. DirtyActionBar 가 `createPortal(…, barHost ?? document.body)` 로 풀던 것과 **같은 이유·같은 해법**이며 Radix 가 대신 해 준다(SSR 가드 `mounted` 도 Radix `Portal` 이 내장).
- **Radix Dialog 1.1.15 모달 내장 동작 (소스 확인)** `[VERIFIED: node_modules/.pnpm/@radix-ui+react-dialog@1.1.15…/dist/index.mjs:108,135-160]`:
  - 스크롤 잠금 `RemoveScroll`(`allowPinchZoom: true`) · 형제 `aria-hidden`(`hideOthers(content)`) · 포커스 트랩(`trapFocus: context.open`) · 바깥 포인터 차단.
  - `onCloseAutoFocus` 기본 동작 = `event.preventDefault(); context.triggerRef.current?.focus();` — **`Dialog.Trigger` 없이 제어형으로 열면 `triggerRef` 가 비어 포커스가 복귀하지 않는다.** → `onCloseAutoFocus={(e) => { e.preventDefault(); returnFocusRef.current?.focus(); }}` 로 연 행/상자에 수동 복원(UI-SPEC 접근성 계약 「제어형이라 수동 복원」과 일치). `composeEventHandlers` 는 사용자 핸들러가 `preventDefault` 하면 내부 핸들러를 건너뛴다.
  - 초기 포커스: 기본은 첫 포커스 가능 요소(= 첫 칩)다. `onOpenAutoFocus={(e) => { e.preventDefault(); contentRef.current?.focus(); }}` + Content `tabIndex={-1}` 로 콘텐츠 컨테이너에 둔다(UI-SPEC).
  - 반영 중 잠금: `onEscapeKeyDown`·`onPointerDownOutside`(또는 `onInteractOutside`) 에서 `busy` 면 `e.preventDefault()`. 그리고 `onOpenChange(false)` 도 busy 면 무시.
- **440px 가운데:** Content 클래스 `fixed left-1/2 -translate-x-1/2 bottom-[max(10px,env(safe-area-inset-bottom))] w-[min(440px,calc(100vw-20px))] max-h-[calc(100dvh-20px)] overflow-y-auto rounded-[28px] bg-[var(--card)] px-5 pt-[22px] pb-4 z-50` — 폭 분기 규칙 없이 `min()` 한 식(UI-SPEC). ※ `app/layout.tsx:25-30` 의 `viewport` 에 `viewportFit: 'cover'` 가 없어 iOS 에서 `env(safe-area-inset-bottom)` 은 0 이다 → 실효값 10px. `viewport-fit` 은 전역 레이아웃을 바꾸므로 **추가하지 않는다**.
- **애니메이션:** `tw-animate-css` 가 이미 설치·사용 중(`data-open:animate-in` 등, `sheet.tsx`). 목업 수치(250ms translateY 120% → 0, reduced-motion 이면 opacity 150ms)는 `motion-safe:`/`motion-reduce:` 로 건다. `-translate-x-1/2` 와 슬라이드 `translateY` 가 같은 `transform`/`translate` 속성에서 충돌하지 않게 가로 가운데는 **래퍼 `left:0; right:0; margin-inline:auto`** 로 두는 편이 안전하다 `[ASSUMED — Tailwind 4 의 translate 는 `translate` 속성을 쓰고 animate 는 `transform` 을 써서 실제로는 공존할 가능성이 높음; 실측 확인]`.
- **소프트 키보드 억제:** 시트에는 `<input>` 이 **없다**. 디스플레이는 `<output aria-live="polite">`, 키패드는 `<button type="button">` 12개. 따라서 `inputMode="none"`·`readOnly` 트릭이 불필요하고 iOS 자동 확대(16px 규칙)도 관련이 없다. 물리 키(태블릿 외장 키보드)는 `Dialog.Content` 의 `onKeyDown` 에서 `0-9`·`Backspace`·`Enter` 처리(`Esc` 는 Radix 가 처리).
- **터치 세부:** 키패드·칩 버튼에 `touch-action: manipulation`(Tailwind `touch-manipulation`) — 연타 시 더블탭 확대·지연 방지 `[ASSUMED: iOS Safari 표준 동작]`. 코드베이스에 선례 없음(grep 0건).
- **z-index 층:** FAB `z-40`(`chat-fab.tsx:118`) · 공용 패널 `z-20` · 알림 토스트 `z-50`(`alert-toasts.tsx:58`) · Dialog `z-50`. 같은 z 면 DOM 뒤쪽이 위 — Radix 포털은 열릴 때 body 끝에 붙으므로 시트가 토스트 위에 선다(목표 동작).

### Q4. DirtyActionBar 제거 범위 (D-04) — files 목록

`DirtyActionBar` 를 **실제로 import 하는 파일은 둘뿐**이다 `[VERIFIED: grep]`: `limit-chaser-form.tsx:126-130`(DirtyActionBar · DirtyBarHostContext · IN_CARD_DIRTY_BAR_CLASS) · `strategy-card.tsx:74`(DirtyBarHostContext). VI 설정 줄(`vi-settings-rows.tsx`)은 자기 「수정」을 가지며 이 바를 쓰지 않는다.

**권장(최소 영향): 폼에서만 걷고 워크벤치 배관은 0 으로 비활성화한다.**

| 파일 | 조치 | 근거 |
|---|---|---|
| `webapp/src/components/trading/limit-chaser-form.tsx` | 바 포털·`dirty`/`dirtySet`·`handleSubmit`/`handleRevert`·`LIMIT_CHASER_DIRTY_HINT`·`dirtyHint`/`dirtyBarClassName`/`onDirtyCountChange` prop 제거. 표현층 전면 교체 | D-04 |
| `webapp/src/components/trading/card/card-body.tsx` | `LIMIT_CHASER_DIRTY_HINT` import · `cardDirtyHint()` · `ORDERBOOK_DIRTY_BAR_CLASS`/`CHAT_FAB_CLEARANCE_CLASS` import · `DIRTY_NAME_MAX` · `dirtyHint`/`dirtyBarClassName`/`onDirtyCountChange` 전달 제거. `currentPrice`·`unacked` 전달 추가 | 폼 prop 제거와 짝 |
| `webapp/src/components/trading/card/strategy-card.tsx` | **무수정 권장.** `card.dirtyCount` 가 늘 0 이 되어 파란 테두리(`:776`)·`usePinnedToViewportBottom`(`:709`)·`card-dirty-host`(`:835-839`)·`DirtyBarHostContext.Provider`(`:806`)가 모두 비활성 | 워크벤치 표면 변경 0 |
| `webapp/src/components/trading/workbench/trading-workbench.tsx` · `shared-panels.tsx` | **무수정.** 합산 0 → 이탈 경고·거래소 전환 확인·공용 패널 비킴 비활성. VI 더티(`viDirty`)는 계속 동작 | 〃 |
| `webapp/src/components/trading/dirty-action-bar.tsx` | **무수정(고아 컴포넌트로 남김).** 삭제하면 strategy-card·shared-panels 까지 번진다 | 실험 브랜치 최소 변경 |
| `webapp/src/lib/limit-chaser.ts` | `dirtyFieldsOf`·`DIRTY_COMPARED_FIELDS` 는 남긴다(`lib/__tests__/limit-chaser.test.ts` 가 단언). 폼은 더 이상 부르지 않는다 | 순수 함수라 무해 |

**테스트/e2e 영향(갱신 필수):**

| 파일 | 깨지는 지점 `[VERIFIED: grep 줄번호]` |
|---|---|
| `src/components/trading/__tests__/limit-chaser-form.test.tsx` (87 테스트) | 사실상 재작성. ②③④⑤⑧(더티·「수정」·「되돌리기」) · ⑫ 체크박스 라벨/그리드 · ⑰ 입력 46px/`--lw`/세그먼트 그리드 · 「quick-260912-ok2」·「18-10」 describe(`:1487-1711`) 전부. 게이트는 `getByRole('checkbox', { name: '매수주문 켜기' })` → `getByRole('switch', …)` |
| `src/components/trading/__tests__/card-body.test.tsx` | `cardDirtyHint` import(`:41`) · 더티 하네스(`:186-194`) · 바 테스트(`:374-405`) · 체크박스 게이트(`:245-247`) |
| `src/components/trading/__tests__/strategy-card-flow.test.tsx` | `#lc-buy-watch-qty` 입력 직접 조작(`:195`) · 게이트 체크박스(`:251`,`:312`,`:552`) · `#lc-buy-order-amount` change(`:557`) · 더티 호스트 포털 테스트(`:360-368`) |
| `src/components/trading/__tests__/manual-order-form.test.tsx` | 조각 스테퍼 「조각 늘리기/줄이기」(`:279-300`) — 스테퍼 제거(UI-SPEC §8 #3). `getByLabelText('가격'/'수량'/'조각 수')`(`:142-143`,`:284`)는 inline 모드에서 `<label htmlFor>` 를 유지하면 그대로 통과 |
| `src/components/stock/__tests__/stock-orderbook-section.test.tsx:215` | `lc-group-${slot}` 앵커 — **슬롯 이름을 유지하면 무변경** |
| `src/styles/__tests__/tds-tokens.test.ts` | `THEME_COLOR_TOKENS`·기대값에 `group-bg`·`switch-off`·`dim` 추가(양 테마 정의 가드) |
| `e2e/specs/trading-workbench.spec.ts` | `dirtyBar` 헬퍼(`:117`) · `field()` 로 `#lc-*` 입력 값 단언/fill(`:197`,`:400-402`,`:683-737`,`:804-808`,`:829-839`,`:1225-1336`,`:1389-1413`) · 게이트 체크박스(`:397`,`:836`,`:1328`). 테스트 7(더티 바 E15) · 12(수정) · GC2(접었다 펴도 더티) · 16(더티 이탈 확인)은 **의미가 소멸** → 재정의 또는 삭제 |
| `e2e/specs/orderbook.spec.ts` | 테스트 11(더티 바 vs FAB, `:419-440`) 소멸 → 「시트가 FAB 위(z)·가운데 440」으로 대체 권장. `submitBuyOrder` 의 `#mo-price-…`/`#mo-qty-…` `.fill`(`:123-124`)은 **inline 모드에서 id 를 유지하면 그대로 통과** |
| `e2e/specs/a11y.spec.ts` | ⑦ 더티 바 `role=status`(`:460-470`) 소멸 → 시트 열린 상태 axe 스캔으로 대체. ⑤ `data-pane` 탭 가능 요소 단언(`:440-448`)은 `data-pane` 속성 유지 시 통과 |
| `e2e/specs/sidebar-tree.spec.ts:212` | `getByRole('checkbox', { name: '매도주문 켜기' })` → `switch` |

**e2e 셀렉터 보존 권장:** (a) 그룹 `data-slot="lc-group-{buy|buy-price|sweep|sell|sell-price|cancel}"`(`limit-chaser-form.tsx:1278` 의 슬롯 유니온 그대로) (b) pane `data-pane="buy"|"sell"` (c) 인라인 입력 `id` = 옛 입력 id(`lc-buy-watch-qty` 등 — `limit-chaser-form.tsx:776` 외) (d) 행에 `data-lc-field="{옛 id}"` + 값 표시 `data-slot="lc-row-value"` 를 추가해 e2e 가 `toHaveText('10,000주')` 로 읽게 한다 (e) 수동주문 `data-testid` 전부 유지.

### Q5. 즉시 전송 경로 (D-04~D-07) — 현재 코드와 새 상태 기계

**현재 전송·응답 신호 (전부 Read 확인)** `[VERIFIED]`:
- 조립: `buildCfg(values)`(`limit-chaser-form.tsx:464-481`) — `...values, isin, accountNo, exchange, crud: crudOf(values), buyOrderQty: buyOrderQtyFromAmount(...), sweepRecalcEnabled: true, sweepMinCount: 0, sweepMinRate: 0`.
- 전송: `send({ t: 'lc.set', cfg })` 반환 boolean = 「소켓에 실었는가」(`use-relay-socket.ts:448` `send: (msg: RelayInbound) => boolean;`). false 면 **보내지 않았음이 확실**.
- 게이트: `toggleGate`(`:578-600`) — `gateBlocked` 가드 → send → 성공 시에만 `setForm(values)`(낙관 반영은 전송 뒤, GC-WR-06) → `sentNotifyRef.current?.(cfg)`.
- 통지: `onSent(cfg)` → 카드 `handleSent`(`strategy-card.tsx:321-330`)가 `pendingRef` 저장 + `ACK_TIMEOUT_MS` 타이머 → `unacked=true`. `export const ACK_TIMEOUT_MS = 3_000;`(`:109`).
- 답: 카드 `acceptAnswer`(`:340-345`) 가 타이머 해제·`unacked=false`·`setAnswerSeq(n+1)`. 호출 지점 = 자기 키 에코(`:385-389`) · 삭제(`:395-405`) · 새 서버 값(`:408-413`) · 상따 거부 통지(`:494`).
- 폼 수신: `serverAnswerSeq`(prop) · `server`(prop, `formFromServer` 로 **전 필드 덮기** `:417-438`). 카드 상태의 `unacked: boolean`(`:200`)은 **현재 폼에 내려가지 않는다**.
- 무장 가드: `gateBlocked(key, next)`(`:569-576`) · `armBlockedTextOf`(`:189-207`) · 켜진 게이트만 검사 + 철거 면제(`isDeleteIntent`, `:630-639`).

**새 상태 기계 `useLcFieldCommit` (권장 설계)** — 폼 인스턴스당 1개, 시트·인라인·체크·토글이 공유:

```
state: idle
     | inflight { field, value, answerSeqAtSend, kind: 'value'|'toggle' }
     | failed   { field, value, reason: 'rejected'|'timeout'|'disconnected'|'armBlocked', text }
queued: { field, value } | null   // 대기 1건(뒤 것이 앞 것을 대체)
```

1. `commit(field, value)`:
   - **(A) `server == null`(미등록 전략) → 로컬 반영만**(`setForm`), 강조 900ms, 즉시 닫힘. 전송하지 않는다. 그룹 스위치 4개(매수·한방·매도 게이트 + `cancelQtyEnabled`)만 전략을 만든다 — 기존 D-05 「첫 스위치 = 등록」 그대로. (근거: 미등록 상태에서 값을 보내면 `crudOf` 가 `'D'` 인 철거 프레임이 나가고, `cancelTradeEnabled` 같은 게이트성 체크를 보내면 의도치 않게 전략이 생긴다 — Pitfall 2.) `[ASSUMED — 사용자 확인 권장, Open Q1]`
   - (B) `value === server[field]` → 전송 없이 닫힘(no-op).
   - (C) 무장 가드: `values = { ...formRef.current, [field]: value }` 에서 `GATE_KEYS.find(k => values[k] && gateBlocked(k, true))` 가 있고 철거가 아니면 → `failed{armBlocked, text: \`${GATE_LABEL[k]} · ${armBlockedTextOf(k, values)}\`}`(기존 `handleSubmit` 조립 규칙 재사용).
   - (D) `inflight` 중이면 `queued` 에 넣고 반환(직렬화 — UI-SPEC 「동시에 나가 있는 값 전송은 1건」).
   - (E) `send()` false → `failed{disconnected}` 「연결이 끊겨 보내지 못했어요」.
   - (F) true → `onSent(cfg)` → `inflight{answerSeqAtSend: serverAnswerSeq}`. 값 필드는 **낙관 반영하지 않는다**(목록 행은 서버 값 — D-06). 토글·체크는 UI-SPEC E2 대로 낙관 표시 후 실패 시 되돌린다(`formFromServer(server, prev)`).
2. 해소 이펙트 (deps: `server`, `serverAnswerSeq`, `unacked`):
   - `matches = server != null && server[field] === value` → **성공**(inflight·failed 둘 다 — 후자가 「늦은 에코」). 닫기 + 행 900ms 강조 + `queued` 실행.
   - `inflight && serverAnswerSeq !== answerSeqAtSend && !matches` → `failed{rejected}` 「반영하지 못했어요」. `queued` 폐기(실패 뒤 연쇄 전송 금지 — 사용자가 누르지 않은 전송).
   - `inflight && unacked` → `failed{timeout}`.
   - 특례: `field === 'buyOrderAmount' && server.buyOrderAmount === 0`(「서버가 모른다」, `lib/limit-chaser.ts:197` · `formFromServer :313`) 이면 답 도착만으로 성공 처리.
3. 자동 재시도 없음(T-16-10). 「다시 시도」 = 사용자가 다시 누른 새 `commit`.

**D-07 (시트 열린 사이 에코):** 시트는 열 때의 `openedServerValue = form[field]` 를 기억한다. 열려 있는 동안 `form[field]` 가 바뀌고(에코는 `formFromServer` 로 폼 전체를 덮는다) 그것이 내 inflight 의 성공이 아니면 → 버퍼 유지, 「지금 ○○」 갱신, 상태 줄 「다른 단말에서 바뀌었어요」. 카드 배너(`strategy-card.tsx:433-445`)는 `sent === null && prev !== null` 일 때만 뜨므로 내 필드 전송의 에코는 배너를 만들지 않는다 — 기존 로직 그대로 맞다. `onServerEcho` 의 `overwrittenDirty` 는 이제 항상 0 → 배너 문구는 「다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요」.

**「감시 중」 안내(D-05):** 그룹 상태 문구가 이미 `cardGroupStatusOf(server, fired)`(`card-body.tsx:131-150`)에서 온다 → 필드가 속한 그룹의 문구가 「감시 중」이면 시트 상태 줄 ④ 표시. 필드→그룹 매핑은 필드 스펙 배열이 소유.

### Q6. 인라인 편집 (D-14 · D-14a · D-14b · D-14c)

- 코드베이스에 인라인 편집 컴포넌트는 **없다**. 가장 가까운 선례는 `NumInput` 의 전체 선택(`limit-chaser-form.tsx:1451-1456` — `el.select(); window.setTimeout(() => el.select(), 0);` iOS 재선택 포함)이다 — 그대로 차용.
- **구조:** 편집 중이 아닌 행 = `<button type="button">`(라벨·값·`›`). 편집 중인 행 = 같은 44px 상자를 `<div>` 로 그리고 값 자리에 `<input inputMode="numeric" data-focus-ring="seamless">` + 단위. `<button>` 안에 `<input>` 을 넣을 수 없으므로 **편집 중인 행만 요소 종류가 바뀐다**(높이·패딩 동일 → D-14a 레이아웃 이동 0). 포커스·선택은 `useLayoutEffect` 에서 `ref.focus(); ref.select();`.
- **한 번 클릭 전환(D-14b) React 패턴:**
  ```tsx
  const nextEditRef = useRef<FieldKey | null>(null);
  // 모든 값 행 버튼: 편집 중인 행이 있으면 pointerdown 캡처 단계에서 대상 기록
  onPointerDownCapture={() => { if (editing !== null && editing !== key) nextEditRef.current = key; }}
  onClick={() => startEdit(key)}                       // 멱등 — blur 쪽이 먼저 열었어도 무해
  // 편집 입력:
  onBlur={() => { const next = nextEditRef.current; nextEditRef.current = null;
                  saveOrCancel(); setEditing(next); }}
  ```
  행 높이 불변이라 React 에서는 click 이 실제로 살아남는 경우가 많지만, blur 저장이 재렌더·검증 말풍선을 만들 수 있으므로 pointerdown 기록이 확실한 보험이다(목업 `index.html:513-519` 과 같은 규율).
- **Tab/Shift+Tab:** `onKeyDown` 에서 `preventDefault` → 저장 → 필드 스펙의 「같은 그룹 다음/이전 값 행」으로 `setEditing`. 감시대상·값 없는 체크 행은 건너뛴다. 그룹 끝이면 편집 종료.
- **↑/↓:** 가격 단위(`원`)는 `+tick(v)` / `−tick(v−1)`, 그 밖(주·만원·%·건)은 ±1, 하한 0, 9자리 상한.
- **Enter/blur 저장 · Esc 취소:** Esc 는 서버 값 복귀·전송 없음. 빈 입력 저장 = 0(UI-SPEC E4). 가격 위반은 Enter/Tab 에서 저장 거부 + Popover 이유, blur(바깥 클릭)에서는 취소(A6).
- **LOCKED 결정 간 긴장 해소:** UI-SPEC E4 loading 행은 「반영 중 다른 행 클릭은 무시」라고 적었지만 D-14b(LOCKED)는 「한 번 클릭으로 저장 + 다음 행 편집」이다. **D-14b 가 우선** — 다음 행 편집은 열어 주고, 그 행의 확정 전송만 `queued` 로 직렬화한다. 반영 중인 앞 행은 편집 상태가 아니라 `aria-busy` + 값 opacity .6 으로 표시.
- **실패 표시:** Radix Popover 를 `PopoverAnchor`(행)로 묶고 `open` 제어, `onOpenAutoFocus={(e) => e.preventDefault()}`(입력 포커스 유지). 사용자가 이미 다른 행으로 옮긴 뒤 앞 행이 실패하면 → 앞 행에 `--destructive` 링 + 말풍선을 띄우되 **포커스를 뺏지 않는다**, 입력값은 `failed.value` 로 보존해 그 행을 다시 누르면 그 값으로 편집이 열린다 `[ASSUMED — UI-SPEC 미정 세부, Open Q3]`.

### Q7. 테스트·검증 표면

- 단위: vitest 2.1.9, jsdom, `webapp/vitest.config.ts` `include: ['src/**/*.test.{ts,tsx}']`. **파일 지정 실행은 `pnpm --filter @gh-radar/webapp exec vitest --run <경로>`** — `pnpm --filter @gh-radar/webapp test -- <이름>` 은 이 저장소에서 필터가 먹지 않고 전체 99 파일을 돌린다(이번 세션 실측: 「Test Files 99 passed (99) · Tests 1731 passed | 1 skipped」 26.3s). 단일 파일 실측: `limit-chaser-form.test.tsx` 87 passed, 2.2s.
- `queued-window.test.ts`(`src/lib/__tests__/`)는 77 힌트 순수 함수 테스트로 이 phase 가 건드리지 않는다 — 회귀 가드로만 돌린다.
- e2e: Playwright `workers: 1`, `baseURL: http://localhost:3100`, `webServer.reuseExistingServer: !CI` — **3100 에 다른 체크아웃(메인 레포)의 dev 서버가 떠 있으면 그 코드를 테스트한다.** worktree 에서 돌리기 전 `lsof -iTCP:3100 -sTCP:LISTEN` 으로 비어 있음/worktree 서버임을 확인(이번 세션 시점: 비어 있음). relay 픽스처는 `REPO_ROOT = path.resolve(__dirname, '../../..')` 라 worktree 의 relay 를 띄운다.
- 명령은 아래 Validation Architecture 참조.

### Q8. 컨테이너 쿼리 문맥

- 선언: `export const LC_CONTAINER_CLASS = "@container/lc";`(`strategy-card.tsx:120`) — 카드 `<article>` 에 적용(`:770-771`), 종목상세 호가 탭은 `stock-orderbook-section.tsx` 루트가 같은 상수를 import 해 단다(`:16` 주석, 테스트 `stock-orderbook-section.test.tsx:202-205`). **`card-body.tsx` 는 `container-type` 을 선언하지 않는다** — 소비만 한다.
- `card-body.tsx:305-308` `[VERIFIED]`: `'grid min-w-0 grid-cols-[42%_minmax(0,1fr)] [&>*]:min-w-0'` · `'@min-[700px]/lc:grid-cols-[260px_minmax(0,1fr)]'` · `'@min-[830px]/lc:grid-cols-[400px_minmax(0,1fr)]'` · `'@min-[992px]/lc:grid-cols-[460px_minmax(0,1fr)]'`. 우측 패널 `data-slot="card-body-options"` 는 `p-2 @min-[700px]/lc:p-2.5`(`:328`).
- 새 행·그룹은 **`@min-[700px]/lc:` 만** 쓴다(감시대상 두 모양, ≥700 열 머리). 새 경계 숫자·`@container` 선언 신설 금지(`strategy-card.test.tsx:407-426` 이 「안쪽 배치는 /lc 유틸리티뿐이며 뷰포트 브레이크포인트가 없다」를 단언).

## Architecture Patterns

### System Architecture Diagram

```
 사용자 입력
   │
   ├─ 터치(pointer: coarse) ──┐            ├─ 마우스(pointer: fine) ──┐
   ▼                           │            ▼                           │
 행 <button> 탭 ──────────────►│          행 클릭 → InlineValueEditor    │
                               ▼            (Enter/Tab/blur 저장, Esc 취소, ↑↓ tick)
                    NumberPadSheet (Radix Dialog → body 포털)           │
                    버퍼 리듀서 · 칩 · D-15 검증                         │
                               │ 「{필드명} 적용」                        │
                               ▼                                        ▼
                    ┌──────── useLcFieldCommit(field, value) ◄──────────┘
                    │  server==null? ─yes→ 로컬 setForm (전송 없음)
                    │  같은 값? ─yes→ no-op
                    │  무장 가드 실패? ─yes→ failed(armBlocked)
                    │  inflight 중? ─yes→ queued(1건)
                    ▼
            buildCfg({...form, [field]: value}) → send({t:'lc.set', cfg})  ── false → failed(disconnected)
                    │ true
                    ▼ onSent(cfg) → 카드: pendingRef + 3s 타이머(unacked)
            relay wss ──► gh-trade 게이트웨이 (무변경)
                    │
       ┌────────────┼───────────────────────────────┐
       ▼            ▼                               ▼
   60 에코       거부 통지(54)                     3초 무응답
   server 갱신   acceptAnswer → answerSeq++        unacked=true
   answerSeq++   (server 불변)
       │            │                               │
       ▼            ▼                               ▼
  server[field]===value → 성공: 시트 닫힘·행 900ms 강조·queued 실행
  답 왔는데 값 불일치 → failed(rejected) 「반영하지 못했어요」 (queued 폐기)
  unacked → failed(timeout) · 이후 내 에코 도착 시 성공(늦은 에코)
```

### Recommended Project Structure

```
packages/shared/src/
├── krxTick.ts                 # krxTickSize · tickUp · tickDown · priceInputIssue (순수)
├── krxTick.test.ts
├── limitUp.ts                 # limitUpPrice → krxTickSize 호출 (행동 보존)
└── index.ts                   # export 추가
webapp/src/lib/
├── use-edit-mode.ts           # useEditMode(): 'sheet' | 'inline'
├── numpad.ts                  # 버퍼 리듀서 · 칩 스펙/연산 · 표시 포맷 (순수)
└── __tests__/{use-edit-mode,numpad}.test.ts
webapp/src/components/trading/lc/          # 이 phase 신규 조각 (이름은 플래너 확정)
├── lc-fields.ts               # 필드 스펙 배열(그룹·순서·라벨·단위·설명·옛 id·게이트)
├── use-lc-field-commit.ts     # 즉시 반영 상태 기계
├── number-pad-sheet.tsx       # 공용 키패드 시트 (상따 apply · 수동주문 fill)
├── setting-group.tsx          # SettingGroup(스위치·상태) · SettingRow · CheckValueRow · WatchTargetRow
└── inline-value-editor.tsx    # 인라인 입력 + Popover 말풍선
webapp/src/components/trading/limit-chaser-form.tsx     # 조립만 (전송 로직 재사용)
webapp/src/components/trading/card/manual-order-form.tsx # TicketBox · 버튼 · ManualOrderEntry 스타일
webapp/src/components/trading/card/card-body.tsx        # prop 배선
webapp/src/components/orderbook/order-panel.tsx         # tickFromTable → krxTickSize
webapp/src/styles/globals.css                           # --group-bg · --switch-off · --dim (:root/.dark)
```

### Pattern 1: 필드 스펙 배열 — 단일 원천
**What:** 그룹·행 순서(D-19), 라벨·단위·시트 설명(UI-SPEC 카피 표), 옛 input id(e2e), 게이트 매핑(D-21), Tab 순서를 **데이터 한 벌**로 둔다.
**When:** 렌더(매수/매도 열), 시트 제목·설명·「{필드명} 적용」 조합(D-23), 인라인 Tab 다음 행, e2e `data-lc-field`.
```ts
// Source: 20-UI-SPEC §레이아웃 계약 · 카피 표 / limit-chaser-form.tsx 기존 id
type Unit = '원' | '주' | '만원' | '%' | '건';
type RowSpec =
  | { kind: 'value'; field: NumericField; id: string; label: string; unit: Unit; desc: string }
  | { kind: 'checkValue'; check: BoolField; field: NumericField; id: string; checkId: string; label: string; unit: Unit; desc: string }
  | { kind: 'check'; check: BoolField; checkId: string; label: string }
  | { kind: 'watch' }                     // buyWatchSide — 시트 없음, Tab 건너뜀
  | { kind: 'derived' };                  // 잔량추적 기준선 (server.sellEntryLatched 일 때만)
interface GroupSpec {
  slot: 'buy-price' | 'buy' | 'sweep' | 'sell-price' | 'sell' | 'cancel'; // data-slot="lc-group-{slot}" 유지
  title?: '매수주문' | '한방체결' | '매도주문' | '매수취소';
  gate?: 'buyEnabled' | 'sweepEnabled' | 'sellEnabled' | 'cancelQtyEnabled';
  rows: RowSpec[];
}
// BUY = [buy-price(매수가격·주문금액), buy(비교가격·감시대상·잔량·체결✓값), sweep(호가변경·한방가격)]
// SELL = [sell-price(매도가격·매도비율), sell(비교가격·호가잔량·잔량추적✓값·체결✓값·[기준선]), cancel(취소잔량·체결✓·잔량추적✓)]
```
※ 「잔량추적」 매도주문 행: 현재 코드는 `sellQtyTrackEnabled` 체크 + `sellQtyTrackRatio`(%) 입력(`limit-chaser-form.tsx:959-977`) → `checkValue`(단위 %). 「취소잔량」(`cancelWatchQty`)은 D-21 로 스위치가 `cancelQtyEnabled` 를 맡으므로 `value` 행.

### Pattern 2: 게이트 스위치 — Radix Switch primitive 직접
**What:** `import { Switch as SwitchPrimitive } from 'radix-ui'` 로 40×24 · thumb 20 · 이동 16px · off `--switch-off` · on `--primary` 를 호출부 클래스로 그린다. 히트 영역 44×44 는 `relative after:absolute after:-inset-x-[2px] after:-inset-y-[10px]`.
**When:** 매수주문·한방체결·매도주문(게이트 3) + 매수취소(`cancelQtyEnabled`, D-21).
**주의:** 매수취소 스위치는 `GATE_KEYS`(`limit-chaser-form.tsx:144` `const GATE_KEYS = ['buyEnabled', 'sweepEnabled', 'sellEnabled'] as const;`)에 **없다** → 무장 차단(`gateBlocked`) 대상이 아니고, 끄기는 언제나 허용. 다만 `crudOf` 의 게이트 4종(`isDeleteIntent`, `lib/limit-chaser.ts:209-216`)에는 들어 있어 이것을 끄는 순간 철거(`'D'`)가 될 수 있다 — 기존 규칙 그대로(확인 없음).
- 접근성 이름 유지: 「매수주문 켜기」「한방체결 켜기」「매도주문 켜기」 + 신규 「매수취소 켜기」(UI-SPEC 접근성 이름 표에는 앞의 3개만 있다 — 매수취소 이름은 플래너 확정).

### Pattern 3: 키패드 버퍼 리듀서(순수)
```ts
// Source: 20-UI-SPEC §5 키패드 규칙 · 목업 index.html:497-504
type Pad = { buf: string; fresh: boolean };           // fresh = 「전체 선택」 대기(D-14c)
export function padKey(s: Pad, key: '0'|'1'|…|'9'|'00'|'back'): Pad {
  if (s.fresh) return { fresh: false, buf: key === 'back' || key === '00' ? '' : key };
  if (key === 'back') return { ...s, buf: s.buf.slice(0, -1) };
  if (key === '00' && (s.buf === '' || s.buf === '0')) return s;       // 빈 값·「0」 뒤 00 무시
  const base = s.buf === '0' ? '' : s.buf;                               // 「0」 다음 숫자는 0 대체
  return { ...s, buf: (base + key).slice(0, 9) };                        // 9자리 상한
}
export function padChip(s: Pad, chip: ChipOp, ctx: { current: number; upper: number }): Pad { /* fresh 해제 */ }
```

### Anti-Patterns to Avoid
- **폼 전체 낙관 반영 후 서버 대기:** 값 행을 전송 전에 `setForm` 하면 실패 시 「목록 행은 서버 값」(D-06)이 깨지고, 다음 대기 전송 cfg 에 거부된 값이 실린다.
- **`answerSeq` 만으로 성공 판정:** 거부도 `answerSeq` 를 올린다(`strategy-card.tsx:494`). 값 비교로 판정.
- **실패 후 queued 자동 전송:** 사용자가 누르지 않은 전송이 나간다(T-16-10 재전송 금지 규율 위반).
- **시트에 `<input>` 두기:** 소프트 키보드·iOS 확대·`inputMode` 트릭 전부 불필요한 문제를 만든다.
- **pane 조건부 렌더:** `data-pane` 숨김은 CSS(`hidden @min-[700px]/lc:block`)로 유지 — 언마운트하면 탭 전환마다 in-flight 상태가 사라진다(`limit-chaser-form.tsx:1086-1110` 주석).
- **뷰포트 `md:`/`@media (min-width)` 로 감시대상 모양 분기:** §2.2b 위반. `@min-[700px]/lc:` 만.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 모달 포커스 트랩·스크롤 잠금·형제 aria-hidden·Esc | 커스텀 fixed div + keydown 루프 | `radix-ui` `Dialog`(1.1.15) | iOS 스크롤 잠금(`react-remove-scroll`)·포커스 복귀·스크린리더 격리가 전부 내장 |
| 스위치 `role="switch"`·`aria-checked`·키보드 | `<button>` + 수동 aria | `radix-ui` `Switch` primitive | 키보드(Space)·상태 속성 표준 |
| 흐름 밖 말풍선 위치 계산 | absolute + 수동 좌표 | `radix-ui` `Popover`(`PopoverAnchor`) | 뷰포트 충돌 회피·포털 |
| 매체 쿼리 구독 SSR 안전 | `useEffect` + `useState` | `useSyncExternalStore` | 하이드레이션 불일치·tearing 없음 |
| 호가 단위 표 | 새 표 | `krxTickSize`(shared, 기존 두 표 흡수) | 중복 표는 언젠가 갈라진다(UI-SPEC 검증 훅) |
| 전송 응답 타이머 | 폼 자체 3초 타이머 | 카드 `unacked`(prop 추가) | 상태줄 「미반영」과 같은 신호여야 두 표시가 다른 말을 안 한다(UI-SPEC A10) |

**Key insight:** 이 phase 의 「새」 것은 표현뿐이다. 전송 조립(`buildCfg`)·무장 판정(`gateBlocked`/`armBlockedTextOf`)·철거 판정(`isDeleteIntent`)·에코 반영(`formFromServer`)·답 상관(카드 훅)은 전부 **재사용**하고 복제하지 않는다.

## Runtime State Inventory

> 이름 변경/데이터 이관 phase 가 아니지만(표현층 재구성) D-04 가 저장 방식을 바꾸므로 확인했다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 없음 — 상따 설정은 서버(gh-trade) 메모리 전략이고 프로토콜 불변. 브라우저 `localStorage` 키 `gh-radar:trading-layout:*` · `gh-radar:trading-panels`(작업대 배치)는 이 phase 가 건드리지 않음 (`tests/setup.ts` 참조) | 없음 |
| Live service config | 없음 — relay·게이트웨이 설정 무변경 | 없음 |
| OS-registered state | 없음 | 없음 |
| Secrets/env vars | 없음 — `NEXT_PUBLIC_RELAY_WS_URL` 등 불변 | 없음 |
| Build artifacts | `packages/shared/dist/*` — shared 에 `krxTick` 추가 시 **재빌드 필요**(webapp 이 dist 를 소비) | `pnpm --filter @gh-radar/shared build` 를 webapp 검증 앞에 |

## Common Pitfalls

### Pitfall 1: 거부를 성공으로 읽기
**What goes wrong:** 시트가 「답이 왔다」(`serverAnswerSeq` 변화)만 보고 닫혀, 게이트웨이가 거부한 값을 사용자는 반영된 줄 안다.
**Why:** 거부 통지도 `acceptAnswer()` 를 부른다(`strategy-card.tsx:494`) — 거부에는 60 에코가 없다.
**How to avoid:** 성공 = `server[field] === 보낸 값`. 답은 왔는데 값이 다르면 실패.
**Warning signs:** 테스트에서 `serverAnswerSeq` 만 올린 렌더에 시트가 닫힌다.

### Pitfall 2: 미등록 전략에서 값 전송
**What goes wrong:** `server == null` 인 새 카드에서 「적용」 → `crudOf` 가 `'D'` → 존재하지 않는 키의 철거 프레임이 나간다(게이트웨이 왕복 낭비, 「미반영」 경로 복잡화). `cancelTradeEnabled` 체크를 켜면 `crudOf` 가 `'C'` → 사용자가 스위치를 켜지 않았는데 전략이 등록된다(`isActiveStrategy` 기준으론 「꺼진 전략」인데 서버엔 존재).
**How to avoid:** `server == null` 이면 스위치 4개만 전송, 나머지는 로컬 반영(Open Q1). 기존 모델에서도 미등록 폼의 값은 스위치 전송에 실려 나갔다(`dirtyFieldsOf(null)` → `[]`, `lib/limit-chaser.ts:193`).

### Pitfall 3: 폼 remount 가 열린 시트를 삼킴
**What goes wrong:** `LimitChaserForm` 키가 `` `${isin}|${accountNo}|${exchange}|${resetSeq}|${liveSeed}` ``(`card-body.tsx:256`)라, 미등록 카드에서 첫 실시간 상한가(`liveSeed`) 도착 시·삭제 에코(`resetSeq`) 시 폼이 remount → 시트 상태가 사라진다.
**How to avoid:** 허용(첫 수백 ms 한정 · 삭제는 스위치 조작 결과라 시트가 열려 있지 않음). 문제가 되면 시트 열림 상태를 `CardBody` 로 끌어올린다. 테스트로 「remount 후 포커스가 body 로 떨어지지 않음」 정도만 확인.

### Pitfall 4: 에코 도착 순서 가정
**What goes wrong:** `answerSeq` 증가가 `server` 갱신보다 먼저 보이는 렌더가 있으면 성공 에코를 잠깐 「실패」로 칠한다.
**Why:** `acceptAnswer` 는 카드 이펙트 안에서 `setAnswerSeq` 를 부르므로 보통 `server` 가 먼저(또는 같은 렌더) 갱신되지만, relay-provider 의 상태 업데이트 배칭에 의존한다 `[ASSUMED]`.
**How to avoid:** 「실패 → 내 값 에코 도착 = 성공」(늦은 에코) 전이를 반드시 구현하고, 단위 테스트에 「answerSeq 먼저, server 나중」 순서 케이스를 둔다.

### Pitfall 5: 폰 밴드 가로 넘침 (라벨 잘림 = 오발주 불변식)
**What goes wrong:** 뷰포트 360(본문 344): 옵션 열 = 344 × 58% ≈ 200 → `p-2` 16 → 그룹 패딩 20 → 행 패딩 8 → **행 안쪽 ≈ 155px**. 「매수가격」(14px × 4 ≈ 56) + 6 + 「1,274,000원 ›」(15px tabular ≈ 98) ≈ 160 > 155. 「잔량추적 기준선」(≈ 91) + 「100,000주」(≈ 73) ≈ 170 > 155. ≥700 밴드 중에는 **본문 830 이 가장 좁다**(830 − 400 − 20 = 410 → 열 201 → 행 안쪽 ≈ 173).
**Why:** 행이 `nowrap` + `justify-between` + 말줄임 금지라 넘치면 그대로 삐져나온다(의도된 가시화).
**How to avoid:** Wave 0 에서 Playwright 로 최악값(7자리 가격 · 100,000주 · 9,999만원 · 기준선 행) × 본문 344/700/830/992 실측 → 넘치면 UI-SPEC backstop 순서(① 행 좌우 패딩 4→0 ② 라벨–값 간격 6→4 ③ 폰 밴드 쉐브런 숨김) 적용. 글자 크기는 바꾸지 않는다. 위 폭 수치는 글리프 폭 추정이라 `[ASSUMED]` — 반드시 실측.
**Warning signs:** 기존 `e2e/overflow.ts` 의 `leavesOverflowing`/`scrollOverflowing` 이 행에서 1px 초과를 보고.

### Pitfall 6: 제어형 Dialog 포커스 미복귀
**What goes wrong:** 시트를 닫으면 포커스가 `<body>` 로 떨어져 키보드 사용자가 목록 맨 위로 튄다.
**Why:** Radix 모달은 `triggerRef` 로만 복귀한다(소스 `index.mjs:146-149`).
**How to avoid:** `onCloseAutoFocus` 에서 연 행 ref 로 `focus()`.

### Pitfall 7: jsdom `matchMedia` 교체 누수
**What goes wrong:** 시트 테스트가 `window.matchMedia` 를 coarse 로 바꾼 채 끝나면 같은 파일의 다음 inline 테스트가 시트 모드로 돈다.
**How to avoid:** `beforeEach` 에서 원본 보관 · `afterEach` 에서 복원(또는 `vi.stubGlobal` + `vi.unstubAllGlobals`).

### Pitfall 8: e2e 가 엉뚱한 dev 서버를 테스트
**What goes wrong:** `reuseExistingServer: true` 라 3100 에 메인 체크아웃 서버가 있으면 worktree 변경이 반영되지 않은 화면을 검증하고 초록불을 낸다.
**How to avoid:** e2e 전 3100 리스너 확인. 없으면 playwright 가 worktree 의 `PORT=3100 pnpm dev` 를 띄운다.

### Pitfall 9: 스위치 컴포넌트 기하
**What goes wrong:** `ui/switch.tsx` 에 `className="h-6 w-10"` 만 주면 thumb 가 16px·이동 16px 로 남아 40×24 트랙에서 어긋난다(`switch.tsx:31` 하드코딩).
**How to avoid:** Radix `Switch` primitive 직접 사용(Pattern 2).

### Pitfall 10: 워크벤치 더티 배관을 반쯤 걷기
**What goes wrong:** `onDirtyCountChange` 를 폼에서 제거하고 카드 훅의 `setDirtyCount` 를 그대로 두면 문제없지만, `strategy-card`/`shared-panels` 의 바 측정 코드만 지우면 VI 쪽이나 다른 테스트(`shared-panels.test.tsx:363-382`)가 깨진다.
**How to avoid:** 워크벤치 쪽은 **한 줄도 건드리지 않는다**(0 이면 전부 비활성). 정리는 병합 결정 뒤 별도 quick.

## Code Examples

### useEditMode (SSR 안전)
```ts
// Source: React useSyncExternalStore 패턴 · card-grid.tsx:115-122 선례 · UI-SPEC §7
'use client';
import { useSyncExternalStore } from 'react';

const COARSE = '(pointer: coarse)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(COARSE);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const getSnapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(COARSE).matches;
const getServerSnapshot = () => false; // 서버·하이드레이션 첫 렌더 = inline

export type EditMode = 'sheet' | 'inline';
export function useEditMode(): EditMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) ? 'sheet' : 'inline';
}
```

### krxTickSize + 입력 검증 (shared)
```ts
// Source: order-panel.tsx:104-120 · limitUp.ts:84-93 (7구간 · 2023-01-25 개정)
export function krxTickSize(price: number): number {
  if (!Number.isFinite(price) || price < 2_000) return 1;
  if (price < 5_000) return 5;
  if (price < 20_000) return 10;
  if (price < 50_000) return 50;
  if (price < 200_000) return 100;
  if (price < 500_000) return 500;
  return 1_000;
}
export const tickUp = (v: number) => v + krxTickSize(v);
export const tickDown = (v: number) => Math.max(0, v - krxTickSize(v - 1));

export type PriceIssue =
  | { kind: 'overUpper'; upper: number }
  | { kind: 'offTick'; tick: number; lower: number; upper: number };
export function priceInputIssue(v: number, upperLimit: number): PriceIssue | null {
  if (!(v > 0)) return null;                                  // 빈 값·0 은 검증 대상 아님
  if (upperLimit > 0 && v > upperLimit) return { kind: 'overUpper', upper: upperLimit };
  const t = krxTickSize(v);
  if (v % t === 0) return null;
  const lower = Math.floor(v / t) * t;
  return { kind: 'offTick', tick: t, lower, upper: lower + t };
}
// 문구(UI-SPEC 카피): `상한가 ${fmt(upper)}원을 넘을 수 없어요` / `${fmt(tick)}원 단위로 입력해 주세요 · 가까운 값 ${fmt(lower)} / ${fmt(upper)}`
```
※ `limitUpPrice` 는 float `tgt`(예 1999.4)로 호출하므로 `krxTickSize(1999.4) = 1` 이 되는지 기존 테스트(`limitUp.test.ts` 1538→1999)로 확인된다. `tickFromTable` 은 `price <= 0 → 1` 이었는데 새 함수도 `< 2_000 → 1` 이라 동치.

### NumberPadSheet 골격 (Radix Dialog 직접 조립)
```tsx
// Source: radix-ui Dialog 1.1.15 API · 20-UI-SPEC §5 수치
import { Dialog } from 'radix-ui';

<Dialog.Root open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--dim)] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
    <Dialog.Content
      ref={contentRef}
      tabIndex={-1}
      data-slot="numpad-sheet"
      onOpenAutoFocus={(e) => { e.preventDefault(); contentRef.current?.focus(); }}
      onCloseAutoFocus={(e) => { e.preventDefault(); returnFocusRef.current?.focus(); }}
      onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
      onKeyDown={onPhysicalKey /* 0-9 · Backspace · Enter */}
      className="fixed inset-x-0 bottom-[max(10px,env(safe-area-inset-bottom))] z-50 mx-auto w-[min(440px,calc(100vw-20px))] max-h-[calc(100dvh-20px)] overflow-y-auto rounded-[28px] bg-[var(--card)] px-5 pt-[22px] pb-4 outline-none"
    >
      <Dialog.Title className="text-[20px] font-bold text-[var(--fg)]">{title}</Dialog.Title>
      <Dialog.Description className="mt-1 mb-[14px] text-[14px] text-[var(--muted-fg)]">{desc}</Dialog.Description>
      <output aria-live="polite">{/* 26/700 숫자 + 캐럿 + 단위 + 「지금 ○○」 */}</output>
      <p role={isError ? 'alert' : 'status'} className="min-h-4 text-[12.5px]">{statusLine}</p>
      {/* 칩(touch-manipulation) · 3×4 키패드(role="group" aria-label="숫자 키패드") · 닫기 | {필드명} 적용/입력 */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### 시트 테스트용 포인터 모킹
```ts
// Source: webapp/tests/setup.ts:36-47 폴리필 형태 그대로
const original = window.matchMedia;
function usePointer(coarse: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: coarse && q === '(pointer: coarse)', media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
afterEach(() => { window.matchMedia = original; });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 값 더티 누적 → 하단 「수정」 일괄 전송(Phase 16 D-06) | 필드 확정 1회 = `lc.set` 1회(Phase 20 D-04, 이 브랜치만) | 2026-09-25 | 더티 표시·바·포털·이탈 경고(상따 몫) 소멸, 필드 단위 in-flight 상태 신설 |
| 게이트 = 네이티브 체크박스 17px(2026-09-23) | TDS 스위치 40×24 + 44 히트 | 이 phase | 테스트 role `checkbox` → `switch` |
| 매수취소 = 매수 카드 맨 아래(2026-09-23) | 매도 탭 맨 아래(D-19) | 이 phase | ArmBlocked 패널 배치는 기존대로(매수 열 = 매수·한방, 매도 열 = 매도) |
| 조각 수 −/+ 스테퍼 | 키패드 칩 1·3·5·10 / 인라인 타이핑·↑↓ | 이 phase | `maxPieces` 초과 칩 비활성 · 검증 문구 |
| 모바일 입력 16px(iOS 확대 방지) | 터치 기기는 시트(입력 없음), inline 은 fine pointer 전용 15px | 이 phase | iOS 16px 규칙이 이 폼에서는 적용 대상이 사라짐 |

**Deprecated/outdated (이 브랜치에서):** `LIMIT_CHASER_DIRTY_HINT` · `cardDirtyHint` · `ORDERBOOK_DIRTY_BAR_CLASS` · 폼의 `dirtyHint`/`dirtyBarClassName`/`onDirtyCountChange` prop · `Card`/`Row`/`NumInput`/`CheckRow`/`GateSwitch` 내부 조각 · `--lw` 라벨 열 폭.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 미등록 전략(`server == null`)에서는 스위치 4개만 전송하고 값·체크·감시대상은 로컬 반영만 한다 | Q5 · Pitfall 2 | 사용자가 「적용 = 즉시 등록」을 기대했다면 동작이 다르게 느껴짐. 반대로 보내면 철거 프레임 낭비·의도치 않은 등록 |
| A2 | iPadOS 는 트랙패드 연결 시에도 `(pointer: coarse)` 를 유지한다 | Q1 | inline 으로 떨어질 뿐(기능 손실 없음) |
| A3 | NXT 호가 단위 = KRX 7구간(증권사 안내 기반, 넥스트레이드 공식 페이지 본문 미확인) | Q2 | 어긋나면 NXT 전략 가격 입력이 잘못 잠기거나 통과 → 게이트웨이 거부 문구로 드러남 |
| A4 | ETF/ETN 호가 단위가 주식과 다를 수 있으나 이번엔 분기하지 않는다 | Q2 | ETF 상따 시 정상 가격이 「단위 불일치」로 잠길 수 있음 |
| A5 | 폰 밴드 행 안쪽 폭 ≈155px(본문 344) · 830 밴드 ≈173px, 7자리 가격·기준선 행이 넘칠 가능성 | Pitfall 5 | 글리프 폭 추정 — 실측 전까지 backstop 필요 여부 미정 |
| A6 | relay-provider 의 에코 반영과 `answerSeq` 증가 순서는 보통 `server` 가 먼저다 | Pitfall 4 | 순서가 반대면 짧은 「실패」 깜빡임 — 늦은 에코 전이로 복구 |
| A7 | 인라인 실패 뒤 다른 행으로 이미 옮겼으면 포커스를 뺏지 않고 링+말풍선만 표시, 재클릭 시 보존값으로 편집 | Q6 | UX 세부 — 사용자 취향 |
| A8 | Tailwind `-translate-x-1/2` 와 tw-animate 슬라이드가 충돌할 수 있어 가운데 정렬은 `inset-x-0 mx-auto` 로 둔다 | Q3 | 충돌하지 않으면 어느 쪽이든 무방 |
| A9 | `touch-action: manipulation` 이 iOS 키패드 연타 확대·지연을 막는다 | Q3 | 미적용 시 빠른 연타에서 확대 가능 |

## Open Questions

1. **미등록 전략에서 「적용」의 의미 (A1)**
   - What we know: 기존 모델에선 미등록 폼 값은 로컬에만 있다가 첫 스위치 전송에 실렸다. D-04 는 「한 필드 확정 = 전략 1회 전송」.
   - What's unclear: 미등록 카드에서도 D-04 를 적용할지.
   - Recommendation: 로컬 반영(전송 없음) + 행 강조로 구현하고, 시트의 「감시 중」 안내 자리에 아무 문구도 두지 않는다. 플래너가 discuss 체크포인트로 사용자 확인 1회 권장(한 줄 질문).
2. **매수취소 스위치의 접근성 이름**
   - What we know: UI-SPEC 접근성 이름 표에는 「매수주문/한방체결/매도주문 켜기」만 있다.
   - Recommendation: 「매수취소 켜기」(같은 패턴). 추가 확인 불필요.
3. **인라인 실패가 다른 행 편집 중에 도착할 때 (A7)** — Recommendation: 포커스 비탈취 + 보존값 재편집. 확인 불필요(UI-SPEC 범위 안 세부).
4. **e2e 의미 소멸 테스트(7·12·GC2·16) 처리**
   - Recommendation: 12 → 「인라인 Enter → 게이트웨이 10 수신 → 에코 → 행 값」으로 재정의, 13 → 「인라인 편집 중 다른 단말 에코 → 입력 유지·행 표시 에코값」, 7·GC2 → 삭제(개념 소멸), 16 → VI 더티로 이탈 경고를 검증하도록 바꾸거나 삭제. 새 touch describe(`hasTouch: true`)에 「행 탭 → 시트(가운데 ≤440·radius 28·body 직속) → 칩/키 → 적용 → 10 수신 → 에코 → 닫힘」 1건.
5. **ETF/ETN 호가 단위 (A4)** — Recommendation: 이번엔 무시, 실사용에서 잠김 제보 시 quick.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / pnpm workspace | 빌드·테스트 | ✓ | (worktree 에서 vitest 실행 성공) | — |
| vitest (webapp) | 단위 테스트 | ✓ | 2.1.9 계열 · 99 파일 1731 통과 기준선 | — |
| Playwright Chromium | e2e · 터치 모드 | ✓ | Chromium 147.0.7727.15 (probe 실행) | — |
| 포트 3100 | e2e dev 서버 | ✓ 비어 있음(조사 시점) | — | 사용 중이면 worktree 서버인지 확인 후 재사용 |
| relay 로컬 픽스처(8090) | e2e 상따/주문 | 미실행(픽스처가 spec 단위로 기동) | — | — |
| `.env.test.local` | e2e 인증 | ✓ 파일 존재 | — | — |

**Missing dependencies with no fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^2.1.9 (webapp, jsdom) · vitest ^4.1.4 (packages/shared) · @playwright/test ^1.59.1 |
| Config file | `webapp/vitest.config.ts` · `webapp/tests/setup.ts` · `webapp/playwright.config.ts` |
| Quick run command | `pnpm --filter @gh-radar/webapp exec vitest --run <파일들>` (worktree 루트에서) |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test` |
| Shared unit | `pnpm --filter @gh-radar/shared exec vitest --run src/krxTick.test.ts src/limitUp.test.ts` |
| E2E (phase gate) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/orderbook.spec.ts e2e/specs/a11y.spec.ts e2e/specs/sidebar-tree.spec.ts` |
| config build/test | `.planning/config.json` `workflow.build_command` / `test_command` 그대로 사용 가능(relay 타입체크 포함) |

### Phase Decisions → Test Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-15 | `krxTickSize` 7구간·경계 · `tickUp/Down` · `priceInputIssue`(상한가 우선·가까운 두 값) | unit | `pnpm --filter @gh-radar/shared exec vitest --run src/krxTick.test.ts` | ❌ Wave 0 |
| D-15 회귀 | `limitUpPrice` 행동 보존 · `order-panel` 스텝퍼 | unit | `… shared exec vitest --run src/limitUp.test.ts` · `… webapp exec vitest --run src/components/orderbook/__tests__/order-panel.test.tsx` | ✅ |
| D-12 | `useEditMode` coarse→sheet · 기본 inline · SSR 스냅샷 false · change 구독 | unit | `… webapp exec vitest --run src/lib/__tests__/use-edit-mode.test.ts` | ❌ Wave 0 |
| D-16·D-17·D-14c | 키패드 리듀서(fresh 덮어쓰기 · 00 규칙 · 0 대체 · 9자리 · ⌫) · 칩 연산(단위별 · 현재가/상한가 0 이면 비활성 · 회 칩 `maxPieces`) | unit | `… vitest --run src/lib/__tests__/numpad.test.ts` | ❌ Wave 0 |
| D-04·D-05·D-06·D-07 | 상태 기계: 적용 → send 1회(32필드·필드만 변경) · 반영 중 잠금 · 에코 값 일치 = 닫힘 · 거부(answerSeq만) = 실패 · `unacked` = 실패 · 늦은 에코 = 성공 · send false = 연결 문구 · 같은 값 = 전송 0 · 미등록 = 전송 0 · 직렬화(대기 1건, 실패 시 폐기) · 다른 단말 에코 = 입력 유지+문구 | component | `… vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx` (+ 훅 단독 테스트 파일) | ⚠️ 재작성 |
| D-01·D-19·D-21·D-22·D-20 | 그룹 순서(매수: 가격→매수주문→한방 / 매도: 가격→매도주문→매수취소) · `lc-group-*` 슬롯 · 스위치 role=switch 4개(매수취소=`cancelQtyEnabled`) · 체크 값 행 `role=checkbox` 즉시 전송 · 꺼진 그룹 opacity .45 편집 가능 · 행 클래스 `min-h-[44px]` | component | 〃 | ⚠️ 재작성 |
| D-02 | 감시대상 `role=group` + `aria-pressed` · 즉시 전송 · 시트 안 열림 · ≥700 라벨 클래스 쌍(`@min-[700px]/lc:`) | component | 〃 | ⚠️ |
| D-13·D-16·D-23 | 시트: body 직속 포털 · `role=dialog` · 제목/설명 · 「{필드명} 적용」/「{필드명} 입력」 · 닫힐 때 연 행으로 포커스 복귀 · busy 시 Esc/바깥 무시 | component | `… vitest --run src/components/trading/lc/__tests__/number-pad-sheet.test.tsx` | ❌ Wave 0 |
| D-14·D-14a·D-14b | 인라인: 클릭 → 입력 전체 선택 · Enter 저장/Esc 취소/↑↓ tick · Tab 같은 그룹 다음(감시대상 건너뜀) · 다른 행 pointerdown → 저장+그 행 편집(한 번 클릭) | component | `… vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx` | ⚠️ |
| D-08~D-11 | 수동주문: inline 모드 `<label>` 연결 유지(`getByLabelText('가격'/'수량'/'조각 수')`) · sheet 모드 상자 버튼 → 시트 「가격 입력」 = 값만 채움 · 주문은 확인 다이얼로그로만 · 스테퍼 제거 · 77/시간외종가/정정·취소 조건 무변경 | component | `… vitest --run src/components/trading/__tests__/manual-order-form.test.tsx` | ⚠️ 부분 갱신 |
| 불변식 | 카드 컨테이너·/lc 유틸만 · 뷰포트 BP 0 | component | `… vitest --run src/components/trading/__tests__/strategy-card.test.tsx src/components/stock/__tests__/stock-orderbook-section.test.tsx` | ✅ |
| D-04 제거 | `dirty-action-bar` DOM 부재 · 더티 prop 제거 후 CardBody 배선 | component | `… vitest --run src/components/trading/__tests__/card-body.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx` | ⚠️ 갱신 |
| 토큰 | `--group-bg`·`--switch-off`·`--dim` 양 테마 정의·oklch 없음 | unit | `… vitest --run src/styles/__tests__/tds-tokens.test.ts` | ⚠️ 기대값 추가 |
| 불변식(폭) | 우측 패널 잘림 0 · 행 높이 44 정확 · ≥700 매수주문/매도주문 그룹 높이 동일 · 본문 344/700/830/992 × 최악값 | e2e | `… playwright test e2e/specs/trading-workbench.spec.ts -g "밴드\|잘림"` | ⚠️ 기존 4·5·18 확장 |
| D-12·D-13 | `hasTouch` → 행 탭 시 시트 · 뷰포트 390 → 폭 370 · ≥460 → 440 가운데 · radius 28 · 하단 ≥10 · body 직속 · 적용 → 게이트웨이 10 수신 → 에코 → 닫힘 | e2e | 새 describe `test.use({ hasTouch: true })` | ❌ |
| 주문 경로 | 수동주문 제출 → 확인 다이얼로그 → 접수/결과 모름 잠금 | e2e | `… playwright test e2e/specs/orderbook.spec.ts` (6·7) · trading-workbench GC5·GC6 | ✅ (inline id 유지 시) |
| a11y | 시트 열린 상태 axe 위반 0 | e2e | `… playwright test e2e/specs/a11y.spec.ts` | ⚠️ ⑦ 대체 |

### Sampling Rate
- **Per task commit:** 해당 task 가 만든/바꾼 테스트 파일만 quick run (각 < 5s).
- **Per wave merge:** `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test` (~30s, 기준선 99 파일 · 1731 통과 · 1 skip).
- **Phase gate:** 위 + e2e 4 spec(순차, `workers: 1`) + 폭 4개 × 최악값 잘림 0 + 시각 확인(다크/라이트, 폰 390 · 태블릿 768 터치 · 데스크톱 1280) 뒤 `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `packages/shared/src/krxTick.ts` + `krxTick.test.ts` — D-15
- [ ] `webapp/src/lib/use-edit-mode.ts` + `src/lib/__tests__/use-edit-mode.test.ts` — D-12
- [ ] `webapp/src/lib/numpad.ts` + `src/lib/__tests__/numpad.test.ts` — D-16/D-17/D-14c
- [ ] 폭 예산 스파이크: 최악값 행을 가진 임시 Playwright 측정(본문 344/700/830/992) — Pitfall 5 backstop 필요 여부 확정 (결과를 PLAN 에 기록 후 스파이크 코드는 버림)
- [ ] 시트 테스트용 `matchMedia` 모킹 헬퍼(파일 로컬 or `tests/` 공용) — Pitfall 7

## Security Domain

`security_enforcement` 는 config 에 없으므로(= 활성) 적용한다. 이 phase 는 인증·세션·권한 경로를 바꾸지 않는다.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 기존 Supabase 세션 · relay auth 무변경 |
| V3 Session Management | no | 〃 |
| V4 Access Control | no | 계좌 소유권은 relay `session.allowedAccounts` 가 판정(`limit-chaser-form.tsx:268` 주석) — 무변경 |
| V5 Input Validation | yes | 클라: 숫자만 · 9자리 상한 · 호가 단위/상한가 보조 검증(입력 보조). 서버·relay 스키마가 최종(`UIntSchema` 등) — 클라 검증을 신뢰 경계로 쓰지 않는다 |
| V6 Cryptography | no | — |

### Known Threat Patterns for this change

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 오터치로 즉시 반영(확인 없는 전송) | Tampering(자기 자산) | 명시적 「{필드명} 적용」 버튼 · 반영 중 잠금 · 자동 재시도 금지 · 직렬화 1건 · 무장 불가 값 전송 차단(`gateBlocked` 재사용) · 스위치 끄기는 언제나 허용(T-16-44) |
| 사용자가 누르지 않은 재전송(중복 등록/발주) | Tampering | 실패 뒤 `queued` 폐기 · 타이머는 표시만(T-16-10) |
| 오래된 로컬 값으로 다른 필드 덮어쓰기 | Tampering | cfg 는 서버 동기화된 `formRef`(에코가 전 필드를 덮음) + 바꾼 필드 1개. 값 필드 낙관 반영 없음 |
| 거부를 성공으로 표시(무로그 fail-safe) | Repudiation | 성공 = 에코 값 일치 · 거부/타임아웃/미전송 각각 문구 · 카드 `card-server-error` `role="alert"` 기존 경로 유지 |
| 다른 종목 가격으로 주문 | Tampering | 수동주문 경로·`isin` 리셋 이펙트 무변경(T-15-40 · T-18-48) |

## Sources

### Primary (HIGH confidence)
- 코드베이스 Read(이번 세션): `webapp/src/components/trading/limit-chaser-form.tsx`(전체) · `card/card-body.tsx`(전체) · `card/strategy-card.tsx`(전체) · `card/manual-order-form.tsx`(1-100, 300-479, 660-1079) · `lib/limit-chaser.ts`(40-339) · `components/ui/sheet.tsx`·`switch.tsx`·`popover.tsx` · `orderbook/order-panel.tsx:90-145` · `packages/shared/src/limitUp.ts` · `packages/shared/src/relay.ts:640-707` · `tests/setup.ts` · `vitest.config.ts` · `playwright.config.ts` · `e2e/specs/*` grep · `styles/__tests__/tds-tokens.test.ts`
- Radix Dialog 1.1.15 소스 `node_modules/.pnpm/@radix-ui+react-dialog@1.1.15…/dist/index.mjs:95-175`
- Playwright Chromium 147 포인터 매체 쿼리 probe(이번 세션 실행 · 임시 파일 삭제)
- `.planning/phases/20-toss-order-ticket/20-CONTEXT.md` · `20-UI-SPEC.md` · `.planning/sketches/002-toss-order-ticket/index.html`(8차) · `18-CONTEXT.md` D-10/D-12/D-19~D-28 · `16-CONTEXT.md` D-05/D-06

### Secondary (MEDIUM confidence)
- [한화투자증권 호가가격단위](https://www.hanwhawm.com/main/center/info/CS181_3p.cmd) — 7구간 표, 유가증권·코스닥·넥스트레이드 공통 적용
- [비즈니스포스트 — 주식시장 호가 25일부터 변경](https://www.businesspost.co.kr/BP?command=article_view&num=303760) — 2023-01-25 개정 대표 구간
- [삼성증권 — 국내 증권/파생시장 호가가격단위 변경 안내](https://samsungpop.com/ux/kor/customer/notice/notice/noticeViewContent.do?MenuSeqNo=19236)
- [신한투자증권 NXT 가이드 ① 제도](https://open.shinhansec.com/mobilealpha/html/CS/NXTPolicyGuide_v2.html) — 가격제한폭 ±30% 양 시장 동일
- [대신증권 한국거래소 제도개편 안내](https://money2.daishin.com/html/Notice/2023/n_07.html)

### Tertiary (LOW confidence)
- 웹 검색 요약 「넥스트레이드와 KRX 는 호가가격단위·기준가격·거래일 동일」(교보·미래에셋 안내 페이지 요약, 원문 추출 실패) — 넥스트레이드 공식 [거래제도](https://nextrade.co.kr/transactionSys/content.do) 본문은 이번 세션에 관측하지 못함

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 0, 설치된 버전·소스 직접 확인
- Architecture (상태 기계·배선): HIGH — 기존 전송/응답 신호를 전부 코드로 확인. 신호 도착 순서만 MEDIUM(A6)
- 포인터 판정: HIGH(Chromium 실측) / 실기 하이브리드 MEDIUM(A2)
- 호가 단위: HIGH(KRX 표·코드 일치) / NXT MEDIUM(A3)
- Pitfalls(폭 예산): MEDIUM — 계산 추정, Wave 0 실측 필요

**Research date:** 2026-09-25
**Valid until:** 2026-10-25 (코드베이스 사실은 브랜치가 움직이면 재확인 — 특히 `limit-chaser-form.tsx`·`card-body.tsx` 줄번호)
