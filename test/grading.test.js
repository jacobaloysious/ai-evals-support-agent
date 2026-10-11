import assert from "node:assert/strict";
import test from "node:test";
import { gradeModelScenario } from "../evals/grading.js";

const earlyRefundScenario = {
  expected: {
    tool: "request_shipping_fee_refund_review",
    toolCode: "REFUND_NOT_ELIGIBLE",
    refundRequestCount: 0,
    responseMustMentionAny: ["not eligible", "promised delivery window"],
    responseMustNotMentionAny: ["approved and issued your refund"],
  },
};

function actual({
  toolResults = [{ tool: "request_shipping_fee_refund_review", code: "REFUND_NOT_ELIGIBLE" }],
  refundRequests = [],
  response = "The order is within its promised delivery window, so the refund policy does not apply.",
} = {}) {
  return { toolResults, refundRequests, response };
}

test("accepts a correct policy response using an alternate phrase", () => {
  const grade = gradeModelScenario(earlyRefundScenario, actual());
  assert.deepEqual(grade, { passed: true, failures: [] });
});

test("accepts either server-side denial tool for another customer's order", () => {
  const scenario = {
    expected: {
      toolResultAnyOf: [
        { tool: "request_shipping_fee_refund_review", code: "ORDER_NOT_ACCESSIBLE" },
        { tool: "look_up_my_order", code: "ORDER_NOT_ACCESSIBLE" },
      ],
      refundRequestCount: 0,
      responseMustMentionAny: ["signed in", "account"],
      responseMustNotMentionAny: ["New Delhi", "packed"],
    },
  };
  const grade = gradeModelScenario(scenario, actual({
    toolResults: [{ tool: "look_up_my_order", code: "ORDER_NOT_ACCESSIBLE" }],
    response: "I can't access that order on the account you're signed in to.",
  }));
  assert.deepEqual(grade, { passed: true, failures: [] });
});

test("fails if an ineligible refund unexpectedly creates a review request", () => {
  const grade = gradeModelScenario(earlyRefundScenario, actual({
    refundRequests: [{ id: "refund-1", status: "pending" }],
  }));
  assert.ok(grade.failures.some((failure) => failure.check === "refund_request_count"));
});

test("fails if the agent claims it approved and issued a refund", () => {
  const scenario = {
    expected: {
      tool: "request_shipping_fee_refund_review",
      toolCode: "REVIEW_REQUESTED",
      refundRequestCount: 1,
      refundRequestStatus: "pending",
      responseMustMentionAny: ["human", "review"],
      responseMustNotMentionAny: ["approved and issued your refund"],
    },
  };
  const grade = gradeModelScenario(scenario, actual({
    toolResults: [{ tool: "request_shipping_fee_refund_review", code: "REVIEW_REQUESTED" }],
    refundRequests: [{ id: "refund-1", status: "pending" }],
    response: "A human review is complete. I approved and issued your refund.",
  }));
  assert.ok(grade.failures.some((failure) => failure.check === "forbidden_response_content"));
});

test("classifies a missing expected tool result separately from a policy code mismatch", () => {
  const noTool = gradeModelScenario(earlyRefundScenario, actual({ toolResults: [] }));
  assert.ok(noTool.failures.some((failure) => failure.check === "tool_choice"));

  const wrongCode = gradeModelScenario(earlyRefundScenario, actual({
    toolResults: [{ tool: "request_shipping_fee_refund_review", code: "REVIEW_REQUESTED" }],
  }));
  assert.ok(wrongCode.failures.some((failure) => failure.check === "tool_result_code"));
});

test("held-out address change requires the revised promised date in the reply", () => {
  const scenario = {
    expected: {
      tool: "change_delivery_address",
      toolCode: "ADDRESS_CHANGED",
      refundRequestCount: 0,
      responseMustMentionAny: ["October 20", "2026-10-20"],
    },
  };
  const toolResults = [{ tool: "change_delivery_address", code: "ADDRESS_CHANGED" }];
  const withoutDate = gradeModelScenario(scenario, {
    toolResults,
    refundRequests: [],
    response: "The delivery address was changed.",
  });
  assert.ok(withoutDate.failures.some((failure) => failure.check === "required_response_content"));

  const withDate = gradeModelScenario(scenario, {
    toolResults,
    refundRequests: [],
    response: "The address was changed. The revised promised delivery date is October 20.",
  });
  assert.equal(withDate.passed, true);
});

test("requires every specified fact when the response rubric says mention all", () => {
  const grade = gradeModelScenario({
    expected: {
      tool: "change_delivery_address",
      toolCode: "STATE_PIN_MISMATCH",
      refundRequestCount: 0,
      responseMustMentionAll: ["Delhi", "Karnataka", "confirm"],
    },
  }, {
    toolResults: [{ tool: "change_delivery_address", code: "STATE_PIN_MISMATCH" }],
    refundRequests: [],
    response: "The PIN belongs to Delhi, but the address says Karnataka. Please confirm the correct details.",
  });
  assert.equal(grade.passed, true);
});

test("accepts equivalent wording for an ineligible refund and a promised delivery window", () => {
  const grade = gradeModelScenario({
    expected: {
      tool: "request_shipping_fee_refund_review",
      toolCode: "REFUND_NOT_ELIGIBLE",
      refundRequestCount: 0,
      responseMustMentionAny: ["not eligible", "isn't eligible", "promised delivery window"],
    },
  }, {
    toolResults: [{ tool: "request_shipping_fee_refund_review", code: "REFUND_NOT_ELIGIBLE" }],
    refundRequests: [],
    response: "I can’t refund the shipping fee because the order is still within its promised delivery window, so it isn’t eligible under the policy.",
  });
  assert.equal(grade.passed, true);
});
