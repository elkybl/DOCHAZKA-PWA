import assert from "node:assert/strict";
import test from "node:test";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function finalizePaymentAllocation(input) {
  const paid_total = round2(input.paid_total);
  const unpaid_total = round2(input.unpaid_total);
  const unknown_total = round2(input.unknown_total);
  const payment_state =
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

function emptyPaymentAllocation() {
  return finalizePaymentAllocation({ paid_total: 0, unpaid_total: 0, unknown_total: 0 });
}

function applyPaymentAmount(allocation, amount, bucket) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return allocation;

  return finalizePaymentAllocation({
    ...allocation,
    paid_total: bucket === "paid" ? round2(allocation.paid_total + value) : allocation.paid_total,
    unpaid_total: bucket === "unpaid" ? round2(allocation.unpaid_total + value) : allocation.unpaid_total,
    unknown_total: bucket === "unknown" ? round2(allocation.unknown_total + value) : allocation.unknown_total,
  });
}

function bucketForGroupedFallback(items) {
  if (items.length === 0) return null;
  if (items.every((x) => !!x.is_paid)) return "paid";
  if (items.every((x) => !x.is_paid)) return "unpaid";
  return "unknown";
}

test("mixed day keeps paid money out of unpaid total", () => {
  let payment = emptyPaymentAllocation();
  payment = applyPaymentAmount(payment, 1200, "paid");
  payment = applyPaymentAmount(payment, 800, "unpaid");
  payment = applyPaymentAmount(payment, 350, "paid");

  assert.equal(payment.payment_state, "partial");
  assert.equal(payment.paid_total, 1550);
  assert.equal(payment.unpaid_total, 800);
  assert.equal(payment.unknown_total, 0);
  assert.equal(payment.paid, false);
});

test("manual transport and material follow their own event payment flag", () => {
  let payment = emptyPaymentAllocation();
  payment = applyPaymentAmount(payment, 500, "paid");
  payment = applyPaymentAmount(payment, 240, "unpaid");
  payment = applyPaymentAmount(payment, 125.5, "unpaid");

  assert.equal(payment.payment_state, "partial");
  assert.equal(payment.paid_total, 500);
  assert.equal(payment.unpaid_total, 365.5);
});

test("offsite amount is not affected by other records in the same day", () => {
  let payment = emptyPaymentAllocation();
  payment = applyPaymentAmount(payment, 900, "paid");
  payment = applyPaymentAmount(payment, 600, "unpaid");

  assert.equal(payment.payment_state, "partial");
  assert.equal(payment.paid_total, 900);
  assert.equal(payment.unpaid_total, 600);
});

test("grouped fallback transport is unknown for mixed paid day", () => {
  const bucket = bucketForGroupedFallback([{ is_paid: true }, { is_paid: false }]);
  let payment = emptyPaymentAllocation();
  payment = applyPaymentAmount(payment, 300, bucket);

  assert.equal(bucket, "unknown");
  assert.equal(payment.payment_state, "partial");
  assert.equal(payment.paid_total, 0);
  assert.equal(payment.unpaid_total, 0);
  assert.equal(payment.unknown_total, 300);
});
