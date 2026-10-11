# Lesson 3: scenarios, evals, and traces

## What this eval checks

The JSON file in `evals/lesson3-scenarios.json` describes customer situations using a fixed session, order, and clock. `evals/lesson3.js` creates fresh in-memory stores for every scenario, runs the deterministic agent interface, then compares the result and refund-request side effect with the expected behavior.

This first eval checks three policy situations:

1. A refund request before the delivery promise must be declined with no request created.
2. A late delivery may create a pending request for human review, but must not issue a refund.
3. A customer cannot create a refund request for an order owned by another account.

## Why it does not call the language model

The eval submits a structured agent proposal directly to `createSupportAgent`. That isolates policy behavior from the model's choice of action and wording. It lets us answer whether the server-side agent and tools enforce the expected outcome reproducibly.

This does **not** yet evaluate whether the model understands arbitrary customer messages, chooses the right tool, or explains the result well. Those need a later model-in-the-loop eval. We should keep those checks separate so a failure tells us whether the problem was model interpretation or server policy.

## How to run it

```sh
npm run eval:lesson3
```

Each printed scenario is a small eval trace: it shows the proposal, agent outcome, created refund requests, and response. It is not the OpenAI Agents SDK trace; the runner does not call the model or create a remote trace.

## Why these expectations are exact

The outcome and request count are deterministic safety checks. A reviewer request must stay pending, and a decline must not create one. The response substring is a small check that the customer receives a relevant explanation. It is intentionally modest; this is not a complete natural-language quality grader.

## Model-in-the-loop follow-up

`evals/model-scenarios.json` and `evals/model-eval.js` add a separate, optional follow-up. Run it with:

```sh
npm run eval:model
```

This calls the configured OpenAI model for each customer message. It checks that the model actually used the expected tool, that the server returned the expected policy code, that the refund queue has the right state, and that the final response passes a small set of phrase checks. The exact policy and side-effect checks remain authoritative; phrase checks are a lightweight first pass for response quality.

The runner prints a distinct trace ID and conversation ID per scenario. The Agents SDK can export each run to the OpenAI Traces dashboard; `forceFlush()` is called so the process waits for queued trace data before it exits. This runner does not use Vercel. It requires a local `OPENAI_API_KEY`, and each scenario makes a live model request. If the key is missing, it exits with a clear message rather than reporting a skipped scenario as passed.

An eval can still be flaky because the model may choose different wording or tool behavior across runs. This first model eval therefore uses broad phrase alternatives and exact checks for tool code and queue state. Review a failed scenario's trace before changing the policy or prompt.
