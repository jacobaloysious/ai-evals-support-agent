const $ = (id) => document.getElementById(id);
let currentState = { signedIn: false };
let busy = false;
let chatHistory = [];
let preparedAddressProposal = null;

async function api(payload) {
  const response = await fetch("/api/demo", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data.error || `Request failed (${response.status}).`;
    throw new Error(data.traceId ? `${message} Trace ID: ${data.traceId}` : message);
  }
  return data;
}

async function act(label, payload) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  $("error").hidden = true;
  try {
    const data = await api(payload);
    currentState = data.state;
    render();
    if (data.result) addActivity(label, data.result);
  } catch (error) {
    $("error").textContent = error.message;
    $("error").hidden = false;
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((button) => { button.disabled = false; });
  }
}

function addressFromForm() {
  return {
    recipientName: $("recipient").value.trim(),
    line1: $("line1").value.trim(),
    city: $("city").value.trim(),
    state: $("state").value.trim(),
    pin: $("pin").value.trim(),
    country: "IN",
  };
}

function addActivity(label, result) {
  const list = $("activity");
  list.querySelector(".empty-state")?.remove();
  const item = document.createElement("article");
  item.className = `activity-item ${result.outcome}`;
  const title = document.createElement("strong");
  title.textContent = label;
  const message = document.createElement("p");
  message.textContent = result.message;
  item.append(title, message);
  if (result.traceId) {
    const trace = document.createElement("small");
    trace.className = "trace-id";
    trace.textContent = `Trace ID: ${result.traceId}`;
    item.append(trace);
  }
  list.prepend(item);
  while (list.children.length > 8) list.lastElementChild.remove();
  if (["STATE_PIN_MISMATCH", "CONFIRMATION_REQUIRED"].includes(result.reasonCode)) {
    $("confirm-address").hidden = false;
  } else if (result.outcome === "changed") {
    $("confirm-address").hidden = true;
    preparedAddressProposal = null;
  }
}

function render() {
  $("chooser").hidden = currentState.signedIn;
  $("workspace").hidden = !currentState.signedIn;
  if (!currentState.signedIn) return;
  const proposal = currentState.pendingAddressProposal;
  if (proposal && preparedAddressProposal !== proposal.orderId) {
    $("address-order-id").value = proposal.orderId;
    $("recipient").value = proposal.newAddress.recipientName;
    $("line1").value = proposal.newAddress.line1;
    $("city").value = proposal.newAddress.city;
    $("state").value = proposal.newAddress.state;
    $("pin").value = proposal.newAddress.pin;
    $("confirm-address").hidden = false;
    preparedAddressProposal = proposal.orderId;
  }
  $("persona-name").textContent = currentState.persona === "alice" ? "Alice" : "Bob";
  $("demo-date").textContent = currentState.demoNow.slice(0, 10);
  const orders = $("orders");
  orders.replaceChildren();
  for (const order of currentState.orders) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "order-card";
    const details = document.createElement("span");
    const id = document.createElement("strong");
    id.textContent = order.id;
    const date = document.createElement("small");
    date.textContent = `Placed ${order.createdAt.slice(0, 10)}`;
    details.append(id, date);
    const status = document.createElement("span");
    status.className = `status ${order.status}`;
    status.textContent = order.status;
    card.append(details, status);
    card.addEventListener("click", () => {
      $("lookup-id").value = order.id;
      $("address-order-id").value = order.id;
      $("refund-order-id").value = order.id;
    });
    orders.append(card);
  }
  const requests = $("requests");
  requests.replaceChildren();
  for (const request of currentState.requests) {
    const row = document.createElement("div");
    row.className = "request-pill";
    row.textContent = `${request.id} · ${request.orderId} · ${request.status} human review`;
    requests.append(row);
  }
}

function appendChat(role, content) {
  const list = $("chat-messages");
  list.querySelector(".empty-state")?.remove();
  const bubble = document.createElement("article");
  bubble.className = `chat-message ${role}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "You" : "Support agent";
  const text = document.createElement("p");
  text.textContent = content;
  bubble.append(label, text);
  list.append(bubble);
  list.scrollTop = list.scrollHeight;
}

$("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const content = $("chat-input").value.trim();
  if (!content) return;
  chatHistory.push({ role: "user", content });
  chatHistory = chatHistory.slice(-8);
  appendChat("user", content);
  $("chat-input").value = "";
  busy = true;
  $("send-chat").disabled = true;
  $("error").hidden = true;
  try {
    const data = await api({ action: "chat", messages: chatHistory });
    currentState = data.state;
    render();
    chatHistory.push({ role: "assistant", content: data.result.message });
    chatHistory = chatHistory.slice(-8);
    appendChat("assistant", data.result.message);
    addActivity("Conversational agent", data.result);
  } catch (error) {
    chatHistory.pop();
    $("error").textContent = error.message;
    $("error").hidden = false;
  } finally {
    busy = false;
    $("send-chat").disabled = false;
  }
});

document.querySelectorAll("[data-persona]").forEach((button) => {
  button.addEventListener("click", async () => {
    await act("Demo session", { action: "select_persona", persona: button.dataset.persona });
    if (!currentState.signedIn) return;
    chatHistory = [];
    preparedAddressProposal = null;
    $("chat-messages").replaceChildren();
    appendChat("assistant", "Hi! I can help with orders in this signed-in demo session.");
    const bob = currentState.persona === "bob";
    for (const id of ["lookup-id", "address-order-id", "refund-order-id"]) {
      $(id).value = bob ? "NS-2001" : "NS-1001";
    }
    $("recipient").value = bob ? "Bob" : "Alice";
    $("line1").value = bob ? "11 Market Road" : "2 New Street";
    $("city").value = bob ? "Mumbai" : "New Delhi";
    $("state").value = bob ? "Maharashtra" : "Delhi";
    $("pin").value = bob ? "400001" : "110001";
    $("confirm-address").hidden = true;
  });
});
$("sign-out").addEventListener("click", () => act("Switch customer", { action: "sign_out" }));
$("reset").addEventListener("click", () => {
  chatHistory = [];
  preparedAddressProposal = null;
  $("chat-messages").replaceChildren();
  appendChat("assistant", "Hi! I can help with orders in this signed-in demo session.");
  $("confirm-address").hidden = true;
  $("activity").replaceChildren();
  act("Reset demo", { action: "reset" });
});
$("advance-day").addEventListener("click", () => act("Advance demo date", { action: "advance_day" }));
$("list-orders").addEventListener("click", () => act("List my orders", {
  action: "propose", proposal: { action: "list_my_orders" },
}));
$("lookup").addEventListener("click", () => act("Look up order", {
  action: "propose", proposal: { action: "get_order", args: { orderId: $("lookup-id").value.trim() } },
}));
$("change-address").addEventListener("click", () => act("Change address", {
  action: "propose", proposal: {
    action: "change_address",
    args: { orderId: $("address-order-id").value.trim(), newAddress: addressFromForm() },
  },
}));
$("confirm-address").addEventListener("click", () => act("Confirm corrected address", {
  action: "confirm_address",
  orderId: $("address-order-id").value.trim(),
  newAddress: addressFromForm(),
}));
$("request-refund").addEventListener("click", () => act("Shipping-fee refund", {
  action: "propose", proposal: {
    action: "request_shipping_refund",
    args: { orderId: $("refund-order-id").value.trim(), reason: $("refund-reason").value.trim() },
  },
}));

fetch("/api/demo", { credentials: "same-origin" })
  .then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Demo unavailable.");
    currentState = data;
    render();
  })
  .catch((error) => {
    $("error").textContent = error.message;
    $("error").hidden = false;
  });
