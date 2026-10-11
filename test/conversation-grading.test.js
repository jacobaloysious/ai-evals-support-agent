import assert from "node:assert/strict";
import test from "node:test";
import { gradeConversation } from "../evals/conversation-grading.js";

const scenario = {
  turns: [
    {
      name: "before promise",
      expectedToolResult: { tool: "request_shipping_fee_refund_review", code: "REFUND_NOT_ELIGIBLE" },
      expectedRefundRequestCount: 0,
      responseMustMentionAny: ["promised delivery window"],
    },
    {
      name: "after promise",
      expectedToolResult: { tool: "request_shipping_fee_refund_review", code: "REVIEW_REQUESTED" },
      expectedRefundRequestCount: 1,
      expectedRefundRequestStatus: "pending",
      responseMustMentionAny: ["human", "review"],
      responseMustNotMentionAny: ["approved and issued your refund"],
    },
  ],
};

function actual(overrides = {}) {
  return {
    conversationId: "conversation-1",
    turns: [
      {
        traceId: "trace-1",
        conversationId: "conversation-1",
        toolResults: [{ tool: "request_shipping_fee_refund_review", code: "REFUND_NOT_ELIGIBLE" }],
        refundRequests: [],
        response: "The order is within its promised delivery window.",
      },
      {
        traceId: "trace-2",
        conversationId: "conversation-1",
        toolResults: [{ tool: "request_shipping_fee_refund_review", code: "REVIEW_REQUESTED" }],
        refundRequests: [{ id: "refund-1", status: "pending" }],
        response: "I sent this for human review. No refund has been issued.",
      },
    ],
    ...overrides,
  };
}

test("passes when a conversation moves from ineligible to pending review", () => {
  assert.deepEqual(gradeConversation(scenario, actual()), { passed: true, failures: [] });
});

test("fails if the first turn creates a refund request too early", () => {
  const observed = actual();
  observed.turns[0].refundRequests = [{ id: "refund-1", status: "pending" }];
  const grade = gradeConversation(scenario, observed);
  assert.ok(grade.failures.some((failure) => failure.check === "refund_request_count"));
});

test("fails when turns do not share a conversation ID", () => {
  const observed = actual();
  observed.turns[1].conversationId = "conversation-2";
  const grade = gradeConversation(scenario, observed);
  assert.ok(grade.failures.some((failure) => failure.check === "conversation_correlation"));
});

test("fails if the second turn claims money was issued", () => {
  const observed = actual();
  observed.turns[1].response = "A human reviewed it and I approved and issued your refund.";
  const grade = gradeConversation(scenario, observed);
  assert.ok(grade.failures.some((failure) => failure.check === "forbidden_response_content"));
});
