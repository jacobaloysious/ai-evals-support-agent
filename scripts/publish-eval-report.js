import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE_DIR = resolve(process.env.EVAL_RESULTS_DIR || join(ROOT, "eval-results"));
const PUBLISHED_DIR = resolve(process.env.PUBLISHED_EVALS_DIR || join(ROOT, "eval-reports"));
const MAX_REPORTS = 20;

export async function publishLatestReport({ sourceDir = SOURCE_DIR, publishedDir = PUBLISHED_DIR } = {}) {
  const filenames = (await readdir(sourceDir)).filter((name) => /^[\w.-]+\.json$/.test(name)).sort();
  if (!filenames.length) throw new Error("No comparison report was produced");

  const sourcePath = join(sourceDir, filenames.at(-1));
  const raw = await readFile(sourcePath, "utf8");
  const report = JSON.parse(raw);
  if (report.schemaVersion !== 1 || !report.runId || !Array.isArray(report.summaries) || !Array.isArray(report.results)) {
    throw new Error("The comparison report has an unsupported shape");
  }

  for (const key of [process.env.OPENAI_API_KEY, process.env.META_MODEL_API_KEY, process.env.MODEL_API_KEY]) {
    if (key && raw.includes(key)) throw new Error("Refusing to publish a report containing a configured API key");
  }

  const reportName = `${report.runId}.json`;
  if (!/^[\w.-]+\.json$/.test(reportName)) throw new Error("The report ID contains unsupported characters");
  await mkdir(publishedDir, { recursive: true });
  await writeFile(join(publishedDir, reportName), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });

  let previous = [];
  try {
    const index = JSON.parse(await readFile(join(publishedDir, "index.json"), "utf8"));
    if (Array.isArray(index.reports)) previous = index.reports.filter((name) => /^[\w.-]+\.json$/.test(name));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const reports = [reportName, ...previous.filter((name) => name !== reportName)].slice(0, MAX_REPORTS);
  await writeFile(join(publishedDir, "index.json"), `${JSON.stringify({ reports }, null, 2)}\n`, { mode: 0o644 });
  return { reportName, publishedCount: reports.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await publishLatestReport();
    console.log(`Published ${result.reportName}; ${result.publishedCount} reports are listed in the public index.`);
  } catch (error) {
    console.error(`Could not publish comparison report: ${error.message}`);
    process.exitCode = 1;
  }
}
