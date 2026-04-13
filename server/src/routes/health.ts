import { Router, type Router as RouterT } from "express";

export const healthRouter: RouterT = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? "dev",
  });
});
