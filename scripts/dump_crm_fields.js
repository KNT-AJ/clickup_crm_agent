#!/usr/bin/env node
"use strict";

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

async function main() {
  const envFromFile = loadEnvFromFile(path.resolve(__dirname, "..", "config.env"));
  const token = getEnv(envFromFile, "CLICKUP_API_KEY");
  const crmListId = getEnv(envFromFile, "CRM_LIST_ID");

  const { data } = await httpRequest({
    method: "GET",
    path: `${CLICKUP_BASE_PATH}/list/${crmListId}/field`,
    token,
  });

  const fields = (data && data.fields) || [];
  const cleaned = fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type || f.type_config?.type,
    options: (f.type_config?.options || []).map((o) => ({ id: o.id, name: o.name || o.label })),
  }));
  console.log(JSON.stringify(cleaned, null, 2));
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

