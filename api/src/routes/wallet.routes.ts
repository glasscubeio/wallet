import { Router } from "express";
import { z } from "zod";
import * as wallet from "../controllers/wallet.controller.ts";
import { requireAuth } from "../middleware/auth.ts";
import { validate, validateQuery } from "../middleware/validate.ts";
import { sendLimiter, otpLimiter } from "../middleware/rateLimit.ts";

const router = Router();

router.get("/capabilities", wallet.getCapabilities);

router.use(requireAuth);

router.get("/", wallet.getWallet);
router.get("/balance", wallet.getBalance);

router.get(
  "/transactions",
  validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  ),
  wallet.getTransactions,
);

router.post(
  "/send",
  sendLimiter,
  otpLimiter,
  validate(
    z.object({
      to: z.string().trim().min(1, "Enter a recipient address"),
      // Coerced so a JSON number works as well as a string.
      amount: z.coerce.string().trim().min(1, "Enter an amount"),
    }),
  ),
  wallet.initiateSend,
);

router.post(
  "/send/confirm",
  sendLimiter,
  validate(
    z.object({
      transferId: z.string().trim().min(1),
      code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
    }),
  ),
  wallet.confirmSend,
);

router.get("/transfers/:id", wallet.getTransfer);

const rampQuery = z.object({ amount: z.coerce.number().positive().optional() });

router.get("/onramp", validateQuery(rampQuery), wallet.getOnrampUrl);
router.get("/offramp", validateQuery(rampQuery), wallet.getOfframpUrl);

export default router;
