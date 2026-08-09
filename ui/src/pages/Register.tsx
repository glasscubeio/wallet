import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { ApiError, type ErrorDetails } from "@/lib/api";

const PERKS = [
  "A dollar account created the moment you sign up",
  "Network fees covered — you never need ETH",
  "Sign in from any device with your email",
];

type FormKey = "username" | "email" | "password";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [errors, setErrors] = useState<ErrorDetails>({});
  const [submitting, setSubmitting] = useState(false);

  function update(key: FormKey, value: string) {
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
      await register(form);
      void navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.details).length)
        setErrors(err.details);
      else
        setErrors({
          _: err instanceof Error ? err.message : "Something went wrong",
        });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Takes about twenty seconds. No wallet app, no seed phrase."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Username" error={errors.username}>
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              invalid={invalid}
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="nodir"
              {...aria}
            />
          )}
        </Field>

        <Field label="Email" error={errors.email}>
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              invalid={invalid}
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              {...aria}
            />
          )}
        </Field>

        <Field
          label="Password"
          error={errors.password}
          hint="At least 8 characters."
        >
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              invalid={invalid}
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              {...aria}
            />
          )}
        </Field>

        {errors._ && (
          <p
            role="alert"
            className="rounded-[10px] bg-debit/8 px-3 py-2.5 text-[13px] text-debit"
          >
            {errors._}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Creating your wallet" : "Create account"}
        </Button>
      </form>

      <ul className="mt-6 space-y-2 border-t border-line pt-5">
        {PERKS.map((perk) => (
          <li
            key={perk}
            className="flex items-start gap-2.5 text-[13px] text-ink-soft"
          >
            <Check
              className="mt-0.75 h-3.5 w-3.5 shrink-0 text-credit"
              aria-hidden="true"
            />
            {perk}
          </li>
        ))}
      </ul>
    </AuthShell>
  );
}
