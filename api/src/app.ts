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

  /*
    HTTP logging.

    Same readable format in every environment — production used to switch to
    Apache "combined", which is built for log shipping and is close to
    unreadable when you're tailing it to see what an app is doing.

    `immediate: false` logs on response so the status and duration are real.
    Successful /health polls are dropped because a monitor hitting it every few
    seconds otherwise buries the traffic you actually care about; a failing
    health check still logs.
  */
  morgan.token("client-ip", (req) => (req as express.Request).ip ?? "-");

  app.use(
    morgan(
      ':client-ip :method :url :status :res[content-length] - :response-time ms ":user-agent"',
      {
        skip: (req, res) => req.url === "/health" && res.statusCode < 400,
      },
    ),
  );

  const allowedOrigins = env.WEB_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Vite serves the same app on localhost and 127.0.0.1, and `vite preview`
  // uses a different port again. Treating those as separate origins turns a
  // routine local run into an unexplained CORS failure, so accept any loopback
  // origin outside production.
  const isLoopback = (origin: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

  app.use(
    cors({
      // credentials:true forbids a wildcard origin, so reflect known ones only.
      origin(origin, cb) {
        // No Origin header: same-origin, curl, or a server-side call.
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        if (!isProd && isLoopback(origin)) return cb(null, true);

        // Refuse by omitting the header rather than throwing. Throwing here
        // produces a 500 that *also* lacks CORS headers, so the browser shows
        // a generic CORS error and the real reason never reaches anyone.
        console.warn(
          `[cors] refused origin ${origin} — add it to WEB_ORIGIN (currently: ${allowedOrigins.join(", ") || "empty"})`,
        );
        cb(null, false);
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
