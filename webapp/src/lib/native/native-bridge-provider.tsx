'use client';

// RED 골격 — 21-04 Task 1 GREEN 에서 구현한다.
import { createContext, useContext, type ReactNode } from 'react';

export type NativeRefreshFn = () => unknown | Promise<unknown>;

export interface NativeBridgeValue {
  isNative: boolean;
  registerRefresh: (fn: NativeRefreshFn) => () => void;
  acquireOverlay: () => () => void;
}

const NOOP = () => {};
const EMPTY_NATIVE_BRIDGE: NativeBridgeValue = {
  isNative: false,
  registerRefresh: () => NOOP,
  acquireOverlay: () => NOOP,
};

const NativeBridgeContext = createContext<NativeBridgeValue | null>(null);

export function NativeBridgeProvider({ children }: { children: ReactNode }) {
  return <NativeBridgeContext value={EMPTY_NATIVE_BRIDGE}>{children}</NativeBridgeContext>;
}

export function useNativeBridge(): NativeBridgeValue {
  return useContext(NativeBridgeContext) ?? EMPTY_NATIVE_BRIDGE;
}
