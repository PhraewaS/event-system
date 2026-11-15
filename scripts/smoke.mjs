const target = process.argv[2];
if (!target) throw new Error("Usage: npm run smoke -- https://YOUR-SERVICE-URL");
const base = new URL(target);
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password)
  throw new Error("Supply an HTTP(S) service URL without credentials.");
async function get(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
  return response;
}
const ready = await (await get("/api/ready")).json();
if (ready.status !== "ready" || ready.db !== "connected") throw new Error("Database readiness failed.");
const html = await (await get("/")).text();
const asset = html.match(/<script[^>]+src="([^"]+)"/);
if (!html.includes('id="root"') || !asset) throw new Error("Built UI is missing.");
const assetUrl = new URL(asset[1], base);
if (assetUrl.origin !== base.origin) throw new Error("Unexpected external UI script.");
const script = await get(assetUrl.pathname);
if (!(script.headers.get("content-type") ?? "").includes("javascript"))
  throw new Error("Built JavaScript asset is missing.");
console.log("Smoke passed: database readiness, built UI and JavaScript asset.");
