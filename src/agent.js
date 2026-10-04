import { addressChangeMessage, orderLookupMessage, orderRecoveryMessage } from "./orders.js";

/**
 * A model may propose one of these actions. Only the injected server tools decide
 * whether a private read, address change, or refund review request is permitted.
 */
export function createSupportAgent({ orderTools, refundTools }) {
  if (!orderTools || !refundTools) throw new TypeError("Server tools are required");

  return {
    handleProposal(proposal) {
      if (!proposal || typeof proposal !== "object") {
        return { outcome: "handoff", message: "Please tell me what you need help with." };
      }
      const { action } = proposal;
      const args = proposal.args && typeof proposal.args === "object" ? proposal.args : {};
      if (action === "get_order") {
        const result = orderTools.getOrder({ orderId: args.orderId });
        if (!result.ok) return deniedOrder(result);
        return {
          outcome: "answered",
          message: `Order ${result.order.id} is ${result.order.status}. Its current promised delivery time is ${result.order.promisedDeliveryAt}.`,
        };
      }
      if (action === "list_my_orders") {
        const result = orderTools.listMyOrders();
        if (!result.ok) return deniedOrder(result);
        return { outcome: "answered", message: orderRecoveryMessage(result) };
      }
      if (action === "change_address") {
        const result = orderTools.changeAddress({ orderId: args.orderId, newAddress: args.newAddress });
        if (result.ok) {
          return {
            outcome: "changed",
            message: `I changed the delivery address for order ${result.orderId}. The revised promised delivery time is ${result.promisedDeliveryAt}.`,
          };
        }
        if (result.code === "ORDER_NOT_ACCESSIBLE" || result.code === "AUTH_REQUIRED") {
          return deniedOrder(result);
        }
        if (result.code === "STATE_PIN_MISMATCH") {
          return { outcome: "needs_confirmation", reasonCode: result.code, message: addressChangeMessage(result) };
        }
        if (result.code === "CONFIRMATION_REQUIRED") {
          return { outcome: "needs_confirmation", reasonCode: result.code, message: "Please confirm the corrected state and PIN before I update your delivery address." };
        }
        if (result.code === "ALREADY_SHIPPED") {
          return { outcome: "declined", message: "This order has already shipped, so I can't change its delivery address. Support can discuss other delivery options with you." };
        }
        if (result.code === "PIN_NOT_SERVICEABLE") {
          return { outcome: "declined", message: "Northstar Shop does not currently deliver to that PIN, so I can't save this address." };
        }
        if (result.code === "PROMISE_UNAVAILABLE") {
          return { outcome: "handoff", message: "I can't confirm a revised delivery promise for this address yet. I'll send this to support for review." };
        }
        return { outcome: "needs_confirmation", message: "Please check and confirm a complete, valid India delivery address and PIN." };
      }
      if (action === "request_shipping_refund") {
        const result = refundTools.requestShippingRefund({ orderId: args.orderId, reason: args.reason });
        if (result.ok) {
          return { outcome: "pending_human_review", message: `I submitted shipping-fee refund request ${result.requestId} for human review. No refund has been issued.` };
        }
        if (result.code === "ORDER_NOT_ACCESSIBLE" || result.code === "AUTH_REQUIRED") {
          return deniedOrder(result);
        }
        if (result.code === "REFUND_NOT_ELIGIBLE") {
          return { outcome: "declined", message: "The current delivery promise has not been missed and the carrier has not confirmed a loss, so the shipping-fee refund policy does not apply." };
        }
        return { outcome: "handoff", message: "I can't verify the delivery promise or loss status. Support will review the request." };
      }
      return { outcome: "declined", message: "I can't perform that action." };
    },
  };
}

function deniedOrder(result) {
  return { outcome: "declined", message: orderLookupMessage(result) };
}
