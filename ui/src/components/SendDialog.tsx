import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { OtpField } from "@/components/ui/otp-input";
import { walletApi, ApiError, type ErrorDetails } from "@/lib/api";
import { formatUsd, shortAddress } from "@/lib/utils";
import type { Transfer } from "@/types/api";

type Step = "details" | "code";

export interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: string;
  onSent?: (transfer: Transfer) => void;
}

function toDetails(err: unknown): ErrorDetails {
  if (err instanceof ApiError) {
    return Object.keys(err.details).length ? err.details : { _: err.message };
  }
  return { _: err instanceof Error ? err.message : "Something went wrong" };
}

export function SendDialog({ open, onOpenChange, balance, onSent }: SendDialogProps) {
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState({ to: "", amount: "" });
  const [code, setCode] = useState("");
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [errors, setErrors] = useState<ErrorDetails>({});
  const [submitting, setSubmitting] = useState(false);

  // A completed dialog shouldn't reopen mid-flow — reset once it's closed.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (open) return;
    closeTimer.current = setTimeout(() => {
      setStep("details");
      setForm({ to: "", amount: "" });
      setCode("");
      setTransfer(null);
      setErrors({});
    }, 200);
    return () => clearTimeout(closeTimer.current);
  }, [open]);

  function update(key: "to" | "amount", value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const { [key]: _omitField, _: _omitGeneral, ...rest } = e;
      return rest;
    });
  }

  function finish(result: Transfer) {
    onSent?.(result);
    onOpenChange(false);
    if (result.status === "completed") {
      toast.success(`Sent $${formatUsd(result.amount)} to ${shortAddress(result.to)}`);
    } else {
      toast.success("Transfer submitted. It'll confirm in a few seconds.");
    }
  }

  async function handleDetails(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const res = await walletApi.send({ to: form.to.trim(), amount: form.amount.trim() });
      setTransfer(res.transfer);
      if (res.requiresOtp) setStep("code");
      else finish(res.transfer);
    } catch (err) {
      setErrors(toDetails(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCode(submittedCode?: string) {
    const value = submittedCode ?? code;
    if (value.length !== 6 || !transfer) return;

    setSubmitting(true);
    setErrors({});

    try {
      const res = await walletApi.confirmSend({ transferId: transfer.id, code: value });
      finish(res.transfer);
    } catch (err) {
      setErrors({ code: err instanceof Error ? err.message : "Something went wrong" });
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  const available = Number(balance || 0);
  const requested = Number(form.amount || 0);
  const overBalance = requested > available;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle>Send USDC</DialogTitle>
              <DialogDescription>
                You have ${formatUsd(available)} available. Fees are covered.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleDetails} className="space-y-4" noValidate>
              <Field label="Recipient address" error={errors.to}>
                {({ id, invalid, ...aria }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    value={form.to}
                    onChange={(e) => update("to", e.target.value)}
                    placeholder="0x…"
                    autoFocus
                    spellCheck="false"
                    className="font-mono text-[13.5px]"
                    {...aria}
                  />
                )}
              </Field>

              <Field label="Amount" error={errors.amount}>
                {({ id, invalid, ...aria }) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-faint">
                      $
                    </span>
                    <Input
                      id={id}
                      invalid={invalid || overBalance}
                      value={form.amount}
                      onChange={(e) => update("amount", e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="tnum pl-7 pr-16"
                      {...aria}
                    />
                    <button
                      type="button"
                      onClick={() => update("amount", String(available))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[12px] font-medium text-indigo transition-colors hover:bg-indigo-wash"
                    >
                      Max
                    </button>
                  </div>
                )}
              </Field>

              {overBalance && !errors.amount && (
                <p role="alert" className="text-[12.5px] text-debit">
                  That's more than your ${formatUsd(available)} balance.
                </p>
              )}

              {errors._ && (
                <p
                  role="alert"
                  className="rounded-[10px] bg-debit/8 px-3 py-2.5 text-[13px] text-debit"
                >
                  {errors._}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={submitting}
                disabled={!form.to || !form.amount || overBalance}
              >
                {submitting ? "Checking" : "Continue"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm this transfer</DialogTitle>
              <DialogDescription>
                We emailed a 6-digit code. Entering it signs the transfer — that's what
                keeps your wallet usable from any device.
              </DialogDescription>
            </DialogHeader>

            <div className="mb-5 rounded-[10px] border border-line bg-paper px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-ink-soft">Sending</span>
                <span className="tnum font-display text-[19px] font-semibold text-ink">
                  ${formatUsd(transfer?.amount)}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-ink-soft">To</span>
                <span className="truncate font-mono text-[12.5px] text-ink">
                  {shortAddress(transfer?.to, 10, 8)}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-ink-soft">Network fee</span>
                <span className="text-[13px] font-medium text-credit">Covered</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-center">
                <OtpField
                  value={code}
                  onChange={setCode}
                  onComplete={handleCode}
                  disabled={submitting}
                  autoFocus
                />
              </div>

              {errors.code && (
                <p role="alert" className="text-center text-[12.5px] text-debit">
                  {errors.code}
                </p>
              )}

              <Button
                size="lg"
                className="w-full"
                loading={submitting}
                disabled={code.length !== 6}
                onClick={() => handleCode()}
              >
                {submitting ? "Sending" : "Confirm and send"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setCode("");
                  setErrors({});
                }}
                className="flex w-full items-center justify-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-indigo"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Change the details
              </button>
            </div>

            <p className="mt-5 flex items-start gap-2 text-[12px] leading-relaxed text-ink-faint">
              <ShieldCheck className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              The code only works for this exact amount and recipient.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
