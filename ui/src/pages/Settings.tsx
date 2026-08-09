import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BadgeCheck, MailWarning, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { OtpField } from "@/components/ui/otp-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { authApi, ApiError, type ErrorDetails } from "@/lib/api";

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

function details(err: unknown): ErrorDetails {
  if (err instanceof ApiError && Object.keys(err.details).length) return err.details;
  return { _: message(err) };
}

function VerifyEmailCard() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user?.emailVerified) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 pt-5">
          <BadgeCheck className="h-5 w-5 shrink-0 text-credit" aria-hidden="true" />
          <div>
            <p className="text-[14.5px] font-medium text-ink">Email verified</p>
            <p className="text-[13px] text-ink-soft">{user.email}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await authApi.requestEmailVerification();
      setSent(true);
      toast.success("Code sent. Check your inbox.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value?: string) {
    setBusy(true);
    setError(null);
    try {
      await authApi.confirmEmailVerification(value ?? code);
      await refresh();
      toast.success("Email verified.");
    } catch (err) {
      setError(message(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-saffron" aria-hidden="true" />
          <div>
            <CardTitle className="text-[16px]">Verify your email</CardTitle>
            <CardDescription>
              Confirming {user?.email} keeps password resets and transfer codes reaching you.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sent ? (
          <>
            <OtpField value={code} onChange={setCode} onComplete={confirm} disabled={busy} />
            {error && (
              <p role="alert" className="text-[12.5px] text-debit">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void confirm()} loading={busy} disabled={code.length !== 6}>
                Verify
              </Button>
              <Button variant="ghost" onClick={() => void sendCode()} disabled={busy}>
                Resend
              </Button>
            </div>
          </>
        ) : (
          <>
            {error && (
              <p role="alert" className="text-[12.5px] text-debit">
                {error}
              </p>
            )}
            <Button onClick={() => void sendCode()} loading={busy}>
              Send verification code
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<ErrorDetails>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await authApi.changePassword(form);
      setForm({ currentPassword: "", newPassword: "" });
      toast.success("Password updated. Other devices have been signed out.");
    } catch (err) {
      setErrors(details(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[16px]">Change password</CardTitle>
        <CardDescription>Updating your password signs out every other device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Current password" error={errors.currentPassword}>
            {({ id, invalid, ...aria }) => (
              <Input
                id={id}
                invalid={invalid}
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                autoComplete="current-password"
                {...aria}
              />
            )}
          </Field>

          <Field label="New password" error={errors.newPassword} hint="At least 8 characters.">
            {({ id, invalid, ...aria }) => (
              <Input
                id={id}
                invalid={invalid}
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                autoComplete="new-password"
                {...aria}
              />
            )}
          </Field>

          {errors._ && (
            <p role="alert" className="text-[12.5px] text-debit">
              {errors._}
            </p>
          )}

          <Button type="submit" loading={busy} disabled={!form.currentPassword || !form.newPassword}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteAccountCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"confirm" | "code">("confirm");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<ErrorDetails>({});
  const [busy, setBusy] = useState(false);

  function reset() {
    setStage("confirm");
    setPassword("");
    setCode("");
    setErrors({});
  }

  async function requestCode() {
    setBusy(true);
    setErrors({});
    try {
      await authApi.requestAccountDeletion();
      setStage("code");
    } catch (err) {
      setErrors({ _: message(err) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setErrors({});
    try {
      await authApi.confirmAccountDeletion({ password, code });
      // The session is already dead server-side — clear local state and leave.
      await logout().catch(() => undefined);
      toast.success("Your account has been deleted.");
      void navigate("/register", { replace: true });
    } catch (err) {
      setErrors(details(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="border-debit/30">
        <CardHeader>
          <CardTitle className="text-[16px]">Delete account</CardTitle>
          <CardDescription>
            This removes your account and all its data permanently. Move any balance out first —
            it can't be recovered afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="danger"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTimeout(reset, 200);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account</DialogTitle>
            <DialogDescription>
              {stage === "confirm"
                ? "Enter your password to continue. We'll email a code to confirm."
                : "Enter the code we emailed you. This is the last step."}
            </DialogDescription>
          </DialogHeader>

          {stage === "confirm" ? (
            <div className="space-y-4">
              <Field label="Password" error={errors.password}>
                {({ id, invalid, ...aria }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    autoFocus
                    {...aria}
                  />
                )}
              </Field>

              {errors._ && (
                <p role="alert" className="text-[12.5px] text-debit">
                  {errors._}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Keep my account
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void requestCode()}
                  loading={busy}
                  disabled={!password}
                >
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <OtpField value={code} onChange={setCode} disabled={busy} autoFocus />
              </div>

              {(errors.code || errors._ || errors.password) && (
                <p role="alert" className="text-center text-[12.5px] text-debit">
                  {errors.code ?? errors._ ?? errors.password}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void confirmDelete()}
                  loading={busy}
                  disabled={code.length !== 6}
                >
                  Delete permanently
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Settings() {
  const { user, wallet } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
          Settings
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          Signed in as {user?.username} · {user?.email}
        </p>
      </div>

      <VerifyEmailCard />
      <ChangePasswordCard />

      {wallet && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">Your wallet</CardTitle>
            <CardDescription>
              Held on {wallet.network}. It belongs to your account, not to this browser — sign in
              anywhere and it follows you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="break-all font-mono text-[13px] text-ink-soft">{wallet.address}</p>
          </CardContent>
        </Card>
      )}

      <DeleteAccountCard />
    </div>
  );
}
