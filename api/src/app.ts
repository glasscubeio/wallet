import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";

import { env, isProd } from "./config/env.ts";
import authRoutes from "./routes/auth.routes.ts";
import walletRoutes from "./routes/wallet.routes.ts";
import { notFound, errorHandler } from "./middleware/error.ts";
import { getOperatorStatus } from "./services/gasStation.service.ts";

export function createApp(): Express {
  const app = express();

  // Behind nginx, so req.ip must come from X-Forwarded-For for rate limiting.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(morgan(isProd ? "combined" : "dev"));

  const allowedOrigins = env.WEB_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      // credentials:true forbids a wildcard origin, so reflect known ones only.
      origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  /**
   * Health includes the gas station balance: an empty operator wallet stops
   * every transfer in the product, so it needs to be visible to monitoring
   * before users are the ones who discover it.
   */
  app.get("/health", async (_req, res) => {
    let operator = null;
    try {
      operator = await getOperatorStatus();
    } catch (err) {
      console.error("[health] operator status failed", err);
    }

    const degraded = !operator?.configured || operator.low;
    res.status(degraded ? 503 : 200).json({
      ok: !degraded,
      network: env.NETWORK,
      uptime: process.uptime(),
      gasStation: operator,
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/wallet", walletRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
