import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends Omit<ComponentProps<"input">, "children"> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-[10px] border bg-card px-3 text-[15px] text-ink transition-colors",
        "placeholder:text-ink-faint",
        "focus:outline-none focus-visible:outline-2 focus-visible:outline-indigo focus-visible:outline-offset-0 focus-visible:border-indigo",
        invalid ? "border-debit" : "border-line-strong",
        className,
      )}
      {...props}
    />
  );
});

/** What `Field` hands to its render prop so the control is wired up correctly. */
export interface FieldRenderProps {
  id: string;
  invalid: boolean;
  "aria-describedby": string | undefined;
}

export interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  id?: string;
  children: (props: FieldRenderProps) => ReactNode;
}

/** Label + input + inline error, so every form field is wired up the same way. */
export function Field({ label, error, hint, children, id: providedId }: FieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      {children({
        id,
        invalid: Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-debit">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}
