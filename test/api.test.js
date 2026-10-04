import assert from "node:assert/strict";
import test from "node:test";
import demo from "../api/demo.js";

process.env.DEMO_SESSION_SECRET = "test-only-secret-with-at-least-thirty-two-characters";

async function call(body, cookie = "") {
  const request = new Request("https://demo.example/api/demo", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { origin: "https://demo.example", "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const response = await demo.fetch(request);
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? cookie,
    setCookie: response.headers.get("set-cookie"),
  };
}

test("demo session is signed, scoped to one fictional customer, and cannot read another address", async () => {
  const initial = await call();
  assert.deepEqual(initial.data, { signedIn: false });

  const alice = await call({ action: "select_persona", persona: "alice" });
  assert.equal(alice.data.state.persona, "alice");
  assert.deepEqual(alice.data.state.orders.map(({ id }) => id), ["NS-1001", "NS-1002"]);
  assert.match(alice.setCookie, /HttpOnly/);
  assert.match(alice.setCookie, /SameSite=Strict/);

  const foreign = await call({ action: "propose", proposal: {
    action: "get_order", args: { orderId: "NS-2001", userId: "bob" },
  } }, alice.cookie);
  assert.equal(foreign.data.result.outcome, "declined");
  assert.doesNotMatch(JSON.stringify(foreign.data), /10 Market Road/);
  assert.deepEqual(foreign.data.state.orders.map(({ id }) => id), ["NS-1001", "NS-1002"]);

  const [payload, mac] = alice.cookie.split("=")[1].split(".");
  const tampered = `northstar_demo=${payload}.${mac.slice(0, -1)}A`;
  const rejected = await call(undefined, tampered);
  assert.deepEqual(rejected.data, { signedIn: false });
});

test("address mismatch requires explicit customer confirmation, and refund follows revised promise", async () => {
  let session = await call({ action: "select_persona", persona: "alice" });
  let cookie = session.cookie;
  const wrong = {
    recipientName: "Alice", line1: "2 New Street", city: "New Delhi",
    state: "Karnataka", pin: "110001", country: "IN",
  };
  const mismatch = await call({ action: "propose", proposal: {
    action: "change_address", args: { orderId: "NS-1001", newAddress: wrong },
  } }, cookie);
  assert.equal(mismatch.data.result.outcome, "needs_confirmation");
  assert.equal(mismatch.data.result.reasonCode, "STATE_PIN_MISMATCH");
  cookie = mismatch.cookie;

  const corrected = { ...wrong, state: "Delhi" };
  const beforeConfirm = await call({ action: "propose", proposal: {
    action: "change_address", args: { orderId: "NS-1001", newAddress: corrected },
  } }, cookie);
  assert.equal(beforeConfirm.data.result.reasonCode, "CONFIRMATION_REQUIRED");
  cookie = beforeConfirm.cookie;

  const confirmed = await call({ action: "confirm_address", orderId: "NS-1001", newAddress: corrected }, cookie);
  assert.equal(confirmed.data.result.outcome, "changed");
  cookie = confirmed.cookie;
  const refreshed = await call(undefined, cookie);
  assert.equal(refreshed.data.state, undefined);
  assert.equal(refreshed.data.orders[0].id, "NS-1001");

  let refund = await call({ action: "propose", proposal: {
    action: "request_shipping_refund", args: { orderId: "NS-1001", reason: "late" },
  } }, cookie);
  assert.equal(refund.data.result.outcome, "declined");
  cookie = refund.cookie;
  for (let day = 0; day < 4; day += 1) {
    const advanced = await call({ action: "advance_day" }, cookie);
    cookie = advanced.cookie;
  }
  refund = await call({ action: "propose", proposal: {
    action: "request_shipping_refund", args: { orderId: "NS-1001", reason: "late" },
  } }, cookie);
  assert.equal(refund.data.result.outcome, "pending_human_review");
  assert.equal(refund.data.state.requests[0].status, "pending");
  assert.equal(refund.data.state.requests.length, 1);
});

test("invalid JSON shape and cross-origin writes are rejected", async () => {
  const invalid = await call(null);
  assert.equal(invalid.status, 400);
  const crossOrigin = await demo.fetch(new Request("https://demo.example/api/demo", {
    method: "POST", headers: { origin: "https://other.example" }, body: "{}",
  }));
  assert.equal(crossOrigin.status, 403);
});
