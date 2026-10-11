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
