export type PaymentState = "paid" | "unpaid" | "partial";

export type PaymentBucket = "paid" | "unpaid" | "unknown";

export type PaymentAllocation = {
  paid_total: number;
  unpaid_total: number;
  unknown_total: number;
  payment_state: PaymentState;
  paid: boolean;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function emptyPaymentAllocation(): PaymentAllocation {
  return {
    paid_total: 0,
    unpaid_total: 0,
    unknown_total: 0,
    payment_state: "paid",
    paid: true,
  };
}

export function applyPaymentAmount(
  allocation: PaymentAllocation,
  amount: number,
  bucket: PaymentBucket
): PaymentAllocation {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return allocation;

  const next = {
    ...allocation,
    paid_total: bucket === "paid" ? round2(allocation.paid_total + value) : allocation.paid_total,
    unpaid_total: bucket === "unpaid" ? round2(allocation.unpaid_total + value) : allocation.unpaid_total,
    unknown_total: bucket === "unknown" ? round2(allocation.unknown_total + value) : allocation.unknown_total,
  };

  return finalizePaymentAllocation(next);
}

export function finalizePaymentAllocation(input: Pick<PaymentAllocation, "paid_total" | "unpaid_total" | "unknown_total">): PaymentAllocation {
  const paid_total = round2(input.paid_total);
  const unpaid_total = round2(input.unpaid_total);
  const unknown_total = round2(input.unknown_total);
  const payment_state: PaymentState =
    unknown_total > 0 || (paid_total > 0 && unpaid_total > 0)
      ? "partial"
      : unpaid_total > 0
      ? "unpaid"
      : "paid";

  return {
    paid_total,
    unpaid_total,
    unknown_total,
    payment_state,
    paid: payment_state === "paid",
  };
}

export function bucketFromPaidFlag(isPaid: boolean): PaymentBucket {
  return isPaid ? "paid" : "unpaid";
}

export function bucketForGroupedFallback(items: Array<{ is_paid: boolean }>): PaymentBucket | null {
  if (items.length === 0) return null;
  if (items.every((x) => !!x.is_paid)) return "paid";
  if (items.every((x) => !x.is_paid)) return "unpaid";
  return "unknown";
}
