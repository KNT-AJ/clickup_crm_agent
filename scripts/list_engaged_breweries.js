#!/usr/bin/env node
"use strict";

// Lists ClickUp CRM tasks with status "Engaged".
// Default behavior: treat all Engaged tasks as breweries (per CRM context), no heuristics.
// Optional: enable heuristics or exact field filter if you need to narrow further.
//
// Usage:
//   node scripts/list_engaged_breweries.js
//   node scripts/list_engaged_breweries.js --json
//   node scripts/list_engaged_breweries.js --heuristic
//   node scripts/list_engaged_breweries.js --field "Industry" --value "Brewery"

const fs = require("fs");
const path = require("path");
const https = require("https");

const CLICKUP_HOST = "api.clickup.com";
const CLICKUP_BASE_PATH = "/api/v2";

function loadEnvFromFile(envFilePath) {
  const env = {};
  const full = path.resolve(envFilePath);
  if (!fs.existsSync(full)) return env;
  const content = fs.readFileSync(full, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) env[key] = val;
  }
  return env;
}

function getEnv(envObj, name, fallback) {
  const value = envObj[name] ?? process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function httpRequest({ method, path: reqPath, token, query, body }) {
  return new Promise((resolve, reject) => {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
    const payload = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: CLICKUP_HOST,
      method,
      path: `${reqPath}${qs}`,
      headers: {
        Authorization: token,
      },
    };
    if (payload) {
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          return reject({ response: { status, data: safeJsonParse(data) } });
        }
        resolve({ status, data: safeJsonParse(data) });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function* iterateListTasksByStatus(listId, statusName, token) {
  let page = 0;
  for (;;) {
    const { data } = await httpRequest({
      method: "GET",
      path: `${CLICKUP_BASE_PATH}/list/${listId}/task`,
      token,
      query: {
        page: String(page),
        order_by: "created",
        subtasks: "true",
        "statuses[]": statusName,
      },
    });
    const tasks = (data && data.tasks) || [];
    if (tasks.length === 0) break;
    for (const task of tasks) yield task;
    page += 1;
  }
}

async function getAccessibleCustomFields(listId, token) {
  const { data } = await httpRequest({
    method: "GET",
    path: `${CLICKUP_BASE_PATH}/list/${listId}/field`,
    token,
  });
  return (data && data.fields) || [];
}

function lower(s) {
  return String(s || "").toLowerCase();
}

function extractFieldValueAsText(fieldMeta, value) {
  if (value == null) return "";
  const t = lower(fieldMeta?.type || fieldMeta?.type_config?.type);
  const opts = (fieldMeta?.type_config?.options || []).map((o) => ({ id: o?.id, name: lower(o?.name ?? o?.label) }));
  if (t === "labels") {
    if (Array.isArray(value)) {
      // value contains option ids
      const names = value
        .map((id) => opts.find((o) => o.id === id)?.name)
        .filter(Boolean);
      return names.join(", ");
    }
    return String(value);
  }
  if (t === "drop_down") {
    const match = opts.find((o) => o.id === value);
    return match ? match.name : String(value);
  }
  return String(value);
}

function looksLikeBreweryByFields(task, fieldsMeta) {
  const byId = new Map((fieldsMeta || []).map((f) => [f.id, f]));
  const cfs = Array.isArray(task?.custom_fields) ? task.custom_fields : [];
  const nameHints = ["type", "industry", "category", "account", "company", "segment", "record"];
  for (const cf of cfs) {
    const meta = byId.get(cf.id) || {};
    const nm = lower(meta?.name || cf?.name || "");
    if (!nameHints.some((h) => nm.includes(h))) continue;
    const text = lower(extractFieldValueAsText(meta, cf.value));
    if (!text) continue;
    if (text.includes("brew")) return true;
  }
  return false;
}

function looksLikeBreweryByTags(task) {
  const tags = Array.isArray(task?.tags) ? task.tags : [];
  return tags.some((t) => lower(t?.name || t).includes("brew"));
}

function looksLikeBreweryByName(task) {
  const nm = lower(task?.name);
  if (!nm) return false;
  return nm.includes("brewing") || nm.includes("brewery") || nm.includes("breweries") || nm.includes("brew co");
}

function taskUrl(task) {
  // Typical URL format: https://app.clickup.com/t/<task_id>
  return `https://app.clickup.com/t/${task.id}`;
}

async function main() {
  // Parse simple flags
  const args = process.argv.slice(2);
  const wantJson = args.includes("--json");
  const useHeuristic = args.includes("--heuristic");
  const fldIdx = args.indexOf("--field");
  const valIdx = args.indexOf("--value");
  const explicitField = fldIdx !== -1 ? args[fldIdx + 1] : null;
  const explicitValue = valIdx !== -1 ? args[valIdx + 1] : null;

  const envFromFile = loadEnvFromFile(path.resolve(__dirname, "..", "config.env"));
  const token = getEnv(envFromFile, "CLICKUP_API_KEY");
  const crmListId = getEnv(envFromFile, "CRM_LIST_ID");

  const fieldsMeta = await getAccessibleCustomFields(crmListId, token);

  const results = [];
  for await (const task of iterateListTasksByStatus(crmListId, "Engaged", token)) {
    let include = true; // default: include all Engaged tasks
    let matchedBy = ["status:Engaged"];

    if (explicitField && explicitValue) {
      include = false;
      const meta = fieldsMeta.find((f) => lower(f.name) === lower(explicitField));
      if (meta) {
        const cf = (task.custom_fields || []).find((f) => f.id === meta.id);
        const text = cf ? extractFieldValueAsText(meta, cf.value) : "";
        if (lower(text) === lower(explicitValue) || lower(text).includes(lower(explicitValue))) {
          include = true;
          matchedBy = [`field:${meta.name}`];
        }
      }
    } else if (useHeuristic) {
      include = false;
      if (looksLikeBreweryByFields(task, fieldsMeta)) matchedBy = ["fields"], (include = true);
      else if (looksLikeBreweryByTags(task)) matchedBy = ["tags"], (include = true);
      else if (looksLikeBreweryByName(task)) matchedBy = ["name"], (include = true);
    }

    if (!include) continue;
    results.push({
      id: task.id,
      name: task.name,
      status: task?.status?.status || task?.status?.name || "",
      url: taskUrl(task),
      matchedBy,
    });
  }

  if (wantJson) {
    console.log(JSON.stringify({ count: results.length, items: results }, null, 2));
  } else {
    console.log(`Found ${results.length} engaged brewery records:`);
    for (const r of results) {
      console.log(`- ${r.name} (id: ${r.id}) [${r.status}] ${r.url}`);
    }
  }
}

main().catch((err) => {
  const status = err?.response?.status;
  const body = err?.response?.data;
  if (status) {
    console.error(`HTTP ${status}: ${JSON.stringify(body)}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
