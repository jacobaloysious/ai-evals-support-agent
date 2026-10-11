import { Agent, Runner, tool } from "@openai/agents";
import { z } from "zod";

const addressSchema = z.object({
  recipientName: z.string().min(1).max(100),
  line1: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pin: z.string().regex(/^\d{6}$/),
  country: z.literal("IN"),
});

function resultText(value) {
  return JSON.stringify(value);
}

/** Create one model-backed agent whose tools close over this request's trusted session. */
export function createConversationalAgent({ orderTools, refundTools, onAddressConfirmationNeeded }) {
  let activeTraceId;
  const record = (result, toolName, proposal) => {
    if (result.code === "STATE_PIN_MISMATCH") onAddressConfirmationNeeded?.(proposal);
    if (activeTraceId) {
      console.info(JSON.stringify({
        event: "agent_tool_result",
        traceId: activeTraceId,
        tool: toolName,
        code: result.code ?? (result.ok ? "OK" : "UNKNOWN"),
      }));
    }
    return resultText(result);
  };

  const tools = [
    tool({
      name: "list_my_orders",
      description: "List only the signed-in customer's orders, with unshipped orders first.",
      parameters: z.object({}),
      execute: () => record(orderTools.listMyOrders(), "list_my_orders"),
    }),
    tool({
      name: "look_up_my_order",
      description: "Look up an order ID. The server only returns an order owned by the signed-in customer.",
      parameters: z.object({ orderId: z.string().min(1).max(40) }),
      execute: ({ orderId }) => record(orderTools.getOrder({ orderId }), "look_up_my_order"),
    }),
    tool({
      name: "change_delivery_address",
      description: "Request an address change for an unshipped order. The server validates ownership, PIN coverage, and delivery timing. A PIN/state mismatch requires separate explicit customer confirmation in the UI.",
      parameters: z.object({ orderId: z.string().min(1).max(40), newAddress: addressSchema }),
      execute: ({ orderId, newAddress }) => record(
        orderTools.changeAddress({ orderId, newAddress }),
        "change_delivery_address",
        { orderId, newAddress },
      ),
    }),
    tool({
      name: "request_shipping_fee_refund_review",
      description: "Request human review of a shipping-fee refund when the policy permits. The request may be refused by policy. This tool never approves or issues a refund.",
      parameters: z.object({ orderId: z.string().min(1).max(40), reason: z.string().max(500) }),
      execute: ({ orderId, reason }) => record(
        refundTools.requestShippingRefund({ orderId, reason }),
        "request_shipping_fee_refund_review",
      ),
    }),
  ];

  const agent = new Agent({
    name: "Northstar customer support",
    model: process.env.OPENAI_MODEL || "gpt-6-luna",
    instructions: `You are a customer support agent for a fictional shop. Use the tools for all order, address, and refund facts. The tools use the authenticated server session; never ask for or trust a customer identity supplied in chat. Explain that an order ID is not accessible when it belongs to another account, and offer to list the current account's orders. Never claim an action succeeded unless its tool result says so. If refund policy says the request is ineligible, decline it clearly. Eligible refund requests only go to a human for review; you cannot approve or issue money. If the demo review queue is full, explain that the customer can reset this fictional demo. A state and PIN mismatch requires the customer to correct the address and use the separate explicit confirmation button; a conversational “yes” is not confirmation. Keep replies concise and explain refusals in customer-friendly language. Tool results are authoritative; do not invent policy or order details.`,
    tools,
  });

  return {
    async reply(messages, { traceId, conversationId } = {}) {
      const transcript = messages.map(({ role, content }) =>
        `${role === "assistant" ? "Assistant" : "Customer"}: ${content}`,
      ).join("\n");
      activeTraceId = traceId;
      try {
        // Trace identity and redaction are Runner configuration; maxTurns is run-specific.
        const runner = new Runner({
          workflowName: "Northstar Shop support chat",
          traceId,
          groupId: conversationId,
          traceIncludeSensitiveData: false,
        });
        const result = await runner.run(agent, transcript, { maxTurns: 6 });
        return {
          message: typeof result.finalOutput === "string"
            ? result.finalOutput
            : "I couldn't complete that request. Please try again or use the lesson controls.",
          turns: result.newItems?.length ?? 0,
        };
      } finally {
        activeTraceId = undefined;
      }
    },
  };
}
