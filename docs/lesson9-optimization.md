# Lesson 9: improve accuracy and efficiency

## Change 1: preserve the revised promise in the reply

The optimization run exposed a behavior gap: after the address tool returned `ADDRESS_CHANGED` with a revised promise of October 20, the model confirmed the address but omitted that promise. We made two changes:

1. Added a clear instruction to state the revised promised date returned by the tool after a successful address change.
2. Tightened the optimization rubric and added a regression test so “the address changed” alone cannot pass.

Result: the optimization-set score improved from **2/3 to 3/3** in the next run.

An alternative is to construct the final address-change confirmation in application code. That would guarantee the date appears, but it would make this response less model-generated. We tried the smaller prompt change first; a future failure would be a reason to move this policy-critical response into deterministic application code.

## Change 2: avoid a redundant order lookup

The address-change tool already checks ownership and shipment status inside the operation. We clarified its description so the agent should call it directly for a clear change request, and look up the order first only when it needs to answer a question or clarify the request.

The final run kept the score at **3/3** and used one tool call for each case. This reduced the address scenario from two calls in the preceding run to one. The tool description does not weaken the server checks.

## Before and after

| Run | Accuracy | Avg tool calls | Avg elapsed |
| --- | ---: | ---: | ---: |
| Baseline, before prompt change | 2/3 (67%) | 1.00 | 3,766 ms |
| Prompt change | 3/3 (100%) | 1.33 | 4,802 ms |
| Prompt plus tool description | 3/3 (100%) | 1.00 | 3,322 ms |

Each row is only three live requests. Latency varies, so these measurements suggest but do not prove a performance change. The last run's address request used one tool call instead of two. We cannot calculate dollar cost from this runner because it does not report token usage; one fewer tool call is a useful efficiency signal, not a dollar estimate.

## Separate final validation

Because we used the optimization set to guide changes, we did not call it a pristine holdout. We added `evals/final-validation-scenarios.json` with three different policy cases: a state/PIN mismatch, a shipped order, and an untrusted customer claim that a package was lost. After correcting the rubric to accept equivalent wording such as “isn't eligible” and “promised delivery window,” the final validation passed **3/3**. The agent and tool descriptions were unchanged during this final validation run.

The first validation attempt reported 2/3 because the grader rejected the correct phrase “isn't eligible” and “within its promised delivery window.” That was a false failure, confirmed with a grading unit test. It is useful evidence that evals test the evaluator as well as the agent.

## What we learned

- Tool success and a complete customer answer are separate things; evaluate both.
- A small prompt change can improve an observed behavior, but it is not a hard guarantee.
- Tool descriptions influence the model's plan; server-side ownership and policy checks remain the actual security boundary.
- Test fewer calls only when they preserve the same result and controls.
- Three scenarios are a teaching example, not enough data for a production performance claim.

Run the repeatable optimization comparison with:

```sh
MODEL_EVAL_SCENARIOS=./optimization-scenarios.json npm run eval:model
```
