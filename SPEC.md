# Support Agent Specification

Version: 0.5 (Lesson 1 agent draft)

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
2. Show the signed-in account identifier in masked form and list only its recent orders, with unshipped orders first.
3. Change a delivery address for any active order that has not shipped, including packed orders, if the new India address is valid and serviceable.
4. Explain shipping-fee refund policy and create an eligible refund request for review.
5. Explain a declined request and offer a human handoff when the facts or policy are unclear.

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

### get_order(order_id)

- Require an authenticated customer_id from the server session, never from the model's text.
- Return the order only if it belongs to that customer.
- Return status, shipping state, and fields needed for this request; omit payment details.

### list_my_orders()

- Require an authenticated server session. Never accept a customer ID from model input.
- Show the signed-in email in masked form. Return only that customer's recent order IDs, dates, and statuses, with unshipped orders first. Omit addresses, session tokens, and other account data.
- If the sought order is absent, suggest checking another account used for the purchase or contacting support.

### change_address(order_id, new_address)

- Require the same ownership check as get_order.
- Require an active order with shipped_at = null at the moment of the change. Packed orders are eligible while shipped_at is null.
- Require an India address with recipient, address line, locality or city, state or union territory, and a six-digit PIN. Check that the PIN is assigned and in Northstar's delivery area.
- If the state and PIN conflict, explain the specific reason using the submitted PIN, submitted state, and state in the trusted postal record. Ask the customer to check and confirm the correct details. Wait for their reply, then revalidate the address before retrying; do not silently fix or save it.
- Obtain a revised promised delivery date from a trusted fulfillment provider. If unavailable, route to human review instead of inventing a date.
- Atomically recheck ownership, active status, and shipped_at inside the tool before saving the address and revised promise, so a stale lookup cannot allow a late change.
- On success, return the saved address and a change receipt. Otherwise, make no change and return a typed denial reason.

### request_shipping_refund(order_id, reason)

- Require ownership and record the policy evidence and reason.
- Decline automatically when trusted facts show the policy does not apply. Hand off when the facts are unclear.
- Create a review request only when trusted facts show eligibility. It must not issue money.
- Return a request ID and pending status.

### approve_refund(request_id, reviewer_id)

- Human-only operation, requiring a separate authenticated reviewer session. The agent cannot call this tool.
- Record reviewer identity, decision, amount, and time. An approved amount cannot exceed the trusted shipping fee.

## Shipping-fee refund policy

- A shipping-fee refund is eligible for human review when delivery misses the current promised delivery date or the carrier confirms the package is lost.
- An accepted address change replaces the original delivery promise with a new promise from the trusted fulfillment or carrier system. Compare delivery against that revised promise.
- If the revised promise is unavailable or the facts are disputed, hand off for human review.
- Every actual refund requires human approval. The agent cannot issue money.

## Decision rules

- Shipped order + address change: decline the change, explain why, and offer a human handoff if the customer wants other delivery options.
- Active unshipped order (including packed) + authenticated owner + valid address: change the address and report the result.
- Refund clearly excluded by policy: decline the refund request and explain the specific policy reason.
- Refund eligible: create a request for human review. Do not promise approval.
- Refund facts or promise unclear: hand off to support without issuing money.
- Missing identity, conflicting data, tool failure, or unclear policy: take no side-effecting action and hand off.

## Customer-facing order lookup responses

- For an order not found under the signed-in customer's account, including an unknown or other-owned order, say: "I can't find that order under the account you're signed into. Please check the order number or sign into the account used for the purchase."
- Use the same customer-facing response in both cases. Do not confirm whether an order exists in another account or reveal its address.
- Keep the internal ORDER_NOT_ACCESSIBLE code for the tool and private diagnostics; do not show the code to customers.
- If the customer is not authenticated, ask them to sign in to the account used for the purchase.
- If state and PIN do not match, identify the conflict (for example, “PIN 110001 is listed for Delhi, while your address says Karnataka”), explain that this blocks the change, and ask the customer to confirm the correct details. Do not silently alter the state or PIN.

## Trace requirements

Record each request, tool call, result, denied action, handoff, and final response with a trace ID. Include a reason code for every denial. Do not log passwords, card details, or authentication codes. Later lessons will add nested spans, prompt hashes, and evaluator results.

## Acceptance examples

1. Signed-in owner asks for status: agent reads their order and answers accurately.
2. Signed-in owner changes a packed but unshipped order to a valid address: tool saves the change and returns a receipt.
3. Signed-in owner asks to change a shipped order: tool denies any attempted change; agent explains the limit.
4. Eligible customer asks for a shipping-fee refund: agent creates a pending review request but cannot issue a refund.
5. Trusted facts show the refund policy does not apply: agent declines without creating a review request.
6. Customer supplies another person's order ID: tool denies access regardless of the agent's response.
7. Customer cannot find an order: show a masked account identifier and only that account's recent orders, unshipped first, without addresses.
8. New India address has a state and PIN mismatch: explain the mismatch, ask the customer to confirm, and make no change.
9. PIN is assigned but outside Northstar's service area: decline the address change.
10. Accepted address change: save the address and trusted revised delivery promise together; use that promise when assessing lateness.
11. Delivery misses the current promised date or the carrier confirms loss: a shipping-fee refund may be sent for human review, never issued directly by the agent.

## Lesson 1 prototype boundary

The runnable example accepts structured action proposals as a stand-in for model output. The customer agent receives only order tools and a refund-request tool; the human review tool is constructed separately. After a state/PIN mismatch, the order tool holds the change until the server supplies a customer confirmation signal for the corrected address. This in-memory hold survives a new agent instance. Server-supplied sessions, order records, PIN fixtures, delivery promises, and clock values drive authorization and policy decisions. No live LLM, login service, postal directory, fulfillment system, payment processor, or durable review queue is connected yet.

The browser demo is a public learning sandbox with fictional Alice and Bob personas. Selecting a persona creates a signed, HTTP-only server session containing only that persona's fictional orders. Anyone may select either persona; this is not real customer authentication. The server reads identity only from the signed session and never from a proposed action. Session state, address-confirmation hold, simulated date, and review requests persist in the signed cookie across serverless requests. The demo contains no real customer data or money movement. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup and limits.

## Deferred implementation

- Replace the deterministic India PIN and coverage fixtures with a verified postal directory and Northstar serviceability source before a real deployment.
- Replace the in-memory conditional write with a database transaction that rechecks ownership and shipping state.
- Connect real authentication, fulfillment promises, a durable human review workflow, and payment issuance in later implementation steps.
