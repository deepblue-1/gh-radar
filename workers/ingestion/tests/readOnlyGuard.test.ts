import { describe, it, expect } from "vitest";
import {
  readOnlyGuard,
  KisForbiddenPathError,
} from "../src/kis/readOnlyGuard";
import type { InternalAxiosRequestConfig } from "axios";

function makeConfig(url: string): InternalAxiosRequestConfig {
  return { url, headers: {} as any };
}

describe("readOnlyGuard", () => {
  it("등락률 순위 path 허용", () => {
    const cfg = makeConfig("/uapi/domestic-stock/v1/ranking/fluctuation");
    expect(() => readOnlyGuard(cfg)).not.toThrow();
  });

  it("현재가 조회 path 허용", () => {
    const cfg = makeConfig("/uapi/domestic-stock/v1/quotations/inquire-price");
    expect(() => readOnlyGuard(cfg)).not.toThrow();
  });

  it("토큰 발급 path 허용", () => {
    const cfg = makeConfig("/oauth2/tokenP");
    expect(() => readOnlyGuard(cfg)).not.toThrow();
  });

  it("주문 path 차단 (trading)", () => {
    const cfg = makeConfig("/uapi/domestic-stock/v1/trading/order-cash");
    expect(() => readOnlyGuard(cfg)).toThrow(KisForbiddenPathError);
  });

  it("주문 path 차단 (order 키워드)", () => {
    const cfg = makeConfig("/uapi/domestic-stock/v1/order-something");
    expect(() => readOnlyGuard(cfg)).toThrow(KisForbiddenPathError);
  });

  it("알 수 없는 path 차단", () => {
    const cfg = makeConfig("/uapi/some-unknown/v1/endpoint");
    expect(() => readOnlyGuard(cfg)).toThrow(KisForbiddenPathError);
  });

  it("full URL에서도 path 추출 후 판단", () => {
    const cfg = makeConfig(
      "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/ranking/fluctuation?foo=bar"
    );
    expect(() => readOnlyGuard(cfg)).not.toThrow();
  });

  it("full URL에서 trading 차단", () => {
    const cfg = makeConfig(
      "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/trading/order-cash"
    );
    expect(() => readOnlyGuard(cfg)).toThrow(KisForbiddenPathError);
  });
});
