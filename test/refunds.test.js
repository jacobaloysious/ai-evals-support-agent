import assert from "node:assert/strict";
import test from "node:test";
import { shippingFeeReviewEligibility } from "../src/refunds.js";

const revisedOrder = {
  promisedDeliveryAt: "2026-10-12T00:00:00Z", // Replaces an earlier promise after an address change.
  deliveredAt: null,
  carrierLost: false,
};

test("does not mark an order late before the revised promise expires", () => {
  assert.deepEqual(shippingFeeReviewEligibility(revisedOrder, "2026-10-11T00:00:00Z"), {
    eligible: false, code: "WITHIN_PROMISE",
  });
});

test("marks an order late after the revised promise expires", () => {
  assert.deepEqual(shippingFeeReviewEligibility(revisedOrder, "2026-10-13T00:00:00Z"), {
    eligible: true, code: "DELIVERY_LATE",
  });
});

test("compares actual delivery time with the revised promise", () => {
  assert.deepEqual(shippingFeeReviewEligibility({
    ...revisedOrder, deliveredAt: "2026-10-11T00:00:00Z",
  }, "2026-10-20T00:00:00Z"), { eligible: false, code: "WITHIN_PROMISE" });
});

test("confirmed carrier loss is eligible before the promise date", () => {
  assert.deepEqual(shippingFeeReviewEligibility({
    ...revisedOrder, carrierLost: true,
  }, "2026-10-05T00:00:00Z"), { eligible: true, code: "CONFIRMED_LOSS" });
});

test("missing revised promise routes to a human instead of inventing a date", () => {
  assert.deepEqual(shippingFeeReviewEligibility({
    ...revisedOrder, promisedDeliveryAt: null,
  }, "2026-10-13T00:00:00Z"), {
    eligible: null, code: "PROMISE_UNAVAILABLE", needsHumanReview: true,
  });
});
