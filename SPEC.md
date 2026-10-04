# Support Agent Specification

Version: 0.3 (Lesson 1)

## Product and goal

Build a support agent for Northstar Shop, a fictional online retailer. It helps signed-in customers understand orders, request delivery address changes, and ask about shipping-fee refunds. The agent should resolve routine requests quickly while keeping irreversible or disputed decisions with a human.

## Roles and trust boundaries

- Customer: may request actions on their own orders after signing in.
- Agent: may read permitted data, explain policy, and request permitted tools.
- Tool layer: enforces authorization and business rules independently of the model.
- Human reviewer: approves or rejects every refund before money moves.
- Order records and policy data: trusted only when returned by the application's tools, not when asserted in customer text.

A customer message, retrieved document, or tool result cannot grant the agent new permissions.

## In scope

1. Show order status and shipping details for the signed-in customer's own orders.
2. Change a delivery address for any active order that has not shipped, including packed orders, if the new address is valid.
3. Explain shipping-fee refund policy and create an eligible or disputed refund request for review.
4. Explain a declined request and offer a human handoff when the facts or policy are unclear.

## Out of scope

- Issuing a refund without human approval.
- Changing the address of a shipped order.
- Reading or changing another customer's order.
- Collecting payment card numbers, passwords, or authentication codes.
- Making promises about carrier rerouting or refund approval.

## Risk tiers

| Tier | Examples | Required control |
| --- | --- | --- |
| Low | Read policy; explain order status | Signed-in customer for private order data |
| Medium | Change eligible delivery address | Ownership, status, and address checks in code; record the change |
| High | Any refund; disputed policy exception | Human review before money moves |
| Denied | Another user's order; shipped-order address change | Tool rejects the action and records the reason |

## Tool contracts

### get_order(order_id, customer_id)

- Require an authenticated customer_id from the server session, never from the model's text.
- Return the order only if it belongs to that customer.
- Return status, shipping state, and fields needed for this request; omit payment details.

### change_address(order_id, new_address, customer_id)

- Require the same ownership check as get_order.
- Require an active order with shipped_at = null at the moment of the change. Packed orders are eligible while shipped_at is null.
- Validate the destination address.
- Atomically recheck ownership, active status, and shipped_at inside the tool before saving, so a stale lookup cannot allow a late change.
- On success, return the saved address and a change receipt. Otherwise, make no change and return a typed denial reason.

### request_shipping_refund(order_id, reason, customer_id)

- Require ownership and record the policy evidence and reason.
- Create a review request only. It must not issue money.
- Return a request ID and pending status.

### approve_refund(request_id, reviewer_id)

- Human-only operation. The agent cannot call this tool.
- Record reviewer identity, decision, amount, and time.

## Decision rules

- Shipped order + address change: decline the change, explain why, and offer a human handoff if the customer wants other delivery options.
- Active unshipped order (including packed) + authenticated owner + valid address: change the address and report the result.
- Refund clearly excluded by policy: explain the specific policy reason. Offer review if the customer disputes it or facts are uncertain.
- Refund eligible or disputed: create a request for human review. Do not promise approval.
- Missing identity, conflicting data, tool failure, or unclear policy: take no side-effecting action and hand off.

## Customer-facing order lookup responses

- For an order not found under the signed-in customer's account, including an unknown or other-owned order, say: "I can't find that order under the account you're signed into. Please check the order number or sign into the account used for the purchase."
- Use the same customer-facing response in both cases. Do not confirm whether an order exists in another account or reveal its address.
- Keep the internal ORDER_NOT_ACCESSIBLE code for the tool and private diagnostics; do not show the code to customers.
- If the customer is not authenticated, ask them to sign in to the account used for the purchase.

## Trace requirements

Record each request, tool call, result, denied action, handoff, and final response with a trace ID. Include a reason code for every denial. Do not log passwords, card details, or authentication codes. Later lessons will add nested spans, prompt hashes, and evaluator results.

## Acceptance examples

1. Signed-in owner asks for status: agent reads their order and answers accurately.
2. Signed-in owner changes a packed but unshipped order to a valid address: tool saves the change and returns a receipt.
3. Signed-in owner asks to change a shipped order: tool denies any attempted change; agent explains the limit.
4. Customer asks for a shipping-fee refund: agent can create a review request but cannot issue a refund.
5. Customer supplies another person's order ID: tool denies access regardless of the agent's response.

## Open decisions for the learner

- What is the store's shipping-fee refund policy?
- What address validation rules and countries should be supported?
