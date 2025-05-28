import express from "express";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type { Request, Response } from "express";
import { latestPrices, topSpreads, warnings } from "../state.js";

type DashboardPayload = {
  [key: string]: any;
  timestamp: number;
  prices: any[];
  topSpreads: any[];
  warnings: any[];
  full: boolean;
};

if (process.env.DASH_ENABLE !== "true") {
  console.log("Dashboard disabled (set DASH_ENABLE=true to enable)");
  // eslint-disable-next-line no-process-exit
  process.exit(0);
}

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "src", "dashboard", "views"));

let lastPayload: DashboardPayload | null = null;

function buildPayload(): DashboardPayload {
  return {
    timestamp: Date.now(),
    prices: latestPrices,
    topSpreads: topSpreads.slice(0, 5),
    warnings,
    full: true
  };
}

// GET /
app.get("/", (_req: Request, res: Response) => {
  res.render("index", {
    refresh: process.env.DASH_REFRESH_MS ?? 15000
  });
});

// GET /data.json  –– diff-only payload
app.get("/data.json", (_req: Request, res: Response) => {
  const current = buildPayload();
  if (!lastPayload) {
    lastPayload = current;
    res.json(current);
    return;
  }

  const diff: Record<string, any> = { full: false };
  for (const k in current) {
    if (JSON.stringify(current[k]) !== JSON.stringify(lastPayload![k])) {
      diff[k] = current[k];
    }
  }
  lastPayload = current;
  res.json(diff);
});

// start server
const port = Number(process.env.DASH_PORT ?? 4000);
app.listen(port, () => console.log(`Dashboard on http://localhost:${port}`)); 