"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  Gauge,
  Home,
  Layers,
  MessageSquare,
  Search,
  Star,
  Target,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";

import { StrategyBadge, viBadgeOf } from "@/components/trading/strategy-badge";
import { useAuth } from "@/lib/auth-context";
import { useRelayContext } from "@/lib/relay-provider";
import { cn } from "@/lib/utils";
import type { RelayLimitChaser } from "@gh-radar/shared";

import { UserSection } from "./user-section";

/**
 * AppSidebar — 16-UI-SPEC §Component Inventory N1~N7 (Phase 16 NAV-01 · D-15~D-19).
 * 시각 정본은 사용자 승인 목업 `16-mypage-sidebar-mockup.html` 이다 (D-24).
 *
 * 트리 (2단 + 전략 3단):
 *   홈 · [종목검색] 상승률 상위 / 테마 / 관심종목 · [트레이딩] 상따(+전략 3단) / VI
 *   · My page · AI 애널리스트
 *
 * ① 그룹 소제목은 `<li>` 다 — **링크도 버튼도 아니다**
 *    D-16 이 「클릭 불가 · 항상 펼침 · 접기 상태 저장 없음」을 못박은 것도 있지만, 더
 *    직접적인 이유는 `app-shell.tsx` 의 모바일 drawer 자동 닫힘이다. 그 훅은 클릭 지점에서
 *    조상을 거슬러 올라가며 `A` 또는 `BUTTON[data-nav-item]` 을 만나면 닫는다. 소제목을
 *    버튼으로 만드는 순간 **그룹명을 눌렀을 뿐인데 drawer 가 닫힌다**.
 *
 * ② 활성 판정은 **정확 일치**다 (접두 일치가 아니다)
 *    `/trading/limit-chaser/{key}` 를 보고 있을 때 2단 「상따」가 같이 켜지면 3단 항목과
 *    활성 표시가 겹쳐 「지금 어디」가 사라진다. 그래서 「상따」는 `/trading/limit-chaser/new`
 *    일 때만 `aria-current` 를 받는다(UI-SPEC §사이드바·라우팅).
 *
 * ③ 전략 키는 `encodeURIComponent` 로 인코딩한다
 *    키가 `{ISIN}:{accountNo}:{exchange}` 라 `:` 를 품는다. 인코딩하지 않으면 경로 세그먼트가
 *    깨진다. 비교할 때는 양쪽을 디코드해서 본다 — `usePathname()` 이 브라우저·서버에서
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

/** 「상따」 2단 항목 = **새 전략 빈 폼**. 목록 항목과 활성 표시가 겹치지 않는다(위 ②). */
const NAV_LIMIT_CHASER: NavLeaf = {
  href: "/trading/limit-chaser/new",
  label: "상따",
  icon: Target,
};

const NAV_VI: NavLeaf = { href: "/trading/vi", label: "VI", icon: Gauge };
const NAV_ME: NavLeaf = { href: "/me", label: "My page", icon: User };
const NAV_CHAT: NavLeaf = { href: "/chat", label: "AI 애널리스트", icon: MessageSquare };

/** 전략 3단 항목의 경로. 키의 `:` 때문에 인코딩이 **필수**다(위 ③). */
export function limitChaserHref(key: string): string {
  return `/trading/limit-chaser/${encodeURIComponent(key)}`;
}

/** 원 아이콘 묶음의 텍스트 대체물. 색·형태 없이도 상태가 읽히는 유일한 축이다. */
export function strategyIoLabel(buyOn: boolean, sellOn: boolean): string {
  return `매수 ${buyOn ? "켜짐" : "꺼짐"} · 매도 ${sellOn ? "켜짐" : "꺼짐"}`;
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
const LINK_ACTIVE = "bg-[var(--accent)] text-[var(--accent-fg)] font-semibold";

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

/** 그룹 소제목. `<li>` + 시각 스타일만 — 링크·버튼으로 만들지 않는다(위 ①). */
function GroupHeading({ label, icon: Icon }: { label: string; icon: NavIcon }) {
  return (
    <li className="flex items-center gap-2 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.02em] text-[var(--muted-fg)]">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </li>
  );
}

/**
 * 전략 3단 항목 — **종목명 + 우측 원 아이콘 2개뿐**이다 (N3 / N3a).
 *
 * 거래소 태그와 상태 배지 6종을 여기 두지 않는다. 240px 폭에서 종목명 + 태그 + 배지 2개는
 * 종목명을 3~4글자로 잘라먹었고, 사용자가 목업 리뷰에서 이 단순화를 확정했다. 상세 상태는
 * My page 전략 현황 행이 전부 보여준다.
 */
function StrategyItem({
  item,
  name,
  active,
}: {
  item: RelayLimitChaser;
  name: string | null;
  active: boolean;
}) {
  const ioLabel = strategyIoLabel(item.buyEnabled, item.sellEnabled);

  return (
    <Link
      href={limitChaserHref(item.key)}
      aria-current={active ? "page" : undefined}
      data-nav-item
      data-strategy-key={item.key}
      className={cn(
        "flex items-center gap-2 rounded-[var(--r)] p-2",
        active ? LINK_ACTIVE : LINK_IDLE,
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold",
          active ? "text-[var(--accent-fg)]" : "text-[var(--fg)]",
        )}
      >
        {/* 종목명이 없으면 ISIN 을 그대로 보여준다 — relay 역매핑의 명시 폴백 계약이다. */}
        {name ?? item.isin}
      </span>
      {/*
        원 아이콘 묶음. 라벨은 **묶음에만** 단다 — 개별 원에 달면 스크린리더가
        「매수 켜짐 · 매도 꺼짐」을 두 번 읽는다.
      */}
      <span
        role="img"
        aria-label={ioLabel}
        title={ioLabel}
        className="ml-auto inline-flex shrink-0 items-center gap-[6px]"
      >
        <span
          aria-hidden="true"
          data-io="buy"
          data-on={item.buyEnabled ? "true" : "false"}
          className="block size-[10px] shrink-0 rounded-full border-[1.5px]"
          style={
            item.buyEnabled
              ? { background: "var(--up)", borderColor: "var(--up)" }
              : { background: "transparent", borderColor: "var(--muted-fg)" }
          }
        />
        <span
          aria-hidden="true"
          data-io="sell"
          data-on={item.sellEnabled ? "true" : "false"}
          className="block size-[10px] shrink-0 rounded-full border-[1.5px]"
          style={
            item.sellEnabled
              ? { background: "var(--down)", borderColor: "var(--down)" }
              : { background: "transparent", borderColor: "var(--muted-fg)" }
          }
        />
      </span>
    </Link>
  );
}

/**
 * ISIN → 종목명 역매핑을 **이미 받은 프레임에서만** 만든다.
 *
 * `RelayLimitChaser` 에는 종목명이 없다(게이트웨이가 싣지 않는다). relay 는 잔고·미체결·
 * VI 주문에만 `stocks.isin` 역매핑으로 이름을 채워 준다. 그래서 여기서는 그 세 곳을 훑어
 * 이름을 얻고, 없으면 ISIN 을 그대로 보여준다 — `account-panel` 이 `name ?? isin` 으로
 * 폴백하는 것과 같은 규약이다. **이름 하나 때문에 별도 조회 경로를 만들지 않는다**(T-16-02:
 * 목록의 원천은 전역 wss 스냅샷뿐이어야 한다).
 */
function useIsinNames(): ReadonlyMap<string, string> {
  const { account, viOrders } = useRelayContext();

  const names = new Map<string, string>();
  for (const row of account?.hold ?? []) {
    if (row.name != null && row.name !== "") names.set(row.isin, row.name);
  }
  for (const row of account?.unf ?? []) {
    if (row.name != null && row.name !== "") names.set(row.isin, row.name);
  }
  for (const row of viOrders) {
    if (row.name != null && row.name !== "") names.set(row.isin, row.name);
  }
  return names;
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
  const { limitChasers, viTrigger } = useRelayContext();
  const tradingVisible = useTradingVisible();
  const names = useIsinNames();

  const isActive = (href: string) => samePath(pathname, href);

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
            <GroupHeading label="트레이딩" icon={Zap} />
            <li>
              <ul className={SUB_LIST}>
                <li>
                  <NavLink
                    item={NAV_LIMIT_CHASER}
                    active={isActive(NAV_LIMIT_CHASER.href)}
                  />
                  <ul className={SUB_LIST}>
                    {limitChasers.length === 0 ? (
                      <li>
                        {/* 링크가 아니다 — 누를 곳이 없다는 사실 자체가 정보다(N5). */}
                        <span className="block px-2 py-1.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                          등록된 전략 없음
                        </span>
                      </li>
                    ) : (
                      limitChasers.map((item) => (
                        <li key={item.key}>
                          <StrategyItem
                            item={item}
                            name={names.get(item.isin) ?? null}
                            active={isActive(limitChaserHref(item.key))}
                          />
                        </li>
                      ))
                    )}
                  </ul>
                </li>
                <li>
                  <NavLink item={NAV_VI} active={isActive(NAV_VI.href)}>
                    {/* N7 — VI 는 항목이 1개뿐이라 배지가 목록을 어지럽히지 않는다. */}
                    <StrategyBadge
                      badge={viBadgeOf(viTrigger?.run === true)}
                      className="ml-auto shrink-0"
                    />
                  </NavLink>
                </li>
              </ul>
            </li>
            <li>
              <NavLink item={NAV_ME} active={isActive(NAV_ME.href)} />
            </li>
          </>
        )}

        <li>
          <NavLink item={NAV_CHAT} active={isActive(NAV_CHAT.href)} />
        </li>
      </ul>
      <UserSection />
    </nav>
  );
}
