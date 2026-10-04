import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import demo from "../api/demo.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);
const port = Number(process.env.PORT || 4173);
process.env.DEMO_SESSION_SECRET ||= "local-development-only-secret-please-do-not-deploy";

createServer(async (incoming, outgoing) => {
  try {
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
    const file = files.get(incoming.url);
    if (!file) { outgoing.writeHead(404); outgoing.end("Not found"); return; }
    const content = await readFile(join(root, file[0]));
    outgoing.writeHead(200, { "content-type": file[1], "cache-control": "no-store" });
    outgoing.end(content);
  } catch (error) {
    outgoing.writeHead(500);
    outgoing.end("Local demo error");
    console.error(error);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Demo ready at http://localhost:${port}`);
});
