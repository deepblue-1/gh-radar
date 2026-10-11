# Phase 26: 시세 전용 공유 연결 — relay 종목 단위 팬아웃 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-30
**Phase:** 26-shared-quote-feed
**Areas discussed:** 공유 시세 세션 단절 UX·헬스, PRICE 필터 relay 이관 범위, 사용자 DMA 세션 역할·수명, 구독·캐시 전역화 세부 + 전환

**전제:** gh-trade 서버 쪽은 `quick 260930-kg3` 에서 quote 역할 관찰자로 진행 중이며 7건 합의(통과 MsgType 4·27·28·29·32·35 · 79 role 에코·저널 필드 비움 · 로그인 뒤 78 1회 · 82·83 역할 무필터 · 모르는 role 거부 · quote 상한 2000 · 54/77/80 미송신·76 quote 만)가 끝났다. 논의 도중 gh-trade 세션이 와이어 세부(role ubyte 슬롯 14/26 · fbs 커밋 `ed2e0240` · 상한 초과 조용히 무시)를 보내와 CONTEXT 「확정된 것」 에 반영했다. 서버 변경은 논의 대상에서 제외했다.

---

## 공유 시세 세션 단절 UX·헬스

| Option | Description | Selected |
|--------|-------------|----------|
| 배지 2축 분리 + 마지막 값 유지 | 「시세」·「주문」 상태를 따로 표시, 시세 끊김이면 캐시 값 유지 + 배지 적색 | ✓ |
| 배지 하나로 합산 + 마지막 값 유지 | 둘 중 하나라도 끊기면 기존 배지 degraded. 시세만/주문만 끊김 구분 불가 | |
| 단절 즉시 호가창 비움 | stale 값 미표시, 짧은 재접속에도 화면 깜빡임 | |

**User's choice:** 배지 2축 분리 + 마지막 값 유지

| Option | Description | Selected |
|--------|-------------|----------|
| 503 포함 | quote 세션 Ready 아니면 503 degraded, 기존 uptime 알림이 잡음 | ✓ |
| 본문 필드만 + 장중 별도 알림 | 저널 관찰자 방식(19 D-04b), 알림 정책 1개 추가 | |

**User's choice:** 503 포함

| Option | Description | Selected |
|--------|-------------|----------|
| 폴백 없음 | 시세는 quote 세션 한 경로, 백오프 재접속 + 합집합 재구독으로만 복구 | ✓ |
| 자동 폴백 | N초 넘게 끊기면 사용자 세션이 예전처럼 구독, 두 경로 상태기계 | |
| 수동 스위치(env) | per-user 모드로 재배포해 되돌림, 두 모드 코드 유지 | |

**User's choice:** 폴백 없음

| Option | Description | Selected |
|--------|-------------|----------|
| 배지만, 값은 그대로 | 적색 배지 + 끊긴 시각, 호가 숫자는 손대지 않음 | ✓ |
| 값 흐림 + 배지 | 호가·체결 영역 반투명 | |
| N초 넘으면 흐림 | 짧은 끊김은 배지만, 임계값은 Claude 재량 | |

**User's choice:** 배지만, 값은 그대로

---

## PRICE 필터 relay 이관 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 서버 규칙 그대로 복제 | 가격 섹션 필드 비교 + 키당 최소 간격(질문 시점 200ms 로 제시 → gh-trade 확인 후 100ms 로 정정), 정본 `tasks/gh-trade-price-only-quote-subscription-reply.md` | ✓ |
| 200ms 간격만 | 필드 비교 없이 키당 200ms 에 하나, 호가만 바뀐 틱도 나감 | |
| 71·75 만 빼고 59 전부 통과 | 필터 최소, PRICE 소켓도 10Hz, ge2 이전으로 후퇴 | |

**User's choice:** 서버 규칙 그대로 복제
**Notes:** `envelope.ts:452` 주석(≥100ms)과 회신문(200ms) 불일치를 gh-trade 세션에 물어 **100ms 가 맞다** 는 답을 받았다(`MarketPublisher.h:159` `kPriceLevelMinIntervalMs = 100`, quick-260923-hp5). 억제된 갱신은 다음 허용 틱에 최신 상태로 나간다(유실 없음). CONTEXT D-05 에 반영.

| Option | Description | Selected |
|--------|-------------|----------|
| hub 키 단위 1회 | 키마다 마지막 가격 섹션·송신 시각, 프레임에 PRICE 통과 플래그, fanout 은 소켓 level 로만 거름 | ✓ |
| 소켓마다 판정 | fanout 이 소켓·키마다 마지막 송신 시각, 키×소켓 상태 | |

**User's choice:** hub 키 단위 1회

| Option | Description | Selected |
|--------|-------------|----------|
| FULL 과 같은 본문 | 웹 파서·상태 계약 무변경, 문제는 프레임 수였지 크기가 아님 | ✓ |
| 축약 프레임(칩 필드만) | 새 프레임 타입, shared 타입·웹 리듀서·테스트 증가 | |

**User's choice:** FULL 과 같은 본문

---

## 사용자 DMA 세션 역할·수명

| Option | Description | Selected |
|--------|-------------|----------|
| D-15 그대로 유지 | wss 인증 즉시 로그인·5분 유예, 종목 구독만 빠짐, 웹 변경 0 | ✓ |
| 지연 로그인 | 주문·전략·계좌 표면에서만 로그인, 시세만 보는 유저는 세션 없음 | |

**User's choice:** D-15 그대로 유지

| Option | Description | Selected |
|--------|-------------|----------|
| allowlist 유지 | dma_credentials 사용자만 구독, 시세 공개 확대는 별도 phase | ✓ |
| 로그인 사용자 전원에 시세 개방 | 기술적으로 가능하나 새 기능(공개 정책·상한 소비) | |

**User's choice:** allowlist 유지

---

## 구독·캐시 전역화 세부 + 전환

| Option | Description | Selected |
|--------|-------------|----------|
| 짧은 linger 후 해제 | 1→0 뒤 N초(10~30초) 유지, 탭 전환 시 재요청 없이 캐시로 | ✓ |
| 즉시 해제·캐시 삭제(현행) | 가장 단순, 탭 전환마다 3프레임 재요청 | |
| 즉시 해제·캐시 보관 | 구독은 끊고 스냅샷만 보관, 오래된 값 잠시 노출 | |

**User's choice:** 짧은 linger 후 해제

| Option | Description | Selected |
|--------|-------------|----------|
| 거부 + 배지·healthz | 새 키 거부 + 소켓 오류 상태 프레임 + healthz 카운터, linger 키 먼저 해제 | ✓ |
| LRU 축출 | 오래 안 본 키를 끊고 새 키 수용, 누군가의 호가창이 예고 없이 멈춤 | |

**User's choice:** 거부 + 배지·healthz

| Option | Description | Selected |
|--------|-------------|----------|
| 빅뱅 전환 | 19 D-14 선례, per-user 구독 코드 제거, 롤백은 이전 relay 이미지 | ✓ |
| env 플래그 병존 | QUOTE_FEED_MODE 로 두 경로 한 릴리스 유지, 정리 quick 필요 | |

**User's choice:** 빅뱅 전환

| Option | Description | Selected |
|--------|-------------|----------|
| 분담 — relay 첫 plan + gh-trade 세션 | relay 관점 수치는 relay 로그/healthz, 서버 측은 gh-trade 세션 의뢰 | |
| 전부 gh-trade 세션에 의뢰 | 서버 프로세스에서 다 재고 결과만 받음 | |
| 기준선 생략 | ROADMAP 「착수 전 실측」 조항을 내림, 전후 비교 근거 없음 | ✓ |

**User's choice:** 기준선 생략

---

## Claude's Discretion

- quote 세션 구현 형태(observer.ts 재사용/파생) · 78 원천 통일 · hub 키 전환·캐시 전역화·세션 교체 규칙 · tape ring 깊이 · 83/82 라우팅.
- linger 값 · 재구독 페이싱 · PRICE 판정기 자료구조 · 상태 프레임/healthz 필드 이름 · 배지 문구.
- 사용자 세션 stalled 판정 재설계 여부 · `resubscribeAll` noop 처리.
- webapp 변경 범위 최소화(배지 2축 + 상태 프레임 + 구독 한도 오류).
- 테스트 시나리오 설계(mock 게이트웨이 quote 역할 · 유저 2명 같은 종목 · PRICE/FULL 혼합).

## Deferred Ideas

- dma_credentials 없는 사용자에게 시세 개방 — 별도 phase.
- env 플래그 per-user/shared 병존 — 기각.
- 착수 전 기준선 실측 — 내림.
- 127(교보) quote 세션 — 후속.
- 사용자 세션 지연 로그인 — 기각.
