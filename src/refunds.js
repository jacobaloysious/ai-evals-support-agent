/**
 * Determine whether a shipping-fee request merits human review.
 * This function never issues a refund. `now` must come from the server clock.
 */
export function shippingFeeReviewEligibility(order, now) {
  if (order?.carrierLost === true) {
    return { eligible: true, code: "CONFIRMED_LOSS" };
  }

  const promised = Date.parse(order?.promisedDeliveryAt ?? "");
  if (Number.isNaN(promised)) {
    return { eligible: null, code: "PROMISE_UNAVAILABLE", needsHumanReview: true };
  }

  const delivered = order?.deliveredAt == null ? null : Date.parse(order.deliveredAt);
  if (delivered !== null && Number.isNaN(delivered)) {
    return { eligible: null, code: "DELIVERY_TIME_UNCLEAR", needsHumanReview: true };
  }

  const observed = delivered ?? Date.parse(now);
  if (Number.isNaN(observed)) throw new TypeError("A trusted current time is required");
  if (observed > promised) return { eligible: true, code: "DELIVERY_LATE" };
  return { eligible: false, code: "WITHIN_PROMISE" };
}
