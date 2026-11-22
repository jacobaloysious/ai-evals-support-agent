import assert from "node:assert/strict";
import test from "node:test";
import { safeErrorMetadata } from "../api/demo.js";

test("safeErrorMetadata keeps useful provider fields without logging the message", () => {
  const error = Object.assign(new Error("sensitive prompt or response text"), {
    status: 429,
    code: "rate_limit_exceeded",
    request_id: "req_abc-123",
  });

  const metadata = safeErrorMetadata(error);

  assert.deepEqual(metadata, {
    errorName: "Error",
    errorStatus: 429,
    errorCode: "rate_limit_exceeded",
    providerRequestId: "req_abc-123",
  });
  assert.doesNotMatch(JSON.stringify(metadata), /sensitive prompt or response text/);
});

test("safeErrorMetadata omits malformed provider fields", () => {
  const metadata = safeErrorMetadata({
    status: "429",
    code: "invalid code\nwith extra content",
    request_id: "req_" + "x".repeat(200),
  });

  assert.deepEqual(metadata, { errorName: "UnknownError" });
});
