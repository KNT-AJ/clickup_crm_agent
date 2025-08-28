#!/usr/bin/env node
"use strict";

// Cross-reference Engaged CRM breweries with data/brewery_data.csv by company name.
// Outputs a match report with best-effort fuzzy matching.

const fs = require("fs");
const path = require("path");
const https = require("https");

const CLICKUP_HOST = "api.clickup.com";
const CLICKUP_BASE_PATH = "/api/v2";

function loadEnvFromFile(envFilePath) {
  const env = {};
  const full = path.resolve(envFilePath);
  if (!fs.existsSync(full)) return env;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

function getEnv(envObj, name, fallback) {
  const v = envObj[name] ?? process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
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
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function* iterateEngagedTasks(listId, token) {
  let page = 0;
  for (;;) {
    const data = await httpRequest({ method: "GET", path: `${CLICKUP_BASE_PATH}/list/${listId}/task`, token, query: { page: String(page), order_by: "created", subtasks: "true", "statuses[]": "Engaged" } });
    const tasks = (data && data.tasks) || [];
    if (tasks.length === 0) break;
    for (const t of tasks) yield t;
    page += 1;
  }
}

function normalize(str) {
  const s = String(str || "").toLowerCase();
  // remove punctuation to spaces, then split
  const words = s.replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP.has(w))
    .map((w) => STEM[w] || w);
  // remove duplicates keep order
  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (!seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

const STOP = new Set([
  "the","and","&","of","ltd","limited","llc","inc","corp","corporation","company","co","co.","co,","co,","sa","s.a.","plc","gmbh",
  "brewing","brewery","breweries","beer","ale","ales","works","beverage","beverages","bros","brothers","brewingco","brew","co-op","coop","cooperative",
  // overly-generic geo/word tokens that caused false positives
  "city","st","saint","louis"
]);
const STEM = Object.fromEntries([
  ["co", "company"],["coo","company"],["coors","coors"],["bier","beer"],["brewers","brewer"],["brewing","brew"],["brewery","brew"],["breweries","brew"],["beverages","beverage"],["ales","ale"],["bros","brothers"],["ucbc","urban","chestnut"],
].filter(Boolean));

function scoreCoverage(aTokens, bTokens) {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / a.size; // how much of engaged name is covered by CSV name
}

function hasDistinctiveOverlap(aTokens, bTokens) {
  const a = new Set(aTokens.filter((t) => t.length >= 4));
  const b = new Set(bTokens.filter((t) => t.length >= 4));
  for (const t of a) if (b.has(t)) return true;
  return false;
}

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function* readCSV(filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  const lines = data.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    yield parseCSVLine(line);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json");

  const envFromFile = loadEnvFromFile(path.resolve(__dirname, "..", "config.env"));
  const token = getEnv(envFromFile, "CLICKUP_API_KEY");
  const crmListId = getEnv(envFromFile, "CRM_LIST_ID");

  const engaged = [];
  for await (const t of iterateEngagedTasks(crmListId, token)) {
    engaged.push({ id: t.id, name: t.name });
  }

  const csvPath = path.resolve(__dirname, "..", "data", "brewery_data.csv");
  if (!fs.existsSync(csvPath)) throw new Error(`Missing CSV at ${csvPath}`);

  const it = readCSV(csvPath);
  const header = it.next().value;
  const nameIdx = header ? header.indexOf("Company Name") : -1;
  if (nameIdx === -1) throw new Error("CSV header does not include 'Company Name'");

  const rows = [];
  for (const cols of it) {
    const name = cols[nameIdx] || "";
    const rawnorm = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    rows.push({ name, tokens: normalize(name), rawnorm, raw: cols });
  }

  const report = [];
  for (const e of engaged) {
    const etok = normalize(e.name);
    let best = null;
    const eRaw = (e.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    for (const r of rows) {
      if (r.rawnorm === eRaw) { best = { score: 1, name: r.name }; break; }
      const contains = (r.rawnorm.includes(eRaw) || eRaw.includes(r.rawnorm)) && eRaw.length >= 6;
      if (contains && hasDistinctiveOverlap(etok, r.tokens)) { best = { score: 0.95, name: r.name }; break; }
      const coverage = scoreCoverage(etok, r.tokens);
      if (coverage >= 0.9 && hasDistinctiveOverlap(etok, r.tokens)) { best = { score: coverage, name: r.name }; break; }
      if (coverage >= 0.75 && hasDistinctiveOverlap(etok, r.tokens)) {
        if (!best || coverage > best.score) best = { score: coverage, name: r.name };
      }
    }
    if (best) report.push({ task: e.name, match: best.name, score: Number(best.score.toFixed(2)) });
    else report.push({ task: e.name, match: null, score: 0 });
  }

  if (jsonOut) {
    console.log(JSON.stringify({ total: engaged.length, matches: report }, null, 2));
  } else {
    console.log(`Engaged: ${engaged.length}`);
    for (const r of report) {
      console.log(`- ${r.task} -> ${r.match ? r.match + ` (score ${r.score})` : "NO MATCH"}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
