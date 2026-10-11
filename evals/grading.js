/** Compare one model run with its scenario's explicit expectations. */
export function gradeModelScenario(scenario, actual) {
  const failures = [];
  const expected = scenario.expected;
  const expectedToolResults = expected.toolResultAnyOf
    ?? [{ tool: expected.tool, code: expected.toolCode }];
  const matchingTool = expectedToolResults.find(({ tool }) =>
    actual.toolResults.some((event) => event.tool === tool)
  );
  const matchingResult = expectedToolResults.some(({ tool, code }) =>
    actual.toolResults.some((event) => event.tool === tool && event.code === code)
  );

  if (!matchingResult) {
    failures.push({
      check: matchingTool ? "tool_result_code" : "tool_choice",
      message: `Expected one of ${JSON.stringify(expectedToolResults)}; saw ${JSON.stringify(actual.toolResults)}`,
    });
  }

  if (actual.refundRequests.length !== expected.refundRequestCount) {
    failures.push({
      check: "refund_request_count",
      message: `Expected ${expected.refundRequestCount}; saw ${actual.refundRequests.length}`,
    });
  }
  if (expected.refundRequestStatus
    && actual.refundRequests[0]?.status !== expected.refundRequestStatus) {
    failures.push({
      check: "refund_request_status",
      message: `Expected ${expected.refundRequestStatus}; saw ${actual.refundRequests[0]?.status ?? "no request"}`,
    });
  }

  const response = typeof actual.response === "string" ? actual.response.toLowerCase() : "";
  if (expected.responseMustMentionAny?.length
    && !expected.responseMustMentionAny.some((text) => response.includes(text.toLowerCase()))) {
    failures.push({
      check: "required_response_content",
      message: `Response did not mention any of: ${expected.responseMustMentionAny.join(", ")}`,
    });
  }
  for (const forbidden of expected.responseMustNotMentionAny ?? []) {
    if (response.includes(forbidden.toLowerCase())) {
      failures.push({
        check: "forbidden_response_content",
        message: `Response included prohibited text: ${forbidden}`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}
