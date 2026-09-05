# Phase 15: DMA 중계 서버(relay) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-05
**Phase:** 15-dma-relay-kb-gh-trade-server-10-wss
**Areas discussed:** 범위·분할, 배포 토폴로지, 인증·접속 권한, 주문 안전장치, 세션 모델(후속)
**전제:** 인계 문서 `tasks/relay-handoff.md` 는 "재검토 금지" 였으나 사용자 지시("확정된 건 없으니 검토도 다시")로 전면 재검토. 사전 실측: GCP VM/방화벽/DNS 존 없음, VPC·고정IP(NAT 용)만 존재, 서버는 Direct VPC Egress, JWT 는 `supabase.auth.getUser`, 웹앱 호가 컴포넌트 없음, gh-trade 준비물(sync 스크립트·fbs·flatc 25.12.19) 확인.

---

## 범위·분할

| Option | Description | Selected |
|--------|-------------|----------|
| 분리: 15=시세, 16=주문 | 읽기 전용으로 15 마무리, 주문은 16 (권장안) | |
| 한 phase에 시세+주문 | 핸드오프 그대로 | ✓ |
| 시세만, 주문은 미정 | 주문은 deferred 아이디어로만 | |

**User's choice:** 한 phase에 시세+주문

| Option | Description | Selected |
|--------|-------------|----------|
| 종목상세에 호가창 섹션 포함 | 목업→UI-SPEC→구현까지 이 phase (권장안) | ✓ |
| 검증용 최소 페이지만 | raw JSON 수준 /dev/quote | |
| relay만, UI 없음 | wscat 검증만 | |

**User's choice:** 종목상세에 호가창 섹션 포함

| Option | Description | Selected |
|--------|-------------|----------|
| VM+relay 배포까지, VPN은 KB 확인 후 | VPN 비활성 상태로 배포, mock 업스트림 검증 (권장안) | |
| 로컬 mock까지만, 배포는 별도 | 코드·스크립트·문서만 | |
| 실서버 연결까지 이 phase | KB 확인이 phase 중 끝난다고 가정 | |

**User's choice:** (Other) "kbs124로 하면되고, 진행하기전에 OpenConnect으로 VPN 연결해서 연결이 되는지, IP 제한이 있는지 검증하고 진행하는게 좋겠어."
**Notes:** KB 확인 대기 대신 kbs124 계정으로 VM 에서 VPN 연결·IP 제한 선검증을 초기 게이트로 채택(D-03). 계정 잠금 방지를 위해 시도 횟수 제한·자동 재시도 금지는 Claude 가 보강.

| Option | Description | Selected |
|--------|-------------|----------|
| 호가 10단 + 체결 테이프, KRX+NXT | 거래원 제외 (권장안) | ✓ |
| 호가 10단만, KRX만 | 최소 범위 | |
| 호가 + 체결 + 거래원, KRX+NXT | 전부 팬아웃 | |

**User's choice:** 호가 10단 + 체결 테이프, KRX+NXT

---

## 배포 토폴로지

| Option | Description | Selected |
|--------|-------------|----------|
| VM 직접 wss + Caddy TLS | 도메인 필요, Cloud Run 무변경 (권장안) | ✓ |
| Cloudflare Tunnel | 공인 포트 0, Cloudflare 계정·도메인 위임 필요 | |
| Cloud Run WS 프록시 | 도메인 불필요, 활성 과금 + 60분 타임아웃 | |

**User's choice:** VM 직접 wss + Caddy TLS

| Option | Description | Selected |
|--------|-------------|----------|
| sslip.io 자동 도메인 | 설정 0, 외부 의존 (당장은 권장) | |
| 새 도메인 구매 + Cloud DNS | 연 $10~15 | |
| 보유 도메인 서브도메인 | Other 에 도메인 기재 | ✓ |

**User's choice:** (Other) "jx1.io 라는 도메인이 있어. 여기에 A레코드 추가해서 쓰자."

| Option | Description | Selected |
|--------|-------------|----------|
| e2-micro + Docker relay + host openconnect | 핸드오프 그대로, swap 추가 (권장안) | ✓ |
| e2-small 여유분 | 2GB, 월 $7 더 | |
| Docker 없이 systemd node 직접 | dockerd 절약, 배포 패턴 이탈 | |

**User's choice:** e2-micro + Docker relay + host openconnect

| Option | Description | Selected |
|--------|-------------|----------|
| Cloud Run REST → VM 내부 HTTP | 핸드오프 안, 기존 requireAuth·로그 재사용 (권장안) | ✓ |
| 같은 wss로 주문도 전송 | Cloud Run 무변경, relay 가 감사·기록 전담 | |

**User's choice:** Cloud Run REST → VM 내부 HTTP

---

## 인증·접속 권한

| Option | Description | Selected |
|--------|-------------|----------|
| supabase.auth.getUser 네트워크 검증 | 서버 동일 패턴, revoke 반영 (권장안) | ✓ |
| JWKS 로컬 검증 (jose) | 핸드오프 안, 비대칭 키 전제 | |

**User's choice:** supabase.auth.getUser 네트워크 검증

| Option | Description | Selected |
|--------|-------------|----------|
| 연결 후 첫 메시지로 auth | 로그에 토큰 미노출 (권장안) | ✓ |
| 쿼리스트링 ?token= | 단순, 로그 노출 | |
| Sec-WebSocket-Protocol 편법 | 규약 오용 | |

**User's choice:** 연결 후 첫 메시지로 auth

| Option | Description | Selected |
|--------|-------------|----------|
| 시세=전 로그인, 주문=allowlist | (권장안) | |
| 시세·주문 모두 allowlist | 5명 제한, 비허용자는 '권한 없음' | ✓ |
| 모두 전 로그인 사용자 | 비권장 | |

**User's choice:** 시세·주문 모두 allowlist

| Option | Description | Selected |
|--------|-------------|----------|
| relay.jx1.io | (권장안) | |
| radar-gw.jx1.io | VM 이름 일치 | |
| dma.jx1.io | 짧음 | ✓ |

**User's choice:** dma.jx1.io

---

## 주문 안전장치

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 계좌, env에서 주입 | RELAY_ACCOUNT_NO 하나 (권장안) | |
| 사용자별 계좌 매핑 테이블 | Supabase user→account_no | |

**User's choice:** (Other) "supabase 에 매핑이 있어야해. 어차피 dma server에 접속하려면 아이디/비밀번호(지금 작업중)를 입력해야 하고, gh-radar는 gmail 로 로그인 하니까 gmail-dma user id/pwd로 매핑을 해야해. user id/pwd로 로그인하면 dma server가 계좌목록 줄거니까 그걸 사용하면 되고."
**Notes:** 핸드오프 전제(단일 radar 계정·비밀번호 미검사)를 뒤집는 답변. gh-trade Phase 17(users.toml 인증 + LoginResp.accounts) 계약을 확인하고 '세션 모델' 후속 영역으로 이어감.

| Option | Description | Selected |
|--------|-------------|----------|
| 1회 금액 상한 + 일일 누적 상한 | env 주입 (권장안) | |
| 1회 금액 상한만 | | |
| 한도 없음 | 웹앱 확인 다이얼로그 + 형식 검사만 | ✓ |

**User's choice:** 한도 없음

| Option | Description | Selected |
|--------|-------------|----------|
| 신규 매수/매도 + 취소, 지정가 보통만 | 정정은 취소+재주문 (권장안) | ✓ |
| 신규 + 정정 + 취소, 지정가 보통 | 핸드오프 전부 | |
| 신규만 | 비권장 | |

**User's choice:** 신규 매수/매도 + 취소, 지정가 보통만

| Option | Description | Selected |
|--------|-------------|----------|
| 접수는 REST 응답, 이후 통보는 wss + Supabase 기록 | 잔고·미체결 전체는 deferred (권장안) | |
| 계좌 상태(잔고·미체결)도 팬아웃 | AccountState 66/67 스냅샷+델타, 범위 확대 | ✓ |
| 파일 로그만, DB 기록 없음 | 핸드오프 그대로 | |

**User's choice:** 계좌 상태(잔고·미체결)도 팬아웃
**Notes:** 접수 REST 응답 + 이후 통보 wss + Supabase `dma_orders` 기록은 권장안 요소로 함께 채택(D-22/D-24).

---

## 세션 모델 (후속 — 계좌 매핑 답변에서 파생)

| Option | Description | Selected |
|--------|-------------|----------|
| 사용자별 DMA 세션 1개 | 매핑된 id/pwd 로 별도 TCP 세션, 세션당 참조계수 (권장안) | ✓ |
| 시세 공용 세션 + 사용자별 주문 세션 | 세션 종류 2개, gh-trade 계좌 0건 예외 필요 | |

**User's choice:** 사용자별 DMA 세션 1개

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase 테이블 + 서버측 AES, 관리자 수기 등록 | dma_credentials, Secret Manager 키 (권장안) | ✓ |
| 웹앱 설정 페이지에서 사용자 직접 입력 | UI+라우트 추가 | |
| VM env/파일에 매핑 | DB 미사용 | |

**User's choice:** Supabase 테이블 + 서버측 AES 암호화, 관리자 수기 등록

| Option | Description | Selected |
|--------|-------------|----------|
| wss 첫 연결 시 로그인, 마지막 연결 종료 후 유예 후 로그아웃 | 주문 REST 는 세션 없으면 409 (권장안) | ✓ |
| relay 부팅 시 전원 상시 로그인 | 계정 잠금 위험 상시 | |
| 주문 REST도 세션 없으면 즉시 로그인 | 유연, 지연·실패 경로 증가 | |

**User's choice:** wss 첫 연결 시 로그인, 마지막 연결 종료 후 유예 후 로그아웃

| Option | Description | Selected |
|--------|-------------|----------|
| 병행: 15 초반은 지금, 로그인·계좌는 17 후 재동기화 | 의존 게이트 명시 (권장안) | ✓ |
| gh-trade 17 먼저 완료 후 15 실행 | 대기 발생 | |

**User's choice:** 병행

---

## Done 게이트

| Option | Description | Selected |
|--------|-------------|----------|
| 논의 끝, CONTEXT 작성 | UI 세부는 목업, 장애·알림은 Claude 재량 (권장안) | ✓ |
| 장애·알림 UX 논의 | | |
| 호가창 UI 배치 논의 | | |

**User's choice:** 논의 끝, CONTEXT 작성

## Claude's Discretion

- wss 메시지 스키마·상태 프레임·구독 프로토콜, shared 타입 공유
- 토큰 만료 처리, 재접속 백오프·상한, 세션 유예 시간, 스냅샷 캐시 TTL
- 장애·알림 UX(VPN/DMA 단절 표시, systemd 재시도 상한, 알림 정책) — 무한 재시도 금지만 고정
- relay 모듈 구조·로거·헬스, dma_orders/dma_credentials 스키마, AES 세부, 등록 스크립트
- VM 프로비저닝 세부(Caddyfile, swap, openconnect 유닛), IAM
- 호가창 UI 세부(목업→UI-SPEC), Cloud Run relay 내부 URL/타임아웃

## Deferred Ideas

- 거래원(MemberStats) 팬아웃 / 정정·IOC/FOK·시장가 / 서버측 주문 한도 / 웹앱 자격증명 입력 UI / 공용 시세 세션 2단 모델 / 주문 REST 즉시 로그인 / JWKS 로컬 검증 / Cloudflare Tunnel / 토큰 주기 재인증 / GetSymbolMasterReq 기반 nxt_tradable 표시
