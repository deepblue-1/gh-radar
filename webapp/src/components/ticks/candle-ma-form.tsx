'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  MA_N_MAX,
  MA_N_MIN,
  isValidMaSpec,
  maKeyOf,
  maNameOf,
  type MaBase,
  type MaKind,
  type MaSpec,
} from '@/lib/ticks/candle-ma';
import type { MaConfig } from '@/lib/ticks/candle-prefs';
import { isNativeApp } from '@/lib/native/native-detect';
import { cn } from '@/lib/utils';

/**
 * 이동평균 더하기 — 한 장 양식 (Phase 42 · D-22 · UI-SPEC S3 · 채택 목업 A).
 *
 * - 줄: 제목 「이동평균 더하기」 → 기준 「봉 | 일」 → 기간 칸 + 「2 ~ 240」 → (오류 줄) → 종류 「단순 | 지수」 → (일이면 안내 줄) → 버튼.
 * - 여는 면: 뷰포트 768 이상(앱 셸 아님) = 「＋」 아래 팝오버 · 그 밖 = 바텀 시트(push-alert-bell 과 같은 갈림 · 열림 상태 하나).
 *   차트 판 치수 · 제목 줄 접힘은 측정 폭(`phone`)이지만, 이 창은 화면 위에 뜨는 면이라 뷰포트로 고른다(UI-SPEC 이 우선).
 * - 열 때마다 봉 · 빈 칸 · 단순으로 시작한다 — 본문(`Panel`)이 열린 동안만 마운트되므로 상태가 저절로 비워진다.
 * - 검증은 순수 `maFormStateOf` 하나 — 빈 칸은 오류 없이 버튼만 꺼짐 · 범위 밖 · 같은 선(켜짐 · 꺼짐 무관)은 오류 줄 + 꺼짐.
 * - Enter = 통과면 더하기 · Esc · 바깥 누르기 = 닫기(입력 버림). 더하면 닫힌다. 새 칩 · 「＋」 초점은 칩 쪽(candle-ma-chips) 몫.
 */

// ── 순수 검증 ───────────────────────────────────────────────────────────────

export interface MaFormInput {
  base: MaBase;
  /** 기간 칸 원문(숫자만 · 이미 정리된 값). */
  nText: string;
  kind: MaKind;
}

export interface MaFormState {
  /** 더할 수 있는 정의 — 빈 칸 · 오류면 null. */
  spec: MaSpec | null;
  error: 'range' | 'dup' | null;
  /** 칩 이름(「단순 20」) — 통과 · 같은 선일 때만. */
  name: string | null;
}

/** 입력 → 검증 결과. 일 기준이면 종류는 늘 「단순」(D-11 — 일 + 지수 없음). */
export function maFormStateOf(input: MaFormInput, config: MaConfig): MaFormState {
  if (input.nText === '') return { spec: null, error: null, name: null };
  const n = Number(input.nText);
  if (!Number.isInteger(n) || n < MA_N_MIN || n > MA_N_MAX) return { spec: null, error: 'range', name: null };
  const spec: MaSpec = { base: input.base, n, kind: input.base === 'day' ? 'sma' : input.kind };
  if (!isValidMaSpec(spec)) return { spec: null, error: 'range', name: null };
  const name = maNameOf(spec);
  const key = maKeyOf(spec);
  if (config.lines.some((l) => maKeyOf(l) === key)) return { spec: null, error: 'dup', name };
  return { spec, error: null, name };
}

/** 기간 칸 원문 정리 — 숫자만 · 앞 0 지움 · 최대 3자리. */
export function periodTextOf(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 3);
}

/** 문구 정본(UI-SPEC S3) — 숫자는 MA_N_MIN · MA_N_MAX 와 같다. */
const RANGE_MSG = '기간은 2 ~ 240 사이 숫자로 넣어 주세요';
const DAY_NOTE = '일 기준은 단순 평균만 있어요';
const TITLE = '이동평균 더하기';

// ── 여는 면 판정(push-alert-bell 과 같은 꼴) ─────────────────────────────────

/** 팝오버를 쓰는 폭 — 이보다 좁으면(폰) 바텀 시트. */
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeDesktop(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** 데스크톱 폭인가 — 서버 스냅숏 false. */
function useWideViewport(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** 앱 셸 안인가 — 마운트 뒤에만 정한다(전에는 null · 하이드레이션). */
function useNativeAfterMount(): boolean | null {
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}

// ── 본문 ────────────────────────────────────────────────────────────────────

interface Choice<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
}

/** 나눔 칸 — 트랙 `--muted` · 켜짐 `--seg-on-*` 600. */
function Seg<T extends string>({
  label,
  value,
  choices,
  onPick,
  sheet,
}: {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onPick: (v: T) => void;
  sheet: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-[10px] bg-[var(--muted)] p-0.5">
      {choices.map((c) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={c.disabled}
            onClick={() => onPick(c.id)}
            className={cn(
              'flex-1 rounded-[8px] disabled:opacity-40',
              sheet ? 'h-9 text-[14px]' : 'h-7 text-[12px]',
              on
                ? 'bg-[var(--seg-on-bg)] font-semibold text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
                : 'font-normal text-[var(--muted-fg)]',
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

const BASES: readonly Choice<MaBase>[] = [
  { id: 'bar', label: '봉' },
  { id: 'day', label: '일' },
];

function Panel({
  config,
  sheet,
  periodRef,
  onAdd,
  onCancel,
}: {
  config: MaConfig;
  sheet: boolean;
  periodRef: RefObject<HTMLInputElement | null>;
  onAdd: (spec: MaSpec) => void;
  onCancel: () => void;
}) {
  const [base, setBase] = useState<MaBase>('bar');
  const [nText, setNText] = useState('');
  const [kind, setKind] = useState<MaKind>('sma');
  const errorId = useId();
  const kindShown: MaKind = base === 'day' ? 'sma' : kind;
  const st = maFormStateOf({ base, nText, kind }, config);
  const errorText = st.error === 'range' ? RANGE_MSG : st.error === 'dup' ? `이미 있는 선이에요 — ${st.name}` : null;

  const submit = () => {
    if (st.spec) onAdd(st.spec);
  };
  const onPeriodKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submit();
  };

  const row = sheet ? 'grid grid-cols-[48px_1fr] items-center gap-3 mb-3' : 'grid grid-cols-[40px_1fr] items-center gap-2 mb-2';
  const lab = cn('text-[var(--muted-fg)]', sheet ? 'text-[14px]' : 'text-[12px]');
  const note = cn('-mt-1 text-[12px]', sheet ? 'mb-3 pl-[60px]' : 'mb-2 pl-12');

  return (
    <div data-slot="candle-ma-form">
      <div className={row}>
        <span className={lab}>기준</span>
        <Seg label="기준" value={base} choices={BASES} onPick={setBase} sheet={sheet} />
      </div>

      <div className={row}>
        <span className={lab}>기간</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              ref={periodRef}
              inputMode="numeric"
              autoComplete="off"
              placeholder="20"
              aria-label={base === 'day' ? '기간(거래일 수)' : '기간(봉 개수)'}
              aria-invalid={errorText !== null || undefined}
              aria-describedby={errorText !== null ? errorId : undefined}
              value={nText}
              onChange={(e) => setNText(periodTextOf(e.target.value))}
              onKeyDown={onPeriodKey}
              className={cn(
                'mono rounded-[8px] pl-2 pr-6 text-right font-semibold',
                sheet ? 'h-10 w-[120px] text-[16px]' : 'h-8 w-[96px] text-[14px]',
              )}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[12px] text-[var(--muted-fg)]"
            >
              {base === 'day' ? '일' : '봉'}
            </span>
          </div>
          <span className="text-[12px] text-[var(--muted-fg)]">
            {MA_N_MIN} ~ {MA_N_MAX}
          </span>
        </div>
      </div>
      {errorText !== null && (
        <p id={errorId} role="alert" className={cn(note, 'text-[var(--destructive)]')}>
          {errorText}
        </p>
      )}

      <div className={row}>
        <span className={lab}>종류</span>
        <Seg
          label="종류"
          value={kindShown}
          choices={[
            { id: 'sma', label: '단순' },
            { id: 'ema', label: '지수', disabled: base === 'day' },
          ]}
          onPick={setKind}
          sheet={sheet}
        />
      </div>
      {base === 'day' && <p className={cn(note, 'text-[var(--muted-fg)]')}>{DAY_NOTE}</p>}

      {sheet ? (
        <button
          type="button"
          disabled={st.spec === null}
          onClick={submit}
          className="mt-1 h-11 w-full rounded-[12px] bg-[var(--primary)] text-[14px] font-semibold text-[var(--primary-fg)] disabled:opacity-40"
        >
          {st.spec ? `${st.name} 더하기` : '더하기'}
        </button>
      ) : (
        <div className="mt-1 flex justify-end gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-[8px] px-3 text-[12px] font-semibold text-[var(--fg-2)] hover:bg-[var(--muted)]"
          >
            취소
          </button>
          <button
            type="button"
            disabled={st.spec === null}
            onClick={submit}
            className="h-8 rounded-[8px] bg-[var(--primary)] px-3 text-[12px] font-semibold text-[var(--primary-fg)] disabled:opacity-40"
          >
            {st.spec ? `${st.name} 더하기` : '더하기'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 껍데기(팝오버 ↔ 시트) ────────────────────────────────────────────────────

export interface CandleMaFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: MaConfig;
  /** 통과한 정의 — 받은 쪽이 구성에 더한다. 더하면 창은 닫힌다. */
  onAdd: (spec: MaSpec) => void;
  /** 「＋」 버튼 — 팝오버 기준점이자 시트 닫힘 뒤 초점 자리. */
  trigger: ReactNode;
}

export function CandleMaForm({ open, onOpenChange, config, onAdd, trigger }: CandleMaFormProps) {
  const native = useNativeAfterMount();
  const wide = useWideViewport();
  const desktop = native === false && wide;
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const periodRef = useRef<HTMLInputElement>(null);

  const add = (spec: MaSpec) => {
    onAdd(spec);
    onOpenChange(false);
  };
  const cancel = () => onOpenChange(false);

  return (
    <>
      <Popover open={open && desktop} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild ref={triggerRef}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          aria-labelledby={titleId}
          onOpenAutoFocus={(e) => {
            // 첫 초점 = 기간 칸(데스크톱은 키보드가 이미 있다).
            e.preventDefault();
            periodRef.current?.focus();
          }}
          className="w-[272px] gap-0 rounded-[14px] bg-[var(--popover)] p-3"
        >
          <h2 id={titleId} className="mb-2 text-[14px] font-semibold text-[var(--fg)]">
            {TITLE}
          </h2>
          <Panel config={config} sheet={false} periodRef={periodRef} onAdd={add} onCancel={cancel} />
        </PopoverContent>
      </Popover>

      <Sheet open={open && !desktop} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // 첫 초점 = 시트 컨테이너(preventScroll) — 기간 칸에 주면 폰 키보드가 저절로 올라온다.
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(e) => {
            // 시트에는 Radix 트리거가 없다 — 닫으면 「＋」 로 초점을 돌린다.
            e.preventDefault();
            triggerRef.current?.focus();
          }}
          className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-[22px] bg-[var(--card)] px-4 pt-2.5 pb-6"
        >
          <div aria-hidden="true" className="mx-auto mb-2.5 h-1 w-9 shrink-0 rounded-full bg-[var(--raised-2)]" />
          <SheetHeader className="mb-3 border-0 p-0">
            <SheetTitle className="text-[16px] font-semibold text-[var(--fg)]">{TITLE}</SheetTitle>
          </SheetHeader>
          <Panel config={config} sheet periodRef={periodRef} onAdd={add} onCancel={cancel} />
        </SheetContent>
      </Sheet>
    </>
  );
}
