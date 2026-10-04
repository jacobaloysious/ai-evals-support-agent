const REQUIRED_FIELDS = ["recipientName", "line1", "city", "state", "pin"];

/** The injected directory stands in for verified India Post and shop coverage data. */
export function validateIndiaAddress(address, pinDirectory) {
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    return { ok: false, code: "INVALID_ADDRESS" };
  }
  for (const field of REQUIRED_FIELDS) {
    if (typeof address[field] !== "string" || !address[field].trim()) {
      return { ok: false, code: "INVALID_ADDRESS" };
    }
  }
  if (address.country !== "IN") {
    return { ok: false, code: "COUNTRY_UNSUPPORTED" };
  }

  const pin = address.pin.trim();
  if (!/^\d{6}$/.test(pin)) return { ok: false, code: "INVALID_PIN_FORMAT" };
  const record = pinDirectory.get(pin);
  if (!record?.assigned) return { ok: false, code: "PIN_NOT_FOUND" };
  if (record.state.toLocaleLowerCase("en-IN") !== address.state.trim().toLocaleLowerCase("en-IN")) {
    return {
      ok: false,
      code: "STATE_PIN_MISMATCH",
      pin,
      submittedState: address.state.trim(),
      postalState: record.state,
    };
  }
  if (!record.serviceable) return { ok: false, code: "PIN_NOT_SERVICEABLE" };

  return {
    ok: true,
    address: Object.fromEntries([
      ...REQUIRED_FIELDS.map((field) => [field, address[field].trim()]),
      ["country", "IN"],
    ]),
  };
}
