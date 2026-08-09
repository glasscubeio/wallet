import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { ApiError, type ErrorDetails } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ identifier: "", password: "" });
  const [errors, setErrors] = useState<ErrorDetails>({});
  const [submitting, setSubmitting] = useState(false);

  function update(key: "identifier" | "password", value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const { [key]: _field, _: _general, ...rest } = e;
      return rest;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      await login(form);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      void navigate(from ?? "/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.details).length) setErrors(err.details);
      else setErrors({ _: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Your wallet follows your account — any device, any browser."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-medium text-indigo hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email or username" error={errors.identifier}>
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              invalid={invalid}
              value={form.identifier}
              onChange={(e) => update("identifier", e.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="you@example.com"
              {...aria}
            />
          )}
        </Field>

        <Field label="Password" error={errors.password}>
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              invalid={invalid}
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="current-password"
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

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Signing in" : "Sign in"}
        </Button>

        <div className="text-center">
          <Link
            to="/forgot-password"
            className="text-[13px] text-ink-soft transition-colors hover:text-indigo"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
