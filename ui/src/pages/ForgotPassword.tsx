import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { authApi, ApiError, type ErrorDetails } from "@/lib/api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<ErrorDetails>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.details.email) setErrors(err.details);
      else setErrors({ _: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`If ${email} has an account, a 6-digit code is on its way. It expires in 10 minutes.`}
      >
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-wash">
            <MailCheck className="h-6 w-6 text-indigo" aria-hidden="true" />
          </div>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={() => navigate("/reset-password", { state: { email } })}
        >
          Enter the code
        </Button>

        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-3 w-full text-center text-[13px] text-ink-soft transition-colors hover:text-indigo"
        >
          Use a different email
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send a code to set a new one."
      footer={
        <Link to="/login" className="font-medium text-indigo hover:underline">
          Back to sign in
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
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors({});
              }}
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              {...aria}
            />
          )}
        </Field>

        {errors._ && (
          <p role="alert" className="rounded-[10px] bg-debit/8 px-3 py-2.5 text-[13px] text-debit">
            {errors._}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Sending" : "Send reset code"}
        </Button>
      </form>
    </AuthShell>
  );
}
