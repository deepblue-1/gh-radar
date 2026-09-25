# Phase 21: GH Trade 모바일 앱 (Capacitor) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-25
**Phase:** 21-gh-trade-mobile-app
**Areas discussed:** 사전 아키텍처 4건, 탭 목적지와 앱 안 웹 셸, 탭바 표시 규칙, 새로고침 세부, 앱 정체성·시스템 연동

---

## 사전 아키텍처 (phase 추가 전 확정)

### 탭바 구현 위치
| Option | Description | Selected |
|--------|-------------|----------|
| 웹(React)에서 구현 | webapp 한 벌, Capacitor 감지 시에만 표시, 토스 토큰·라우트 판정 재사용 | |
| 네이티브(Swift+Kotlin) | weekly-wine 방식 이식, 로드 전에도 표시, 두 벌 유지 | ✓ |

### 앱 로그인
| Option | Description | Selected |
|--------|-------------|----------|
| 네이티브 Google Sign-In + signInWithIdToken | 소셜로그인 플러그인 → id_token → Supabase 교환 | ✓ |
| WebView UA 위장 | overrideUserAgent 만, Google 정책 위반 | |
| 나중에 결정 | 로그인 분리 | |

### pull-to-refresh 동작
| Option | Description | Selected |
|--------|-------------|----------|
| 네이티브 제스처 → 웹 refresh 훅, 없으면 reload | 페이지별 훅 등록, 트레이딩은 relay 재탐침 | ✓ |
| 네이티브 제스처 → 무조건 reload | weekly-wine 그대로 | |

### 저장 위치
| Option | Description | Selected |
|--------|-------------|----------|
| gh-radar 모노레포 mobile/ | 웹 브리지 코드와 한 커밋 | ✓ |
| 별도 저장소 gh-trade-app | weekly-wine-app 구조 | |

---

## 탭 목적지와 앱 안 웹 셸

### 검색 탭 목적지
| Option | Description | Selected |
|--------|-------------|----------|
| 전용 /search 페이지 신설 | 검색 입력 + 상승률상위·테마·관심종목 진입 카드 | ✓ |
| 기존 ⌘K 다이얼로그 열기 | JS 주입, 새 페이지 없음 | |
| /watchlist 로 이동 | 관심종목이 목적지 | |

### 마이 탭 구성
| Option | Description | Selected |
|--------|-------------|----------|
| /me 상단에 계정 카드 추가 | 아바타·이름·이메일·테마 토글·로그아웃, 웹도 동일 | ✓ |
| 앱에서만 계정 카드 | Capacitor 감지 시에만 | |
| 별도 /settings 신설 | 페이지 추가 | |

### 햄버거·사이드바 드로어
| Option | Description | Selected |
|--------|-------------|----------|
| 앱에서 햄버거 숨김, 로고+검색만 | 탭바로 대체 | |
| 햄버거 유지 (웹과 동일) | 드로어의 전략 바로가기 접근 유지 | ✓ |
| 헤더 자체 숨김 | 본문만 | |

### AI FAB (종목상세)
| Option | Description | Selected |
|--------|-------------|----------|
| 탭바 위로 올려 유지 | 오프셋만 조정 | |
| FAB 숨기고 AI 탭이 종목 컨텍스트 이어받기 | /chat?code= | |
| 앱에서는 FAB 숨김만 | 종목 대화는 종목상세 안 버튼(ChatSheet) | ✓ |

**Notes:** AI 탭 = /chat 이동은 질문 전제로 수용됨.

---

## 탭바 표시 규칙

### 숨김 상황
| Option | Description | Selected |
|--------|-------------|----------|
| 로그인 화면 + 웹 「오버레이 열림」 신호 | 바텀시트·키패드·드로어 열림 시 페이드아웃 | ✓ |
| 로그인 화면에서만 | URL 기반만 | |
| 로그인 + 트레이딩 전체 | 본문 공간 최대 | |

### iPad 넓은 폭
| Option | Description | Selected |
|--------|-------------|----------|
| 폭 1024 이상이면 탭바 숨김 | 사이드바가 내비 담당 | |
| 항상 탭바 표시 | 중복 허용 | |
| 앱에서는 사이드바 항상 숨기고 탭바만 | 햄버거 드로어로 대체 | ✓ |

### 활성 탭 판정 (비매칭 경로)
| Option | Description | Selected |
|--------|-------------|----------|
| 모두 비활성 (weekly-wine 방식) | 정확 매칭만 활성 | ✓ |
| 종목상세·테마상세는 검색 탭 활성 | 탐색 결과 화면 | |
| 직전 활성 탭 유지 | 진입 경로 기억 | |

### 아이콘 체계
| Option | Description | Selected |
|--------|-------------|----------|
| 웹과 동일 lucide 벡터 내장 | 한 브랜드 | |
| 각 OS 기본 (SF Symbols / Material) | OS 자연스러움, filled 기본 제공 | ✓ |

---

## 새로고침 세부

### relay 기반 화면(/trading·/me)
| Option | Description | Selected |
|--------|-------------|----------|
| relay 재탐침 + 스냅샷 재요청 | resume probe 강제 실행 | ✓ |
| 제스처 비활성 | 훅이 미지원 통보 | |
| 전체 reload | 편집 상태 유실 가능 | |

### 스피너 종료
| Option | Description | Selected |
|--------|-------------|----------|
| 훅 Promise 완료 시, 최소 0.6s·최대 8s | 실제 완료에 맞춤 | |
| 고정 1초 (weekly-wine 방식) | 단순 | ✓ |

### 종목상세 새로고침 범위
| Option | Description | Selected |
|--------|-------------|----------|
| 시세·차트·통계 캐시만, 뉴스·토론은 캐시 재읽기 | 외부 API 호출 유발 없음 | ✓ |
| 뉴스 수동 새로고침 포함(스로틀) | 사용자 수 비례 외부 호출 경로 추가 | |

### 오프라인
| Option | Description | Selected |
|--------|-------------|----------|
| 내장 오프라인 화면 + 자동 복구 | weekly-wine www/index.html 방식 | ✓ |
| WebView 기본 에러 화면 | 별도 처리 없음 | |

---

## 앱 정체성·시스템 연동

### appId
| Option | Description | Selected |
|--------|-------------|----------|
| io.jx1.trade | 운영 도메인 역순 | |
| io.jx1.ghtrade | 브랜드명 | |
| com.ghtrade.app | 도메인 독립 | ✓ |

### 아이콘·스플래시
| Option | Description | Selected |
|--------|-------------|----------|
| Claude 가 레이더 모티프로 새로 그림 | 시안 2개, @capacitor/assets | ✓ |
| 사용자가 이미지 제공 | | |
| 현 레이더 SVG 확대 | 순흑 바탕 | |

### 테마 연동
| Option | Description | Selected |
|--------|-------------|----------|
| 웹 토글을 네이티브가 따라가기 | 메시지로 상태바·바탕·탭바 전환, 마지막 값 저장 | ✓ |
| OS 설정을 네이티브·웹이 따르기 | 웹 정책과 갈림 | |
| 앱은 항상 다크 | | |

### 회전
| Option | Description | Selected |
|--------|-------------|----------|
| 폰 세로 고정, iPad 전방향 | Split View 허용 | ✓ |
| 폰·iPad 모두 전방향 | weekly-wine 방식 | |

---

## Claude's Discretion

- 탭바 UI 프레임워크(UIKit/View 권장) · 메시지 스키마 · refresh 레지스트리 API 이름
- Android 내부 스크롤 영역 제스처 충돌 처리
- 로그인 화면 앱 분기 문구·세션 만료 흐름
- 소셜로그인 플러그인 최종 선택(Capacitor 8 · nonce 지원)
- Capacitor/iOS/Android 최소 버전, 로컬 dev `server.url` 분리 방식

## Deferred Ideas

- 푸시 알림(v2 NOTF-*), 딥링크/유니버설 링크, 스토어 제출·fastlane, 사이드바 IA 재편, AI 탭 종목 컨텍스트 이어받기, 웹 모바일 탭바
