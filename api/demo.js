import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupportAgent } from "../src/agent.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import { createAgentRefundTools, RefundRequestStore } from "../src/refund_requests.js";

const COOKIE = "northstar_demo";
const ONE_DAY = 24 * 60 * 60 * 1000;
const PIN_DIRECTORY = new Map([
  ["110001", { assigned: true, state: "Delhi", serviceable: true }],
  ["400001", { assigned: true, state: "Maharashtra", serviceable: true }],
  ["560001", { assigned: true, state: "Karnataka", serviceable: false }],
]);

const fixtures = {
  alice: {
    email: "alice@example.com",
    orders: [
      {
        id: "NS-1001", customerId: "alice", createdAt: "2026-10-01T00:00:00Z",
        status: "packed", active: true, shippedAt: null,
        deliveryAddress: {
          recipientName: "Alice", line1: "1 Old Street", city: "New Delhi",
          state: "Delhi", pin: "110001", country: "IN",
        },
        promisedDeliveryAt: "2026-10-08T00:00:00Z", shippingFee: 50,
        carrierLost: false, deliveredAt: null,
      },
      {
        id: "NS-1002", customerId: "alice", createdAt: "2026-09-20T00:00:00Z",
        status: "shipped", active: true, shippedAt: "2026-09-22T00:00:00Z",
        deliveryAddress: {
          recipientName: "Alice", line1: "1 Old Street", city: "New Delhi",
          state: "Delhi", pin: "110001", country: "IN",
        },
        promisedDeliveryAt: "2026-10-10T00:00:00Z", shippingFee: 40,
        carrierLost: false, deliveredAt: null,
      },
    ],
  },
  bob: {
    email: "bob@example.com",
    orders: [{
      id: "NS-2001", customerId: "bob", createdAt: "2026-10-02T00:00:00Z",
      status: "packed", active: true, shippedAt: null,
      deliveryAddress: {
        recipientName: "Bob", line1: "10 Market Road", city: "Mumbai",
        state: "Maharashtra", pin: "400001", country: "IN",
      },
      promisedDeliveryAt: "2026-10-09T00:00:00Z", shippingFee: 60,
      carrierLost: false, deliveredAt: null,
    }],
  },
};

function json(data, status = 200, cookie) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}

function cookieHeader(request, value, maxAge = 86400) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function sign(state, secret) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function readState(request, secret) {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!entry) return null;
  const [payload, signature] = entry.slice(COOKIE.length + 1).split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (state.version !== 1 || state.expiresAt < Date.now() || !fixtures[state.userId]
      || !Array.isArray(state.orders) || state.orders.length > 3
      || state.orders.some((order) => order.customerId !== state.userId)
      || !Array.isArray(state.requests) || state.requests.length > 5
      || state.requests.some((item) => item.customerId !== state.userId)) return null;
    return state;
  } catch {
    return null;
  }
}

function initialState(userId) {
  return {
    version: 1,
    expiresAt: Date.now() + ONE_DAY,
    userId,
    demoNow: "2026-10-04T00:00:00Z",
    orders: structuredClone(fixtures[userId].orders),
    requests: [],
    pendingConfirmations: [],
  };
}

function sameAddress(a, b) {
  return ["recipientName", "line1", "city", "state", "pin", "country"]
    .every((field) => a?.[field] === b?.[field]);
}

function createWorld(state) {
  const store = new OrderStore(state.orders, state.pendingConfirmations);
  const requests = new RefundRequestStore(state.requests);
  const session = { authenticated: true, userId: state.userId, email: fixtures[state.userId].email };
  const orderTools = createOrderTools({
    store,
    getSession: () => session,
    pinDirectory: PIN_DIRECTORY,
    quoteDeliveryPromise: () => new Date(Date.parse(state.demoNow) + 3 * ONE_DAY).toISOString(),
    consumeAddressConfirmation: ({ orderId, customerId, newAddress }) =>
      customerId === state.userId && state.confirmedAddress?.orderId === orderId
      && sameAddress(state.confirmedAddress.address, newAddress),
  });
  const refundTools = createAgentRefundTools({
    orders: store, requests, getSession: () => session, getNow: () => state.demoNow,
  });
  return { store, requests, orderTools, agent: createSupportAgent({ orderTools, refundTools }) };
}

function snapshot(state, world) {
  state.orders = world.store.listOrdersForOwner(state.userId);
  state.requests = world.requests.listForCustomer(state.userId);
  state.pendingConfirmations = world.store.pendingAddressConfirmationsForOwner(state.userId);
  delete state.confirmedAddress;
  return {
    signedIn: true,
    persona: state.userId,
    demoNow: state.demoNow,
    orders: world.orderTools.listMyOrders().orders,
    requests: state.requests.map(({ id, orderId, status }) => ({ id, orderId, status })),
  };
}

export default {
  async fetch(request) {
    const secret = process.env.DEMO_SESSION_SECRET;
    if (typeof secret !== "string" || secret.length < 32) {
      return json({ error: "Demo session secret is not configured." }, 503);
    }
    const state = readState(request, secret);
    if (request.method === "GET") {
      if (!state) return json({ signedIn: false });
      const world = createWorld(state);
      return json(snapshot(state, world));
    }
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Origin denied." }, 403);

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 5000) return json({ error: "Request too large." }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Expected a JSON object." }, 400);
    }

    if (body.action === "select_persona" && fixtures[body.persona]) {
      const selected = initialState(body.persona);
      const world = createWorld(selected);
      return json({ state: snapshot(selected, world) }, 200,
        cookieHeader(request, sign(selected, secret)));
    }
    if (body.action === "sign_out") {
      return json({ state: { signedIn: false } }, 200, cookieHeader(request, "", 0));
    }
    if (!state) return json({ error: "Choose a demo account first." }, 401);

    const world = createWorld(state);
    let result;
    if (body.action === "advance_day") {
      const advanced = Date.parse(state.demoNow) + ONE_DAY;
      if (advanced > Date.parse("2026-11-04T00:00:00Z")) {
        return json({ error: "Demo clock limit reached." }, 400);
      }
      state.demoNow = new Date(advanced).toISOString();
      result = { outcome: "clock_advanced", message: `Demo date is now ${state.demoNow.slice(0, 10)}.` };
    } else if (body.action === "confirm_address") {
      const { orderId, newAddress } = body;
      if (!world.store.needsAddressConfirmation(orderId, state.userId)) {
        return json({ error: "No address confirmation is pending." }, 400);
      }
      state.confirmedAddress = { orderId, address: newAddress };
      result = world.agent.handleProposal({ action: "change_address", args: { orderId, newAddress } });
    } else if (body.action === "propose") {
      if (state.requests.length >= 5 && body.proposal?.action === "request_shipping_refund") {
        return json({ error: "Demo review queue is full. Reset the demo to continue." }, 429);
      }
      result = world.agent.handleProposal(body.proposal);
    } else if (body.action === "reset") {
      const reset = initialState(state.userId);
      const resetWorld = createWorld(reset);
      return json({ state: snapshot(reset, resetWorld) }, 200,
        cookieHeader(request, sign(reset, secret)));
    } else {
      return json({ error: "Unknown action." }, 400);
    }
    const view = snapshot(state, world);
    const signed = sign(state, secret);
    if (signed.length > 3800) return json({ error: "Demo state is full. Reset the demo." }, 413);
    return json({ result, state: view }, 200, cookieHeader(request, signed));
  },
};
