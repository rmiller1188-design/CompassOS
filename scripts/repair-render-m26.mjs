import { appendFileSync } from "node:fs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required secret or input: ${name}`);
  return value;
};
const optional = name => process.env[name]?.trim() || "";
const summary = line => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

async function jsonRequest(url, { token, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function waitFor(url, expectedStatus, attempts, delayMs) {
  let last = "no response";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      last = `HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`;
      if (response.ok && body.status === expectedStatus) return body;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    console.log(`Attempt ${attempt}/${attempts} for ${url}: ${last}`);
    await sleep(delayMs);
  }
  throw new Error(`${url} did not report ${expectedStatus}. Last result: ${last}`);
}

try {
  const token = required("RENDER_API_KEY");
  const serviceId = required("RENDER_M26_SERVICE_ID");
  const branch = optional("M26_TARGET_BRANCH") || "m26-connected-accounts";
  const appUrl = (optional("M26_APP_URL") || "https://compass-os-m26.onrender.com").replace(/\/$/, "");

  console.log(`::add-mask::${token}`);
  summary("# Compass M26 Render repair");

  const current = await jsonRequest(`https://api.render.com/v1/services/${serviceId}`, { token });
  const service = current.service || current;
  const name = String(service.name || "");
  const type = String(service.type || "");
  if (name !== "compass-os-m26" || type === "static_site") {
    throw new Error(`Safety stop: expected the compass-os-m26 web service, received ${name || "unnamed"} (${type || "unknown"}).`);
  }

  await jsonRequest(`https://api.render.com/v1/services/${serviceId}`, {
    token,
    method: "PATCH",
    body: {
      branch,
      autoDeploy: "yes",
      rootDir: "",
      serviceDetails: {
        runtime: "node",
        envSpecificDetails: {
          buildCommand: "npm install --no-audit --no-fund && npm run build",
          startCommand: "npm run start"
        },
        healthCheckPath: "/api/live"
      }
    }
  });

  const deploy = await jsonRequest(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    token,
    method: "POST",
    body: { clearCache: "clear" }
  });
  const deployId = deploy.id || deploy.deploy?.id || "queued";

  summary(`- Service: \`${name}\``);
  summary(`- Branch: \`${branch}\``);
  summary("- Start command: `npm run start`");
  summary("- Health check: `/api/live`");
  summary(`- Deploy: \`${deployId}\``);

  await waitFor(`${appUrl}/api/live`, "live", 80, 15_000);
  summary("- Render liveness: `live`");

  await waitFor(`${appUrl}/api/health`, "ready", 20, 15_000);
  summary("- Compass readiness: `ready`");
  summary("\nRender repair completed successfully.");
  console.log("Compass M26 Render repair completed successfully.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  summary(`\n## Repair failed\n\`${message.replaceAll("`", "'")}\``);
  console.error(message);
  process.exit(1);
}
