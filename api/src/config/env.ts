import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(9550),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be >= 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be >= 16 chars"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),

  // Cookies / CORS
  WEB_ORIGIN: z.string().default("http://localhost:9551"),
  COOKIE_DOMAIN: z.string().optional(),

  // Coinbase CDP — holds each user's key and produces the EIP-712 signature.
  // Never surfaced to the user: no CDP widget, no CDP login, no browser SDK.
  CDP_API_KEY_ID: z.string().optional(),
  CDP_API_KEY_SECRET: z.string().optional(),
  CDP_WALLET_SECRET: z.string().optional(),

  // Gas station — our own relayer. This wallet holds ETH and pays every user's
  // gas. It never holds user USDC and cannot move it without a signed
  // authorization from the user's own key.
  OPERATOR_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "OPERATOR_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key")
    .optional(),
  // Warn in the health check once the operator drops below this (in ETH).
  OPERATOR_MIN_BALANCE_ETH: z.string().default("0.01"),

  // Chain
  NETWORK: z.string().default("base-sepolia"),
  CHAIN_ID: z.coerce.number().default(84532),
  RPC_URL: z.string().default("https://sepolia.base.org"),
  USDC_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Hamyon <onboarding@resend.dev>"),

  // Explorer
  BASESCAN_API_KEY: z.string().optional(),
  BASESCAN_API_URL: z.string().default("https://api.etherscan.io/v2/api"),
  EXPLORER_BASE_URL: z.string().default("https://sepolia.basescan.org"),

  // MoonPay
  MOONPAY_PUBLISHABLE_KEY: z.string().optional(),
  MOONPAY_SECRET_KEY: z.string().optional(),
  MOONPAY_BUY_URL: z.string().default("https://buy-sandbox.moonpay.com"),
  MOONPAY_SELL_URL: z.string().default("https://sell-sandbox.moonpay.com"),
  MOONPAY_CURRENCY_CODE: z.string().default("usdc"),

  // Behaviour
  REQUIRE_EMAIL_VERIFICATION: bool(false),
  REQUIRE_OTP_FOR_SEND: bool(true),
  OTP_TTL_MINUTES: z.coerce.number().default(10),
  // How long a signed transfer authorization stays valid, in seconds.
  AUTHORIZATION_TTL_SECONDS: z.coerce.number().default(600),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProd = env.NODE_ENV === "production";

/** CDP can only sign when all three credentials are present. */
export const cdpConfigured = Boolean(
  env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET && env.CDP_WALLET_SECRET,
);

/** Without the operator key there is no one to pay gas, so sends are blocked. */
export const gasStationConfigured = Boolean(env.OPERATOR_PRIVATE_KEY);

export const resendConfigured = Boolean(env.RESEND_API_KEY);
export const basescanConfigured = Boolean(env.BASESCAN_API_KEY);
export const moonpayConfigured = Boolean(
  env.MOONPAY_PUBLISHABLE_KEY && env.MOONPAY_SECRET_KEY,
);
