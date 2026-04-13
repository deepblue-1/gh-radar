import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requestId } from "../../src/middleware/request-id";

function app() {
  const a = express();
  a.use(requestId());
  a.get("/x", (req, res) => {
    res.json({ id: (req as unknown as { id: string }).id });
  });
  return a;
}

describe("requestId middleware", () => {
  it("generates UUID when header missing", async () => {
    const res = await request(app()).get("/x");
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.id).toBe(res.headers["x-request-id"]);
  });

  it("echoes valid incoming X-Request-Id", async () => {
    const res = await request(app())
      .get("/x")
      .set("X-Request-Id", "abc_123-XYZ");
    expect(res.headers["x-request-id"]).toBe("abc_123-XYZ");
  });

  it("rejects invalid id (spaces) and generates new UUID", async () => {
    const res = await request(app())
      .get("/x")
      .set("X-Request-Id", "has spaces");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
