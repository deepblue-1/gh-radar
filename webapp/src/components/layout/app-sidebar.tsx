"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  Home,
  Layers,
  MessageSquare,
  Search,
  Star,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";

import { ExchangeTag } from "@/components/trading/exchange-tag";
import {
  LATCH_LED_NAMES,
  latchLedStateOf,
  type LatchLedKind,
  type LatchLedTone,
} from "@/components/trading/latch-led";
import { useAuth } from "@/lib/auth-context";
import { useIsinLabels } from "@/lib/isin-labels";
import { exchangeLabeledName, isActiveStrategy } from "@/lib/limit-chaser";
import { useRelayContext } from "@/lib/relay-provider";
import { requestTradingFocus } from "@/lib/trading-focus";
import { cn } from "@/lib/utils";
import type { RelayExchange, RelayLimitChaser } from "@gh-radar/shared";

import { ThemeToggle } from "./theme-toggle";
import { UserSection } from "./user-section";

/**
 * AppSidebar — 16-UI-SPEC §Component Inventory N1~N7 (Phase 16 NAV-01 · D-15~D-19).
 * 시각 정본은 사용자 승인 목업 `16-mypage-sidebar-mockup.html` 이다 (D-24).
 *
 * 트리 (2단 + 트레이딩 3단 — Phase 18 D-03 이 트레이딩 그룹을 다시 짰다):
 *   홈 · [종목검색] 상승률 상위 / 테마 / 관심종목
 *   · [트레이딩 = `/trading` 링크] VI(가동 거래소 태그만 · 둘 다 꺼지면 없음) / 등록된 상따 전략 N개
 *   · My page · AI 애널리스트
 *
 * ① 「종목검색」 소제목은 `<li>` 다 — **링크도 버튼도 아니다**
 *    D-16 이 「클릭 불가 · 항상 펼침 · 접기 상태 저장 없음」을 못박은 것도 있지만, 더
 *    직접적인 이유는 `app-shell.tsx` 의 모바일 drawer 자동 닫힘이다. 그 훅은 클릭 지점에서
 *    조상을 거슬러 올라가며 `A` 또는 `BUTTON[data-nav-item]` 을 만나면 닫는다. 소제목을
 *    버튼으로 만드는 순간 **그룹명을 눌렀을 뿐인데 drawer 가 닫힌다**.
 *    「트레이딩」 제목만 예외로 **링크**다(D-03) — 누르면 실제로 `/trading` 으로 이동하므로
 *    drawer 가 닫히는 것이 맞는 동작이다. 그룹은 여전히 항상 펼침이다(D-16).
 *
 * ② 활성 판정은 **정확 일치**다 (접두 일치가 아니다)
 *    `/trading` 의 활성 표시는 제목 **하나**가 받는다. 3단 항목(VI 0~1 · 전략 N)은 모두 같은
 *    작업대를 가리키므로 활성 표시를 받지 않는다 — 여러 줄이 함께 켜지면 「지금 어디」가
 *    사라진다. `usePathname()` 은 쿼리를 싣지 않으므로 `/trading?focus=…` 에서도 제목이 켜진다.
 *
 * ③ 전략 키는 `encodeURIComponent` 로 인코딩한다
 *    키가 `{ISIN}:{accountNo}:{exchange}` 라 `:` 를 품는다. `?focus=` 쿼리 값으로 옮길 때도
 *    인코딩한다 — 옛 `/trading/limit-chaser/{key}` 리다이렉트가 같은 규율로 재인코드한다.
 *    경로 비교(`samePath`)는 양쪽을 디코드해서 본다 — `usePathname()` 이 브라우저·서버에서
 *    인코딩 상태가 갈릴 수 있어 문자열 동일성만으로는 활성 표시가 조용히 죽는다.
 *
 * ④ 조건부 숨김 (N4 / D-19) — **UI 숨김은 권한이 아니다**
 *    숨김은 오진입을 줄이는 편의일 뿐이고 실제 차단은 relay 의 `unauthorized` 와 각 라우트의
 *    `<DmaGate>` 가 한다(T-16-04). 직접 URL 로는 여전히 들어올 수 있다.
 *
 * ⑤ 깜빡임 규율 — 숨긴 채로 시작하고, 한 번 뜬 뒤에는 재접속으로 사라지지 않는다
 *    「연결 중」에 미리 보여줬다 감추면 사용자는 메뉴가 사라지는 것을 본다. 그래서 판정 전에는
 *    **숨긴 상태로 시작**해 `ready` 수신 후 나타난다(UI-SPEC §사이드바·라우팅).
 *    반대편도 같은 값을 지킨다 — 재접속 중에는 이미 뜬 그룹을 **내리지 않는다**.
 *    `use-relay-socket.ts` 의 close 처리도 같은 이유로 데이터를 지우지 않고 `isStale` 만
 *    세운다("데이터를 지우지 않는다 — isStale 만 세운다"). 목록은 그대로 있는데 메뉴만
 *    사라지는 상태를 만들지 않기 위해 `everReady` 래치를 둔다. 로그아웃·`unauthorized` 는
 *    래치를 **되돌린다** — 그 둘은 깜빡임이 아니라 권한 상실이다.
 */

type NavIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** 링크 1건. 소제목은 이 모양을 쓰지 않는다(링크가 아니므로). */
interface NavLeaf {
  href: string;
  label: string;
  icon: NavIcon;
}

const NAV_HOME: NavLeaf = { href: "/", label: "홈", icon: Home };

/** 「종목검색」 그룹 — 로그인·매핑과 무관하게 **항상** 보인다(N4). */
const NAV_SEARCH_GROUP: NavLeaf[] = [
  // D-15: `/scanner` 라벨만 「상승률 상위」로 바뀌고 URL 은 그대로다.
  { href: "/scanner", label: "상승률 상위", icon: TrendingUp },
  { href: "/themes", label: "테마", icon: Layers },
  { href: "/watchlist", label: "관심종목", icon: Star },
];

/** 「트레이딩」 그룹 제목 = `/trading` 작업대 링크 (D-03). 개별 「상따」·「VI」 메뉴는 없다. */
const NAV_TRADING: NavLeaf = { href: "/trading", label: "트레이딩", icon: Zap };

/** VI 줄 태그의 거래소 순서 — KRX 먼저(목업 `.asb` 순서 승계). */
const VI_TAG_ORDER: readonly RelayExchange[] = ["KRX", "NXT"];

const NAV_ME: NavLeaf = { href: "/me", label: "My page", icon: User };
const NAV_CHAT: NavLeaf = { href: "/chat", label: "AI 애널리스트", icon: MessageSquare };

/**
 * 전략 1건의 경로 — `/trading` 작업대에서 그 카드를 펼친다. 키의 `:` 때문에 인코딩이 **필수**다(위 ③).
 *
 * ★ 이름은 옛 상따 편집 화면 시절 그대로다(Phase 18 D-03). 본문만 바꿔 호출부 2곳(사이드바 전략
 *   항목 · My page 전략 현황 카드)이 무수정으로 산다.
 */
export function limitChaserHref(key: string): string {
  return `/trading?focus=${encodeURIComponent(key)}`;
}

/** LED 3점 순서 — 카드 헤더의 LED 칩과 같은 순서다. */
const LED_KINDS: readonly LatchLedKind[] = ["buy", "sell", "cancel"];

/**
 * LED 3점 묶음의 텍스트 대체물 — 「매수 감시 · 매도 OFF · 취소 대기」. 색 없이도 상태가 읽히는
 * 유일한 축이다. 판정은 `latchLedStateOf` 그대로 부른다(다시 쓰지 않는다).
 */
export function strategyLedLabel(item: RelayLimitChaser): string {
  return LED_KINDS.map(
    (kind) => `${LATCH_LED_NAMES[kind]} ${latchLedStateOf(kind, item).label}`,
  ).join(" · ");
}

/**
 * 3단 전략 항목의 표시 이름 (E16 partial) — 전략의 `name` → 계좌 역매핑 이름 → 단축코드 → ISIN.
 * 빈 문자열은 없는 것으로 본다. 폴백 체인 뒤에 NXT 전략이면 「· NXT」 꼬리가 붙는다 — 같은 종목
 * KRX·NXT 두 전략을 가른다(`exchangeLabeledName` · 18-REVIEW-R2 GC-IN-04 · D-03). KRX 는 이름만이다.
 */
function strategyDisplayName(item: RelayLimitChaser, labelName: string | undefined): string {
  const base = [item.name, labelName, item.code].find((s) => s != null && s !== "") ?? item.isin;
  return exchangeLabeledName(base, item.exchange);
}

/**
 * 경로 동일성. 인코딩 차이를 흡수하되 **접두 일치는 하지 않는다**(위 ②).
 * 디코드가 실패하는 경로(잘린 `%`)는 원문 비교 결과를 그대로 쓴다.
 */
function samePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  try {
    return decodeURIComponent(pathname) === decodeURIComponent(href);
  } catch {
    return false;
  }
}

const LINK_BASE =
  "flex items-center gap-2 rounded-[var(--r)] px-3 py-2 text-[length:var(--t-sm)]";
const LINK_IDLE =
  "text-[var(--muted-fg)] hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)] hover:text-[var(--fg)]";
// B 사이드바 `a.on` = raised 면 (260924-vj1)
const LINK_ACTIVE = "bg-[var(--muted)] text-[var(--fg)] font-semibold";

/** 2·3단 들여쓰기 — 목업 `.side ul ul` (margin-left 12 + 좌측 hairline + padding-left 8). */
const SUB_LIST =
  "m-0 mt-1 ml-3 flex list-none flex-col gap-1 border-l border-[var(--border)] p-0 pl-2";

function NavLink({
  item,
  active,
  children,
}: {
  item: NavLeaf;
  active: boolean;
  children?: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-nav-item
      className={cn(LINK_BASE, active ? LINK_ACTIVE : LINK_IDLE)}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {children}
    </Link>
  );
}

/**
 * 그룹 소제목. 기본은 `<li>` + 시각 스타일만 — 링크·버튼으로 만들지 않는다(위 ①).
 * `item` 을 주면 **링크로 승격**한다(「트레이딩」 → `/trading`, D-03).
 *
 * ★ 글꼴은 다른 메뉴와 **같은 14px**(`--t-sm`)이다 (260912-k2x). 11px 하드코딩이던 시절에는
 *   「종목검색」·「트레이딩」만 메뉴보다 작아 사이드바 안에서 혼자 다른 축을 썼다.
 * ★ `font-semibold` 는 링크일 때도 **그대로 둔다** — 제목이 링크가 돼도 그룹 제목이라는 위계는
 *   남아야 한다. 링크 쪽 색·활성 표시는 `NavLink` 와 같은 `LINK_ACTIVE`/`LINK_IDLE` 조합이다.
 */
function GroupHeading({
  label,
  icon: Icon,
  item,
  active = false,
}: {
  label: string;
  icon: NavIcon;
  item?: NavLeaf;
  active?: boolean;
}) {
  if (item !== undefined) {
    return (
      <li>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          data-nav-item
          className={cn(
            LINK_BASE,
            "font-semibold tracking-[0.02em]",
            active ? LINK_ACTIVE : LINK_IDLE,
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </Link>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 px-3 pt-2 pb-1 text-[length:var(--t-sm)] font-semibold tracking-[0.02em] text-[var(--muted-fg)]">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </li>
  );
}

/** 3단 항목 공통 모양 — 목업 `.asb div.s3`. 활성 표시는 받지 않는다(위 ②). */
const SUB_ITEM =
  "flex items-center gap-2 rounded-[var(--r)] p-2 text-[length:var(--t-sm)] font-semibold";

/**
 * 3단 VI 줄 — 「VI」 한 줄 + 오른쪽에 **가동 중인 거래소의 태그만** (quick-260923-dmb · D1).
 * 누르면 작업대(VI 설정이 있는 곳)로 간다. 활성 표시는 받지 않는다(위 ②).
 *
 * ★ 판정은 **거래소별**이다(`viTriggers.KRX`/`.NXT` 각각의 `run === true`). 합집합 판정
 *   (`viAnyRunning`)으로는 어느 거래소가 켜졌는지 말할 수 없다.
 * ★ 태그 순서는 KRX → NXT(`VI_TAG_ORDER`). 모름(키 부재)·미등록(`null`)·중지는 태그가 없다.
 * ★ 가동 거래소가 하나도 없으면 이 줄 자체를 그리지 않는다 — 호출부가 `running.length > 0`
 *   일 때만 렌더한다(숨김이 아니라 미렌더).
 * ★ 접근 이름은 「VI — KRX·NXT 가동」 꼴(`aria-label`)이다. 보이는 글자 「VI」가 이름 맨 앞에
 *   있어 WCAG 2.5.3 Label-in-Name 을 충족하고, 태그 묶음은 이름이 이미 말하므로 `aria-hidden` 이다.
 */
function ViItem({ running }: { running: readonly RelayExchange[] }) {
  return (
    <Link
      href={NAV_TRADING.href}
      data-nav-item
      data-sidebar-item="vi"
      aria-label={`VI — ${running.join("·")} 가동`}
      className={cn(SUB_ITEM, LINK_IDLE)}
    >
      {/* 글자색은 전략 항목과 같은 `--fg` — 목업 `.s3` 는 3단 항목을 한 색으로 쓴다. */}
      <span className="min-w-0 flex-1 truncate text-[var(--fg)]">VI</span>
      <span aria-hidden="true" className="ml-auto inline-flex shrink-0 items-center gap-1">
        {running.map((ex) => (
          <ExchangeTag key={ex} exchange={ex} />
        ))}
      </span>
    </Link>
  );
}

/** LED 점 색 — 목업 `.asb div.s3 .ld i`. 토큰은 클래스로만 쓴다(JS 로 값을 읽지 않는다). */
const LED_DOT_CLASS: Record<LatchLedTone, string> = {
  off: "bg-[var(--flat)]",
  latent: "bg-[var(--led-latent)]",
  armed: "bg-[var(--led-armed)]",
};

/**
 * 전략 3단 항목 — **종목명 + 우측 LED 3점(7px)뿐**이다 (N3 / N3a · Phase 18 D-03).
 *
 * 거래소 태그와 상태 배지 6종을 여기 두지 않는다. 240px 폭에서 종목명 + 태그 + 배지 2개는
 * 종목명을 3~4글자로 잘라먹었고, 사용자가 목업 리뷰에서 이 단순화를 확정했다. 상세 상태는
 * My page 전략 현황 행과 작업대 카드가 전부 보여준다.
 * LED 3점(7px × 3 + 간격 3px × 2 = 27px)은 옛 원 아이콘 2개(10px × 2 + 6px = 26px)와 같은 폭 예산
 * 안에 들어간다 — 종목명 몫을 더 빼앗지 않는다.
 *
 * ★ 누르면 링크는 `/trading?focus=` 로 가고, **동시에** 작업대에 포커스 요청을 보낸다. 작업대는
 *   `?focus=` 를 마운트 1회만 소비하므로, 이미 `/trading` 위라면 URL 만 바뀌고 카드가 펼쳐지지
 *   않는다 — 그 빈자리를 요청 이벤트가 채운다(`lib/trading-focus.ts`). 수식 키 클릭(새 탭)은
 *   지금 탭의 카드를 건드리지 않는다.
 */
function StrategyItem({ item, name }: { item: RelayLimitChaser; name: string }) {
  const ledLabel = strategyLedLabel(item);

  return (
    <Link
      href={limitChaserHref(item.key)}
      data-nav-item
      data-sidebar-item="strategy"
      data-strategy-key={item.key}
      onClick={(event) => {
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        requestTradingFocus(item.key);
      }}
      className={cn(SUB_ITEM, LINK_IDLE)}
    >
      <span title={name} className="min-w-0 flex-1 truncate text-[var(--fg)]">
        {name}
      </span>
      {/*
        LED 3점 묶음. 라벨은 **묶음에만** 단다 — 개별 점에 달면 스크린리더가 세 번 읽는다.
        판정은 `latchLedStateOf` 그대로다(카드 헤더 LED 칩과 같은 함수 — 둘이 갈리지 않는다).
      */}
      <span
        role="img"
        aria-label={ledLabel}
        title={ledLabel}
        className="ml-auto inline-flex shrink-0 items-center gap-[3px]"
      >
        {LED_KINDS.map((kind) => {
          const tone = latchLedStateOf(kind, item).tone;
          return (
            <span
              key={kind}
              aria-hidden="true"
              data-led={kind}
              data-tone={tone}
              className={cn("block size-[7px] shrink-0 rounded-full", LED_DOT_CLASS[tone])}
            />
          );
        })}
      </span>
    </Link>
  );
}

/**
 * 트레이딩 그룹 · My page 노출 여부 (위 ④⑤).
 * 반환 `true` 는 「보여도 된다」이지 「권한이 있다」가 아니다.
 */
function useTradingVisible(): boolean {
  const { user } = useAuth();
  const { status } = useRelayContext();
  const [everReady, setEverReady] = useState(false);

  useEffect(() => {
    if (user == null || status === "unauthorized") {
      // 권한 상실 — 래치를 되돌린다. 다음 사용자의 화면에 이전 상태가 남지 않는다.
      setEverReady(false);
      return;
    }
    if (status === "ready") setEverReady(true);
  }, [user, status]);

  if (user == null || status === "unauthorized") return false;
  // `status === "ready"` 를 따로 보는 이유: 첫 렌더에서 이미 ready 면 effect 를 기다리지 않는다.
  return status === "ready" || everReady;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { limitChasers, viTriggers } = useRelayContext();
  const tradingVisible = useTradingVisible();
  const labels = useIsinLabels();

  const isActive = (href: string) => samePath(pathname, href);
  // 거래소별 진실 — 가동(run === true)인 거래소만, KRX → NXT 순.
  const viRunning = VI_TAG_ORDER.filter((ex) => viTriggers[ex]?.run === true);
  /*
    사이드바에는 **켜진 전략**(`isActiveStrategy` — 매수·매도 스위치 또는 취소잔량)만 싣는다
    (사용자 결정 2026-09-23 개정 — 취소잔량만 켜진 전략도 싣는다). 서버는 무장이 풀린 전략을 지우지
    않으므로(삭제는 crud "D"·장 마감 정리뿐) 거르지 않으면 꺼진 전략이 쌓인다. 작업대와 같은 기준이다.
  */
  const sidebarChasers = limitChasers.filter(isActiveStrategy);

  return (
    <nav aria-label="주 메뉴" className="flex h-full flex-col justify-between">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        <li>
          <NavLink item={NAV_HOME} active={isActive(NAV_HOME.href)} />
        </li>

        <GroupHeading label="종목검색" icon={Search} />
        <li>
          <ul className={SUB_LIST}>
            {NAV_SEARCH_GROUP.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(item.href)} />
              </li>
            ))}
          </ul>
        </li>

        {tradingVisible && (
          <>
            <GroupHeading
              label={NAV_TRADING.label}
              icon={NAV_TRADING.icon}
              item={NAV_TRADING}
              active={isActive(NAV_TRADING.href)}
            />
            {/*
              3단 = VI 0~1줄 + 등록 전략 N개 (D-03 · E16 · quick-260923-dmb). 둘 다 없으면 3단 목록
              자체가 없다 — 빈 `ul` 은 스크린리더에 「목록 0개」로 읽히고 mt-1 빈 틈과 빈 hairline 을
              남긴다. 빈 문구는 없다 — 스냅샷 전(로딩)도 같은 모양이라 스피너가 없다. 전략 수 상한이
              없으므로 목록은 세로로 자연 확장하고 앱 셸이 스크롤한다. 작업대 카드 집합과 같은
              `limitChasers` 를 보므로 별도 동기화 없이 카드와 맞는다.
            */}
            {(viRunning.length > 0 || sidebarChasers.length > 0) && (
              <li>
                <ul className={SUB_LIST}>
                  {viRunning.length > 0 && (
                    <li>
                      <ViItem running={viRunning} />
                    </li>
                  )}
                  {sidebarChasers.map((item) => (
                    <li key={item.key}>
                      <StrategyItem
                        item={item}
                        name={strategyDisplayName(item, labels.get(item.isin)?.name)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            )}
            <li>
              <NavLink item={NAV_ME} active={isActive(NAV_ME.href)} />
            </li>
          </>
        )}

        <li>
          <NavLink item={NAV_CHAT} active={isActive(NAV_CHAT.href)} />
        </li>
      </ul>
      {/*
        하단 한 줄 — 유저 섹션과 테마 토글이 나란히 선다. 토글이 탑바를 떠나 여기로 왔다.
        `UserSection` 트리거의 `w-full` 은 이 래퍼 안에서만 늘어나므로 토글을 밀어내지 않는다.
        `user == null` 이면 `UserSection` 이 `null` 을 돌려주고 토글만 남는 것이 정상이다.
      */}
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <UserSection />
        </div>
        <ThemeToggle className="size-9 shrink-0" />
      </div>
    </nav>
  );
}
