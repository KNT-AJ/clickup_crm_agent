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

function httpRequest({ method, path: reqPath, token, query }) {
  return new Promise((resolve, reject) => {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
    const options = {
      hostname: CLICKUP_HOST,
      method,
      path: `${reqPath}${qs}`,
      headers: { Authorization: token },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.end();
  });
}

function lower(s) { return String(s || "").toLowerCase(); }

async function main() {
  const envFromFile = loadEnvFromFile(path.resolve(__dirname, "..", "config.env"));
  const token = getEnv(envFromFile, "CLICKUP_API_KEY");
  const listId = getEnv(envFromFile, "CRM_LIST_ID");
  const term = lower(process.argv[2] || "brew");

  const data = await httpRequest({ method: "GET", path: `${CLICKUP_BASE_PATH}/list/${listId}/field`, token });
  const fields = data?.fields || [];
  const matches = [];
  for (const f of fields) {
    const name = f?.name || "";
    const type = f?.type || f?.type_config?.type;
    const opts = (f?.type_config?.options || []).map((o) => o?.name || o?.label || "");
    if (lower(name).includes(term)) {
      matches.push({ id: f.id, name, type, where: "field-name" });
      continue;
    }
    for (const o of opts) {
      if (lower(o).includes(term)) {
        matches.push({ id: f.id, name, type, option: o, where: "option" });
        break;
      }
    }
  }
  console.log(JSON.stringify(matches, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

