'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  LineChart,
  Radar,
  ShieldCheck,
  Star,
} from 'lucide-react';

import { GoogleMark } from '../_components/google-mark';

const ERRORS = [
  { key: 'none', label: '정상', message: '' },
  {
    key: 'auth_failed',
    label: 'auth_failed',
    message: '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.',
  },
  {
    key: 'oauth_denied',
    label: 'oauth_denied',
    message: 'Google 인증이 취소되었습니다.',
  },
];

function ErrorToggles({
  errorKey,
  onChange,
}: {
  errorKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-1">
      {ERRORS.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => onChange(e.key)}
          className={`rounded-full border px-2 py-0.5 text-xs transition ${
            errorKey === e.key
              ? 'border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)]'
              : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted-fg)]'
          }`}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}

export function LoginFdAurora() {
  const [errorKey, setErrorKey] = useState('none');
  const err = ERRORS.find((e) => e.key === errorKey)?.message;
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div
          className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-[color-mix(in_oklch,var(--primary)_55%,transparent)] blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-20 bottom-0 size-48 rounded-full bg-[color-mix(in_oklch,var(--destructive)_40%,transparent)] blur-3xl opacity-70"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)]/70 backdrop-blur">
              <Radar className="size-5 text-[var(--primary)]" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">gh-radar</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/70 px-2 py-0.5 text-xs text-[var(--muted-fg)] backdrop-blur">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Google OAuth
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="text-[22px] font-semibold leading-tight tracking-tight">
              상한가 레이더에
              <br />
              들어오셨습니다.
            </h3>
            <p className="text-sm text-[var(--muted-fg)] leading-normal">
              ⭐ 로 관심종목을 저장하고, 1분마다 시세·뉴스·토론방 요약을 한 곳에서 확인.
            </p>
          </div>

          {err && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[var(--bg)]/70 p-3 text-sm text-[var(--destructive)] backdrop-blur"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {err}
            </div>
          )}

          <button
            type="button"
            className="group flex w-full items-center justify-between gap-2 rounded-lg bg-[var(--fg)] px-4 py-3 text-left text-sm font-semibold text-[var(--bg)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="flex items-center gap-2">
              <GoogleMark />
              Google로 로그인
            </span>
            <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-3 text-xs text-[var(--muted-fg)]">
            <Star className="size-3 text-[var(--primary)]" aria-hidden="true" />
            이번 주 평균 ⭐ 52회 · 상한가 32종목 포착
          </div>
        </div>
      </div>
      <ErrorToggles errorKey={errorKey} onChange={setErrorKey} />
    </div>
  );
}

export function LoginFdDuotone() {
  const [errorKey, setErrorKey] = useState('none');
  const err = ERRORS.find((e) => e.key === errorKey)?.message;
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="grid grid-cols-[1fr_1px_1fr] bg-[var(--card)]">
          <div className="flex flex-col justify-between gap-4 bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--primary)]">
                № 06.2
              </span>
              <LineChart className="size-4 text-[var(--primary)]" aria-hidden="true" />
            </div>
            <div>
              <div className="font-mono text-5xl font-semibold leading-none tracking-tight text-[var(--fg)]">
                +29.8<span className="text-[var(--primary)]">%</span>
              </div>
              <p className="mt-2 text-xs text-[var(--muted-fg)] leading-normal">
                오늘 포착된 최고 상한가 근접도
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-0.5">
                <dt className="text-[var(--muted-fg)]">스캔 간격</dt>
                <dd className="font-mono text-sm font-semibold">60s</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[var(--muted-fg)]">관심 한도</dt>
                <dd className="font-mono text-sm font-semibold">50</dd>
              </div>
            </dl>
          </div>
          <div className="bg-[var(--border)]" aria-hidden="true" />
          <div className="flex flex-col justify-between gap-4 p-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted-fg)]">
                Login
              </p>
              <h3 className="mt-1 text-lg font-semibold leading-tight">
                급등의 첫 신호를,
                <br />
                놓치지 않기 위해.
              </h3>
            </div>
            {err && (
              <div
                role="alert"
                className="rounded border-l-2 border-[var(--destructive)] bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-3 py-2 text-xs text-[var(--destructive)] leading-normal"
              >
                {err}
              </div>
            )}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--fg)] bg-[var(--bg)] px-4 py-2.5 text-sm font-semibold text-[var(--fg)] transition hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <GoogleMark />
              Google로 로그인
            </button>
            <p className="text-[11px] text-[var(--muted-fg)] leading-relaxed">
              데이터 출처 · KRX · KIS · Naver News
              <br />
              개인정보 보관 기간 · 회원 탈퇴 시 즉시 삭제
            </p>
          </div>
        </div>
      </div>
      <ErrorToggles errorKey={errorKey} onChange={setErrorKey} />
    </div>
  );
}

export function LoginFdCompactStack() {
  const [errorKey, setErrorKey] = useState('none');
  const err = ERRORS.find((e) => e.key === errorKey)?.message;
  return (
    <div>
      <div className="relative flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-start justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted-fg)]">
              gh-radar / auth
            </span>
            <h3 className="mt-1 text-base font-semibold leading-snug">
              관심종목을 계속 추적하려면 로그인이 필요합니다
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]">
            <ShieldCheck className="size-3" aria-hidden="true" />
            OAuth2
          </span>
        </div>

        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--bg)] text-sm">
          <li className="flex items-center gap-3 px-3 py-2">
            <Star className="size-4 text-[var(--primary)]" aria-hidden="true" />
            <span className="text-[var(--fg)]">관심종목 1분 폴링</span>
          </li>
          <li className="flex items-center gap-3 px-3 py-2">
            <LineChart className="size-4 text-[var(--primary)]" aria-hidden="true" />
            <span className="text-[var(--fg)]">상한가 근접 실시간 스캔</span>
          </li>
          <li className="flex items-center gap-3 px-3 py-2">
            <Radar className="size-4 text-[var(--primary)]" aria-hidden="true" />
            <span className="text-[var(--fg)]">AI 뉴스·토론방 요약</span>
          </li>
        </ul>

        {err && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded border border-[color-mix(in_oklch,var(--destructive)_25%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-3 py-2 text-xs text-[var(--destructive)]"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {err}
          </div>
        )}

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
        >
          <GoogleMark />
          Google로 로그인
        </button>

        <p className="text-[11px] text-[var(--muted-fg)] leading-relaxed">
          계속하면 약관에 동의한 것으로 간주됩니다. 이메일 외 개인정보는 저장하지
          않습니다.
        </p>
      </div>
      <ErrorToggles errorKey={errorKey} onChange={setErrorKey} />
    </div>
  );
}
