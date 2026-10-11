/** Grade one multi-turn agent conversation and its per-turn side effects. */
export function gradeConversation(scenario, actual) {
  const failures = [];
  if (actual.turns.length !== scenario.turns.length) {
    failures.push({
      check: "turn_count",
      message: `Expected ${scenario.turns.length} turns; saw ${actual.turns.length}`,
    });
  }

  if (actual.turns.some((turn) => turn.conversationId !== actual.conversationId)) {
    failures.push({ check: "conversation_correlation", message: "Turns did not share the conversation ID" });
  }
  const traceIds = actual.turns.map((turn) => turn.traceId);
  if (new Set(traceIds).size !== traceIds.length) {
    failures.push({ check: "trace_identity", message: "Each turn should have its own trace ID" });
  }

  for (const [index, expected] of scenario.turns.entries()) {
    const observed = actual.turns[index];
    if (!observed) continue;
    const prefix = `turn ${index + 1} (${expected.name})`;
    const sawExpectedToolResult = observed.toolResults.some(({ tool, code }) =>
      tool === expected.expectedToolResult.tool && code === expected.expectedToolResult.code
    );
    if (!sawExpectedToolResult) {
      failures.push({
        check: "tool_result",
        message: `${prefix}: expected ${expected.expectedToolResult.tool}=${expected.expectedToolResult.code}; saw ${JSON.stringify(observed.toolResults)}`,
      });
    }
    if (observed.refundRequests.length !== expected.expectedRefundRequestCount) {
      failures.push({
        check: "refund_request_count",
        message: `${prefix}: expected ${expected.expectedRefundRequestCount}; saw ${observed.refundRequests.length}`,
      });
    }
    if (expected.expectedRefundRequestStatus
      && observed.refundRequests[0]?.status !== expected.expectedRefundRequestStatus) {
      failures.push({
        check: "refund_request_status",
        message: `${prefix}: expected ${expected.expectedRefundRequestStatus}; saw ${observed.refundRequests[0]?.status ?? "no request"}`,
      });
    }

    const response = typeof observed.response === "string" ? observed.response.toLowerCase() : "";
    if (expected.responseMustMentionAny?.length
      && !expected.responseMustMentionAny.some((text) => response.includes(text.toLowerCase()))) {
      failures.push({
        check: "response_content",
        message: `${prefix}: response did not mention any of ${expected.responseMustMentionAny.join(", ")}`,
      });
    }
    for (const forbidden of expected.responseMustNotMentionAny ?? []) {
      if (response.includes(forbidden.toLowerCase())) {
        failures.push({
          check: "forbidden_response_content",
          message: `${prefix}: response included prohibited text: ${forbidden}`,
        });
      }
    }
  }

  return { passed: failures.length === 0, failures };
}
