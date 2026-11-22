import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import demo from "../api/demo.js";
import { runComparison } from "../evals/compare-models.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/eval-dashboard.html", ["eval-dashboard.html", "text/html; charset=utf-8"]],
  ["/eval-dashboard.js", ["eval-dashboard.js", "text/javascript; charset=utf-8"]],
  ["/eval-dashboard.css", ["eval-dashboard.css", "text/css; charset=utf-8"]],
]);
const port = Number(process.env.PORT || 4173);
process.env.DEMO_SESSION_SECRET ||= "local-development-only-secret-please-do-not-deploy";

createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url === "/api/evals/runs" && incoming.method === "GET") {
      const folder = join(root, "eval-results");
      let filenames = [];
      try { filenames = (await readdir(folder)).filter((name) => /^[\w.-]+\.json$/.test(name)).sort().reverse().slice(0, 20); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      const reports = await Promise.all(filenames.map(async (name) => JSON.parse(await readFile(join(folder, name), "utf8"))));
      outgoing.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      outgoing.end(JSON.stringify(reports));
      return;
    }
    if (incoming.url === "/api/evals/compare" && incoming.method === "POST") {
      const origin = incoming.headers.origin;
      if (origin && new URL(origin).host !== `localhost:${port}`) { outgoing.writeHead(403); outgoing.end("Origin denied"); return; }
      const report = await runComparison();
      outgoing.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      outgoing.end(JSON.stringify(report));
      return;
    }
    if (incoming.url === "/api/demo") {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(`http://localhost:${port}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        ...(incoming.method === "GET" ? {} : { body: Buffer.concat(chunks) }),
      });
      const response = await demo.fetch(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const file = files.get(incoming.url === "/evals" ? "/eval-dashboard.html" : incoming.url);
    if (!file) { outgoing.writeHead(404); outgoing.end("Not found"); return; }
    const content = await readFile(join(root, file[0]));
    outgoing.writeHead(200, { "content-type": file[1], "cache-control": "no-store" });
    outgoing.end(content);
  } catch (error) {
    if (incoming.url === "/api/evals/compare") {
      outgoing.writeHead(503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      outgoing.end(JSON.stringify({ error: error.message }));
      return;
    }
    outgoing.writeHead(500);
    outgoing.end("Local demo error");
    console.error(error);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Demo ready at http://localhost:${port}`);
});
