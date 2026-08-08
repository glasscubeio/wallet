import { Router } from "express";
import { z } from "zod";
import * as auth from "../controllers/auth.controller.ts";
import { requireAuth } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { authLimiter, otpLimiter } from "../middleware/rateLimit.ts";

const router = Router();

const password = z.string().min(8, "Use at least 8 characters").max(128, "That's too long");

const username = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(32, "At most 32 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only");

const email = z.string().trim().toLowerCase().email("Enter a valid email address");

const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

router.post(
  "/register",
  authLimiter,
  validate(z.object({ username, email, password })),
  auth.register,
);

router.post(
  "/login",
  authLimiter,
  validate(
    z.object({
      identifier: z.string().trim().min(1, "Enter your email or username"),
      password: z.string().min(1, "Enter your password"),
    }),
  ),
  auth.login,
);

router.post("/refresh", auth.refresh);
router.post("/logout", auth.logout);
router.post("/logout-all", requireAuth, auth.logoutAll);
router.get("/me", requireAuth, auth.me);

router.post("/verify-email/request", requireAuth, otpLimiter, auth.requestEmailVerification);
router.post(
  "/verify-email/confirm",
  requireAuth,
  validate(z.object({ code })),
  auth.confirmEmailVerification,
);

router.post("/forgot-password", otpLimiter, validate(z.object({ email })), auth.forgotPassword);

router.post(
  "/reset-password",
  authLimiter,
  validate(z.object({ email, code, password })),
  auth.resetPassword,
);

router.post(
  "/change-password",
  requireAuth,
  authLimiter,
  validate(
    z.object({
      currentPassword: z.string().min(1, "Enter your current password"),
      newPassword: password,
    }),
  ),
  auth.changePassword,
);

router.post("/delete-account/request", requireAuth, otpLimiter, auth.requestAccountDeletion);
router.post(
  "/delete-account/confirm",
  requireAuth,
  validate(z.object({ password: z.string().min(1, "Enter your password"), code })),
  auth.confirmAccountDeletion,
);

export default router;
