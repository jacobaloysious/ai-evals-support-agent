/**
 * Fictional in-memory order store for Lesson 1.
 * The model never receives this store or the authenticated session.
 */
export class OrderStore {
  #orders;

  constructor(orders = []) {
    this.#orders = new Map(orders.map((order) => [order.id, { ...order }]));
  }

  getOrderForOwner(orderId, customerId) {
    const order = this.#orders.get(orderId);
    if (!order || order.customerId !== customerId) return null;
    return { ...order };
  }

  /** A conditional write: check current state and save without an intervening await. */
  changeAddressForOwner(orderId, customerId, newAddress) {
    const order = this.#orders.get(orderId);
    if (!order || order.customerId !== customerId) {
      return { ok: false, code: "ORDER_NOT_ACCESSIBLE" };
    }
    if (!order.active) return { ok: false, code: "ORDER_INACTIVE" };
    if (order.shippedAt !== null) {
      return { ok: false, code: "ALREADY_SHIPPED" };
    }

    order.deliveryAddress = newAddress;
    return {
      ok: true,
      code: "ADDRESS_CHANGED",
      orderId,
      deliveryAddress: order.deliveryAddress,
    };
  }

  /** Simulates a separate warehouse process changing an order after a read. */
  markShipped(orderId, timestamp) {
    const order = this.#orders.get(orderId);
    if (!order) throw new Error("Unknown order");
    order.shippedAt = timestamp;
  }
}

/**
 * Expose only orderId and newAddress to the model. The trusted server supplies
 * getSession; any customerId included in model arguments is ignored.
 */
export function createOrderTools({ store, getSession }) {
  if (!(store instanceof OrderStore) || typeof getSession !== "function") {
    throw new TypeError("A store and trusted session provider are required");
  }

  return {
    changeAddress({ orderId, newAddress }) {
      const session = getSession();
      if (session?.authenticated !== true || !session.userId) {
        return { ok: false, code: "AUTH_REQUIRED" };
      }
      if (typeof newAddress !== "string" || !newAddress.trim()) {
        return { ok: false, code: "INVALID_ADDRESS" };
      }
      return store.changeAddressForOwner(
        orderId,
        session.userId,
        newAddress.trim(),
      );
    },
  };
}
