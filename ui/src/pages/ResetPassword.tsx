import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { OtpField } from "@/components/ui/otp-input";
import { authApi, ApiError, type ErrorDetails } from "@/lib/api";

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const passedEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(passedEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<ErrorDetails>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      await authApi.resetPassword({ email, code, password });
      toast.success("Password updated. Sign in with your new password.");
      void navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.details).length) setErrors(err.details);
      else setErrors({ _: err instanceof Error ? err.message : "Something went wrong" });
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Enter the code from your email and choose a new password."
      footer={
        <Link to="/forgot-password" className="font-medium text-indigo hover:underline">
          Send a new code
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email}>
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              invalid={invalid}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              {...aria}
            />
          )}
        </Field>

        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-ink-soft">Reset code</span>
          <OtpField value={code} onChange={setCode} autoFocus={Boolean(email)} />
          {errors.code && (
            <p role="alert" className="text-[12.5px] text-debit">
              {errors.code}
            </p>
          )}
        </div>

        <Field label="New password" error={errors.password} hint="At least 8 characters.">
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              invalid={invalid}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              {...aria}
            />
          )}
        </Field>

        {errors._ && (
          <p role="alert" className="rounded-[10px] bg-debit/8 px-3 py-2.5 text-[13px] text-debit">
            {errors._}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={code.length !== 6 || !password || !email}
        >
          {submitting ? "Updating" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
