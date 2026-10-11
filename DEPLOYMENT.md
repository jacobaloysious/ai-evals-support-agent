# Lesson 1 demo deployment

This is a fictional support-agent sandbox. Alice and Bob are selectable demo personas, not real authenticated customer accounts. The server issues a signed, HTTP-only demo session for the selected persona and uses it for every private read and proposed change. The interface sends no trusted customer ID in an agent proposal.

## Try locally

Use Node.js 20 or newer and pnpm 9. Install dependencies from the lockfile. The tests and deterministic evals do not need an API key. To enable the conversational agent, create an API key in the OpenAI API Platform, then set `OPENAI_API_KEY` in the server process environment before starting the server. The default model is `gpt-6-luna`; set `OPENAI_MODEL` to choose another model available to your API project.

```sh
pnpm install --frozen-lockfile
pnpm test
```

To start live chat, export the key in the same terminal session and start the server:

```sh
export OPENAI_API_KEY="your-api-key"
pnpm run dev
```

Keep the key private: do not paste it into browser code, commit it, or store it in a `VITE_` variable. The browser talks to this project's server endpoint; only that server should read the key. ChatGPT subscriptions and API Platform billing are separate, so a ChatGPT plan does not provide API usage or credits. See [OpenAI's billing guide](https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform).

Open `http://localhost:4173`. The local server uses a development-only signing secret.

## Deploy on Vercel

Vercel hosts the browser files and runs `api/demo.js` as a server-side Node.js Function. Vercel does not provide the model or API credits: the function makes requests to OpenAI using the key you provide.

1. Push the repository to GitHub, then import it from the Vercel dashboard. Select **Other** for the framework preset if asked, leave the root directory at the repository root, and do not add a build command.
2. In the Vercel project, open **Settings → Environment Variables**. Add:
   - `OPENAI_API_KEY`: an API key created in the OpenAI API Platform.
   - `DEMO_SESSION_SECRET`: a unique random value of at least 32 characters, used to sign the fictional demo session.
3. Select the environments where you want each variable available (usually **Production** and **Preview**; include **Development** if you use Vercel's local development command). Save the variables. Vercel keeps these values in project settings; do not commit them to Git.
4. Deploy the project and open its URL. The browser UI is served as static files, while chat requests go to the server function. The API key stays on the server and is not sent to the browser.
5. If you add or change a variable after deploying, trigger a new deployment. Environment changes apply to new deployments, not an already-running deployment. See [Vercel's environment-variable guide](https://vercel.com/docs/environment-variables/managing-environment-variables).

If the page loads but chat fails, first check that `OPENAI_API_KEY` is set for the deployment environment you opened and that you redeployed after saving it. Then inspect **Vercel → project → Logs** for the function error. OpenAI API usage and billing are managed separately in the OpenAI API Platform; a ChatGPT subscription is separate from API billing. Live chats and model evals can incur API charges.

## What the demo proves

- The proposed action cannot supply the trusted customer identity. It comes from a signed server session.
- Only the selected persona's orders are placed in that session. Unknown and other-owned order IDs return the same safe customer message.
- A state/PIN mismatch needs an explicit customer confirmation before an address is saved. The revised delivery promise is then used to judge a later refund request.
- Eligible shipping-fee refunds become pending review requests. No payment is issued and the customer agent has no human decision tool.

## Lesson 2: inspect an agent run

Each chat has a conversation ID, and each submitted question has its own trace ID. The OpenAI Agents SDK uses the conversation ID as `groupId` so its traces can be linked; the activity entry shows both IDs. In OpenAI **Logs → Traces**, find the workflow named **Northstar Shop support chat** and use the group ID to review the conversation's separate runs. In Vercel **Runtime Logs**, search for the conversation ID to find each run's start and completion or failure, then use that run's trace ID to find its tool result codes. The trace ID still identifies one run. Traces may contain prompt and tool context, so inspect what the dashboard records before using real customer data.

## Prototype limits

Anyone can choose either fictional persona. This is not production login. Session state is carried in a signed cookie, so this is not a durable order database or reviewer queue. PIN coverage and delivery promises are fixtures. The conversational model calls OpenAI and may incur API charges. There is no live carrier, payment processor, or reviewer interface. Replace these pieces before using real customer data or handling real orders.

The demo API has no rate limit. Repo visibility and demo access are separate: before sharing a deployed demo broadly, add abuse and usage controls to protect the API budget.
