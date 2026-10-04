const $ = (id) => document.getElementById(id);
let currentState = { signedIn: false };
let busy = false;

async function api(payload) {
  const response = await fetch("/api/demo", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
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
  list.prepend(item);
  while (list.children.length > 8) list.lastElementChild.remove();
  if (["STATE_PIN_MISMATCH", "CONFIRMATION_REQUIRED"].includes(result.reasonCode)) {
    $("confirm-address").hidden = false;
  } else if (result.outcome === "changed") {
    $("confirm-address").hidden = true;
  }
}

function render() {
  $("chooser").hidden = currentState.signedIn;
  $("workspace").hidden = !currentState.signedIn;
  if (!currentState.signedIn) return;
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

document.querySelectorAll("[data-persona]").forEach((button) => {
  button.addEventListener("click", async () => {
    await act("Demo session", { action: "select_persona", persona: button.dataset.persona });
    if (!currentState.signedIn) return;
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
