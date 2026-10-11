# Multi-turn conversation eval

## Why run this separately

The Lesson 3 model eval sends one customer message to a fresh agent and checks one response. This eval keeps the same order, session, agent, and message history across multiple turns so it can test whether later behavior uses the current conversation context and world state.

## Scenario

The customer asks for a shipping-fee refund on October 14, while the delivery promise is October 15. The policy tool declines and creates no request. The fixture clock then advances to October 16. The customer asks again, and the same agent should create a pending request for human review.

```text
Turn 1: customer asks before promise → REFUND_NOT_ELIGIBLE → zero requests
Fixture clock advances to October 16
Turn 2: customer asks again → REVIEW_REQUESTED → one pending request
```

The test harness passes the accumulated transcript on each run:

```js
messages.push({ role: "user", content: step.message });
const reply = await agent.reply(messages, { traceId, conversationId });
messages.push({ role: "assistant", content: reply.message });
```

Each model turn receives a unique trace ID, but both use the same conversation ID. This matches the application's correlation design: a conversation can contain multiple traces. The clock is controlled by the test fixture, so the date change is repeatable.

## Checks

`evals/conversation-grading.js` checks every turn's tool result and queue state, the final wording, one shared conversation ID, and a distinct trace ID per turn. Unit tests use synthetic good and bad conversation results, so they need no API key. `npm run eval:conversation` runs the model-backed version and requires `OPENAI_API_KEY`.

This eval proves that the model received the prior messages and that the server applied the policy against the current test clock. It does not simulate a real deployment or a human refund reviewer making a decision.
