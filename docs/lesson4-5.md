# Lessons 4–5: trace review and evaluator checks

## Lesson 4: classify what a run shows

Review each trace in order: model call, tool choice, tool result, side effect, final answer. Label the observed failure before changing code. These labels help separate what happened from what needs fixing:

| Category | Evidence to look for | Example response |
| --- | --- | --- |
| Infrastructure | The model run never completed; no tool result exists | Fix the API key, network, or service issue before grading agent behavior |
| Tool choice | No expected tool was called, or the chosen tool does not fit the request | Review the model's tool selection and instructions |
| Tool or policy result | The right tool ran but returned an unexpected code | Inspect the deterministic policy and fixture inputs |
| Side effect | The tool result looks safe, but state changed unexpectedly | Check the store mutation and authorization boundary |
| Final response | Tool result was correct but the model misrepresented it | Review the final answer against the tool result |
| Evaluator issue | A safe run failed only because its wording or valid path differed | Improve the rubric while preserving the actual policy requirement |

We saw two evaluator issues in our first model run. The agent correctly explained that an early refund was unavailable because the order was “within its promised delivery window,” but the first phrase list did not accept that wording. In the cross-account case, the agent looked up the order and got `ORDER_NOT_ACCESSIBLE`; the rubric incorrectly insisted that the refund tool itself had to return the denial. Both were false failures. We changed the expectations to measure policy outcome and safe behavior rather than one exact wording or valid tool path.

We also had an initial connection error when the eval process could not reach OpenAI. That is an infrastructure failure, not evidence that the agent policy is wrong. The trace IDs printed by `npm run eval:model` let us open each successful model run in OpenAI's trace dashboard and inspect model and tool spans.

## Lesson 5: test the evaluator itself

The grader is now a pure function in `evals/grading.js`. It takes a scenario plus observed tool results, refund requests, and response text, and returns pass/fail checks. `test/grading.test.js` tests it without an API key.

The tests include known-good examples (alternate but correct phrasing and either server-side access denial path) and known-bad examples (an unexpected refund request and a false claim that money was issued). They also check that a missing tool choice and a wrong policy result receive different grader labels.

This protects against both:

- **False failure:** correct agent behavior is rejected because the rubric is too narrow.
- **False pass:** incorrect or unsafe behavior is accepted because the rubric checks too little.

The phrase checks are still intentionally small. They demonstrate evaluator validation; they are not a complete natural-language safety classifier. Exact policy outcomes and state changes remain the stronger checks.

Run the evaluator unit tests and all existing tests with `npm test`. Run the live model scenarios separately with `npm run eval:model`; that uses the OpenAI API and can produce variable wording.
