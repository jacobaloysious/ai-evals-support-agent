# Lesson 8: initial held-out baseline

We added `evals/optimization-scenarios.json` for three ordinary customer requests: read an order's status, list the signed-in customer's orders, and change an eligible delivery address. The eval runner can select it without changing the agent:

```sh
MODEL_EVAL_SCENARIOS=./optimization-scenarios.json npm run eval:model
```

The runner reports scenario pass rate, tool-call count, and elapsed milliseconds. These are observable cost proxies, not dollar costs. Dollar estimates require token usage and the current model's pricing; the SDK wrapper does not expose token usage in this eval output.

## Baseline

Model: `gpt-6-luna`. Date: 2026-10-11. The final baseline run used the written policy as the rubric:

| Scenario | Result | Tool calls | Elapsed |
| --- | --- | ---: | ---: |
| Order status | Pass | 1 | 3,972 ms |
| List signed-in account's orders | Pass | 1 | 3,686 ms |
| Change address and report revised promise | Fail | 1 | 3,640 ms |

Accuracy: **2/3 (67%)**. Average: **1.0 tool call** and **3,766 ms** per scenario in this small run. Latency varies with network and service conditions, and three samples are not a stable performance estimate.

The first pass of the address scenario only required the reply to say that the address changed. The agent did that but omitted the revised October 20 delivery promise. The tool result was `ADDRESS_CHANGED`, but the response was incomplete according to the spec. We tightened the rubric and added a grader regression test. This is why the rubric needs to measure the customer outcome, not just successful tool execution.

The address-date case exposed a gap, and we used that observation to guide the Lesson 9 changes. So `optimization-scenarios.json` is now a development/regression set, not a pristine held-out set. We created a separate `final-validation-scenarios.json` for a final check after those changes.
