import { useContext } from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { cn } from "@/lib/utils";

function Slot({ index }: { index: number }) {
  const { slots } = useContext(OTPInputContext);
  const slot = slots[index];
  if (!slot) return null;

  const { char, hasFakeCaret, isActive } = slot;

  return (
    <div
      className={cn(
        "relative flex h-13 w-11 items-center justify-center rounded-[10px] border bg-card",
        "font-mono text-[20px] text-ink transition-colors",
        isActive ? "border-indigo ring-2 ring-indigo/20" : "border-line-strong",
      )}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-[blink_1s_steps(2,start)_infinite] bg-ink" />
        </div>
      )}
    </div>
  );
}

export interface OtpFieldProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Six-digit code entry. Autocomplete is set to `one-time-code` so iOS and
 * Android offer the code straight from the notification.
 */
export function OtpField({ value, onChange, onComplete, disabled, autoFocus }: OtpFieldProps) {
  return (
    <OTPInput
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={6}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      containerClassName="flex items-center gap-2 has-[:disabled]:opacity-50"
      render={({ slots }) => (
        <div className="flex gap-2">
          {slots.map((_, i) => (
            <Slot key={i} index={i} />
          ))}
        </div>
      )}
    />
  );
}
