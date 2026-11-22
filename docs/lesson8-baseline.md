# Lesson 8: establish a baseline and grow the regression suite

We added three ordinary customer requests to the live model eval: read an order's status, list the signed-in customer's orders, and change an eligible delivery address. They are now part of the maintained `evals/model-scenarios.json` regression suite. At the time, this three-scenario subset was loaded from a separate file using `MODEL_EVAL_SCENARIOS`. That file has since been merged into the main suite, so the historical command no longer selects just those three cases. Run `pnpm run eval:model` to run the current full suite.

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

The address-date case exposed a gap, and we used that observation to guide the Lesson 9 changes. Once used to guide changes, these examples became regression cases rather than a held-out set. The historical scores below refer to the three-scenario subset at that time; the current model eval runs the full maintained suite.
