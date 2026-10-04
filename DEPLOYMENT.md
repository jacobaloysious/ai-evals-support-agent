# Lesson 1 demo deployment

This is a fictional support-agent sandbox. Alice and Bob are selectable demo personas, not real authenticated customer accounts. The server issues a signed, HTTP-only demo session for the selected persona and uses it for every private read and proposed change. The interface sends no trusted customer ID in an agent proposal.

## Try locally

Use Node.js 20 or newer. To enable the conversational agent, set `OPENAI_API_KEY` in your local environment before starting the server. The default model is `gpt-6-luna`; set `OPENAI_MODEL` to choose another supported model.

```sh
npm test
npm run dev
```

Open `http://localhost:4173`. The local server uses a development-only signing secret.

## Deploy on Vercel

1. Import this GitHub repository as a Vercel project. Select **Other** for the framework preset if asked, leave the root directory at the repository root, and do not add a build command.
2. Add Vercel environment variables named `DEMO_SESSION_SECRET` (unique random value of at least 32 characters) and `OPENAI_API_KEY` (an OpenAI API key). Set them for the environments where the demo should run. Do not store either value in GitHub.
3. Deploy, then visit the project URL. Vercel serves the static interface and the `api/demo.js` Node.js Function.
4. If the environment variable is added or changed after a deployment, redeploy so the function receives it.

## What the demo proves

- The proposed action cannot supply the trusted customer identity. It comes from a signed server session.
- Only the selected persona's orders are placed in that session. Unknown and other-owned order IDs return the same safe customer message.
- A state/PIN mismatch needs an explicit customer confirmation before an address is saved. The revised delivery promise is then used to judge a later refund request.
- Eligible shipping-fee refunds become pending review requests. No payment is issued and the customer agent has no human decision tool.

## Prototype limits

Anyone can choose either fictional persona. This is not production login. Session state is carried in a signed cookie, so this is not a durable order database or reviewer queue. PIN coverage and delivery promises are fixtures. The conversational model calls OpenAI and may incur API charges. There is no live carrier, payment processor, or reviewer interface. Replace these pieces before using real customer data or handling real orders.
