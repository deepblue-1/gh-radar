# Phase 27 — UI Review

**Audited:** 2026-10-10
**Baseline:** 추상 6-pillar 기준 + 27-CONTEXT.md 결정(D-01~D-17, 목업 채택안)을 잠긴 기준선으로 사용 (UI-SPEC 없음)
**Screenshots:** 촬영 안 함 (localhost:3100 개발 서버 응답 없음 — 코드 전용 감사)
**Interaction captures:** off (workflow.ui_interaction_capture 가 false)

> 시각 판정(밴드별 줄바꿈 · 실제 대비 · 터치 크기)은 코드에서 추론한 것이다. 실측이 아니다. 다만 27-UAT 1~5번이 첫 거래일 실사용으로 네 표면의 pass 를 이미 기록했다(사용자 눈 확인). 아래 감점은 그 UAT 가 보지 않는 결함 위주다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 한국어 의미어와 서버 원문 규율은 좋다. 비활성 버튼에 사유 문구가 없고(D-05 의도), 「바로시작」 이 무엇을 시작하는지 단독으로는 모호하다 |
| 2. Visuals | 3/4 | 4번째 LED · 칩 · 버튼 행 위계는 선명하다. LED 4칩이 좁은 밴드에서 어떻게 접히는지 실측 근거가 없다 |
| 3. Color | 3/4 | hex 하드코딩 0, 토큰만 쓴다. 다만 「바로시작」 이 상승(빨강)색이라 매도 방향 · 손실색과 겹친다 |
| 4. Typography | 2/4 | 10 · 11 · 12 · 12.5 · 13 · 14 · 15 · 16 · 17px 임의값이 난립한다. 관련 4파일 합계 9종 이상 |
| 5. Spacing | 3/4 | 44px 행 · 8px 간격 규율은 일관되고 임의 px 값은 소수다. 쉐브런 상시 표시가 /me 에서만 예외다 |
| 6. Experience Design | 3/4 | 3초 미반영 · in-flight 잠금 · 서버 거부 롤백이 갖춰졌다. 비활성 이유 비노출과 장애 시 복구 동선이 약하다 |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **[WARNING] 바로시작 · 중지 비활성 이유가 어디에도 안 보인다** — 버튼이 `disabled:opacity-40` 만 입는다 (`setting-group.tsx:147`). 눌리지 않는 이유(전략 미등록 D-09 · 그룹 확정 중 D-07 · 41 응답 대기 · 세션 미준비)를 사용자가 알 길이 없다. 설명 줄 금지(D-05)는 지키되 `title` 과 `aria-describedby` 로 사유를 싣거나, 사유가 D-07(확정 중)일 때만 시각 힌트를 추가해라. 지금은 장중에 「왜 안 눌리지」 상황이 생긴다.
2. **[WARNING] 글자 크기 척도가 없다** — 관련 파일에서 `text-[10px]` ~ `text-[17px]` 임의값 9종 이상이 쓰인다 (`card-header.tsx:259` 10px LED 라벨, `:335 :343` 11px 칩, `setting-group.tsx` 12/12.5/13/14/15/16/17px, `limit-chaser-defaults.tsx` 11/12.5/13/15px). 12px 과 12.5px, 14px 과 15px 의 구분이 의미 단위로 설명되지 않는다. 3~4단계(캡션 12 · 본문 14 · 행 값 15 · 제목 17)로 토큰화하고, 10px LED 라벨은 12px 이상으로 올려 가독성 하한을 맞춰라.
3. **[WARNING] 「바로시작」 의 색 의미 충돌** — 채움색이 `--up`(상승 = 빨강)이다 (`setting-group.tsx:155`). 한국 시세 관례에서 빨강 = 상승이라 매수 · 상승 신호로 읽히는데, 이 버튼은 자동 매도를 개시한다. 같은 카드의 구분 배지는 매도 = down(파랑)이다. 방향 색이 아니라 중립 primary 로 바꾸거나, 최소한 카드 안에서 방향 색 규칙과 충돌하지 않는다는 근거를 CONTEXT 에 남겨라. 목업 채택안이라 의도된 선택일 수 있지만 오조작 위험이 있다.

그 밖의 권고(우선순위 낮음, 합쳐서 6+ 건):
4. LED 4칩이 좁은 밴드(본문 685 미만)에서 둘째 줄로 접힐 때의 실측 결과가 CONTEXT 구현 메모(「구현 때 실측」)에 닫히지 않았다. 스크린샷이나 e2e 앵커로 한 번 못 박아라.
5. `/me` 쉐브런 상시 표시는 공용 규칙(폰 밴드에서 숨김)을 CSS 로 덮는 예외다 (`limit-chaser-defaults.tsx`, `[&_[data-slot=lc-row-chevron]]:inline`). 상따 카드와 /me 의 행 문법이 갈린다.
6. 플래시 성공 신호가 글자색 변화뿐이다 (`FLASH_CLASS`, 색만 바뀜 · 움직임 없음). 저장 확인이 색각 · 주의에 의존한다. 체크 아이콘이나 `aria-live` 알림을 보태라.
7. 「불러오는 중」 이 멈추는 경우(84 미수신)의 재시도 · 안내가 없다. 행이 `opacity-45` 로 흐려지고 편집 불가인 채로 남는다.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 좋은 점: 시작조건 0 을 「이탈 후 다음 체결」 의미어로, 상태 0 을 서버 문구와 같은 「꺼짐」 으로 맞췄다. 서버 거부는 원문 그대로 전략 로그에 싣는다(D-13). 방법 콤보 순서와 이름이 WinForms 와 같다. 설정 섹션의 상태 칩 3종(서버 저장값 · 서버 저장값 없음 · 불러오는 중)과 안내 문구가 상태별로 갈린다.
- 결함: 「바로시작」 / 「중지」 가 무엇을 하는지 버튼 이름만으로는 불명확하다. 자동매도를 시작한다는 맥락은 카드 제목줄에만 있다. 접근성 이름에 「자동매도」 접두가 없다 (`setting-group.tsx:160,172`).
- 결함: 비활성 사유 문구 없음(Top 1).
- 「누적 매도」 「기준 상한가 N원」 행은 상태 0 에서 「—」 로 비어, 「아직 안 시작」 인지 「데이터 없음」 인지 구분되지 않는다.

### Pillar 2: Visuals (3/4)
- 제목줄 스위치 + 상태 칩 + 접힘 요약으로 초점이 분명하다. LED 4번째 「자동」 은 비클릭이고 툴팁에 기준가를 싣는다(`latch-led.tsx:142`).
- LED 라벨이 10px 이고(`card-header.tsx:259`) 4칩이 한 줄에 들어가는지 실측이 없다. 4칩이 줄바꿈되면 칩 문구를 줄이는 쪽이라는 D-04 약속이 코드에서 확인되지 않는다.
- 상태 색 의미가 칩(주황 = 대기 · 완료)과 LED 에서 같아 일관되나, 「완료」 가 주황(진행 중 계열)이라 완료로 읽히지 않을 수 있다. WinForms 동형 결정이므로 수용하되 기록한다.

### Pillar 3: Color (3/4)
- hex · rgb 하드코딩 0건. `--led-armed` `--led-latent` `--up` `--muted-fg` `--destructive` 토큰만 쓴다. 새 토큰 0 (D-04 준수).
- 「바로시작」 `--up` 채움 + `--destructive-fg` 글자색이 상승색을 재사용한다(Top 3). 중지가 `--muted` 라 두 버튼의 위계는 선명하다.
- 대기 · 완료 주황과 감시 · 매도중 초록 2색만으로 4상태를 구분한다. 색에만 의존하지 않고 칩 낱말이 같이 있어 통과한다.

### Pillar 4: Typography (2/4)
- 척도 없이 임의 px 값이 흩어진다 (`setting-group.tsx` 15px 6회 · 12.5px 4회 · 14px 3회 · 13px 2회 · 12px 2회 · 17px · 16px / `card-header.tsx` 10 · 11 · 12 · 13 · 15px / `limit-chaser-defaults.tsx` 11 · 12.5 · 13 · 15px).
- 10px · 11px 는 모바일 최소 가독 기준(약 12px) 아래다. 선행 phase 28 UI 감사에서도 「글자 크기 하한 이탈」 이 지적됐다(커밋 dfe2bb14) — 같은 결함이 반복된다.
- 굵기는 semibold · bold 위주로 과하지 않다.

### Pillar 5: Spacing (3/4)
- 44px 행 · `gap-2` · `px-1` 버튼 행 등 4/8 배수가 일관된다. 폭 분기는 뷰포트가 아니라 컨테이너 쿼리(`@min-[685px]/lc`, `@min-[700px]/me`)를 쓴다 — CLAUDE.md 규약 준수.
- 감점: 685 · 700 두 경계가 공존한다. 700 은 /me 컨테이너 전용이라 규약상 허용되나 globals.css §2.2b 에 근거가 없다. 임의 값 `h-[22px]` `w-[18px]` `rounded-[12px]` 가 섞인다.

### Pillar 6: Experience Design (3/4)
- 상태 커버리지: 로딩(`aria-busy` + 흐림), 전송 중(점선 pend 칩, 버튼 잠금), 3초 무응답 「미반영」, 서버 거부(원문 `role="alert"` + 행 서버 값 롤백), 대기열 직렬화가 모두 있다. 낙관 갱신 없이 에코를 진실로 삼는 설계는 건전하다.
- 확인창이 없는 「바로시작」 은 D-06 의 의식적 선택이다. 매도 실행 버튼이라 오터치 위험은 「접힌 카드에서는 안 보임」 이 유일한 방어선이다. 위험을 알고 수용한 결정이므로 BLOCKER 로 올리지 않는다.
- 감점: 비활성 사유 비노출(Top 1), 84 미수신 시 복구 동선 없음, 성공 피드백이 색 변화 하나(권고 6).
- 접근성: 그룹에 `role="group"` · `aria-label`, 거부에 `role="alert"` 가 있다. 플래시와 상태 칩 변화에 `aria-live` 가 없다.

---

## Files Audited
- `/Users/alex/repos/gh-radar/webapp/src/components/trading/lc/setting-group.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/trading/lc/lc-fields.ts` (그룹 정의 일부)
- `/Users/alex/repos/gh-radar/webapp/src/components/trading/latch-led.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/trading/card/card-header.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/trading/limit-chaser-form.tsx` (버튼 활성 판정)
- `/Users/alex/repos/gh-radar/webapp/src/components/me/limit-chaser-defaults.tsx`
- `/Users/alex/repos/gh-radar/.planning/phases/27-auto-sell-integration/27-CONTEXT.md` · `27-UAT.md`
