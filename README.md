# AI Evals: learn by building a support agent

A hands-on course project for learning how to define, test, trace, red-team, and improve an LLM agent. The example is a fictional online shop. Its orders, users, PIN directory, delivery promises, and refund queue are fixtures; it is not a production support system.

The project follows the [AI Evals for Engineers & PMs syllabus](https://docs.google.com/document/d/1KSUlzN-C8z1q_gHduCi6eKgCzlHVV6u3dT0aypqi_YI/edit?tab=t.0). The code and explanations here are an independent learning implementation, not the course authors' materials.

## Start here

### Requirements

- Node.js 20 or newer
- pnpm 9 (the GitHub Actions workflow uses pnpm 9)
- An OpenAI API key only for chat and live model evals; tests and deterministic evals work without one

### Install and run the checks

```sh
npm install --global pnpm@9
pnpm install --frozen-lockfile
pnpm test
pnpm run eval:policy
```

`pnpm test` runs the unit and API tests. `eval:policy` runs deterministic policy scenarios without contacting OpenAI.

### Run the demo

```sh
pnpm run dev
```

Open <http://localhost:4173>. The browser demo lets you choose fictional Alice and Bob personas. The structured lesson controls work without an API key. To use model-backed chat, set `OPENAI_API_KEY` in the server's environment before starting it. For example, in zsh:

```sh
export OPENAI_API_KEY="your-key"
pnpm run dev
```

Never commit a real API key. Live model evals call the OpenAI API and can incur charges. The default model is `gpt-6-luna`; `OPENAI_MODEL` can override it.

For deployment setup and the limits of the demo, read [DEPLOYMENT.md](DEPLOYMENT.md). For the system flow and where each eval runs, see [docs/architecture.md](docs/architecture.md).
For contribution guidance, see [CONTRIBUTING.md](CONTRIBUTING.md). For public-release items, see the [public-readiness checklist](docs/public-release-checklist.md).

## Learning path

Read the lessons in order. Each page explains the question, implementation, command, and limitations for that step. [docs/README.md](docs/README.md) is the documentation index.

| Lesson | Learn | Start with |
| --- | --- | --- |
| 1 | Specify the support problem, define trusted boundaries, and build a tool-using agent | [SPEC.md](SPEC.md), [`src/agent.js`](src/agent.js), [`src/conversational_agent.js`](src/conversational_agent.js) |
| 2 | Trace a run and connect a conversation to its individual model turns | [DEPLOYMENT.md](DEPLOYMENT.md#lesson-2-inspect-an-agent-run), [`api/demo.js`](api/demo.js) |
| 3 | Compare deterministic policy evals, live model evals, and multi-turn evals | [docs/lesson3.md](docs/lesson3.md), [docs/conversation-evals.md](docs/conversation-evals.md) |
| 4–5 | Classify failures and test the grader against good and bad examples | [docs/lesson4-5.md](docs/lesson4-5.md), [`evals/model-grading.js`](evals/model-grading.js) |
| 6 | Run tests and a deterministic eval automatically in GitHub Actions | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| 7 | Try prompt injection and pressure tactics against the agent | [docs/lesson7-red-team.md](docs/lesson7-red-team.md) |
| 8 | Establish a baseline and learn why an eval set can stop being held out | [docs/lesson8-baseline.md](docs/lesson8-baseline.md) |
| 9 | Improve response quality and tool efficiency, then validate on separate cases | [docs/lesson9-optimization.md](docs/lesson9-optimization.md) |

## Useful commands

| Command | What it does | Uses the OpenAI API? |
| --- | --- | --- |
| `pnpm test` | Unit and API tests, including grader checks | No |
| `pnpm run eval:policy` | Deterministic refund-policy scenarios | No |
| `pnpm run eval:model` | Live one-message scenarios | Yes; a run may use several model turns and tool calls |
| `pnpm run eval:conversation` | Live multi-turn refund conversation | Yes; multiple model turns |
| `MODEL_EVAL_SCENARIOS=./model-optimization-scenarios.json pnpm run eval:model` | Live eval against the Lesson 8–9 optimization cases | Yes |
| `MODEL_EVAL_SCENARIOS=./model-final-validation-scenarios.json pnpm run eval:model` | Live eval against separate final policy cases | Yes |

GitHub Actions runs `pnpm test` and `pnpm eval:policy`. It deliberately does not call the live model evals: those need a secret API key, incur usage, and can vary between runs.

## Prototype limits

The demo uses signed sessions for fictional personas, in-memory fixtures, and simulated fulfillment and policy data. Anyone using it can select either demo persona. It has no real customer authentication, durable database, carrier integration, payment processor, or human-review interface. A successful refund eval creates a pending review request; it never moves money.

The demo's server endpoint calls the model with the project's API key. If you expose a deployed demo, add abuse and usage controls first. The code currently does not rate-limit chat requests. Repo visibility and demo access are separate decisions.

## License

No license has been selected for this repository yet. If you want readers to reuse or adapt the code outside GitHub's built-in viewing and forking, choose a license before describing the project as open source. See [GitHub's licensing guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

## Progress

- [x] Lessons 1–9: specification, agent, traces, evals, grader validation, CI, red-team cases, baseline, and optimization.
