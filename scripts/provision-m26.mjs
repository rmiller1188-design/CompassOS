import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required secret or input: ${name}`);
  return value;
};
const optional = name => process.env[name]?.trim() || "";
const mask = value => value && console.log(`::add-mask::${value}`);
const writeEnv = (name, value) => {
  mask(value);
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
};
const writeOutput = (name, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const summary = line => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

function listPayload(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of [...keys, "data", "items"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function jsonRequest(url, { token, method = "GET", body, allow404 = false } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${url} failed (${response.status}): ${text.slice(0, 600)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function runSupabase(args, extraEnv = {}) {
  const result = spawnSync("npx", ["--yes", "supabase@latest", ...args], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv }
  });
  if (result.status !== 0) throw new Error(`Supabase CLI failed: supabase ${args.join(" ")}`);
}

function normalizeSupabaseProject(row) {
  return row?.project || row;
}

async function provisionSupabase() {
  const accessToken = required("SUPABASE_ACCESS_TOKEN");
  const dbPassword = required("SUPABASE_DB_PASSWORD");
  mask(accessToken);
  mask(dbPassword);

  const projectName = optional("M26_PROJECT_NAME") || "CompassOS-M26";
  const requestedRef = optional("M26_PROJECT_REF");
  const requestedOrg = optional("M26_ORG_SLUG");
  const region = optional("M26_REGION") || "us-west-2";
  const appUrl = required("M26_APP_URL").replace(/\/$/, "");

  const orgPayload = await jsonRequest("https://api.supabase.com/v1/organizations", { token: accessToken });
  const organizations = listPayload(orgPayload, ["organizations"]);
  const organization = requestedOrg
    ? organizations.find(row => row.slug === requestedOrg || row.id === requestedOrg || row.name === requestedOrg)
    : organizations.length === 1 ? organizations[0] : null;

  if (!organization) {
    const available = organizations.map(row => row.slug || row.name || row.id).filter(Boolean).join(", ");
    throw new Error(`Unable to select a Supabase organization. Set the workflow org_slug input. Available: ${available || "none"}`);
  }

  let projectsPayload = await jsonRequest("https://api.supabase.com/v1/projects", { token: accessToken });
  let projects = listPayload(projectsPayload, ["projects"]).map(normalizeSupabaseProject);
  let project = requestedRef
    ? projects.find(row => row.ref === requestedRef || row.id === requestedRef)
    : projects.find(row => row.name === projectName && (!row.organization_id || row.organization_id === organization.id));

  if (!project) {
    console.log(`Creating Supabase project ${projectName} in ${region}...`);
    runSupabase([
      "projects", "create", projectName,
      "--org-id", String(organization.id),
      "--db-password", dbPassword,
      "--region", region,
      "--yes"
    ], { SUPABASE_ACCESS_TOKEN: accessToken });
  }

  for (let attempt = 0; attempt < 90; attempt++) {
    projectsPayload = await jsonRequest("https://api.supabase.com/v1/projects", { token: accessToken });
    projects = listPayload(projectsPayload, ["projects"]).map(normalizeSupabaseProject);
    project = requestedRef
      ? projects.find(row => row.ref === requestedRef || row.id === requestedRef)
      : projects.find(row => row.name === projectName && (!row.organization_id || row.organization_id === organization.id));
    const status = String(project?.status || "").toUpperCase();
    if (project && (status.includes("ACTIVE") || status.includes("HEALTHY"))) break;
    if (attempt === 89) throw new Error("Supabase project did not become healthy within 15 minutes.");
    await sleep(10_000);
  }

  const projectRef = String(project.ref || project.id);
  console.log(`Using Supabase project ${projectRef}.`);

  runSupabase(["link", "--project-ref", projectRef, "--password", dbPassword, "--yes"], {
    SUPABASE_ACCESS_TOKEN: accessToken,
    SUPABASE_DB_PASSWORD: dbPassword
  });
  runSupabase(["db", "push", "--linked", "--password", dbPassword, "--include-all", "--yes"], {
    SUPABASE_ACCESS_TOKEN: accessToken,
    SUPABASE_DB_PASSWORD: dbPassword
  });

  await jsonRequest(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    token: accessToken,
    method: "PATCH",
    body: {
      site_url: appUrl,
      uri_allow_list: [`${appUrl}/auth/callback`, "http://localhost:3000/auth/callback"].join(",")
    }
  });

  const keysPayload = await jsonRequest(`https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`, { token: accessToken });
  const keys = listPayload(keysPayload, ["api_keys", "keys"]);
  const keyName = row => String(row.name || row.role || "").toLowerCase();
  const keyType = row => String(row.type || "").toLowerCase();
  const publishable = keys.find(row => keyType(row) === "publishable" || keyName(row).includes("publishable") || keyName(row) === "anon");
  const server = keys.find(row => keyType(row) === "secret" || keyName(row).includes("secret") || keyName(row) === "service_role");
  const publishableKey = publishable?.api_key || publishable?.key;
  const serverKey = server?.api_key || server?.key;
  if (!publishableKey || !serverKey) throw new Error("Supabase API keys could not be resolved after project provisioning.");

  const supabaseUrl = `https://${projectRef}.supabase.co`;
  writeEnv("M26_SUPABASE_REF", projectRef);
  writeEnv("M26_SUPABASE_URL", supabaseUrl);
  writeEnv("M26_SUPABASE_PUBLISHABLE_KEY", String(publishableKey));
  writeEnv("M26_SUPABASE_SERVER_KEY", String(serverKey));
  writeOutput("project_ref", projectRef);
  writeOutput("project_url", supabaseUrl);

  summary("## Supabase provisioned");
  summary(`- Project: \`${projectName}\``);
  summary(`- Reference: \`${projectRef}\``);
  summary(`- Region: \`${region}\``);
  summary("- Migrations: applied");
  summary("- Auth redirect URLs: configured");

  return { appUrl, projectRef, supabaseUrl, publishableKey: String(publishableKey), serverKey: String(serverKey) };
}

function unwrapRenderService(payload) {
  return payload?.service || payload;
}

async function getRenderEnv(renderToken, serviceId, key) {
  const payload = await jsonRequest(`https://api.render.com/v1/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    token: renderToken,
    allow404: true
  });
  if (!payload) return "";
  const value = payload.value ?? payload.envVar?.value ?? payload.env_var?.value;
  return typeof value === "string" ? value : "";
}

async function putRenderEnv(renderToken, serviceId, key, value) {
  mask(value);
  await jsonRequest(`https://api.render.com/v1/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    token: renderToken,
    method: "PUT",
    body: { value }
  });
}

async function configureRender(supabase) {
  const renderToken = optional("RENDER_API_KEY");
  const serviceId = optional("RENDER_M26_SERVICE_ID");
  if (!renderToken && !serviceId) {
    summary("\n## Render not configured");
    summary("Add `RENDER_API_KEY` and `RENDER_M26_SERVICE_ID` repository secrets, then rerun this workflow.");
    return { configured: false };
  }
  if (!renderToken || !serviceId) throw new Error("Both RENDER_API_KEY and RENDER_M26_SERVICE_ID are required to configure Render.");
  mask(renderToken);

  const googleClientId = required("GOOGLE_CLIENT_ID");
  const googleClientSecret = required("GOOGLE_CLIENT_SECRET");
  const microsoftClientId = required("MICROSOFT_CLIENT_ID");
  const microsoftClientSecret = required("MICROSOFT_CLIENT_SECRET");
  const openAiKey = optional("OPENAI_API_KEY");
  [googleClientId, googleClientSecret, microsoftClientId, microsoftClientSecret, openAiKey].forEach(mask);

  const servicePayload = await jsonRequest(`https://api.render.com/v1/services/${serviceId}`, { token: renderToken });
  const service = unwrapRenderService(servicePayload);
  const serviceName = String(service.name || "");
  const serviceType = String(service.type || service.serviceDetails?.type || "");
  if (serviceName === "compass-os" || serviceType === "static_site") {
    throw new Error("Safety stop: the selected Render service is the working static Compass service. Create/select a separate web service named compass-os-m26.");
  }
  if (serviceName !== "compass-os-m26") {
    throw new Error(`Safety stop: expected Render service compass-os-m26, received ${serviceName || "unnamed"}.`);
  }

  const targetBranch = optional("M26_TARGET_BRANCH") || "m26-connected-accounts";
  await jsonRequest(`https://api.render.com/v1/services/${serviceId}`, {
    token: renderToken,
    method: "PATCH",
    body: { branch: targetBranch, autoDeploy: "yes" }
  });

  let encryptionKey = await getRenderEnv(renderToken, serviceId, "TOKEN_ENCRYPTION_KEY");
  let stateSecret = await getRenderEnv(renderToken, serviceId, "OAUTH_STATE_SECRET");
  if (!encryptionKey) encryptionKey = randomBytes(32).toString("base64");
  if (!stateSecret) stateSecret = randomBytes(32).toString("hex");

  const envVars = {
    NODE_VERSION: "22",
    NEXT_PUBLIC_APP_URL: supabase.appUrl,
    NEXT_PUBLIC_SUPABASE_URL: supabase.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: supabase.serverKey,
    TOKEN_ENCRYPTION_KEY: encryptionKey,
    OAUTH_STATE_SECRET: stateSecret,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    MICROSOFT_CLIENT_ID: microsoftClientId,
    MICROSOFT_CLIENT_SECRET: microsoftClientSecret,
    MICROSOFT_TENANT: optional("MICROSOFT_TENANT") || "common",
    OPENAI_MODEL: optional("OPENAI_MODEL") || "gpt-5"
  };
  if (openAiKey) envVars.OPENAI_API_KEY = openAiKey;

  for (const [key, value] of Object.entries(envVars)) {
    await putRenderEnv(renderToken, serviceId, key, value);
  }

  const deploy = await jsonRequest(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    token: renderToken,
    method: "POST",
    body: { clearCache: "do_not_clear" }
  });
  const deployId = deploy.id || deploy.deploy?.id || "queued";
  summary("\n## Render configured");
  summary(`- Service: \`${serviceName}\``);
  summary(`- Branch: \`${targetBranch}\``);
  summary(`- Deploy: \`${deployId}\``);

  return { configured: true, deployId };
}

async function verifyHealth(appUrl) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${appUrl}/api/health`, { headers: { accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.status === "ready") {
        summary("- Health check: `ready`");
        return;
      }
      console.log(`Health attempt ${attempt + 1}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
    } catch (error) {
      console.log(`Health attempt ${attempt + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(15_000);
  }
  throw new Error("M26 Render service did not report ready within 15 minutes.");
}

try {
  summary("# Compass M26 infrastructure run");
  const supabase = await provisionSupabase();
  const render = await configureRender(supabase);
  if (render.configured) await verifyHealth(supabase.appUrl);
  summary("\nInfrastructure workflow completed.");
  console.log("Compass M26 infrastructure workflow completed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  summary(`\n## Failed\n\`${message.replaceAll("`", "'")}\``);
  console.error(message);
  process.exit(1);
}
