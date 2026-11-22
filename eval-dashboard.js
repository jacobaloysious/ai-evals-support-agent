const $ = (selector) => document.querySelector(selector);
const runButton = $("#run-comparison");
const productionRunLink = $("#production-run-link");
const statusNode = $("#status");
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
let reports = [];

if (!isLocal) {
  runButton.hidden = true;
  productionRunLink.hidden = false;
  $("#environment-badge").textContent = "PUBLIC · READ ONLY";
  $("#run-note").textContent = "Anyone can view these reports. Starting a comparison requires write access to the GitHub repository. Live runs use API credits; keys stay in GitHub Actions secrets.";
  $("#history-eyebrow").textContent = "PUBLISHED REPORTS";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function number(value) { return Number.isFinite(value) ? new Intl.NumberFormat().format(value) : "Unavailable"; }
function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "Unavailable"; }
function dollars(value) { return Number.isFinite(value) ? `$${value.toFixed(6)}` : "Unavailable"; }
function byProvider(report, provider) { return report.summaries.find((item) => item.provider === provider); }
function resultFor(report, provider, scenarioName) { return report.results.find((item) => item.provider === provider && item.scenario === scenarioName); }

function render(report) {
  if (!report) return;
  $("#comparison").hidden = false;
  $("#run-title").textContent = new Date(report.createdAt).toLocaleString();
  $("#pricing-date").textContent = `Rates effective ${report.pricingEffectiveDate}`;
  const revision = report.sourceRevision ? report.sourceRevision.slice(0, 12) : "not available";
  $("#provenance").textContent = `Source commit ${revision}; working tree ${report.workingTreeDirty ? "had uncommitted changes" : "was clean"}. Scenario files are SHA-256 fingerprinted in the saved report.`;
  $("#openai-pricing").href = report.pricingSources.openai;
  $("#meta-pricing").href = report.pricingSources.meta;
  const openai = byProvider(report, "openai");
  const meta = byProvider(report, "meta");
  $("#cards").innerHTML = [openai, meta].map((summary) => `<article class="card"><h3>${escapeHTML(summary.provider === "openai" ? "OpenAI" : "Meta")} · ${escapeHTML(summary.model)}</h3><div class="card-big">${percent(summary.qualityPassRate)}</div><div class="card-caption">scenario pass rate · ${summary.passedScenarios}/${summary.scenarioCount} passed</div></article>`).join("");
  const metrics = [
    ["Quality pass rate", percent(openai.qualityPassRate), percent(meta.qualityPassRate), "Existing rubric checks for safe and correct scenario behavior."],
    ["Failed rubric checks", number(openai.failedChecks), number(meta.failedChecks), "Open scenario details below to inspect each failed expectation."],
    ["User turns", number(openai.userTurns), number(meta.userTurns), "Customer messages across single-turn and conversation scenarios."],
    ["Agent model turns / API requests", number(openai.modelTurns), number(meta.modelTurns), "Each model response cycle is counted as a provider request; tool calls are separate."],
    ["Tool calls", number(openai.toolCalls), number(meta.toolCalls), "Calls to the agent's local order/refund tools."],
    ["Input tokens", number(openai.inputTokens), number(meta.inputTokens), "Tokens sent to the model, summed over the run."],
    ["Output tokens", number(openai.outputTokens), number(meta.outputTokens), "Tokens returned by the model, summed over the run."],
    ["Total tokens", number(openai.totalTokens), number(meta.totalTokens), "Provider-reported input plus output tokens."],
    ["Estimated total cost", dollars(openai.totalEstimatedCostUsd), dollars(meta.totalEstimatedCostUsd), "Rate-file estimate; not the provider invoice."],
    ["Median latency", `${number(openai.medianLatencyMs)} ms`, `${number(meta.medianLatencyMs)} ms`, "Median end-to-end scenario time."],
    ["P95 latency", `${number(openai.p95LatencyMs)} ms`, `${number(meta.p95LatencyMs)} ms`, "95th percentile scenario time; small sample caveat applies."],
  ];
  $("#summary-rows").innerHTML = metrics.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`).join("");
  const names = [...new Set(report.results.map((item) => item.scenario))];
  $("#scenario-rows").innerHTML = names.map((name) => {
    const a = resultFor(report, "openai", name); const b = resultFor(report, "meta", name);
    const grade = (item) => {
      if (!item) return "—";
      const checks = item.grade.failures.map((failure) => `<li><strong>${escapeHTML(failure.check)}:</strong> ${escapeHTML(failure.message)}</li>`).join("");
      const tools = (item.metrics?.toolResults ?? []).map((tool) => `${tool.tool}=${tool.code}`).join(", ") || "none";
      const traceIds = Array.isArray(item.traceId) ? item.traceId.join(", ") : item.traceId;
      const error = item.error ? `<p>Run error: ${escapeHTML(item.error.name)}${item.error.status ? ` · HTTP ${item.error.status}` : ""}${item.error.code ? ` · ${escapeHTML(item.error.code)}` : ""}${item.error.requestId ? ` · request ${escapeHTML(item.error.requestId)}` : ""}</p>` : "";
      const response = item.response ? `<p><strong>Response</strong><br>${escapeHTML(item.response)}</p>` : "";
      return `<span class="${item.grade.passed ? "pass" : "fail"}">${item.grade.passed ? "PASS" : "FAIL"}</span><details class="case-details"><summary>Inspect</summary>${error}<ul>${checks || "<li>No failed checks.</li>"}</ul><p><strong>Tool results:</strong> ${escapeHTML(tools)}</p><p><strong>Trace:</strong> ${escapeHTML(traceIds ?? "unavailable")}</p>${response}</details>`;
    };
    const latency = (item) => item ? number(item.latencyMs) : "—";
    const tokens = (item) => item?.metrics ? `${number(item.metrics.inputTokens)} / ${number(item.metrics.outputTokens)}` : "Unavailable";
    const type = a?.scenarioType ?? b?.scenarioType ?? "—";
    const turns = (item) => item?.metrics ? `${number(item.metrics.userTurns)} / ${number(item.metrics.modelTurns)}` : "Unavailable";
    return `<tr><td class="scenario-name">${escapeHTML(name)}</td><td>${escapeHTML(type)}</td><td>${grade(a)}</td><td>${grade(b)}</td><td>${turns(a)} / ${turns(b)}</td><td>${latency(a)} / ${latency(b)}</td><td>${tokens(a)} / ${tokens(b)}</td><td>${dollars(a?.estimatedCostUsd)} / ${dollars(b?.estimatedCostUsd)}</td></tr>`;
  }).join("");
}

function renderHistory() {
  $("#history").innerHTML = reports.length ? reports.map((report, index) => `<button class="history-item" data-index="${index}"><span><strong>${new Date(report.createdAt).toLocaleString()}</strong><small>${report.scenarioCount} scenarios · ${escapeHTML(report.summaries.map((s) => `${s.provider} ${percent(s.qualityPassRate)}`).join(" vs "))}</small></span><span>View →</span></button>`).join("") : `<p class="muted">No saved runs yet. Set both provider keys, then run the comparison.</p>`;
  document.querySelectorAll(".history-item").forEach((button) => button.addEventListener("click", () => render(reports[Number(button.dataset.index)])));
}

async function load() {
  if (!isLocal) {
    const indexResponse = await fetch("/eval-reports/index.json", { cache: "no-store" });
    if (!indexResponse.ok) throw new Error("Could not load published comparison index");
    const index = await indexResponse.json();
    const files = Array.isArray(index.reports) ? index.reports : [];
    const loaded = await Promise.all(files.map(async (file) => {
      if (!/^[\w.-]+\.json$/.test(file)) return null;
      const response = await fetch(`/eval-reports/${encodeURIComponent(file)}`, { cache: "no-store" });
      return response.ok ? response.json() : null;
    }));
    reports = loaded.filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderHistory();
    if (reports.length) render(reports[0]);
    statusNode.textContent = reports.length ? `${reports.length} published comparison${reports.length === 1 ? "" : "s"}` : "No comparisons have been published yet";
    return;
  }
  const response = await fetch("/api/evals/runs");
  if (!response.ok) throw new Error("Could not load saved runs");
  reports = await response.json();
  renderHistory();
  if (reports.length) render(reports[0]);
  statusNode.textContent = reports.length ? `${reports.length} saved comparison${reports.length === 1 ? "" : "s"}` : "Ready for the first comparison";
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  statusNode.textContent = "Running both models across the scenario suite… This may take a few minutes.";
  try {
    const response = await fetch("/api/evals/compare", { method: "POST" });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || "Comparison failed; check the local terminal for setup details.");
    reports.unshift(report);
    renderHistory(); render(report);
    statusNode.textContent = "Comparison complete. Read the quality changes before considering cost savings.";
  } catch (error) {
    statusNode.textContent = error.message;
  } finally {
    runButton.disabled = false;
  }
});

load().catch((error) => { statusNode.textContent = error.message; });
