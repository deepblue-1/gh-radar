'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import type { Stock } from '@gh-radar/shared';
import { Badge } from '@/components/ui/badge';
import { Number as NumberDisplay } from '@/components/ui/number';
import { WatchlistToggle } from '@/components/watchlist/watchlist-toggle';
import { useChat } from '@/components/chat/chat-provider';

export interface StockHeroProps {
  stock: Stock;
  /**
   * 매매 가능 종목인가(Phase 21 D-30 — `isPickable`). true 일 때만 넓은 폭(≥768) 「트레이딩」 알약이 선다.
   * 기본 false — 판정을 모르는 소비처가 매매 불가 종목에 버튼을 띄우지 않게(T-21-93).
   */
  tradable?: boolean;
}

/**
 * StockHero — Phase 6 D4 Hero 섹션 (UI-SPEC primary focal point).
 * - 종목명(17px/600 — TDS t5 · 260925-0pf) · 코드(raised 칩) · 마켓배지 — 토스 B(260924-vj1 · 타이포 교정)
 * - 현재가 30px/700 (폰·데스크톱 동일)
 * - 등락액 + 등락률 15px/500 (up/down/flat 색상)
 * - price <= 0 → em-dash (정지/폐지 종목)
 *
 * 뒤로가기 버튼 (←): router.back() 으로 진입 경로 보존 (이전 페이지 = scanner 또는
 * watchlist 어느 쪽이든 정확). history 가 비어있는 직접 URL 진입은 /scanner fallback.
 * 이전에는 href="/" 였으나 page.tsx 가 /scanner 로 redirect 하여 watchlist 진입이
 * 무시되는 버그가 있었음.
 *
 * changeRate 스케일 주의: 서버는 정수 % (2.09 = 2.09%) 로 내려주고
 * `<Number format="percent">` 는 소수 (0.0325 = 3.25%) 를 기대하므로 /100 로 변환.
 *
 * Phase 21 D-10 — 앱(`html.native-app`)에서만 첫 줄 끝에 「AI 분석」 버튼이 보인다(FAB 대체 · 기존 ChatSheet 를 이 종목 컨텍스트로 연다).
 *
 * Phase 21 D-30 (스케치 008 ② A) — 넓은 폭(≥768)에서 첫 줄 끝에 「트레이딩」 알약(32 · 13/600 · `--up` 채움 ·
 * 흰 글자)이 선다. 누르면 `/trading?code={code}` — 그 종목 카드에 도착한다. 폰(<768)은 하단 CTA 바
 * (`stock-detail-tabs.tsx`)가 같은 링크를 맡는다. 매매 불가 종목(`tradable` false)은 버튼이 없다.
 */
export function StockHero({ stock, tradable = false }: StockHeroProps) {
  const priceValid = Number.isFinite(stock.price) && stock.price > 0;
  const changeRateDecimal = stock.changeRate / 100;
  const router = useRouter();
  const { openChat } = useChat();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/scanner');
    }
  };

  return (
    <section className="space-y-1.5" aria-label="종목 개요">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleBack}
          aria-label="이전 페이지로 돌아가기"
          className="inline-flex items-center text-[length:var(--t-h2)] text-[var(--muted-fg)] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm py-2 pr-1"
        >
          ←
        </button>
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--fg)]">
          {stock.name}
        </h1>
        <span className="mono rounded-[6px] bg-[var(--muted)] px-[7px] py-[2px] text-[12px] font-semibold text-[var(--muted-fg)]">
          {stock.code}
        </span>
        <Badge variant="outline">{stock.market}</Badge>
        <WatchlistToggle stockCode={stock.code} stockName={stock.name} />
        {/*
          D-10 — 앱 전용. `hidden` 은 변형 없는 유틸이라 `native:` 변형 유틸이 항상 뒤에 출력돼 앱에서 이긴다.
          비로그인이면 ChatSheet 가 스스로 로그인 필요 상태를 보여 준다(새 권한 경로 없음).
          `ml-auto shrink-0` — 줄 오른쪽 끝(헤더 액션 자리)에 붙는다. 긴 종목명·360 폰에서 줄이 넘치면 다음 줄
          왼쪽에 외톨이로 떨어지지 않고 오른쪽 끝에 선다(아래 「새로고침」과 같은 열).
        */}
        <button
          type="button"
          data-slot="stock-ai-button"
          onClick={() => openChat({ code: stock.code, name: stock.name })}
          aria-label={`AI 분석 — ${stock.name}`}
          className="ml-auto hidden shrink-0 native:inline-flex h-8 items-center gap-1 rounded-full bg-[var(--muted)] px-3 text-[13px] font-semibold text-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Sparkles size={14} aria-hidden="true" />
          AI 분석
        </button>
        {/*
          D-30 · 스케치 008 ② A — 넓은 폭 「트레이딩」 알약. `hidden md:inline-flex` — 폰은 하단 CTA 바가 맡는다.
          브라우저는 이 알약이 `ml-auto` 로 줄 끝에 서고, 앱(iPad)은 「AI 분석」이 `ml-auto` 를 가지므로
          `native:ml-0` 으로 그 옆에 나란히 붙는다(두 알약 공존 · 긴 종목명이면 줄바꿈 허용 — 위 flex-wrap).
        */}
        {tradable && (
          <Link
            data-slot="detail-trading-button"
            href={`/trading?code=${encodeURIComponent(stock.code)}`}
            className="ml-auto hidden h-8 shrink-0 items-center rounded-full bg-[var(--up)] px-3.5 text-[13px] font-semibold text-white focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:inline-flex native:ml-0"
          >
            트레이딩
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-2.5">
        {priceValid ? (
          <span
            data-testid="stock-hero-price"
            className="mono text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--fg)]"
          >
            <NumberDisplay value={stock.price} format="price" />
          </span>
        ) : (
          <span
            data-testid="stock-hero-price"
            className="mono text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--muted-fg)]"
          >
            —
          </span>
        )}
        <span className="text-[15px] font-medium">
          <NumberDisplay
            value={stock.changeAmount}
            format="price"
            showSign
            withColor
          />
        </span>
        <span className="text-[15px] font-medium">
          <NumberDisplay
            value={changeRateDecimal}
            format="percent"
            showSign
            withColor
          />
        </span>
      </div>
    </section>
  );
}
