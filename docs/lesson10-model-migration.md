# Lesson 10: Compare model providers before migrating

## The learning goal

Move the same support agent between OpenAI and Meta Model API, then use one maintained scenario suite to see what changed. The agent instructions, tools, fixtures, and grader stay the same. In a controlled comparison, vary the provider and model ID while holding reasoning effort and response verbosity constant.

This project uses the Agents SDK's OpenAI-compatible provider with Meta's Responses endpoint (`https://api.meta.ai/v1`). Meta documents tool calling and the OpenAI-compatible Responses API. That lets us compare the providers without rewriting the agent's tool definitions. It does **not** mean their model behavior or every API feature is identical. The comparison workflow supports Muse Ember and Muse Spark and applies one selected reasoning effort to both providers so their defaults do not silently differ.

## Step 1: configure credentials

Copy `.env.example` values into your shell or the local server environment. Keep both provider keys server-side:

```sh
export OPENAI_API_KEY="..."
export META_MODEL_API_KEY="..."
pnpm run dev
```

The app's normal chat uses `MODEL_PROVIDER` (`openai` by default, `meta` to switch). For example, `MODEL_PROVIDER=meta` selects `muse-spark-1.3`. The local comparison dashboard always runs both providers and does not change the app's default.

## Step 2: make a paired baseline

For a local run, open <http://localhost:4173/evals> and click **Run both models**. In production, start the **Model comparison** workflow from GitHub Actions and select a Meta model and shared reasoning effort. This is manual because every scenario makes live API calls and can incur charges. Each provider receives the same scenario prompt and fixture state; their execution order alternates across scenarios to reduce timing-order bias.

The current comparison includes 11 single-turn model scenarios and the existing multi-turn conversation scenario. The output is one local JSON report under `eval-results/`; that directory is gitignored because reports can contain generated responses and are run artifacts. API keys are not recorded.

## Step 3: read each metric

| Metric | What it measures | Decision use |
| --- | --- | --- |
| Rubric pass rate | Scenarios passing existing tool, policy, and response checks | Start here; safety-critical failures can veto a migration |
| Failed checks | Specific violated expectations | Inspect the scenario and trace before explaining a score change |
| Model requests | Model API requests in an agent run | Extra agent calls can increase latency and token cost |
| Tool calls | Calls to this app's order/refund functions | Separate from provider requests; tools here use local fixtures |
| Input/output tokens | SDK/provider-reported usage across the run | Helps explain cost and prompt/tool-loop growth |
| Cached input/reasoning tokens | Provider-reported details when available | Cached input affects the input rate; reasoning tokens are part of billed output |
| Estimated cost | Token counts × configured rates | Compare economics; this is an estimate, not invoice data |
| Median/P95 latency | End-to-end time per scenario | Compare user-visible speed; this sample is small |

These metrics stay separate because one customer message may trigger multiple model requests and tool calls. Missing usage is **unavailable**, not zero. The report keeps per-scenario results so aggregate scores cannot hide a regression.

## Step 4: decide whether to migrate

Use the current OpenAI run as a baseline and compare Meta on the same suite. First inspect security or policy failures, then compare quality scenario by scenario. If important scenarios fail, update the agent or eval expectation only when the desired behavior changes; rerun the suite to check regressions. After quality is acceptable, compare estimated cost and latency.

One paired pass is a teaching/demo baseline, not enough evidence for a production decision. Model outputs vary. Repeat the paired run several times, on the same scenario versions and under comparable conditions. Compare per-scenario consistency as well as averages, and reserve new held-out scenarios for an independent check. This dashboard starts with one pass so runtime and cost stay clear; a repeat-count control can be the next incremental step.

## Where it runs

The comparison runner runs locally or through the manually triggered GitHub Actions workflow. In production, Vercel serves a read-only dashboard and published reports. The production dashboard links to GitHub Actions to start a run; it never calls a paid model endpoint itself. Only repository writers can manually trigger the workflow. Provider keys are stored as GitHub Actions secrets, and the workflow publishes reports to `eval-reports/` so Vercel can serve them as static files. GitHub's `GITHUB_TOKEN` has only the repository-content permission needed to publish those reports. The workflow checks for both keys before it runs any paid scenarios.

Offline unit/API tests and deterministic policy scenarios continue to run on each push and pull request. Live comparisons remain manual because they use provider credits and model behavior varies.

## Cost assumptions

Rates live in [`evals/pricing.json`](../evals/pricing.json) with official links and an effective date. Update that file when model IDs, modes, billing rates, or dates change. The estimate uses standard input/output token rates and reported cached-input details; it does not represent an invoice. Meta's Contributor variant has different pricing and data-use terms and is not silently substituted.
