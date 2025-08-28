#!/usr/bin/env node
"use strict";

// For all Engaged tasks in the CRM list, read comments, extract
// contact details (name, email, phone, title) and update custom fields:
// - Contact (Main)
// - Contact (Main) Email
// - Contact (Main) Phone Number
// - Contact (Main) Title (fallback to Contact Title)
//
// Usage:
//   node scripts/update_fields_from_comments.js           # applies updates
//   node scripts/update_fields_from_comments.js --dry-run # only prints changes
//   node scripts/update_fields_from_comments.js --limit 5 # limit number of tasks processed
//   node scripts/update_fields_from_comments.js --overwrite # overwrite non-empty fields

const fs = require("fs");
const path = require("path");
const https = require("https");

const CLICKUP_HOST = "api.clickup.com";
const CLICKUP_BASE_PATH = "/api/v2";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function httpRequest({ method, path: reqPath, token, query, body }) {
  return new Promise((resolve, reject) => {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
    const payload = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: CLICKUP_HOST,
      method,
      path: `${reqPath}${qs}`,
      headers: { Authorization: token },
    };
    if (payload) {
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
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

function safeJsonParse(t) { try { return t ? JSON.parse(t) : null; } catch { return t; } }

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
    for (const t of tasks) yield t;
    page += 1;
    await sleep(100);
  }
}

async function getAccessibleCustomFields(listId, token) {
  const { data } = await httpRequest({ method: "GET", path: `${CLICKUP_BASE_PATH}/list/${listId}/field`, token });
  return (data && data.fields) || [];
}

async function getTaskComments(taskId, token) {
  const { data } = await httpRequest({ method: "GET", path: `${CLICKUP_BASE_PATH}/task/${taskId}/comment`, token });
  return (data && data.comments) || [];
}

function flattenCommentText(c) {
  // ClickUp comment may be rich text array in c.comment, or text in text_content
  const val = c && (c.comment ?? c.text_content ?? c.text);
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map((seg) => (seg && seg.text) || "").join("");
  return "";
}

function normalizeUSPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1${digits.slice(1)}`;
  return null; // skip non-US or malformed
}

function extractContactData(text) {
  const out = {};
  if (!text) return out;
  const t = text;

  // Email(s)
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emails = t.match(emailRe) || [];
  if (emails.length) out.email = emails[0];

  // Phone: only accept labeled phone lines to avoid false positives
  const phoneLabelRe = /(?:^|\n)\s*(?:Phone|Phone Number|Mobile|Cell)\s*:\s*([^\n]+)/i;
  const mPhoneLbl = t.match(phoneLabelRe);
  if (mPhoneLbl) {
    const normalized = normalizeUSPhone(mPhoneLbl[1].trim());
    if (normalized) out.phone = normalized;
  }

  // Name via label
  const nameRe = /(?:^|\n)\s*(?:Name|Contact|Contact Person|Primary Contact|Key Contact|Contact \(Main\))\s*:\s*([^\n]+)/i;
  const mName = t.match(nameRe);
  if (mName) out.name = mName[1].trim();

  // Title / Role via label
  const titleRe = /(?:^|\n)\s*(?:Title|Role|Position|Your Role)\s*:\s*([^\n]+)/i;
  const mTitle = t.match(titleRe);
  if (mTitle) out.title = mTitle[1].trim();

  return out;
}

function indexFieldsByName(fields) {
  const map = new Map();
  for (const f of fields) {
    const nm = String(f.name || "").toLowerCase();
    map.set(nm, f);
  }
  return map;
}

function findPreferredContactFields(fields) {
  const by = indexFieldsByName(fields);
  function get(name) { return by.get(String(name).toLowerCase()); }
  // Prefer explicit (Main) variants; fall back to generic ones
  const out = {
    name: get("Contact (Main)") || get("Contact") || get("Contact 1"),
    email: get("Contact (Main) Email") || get("Contact 1 Email") || get("Contact 2 Email") || get("Contact 3 Email") || get("Contact 4 Email"),
    phone: get("Contact (Main) Phone Number") || get("Contact 1 Phone") || get("Contact 2 Phone") || get("Contact 3 Phone") || get("Contact 4 Phone"),
    title: get("Contact (Main) Title") || get("Contact Title") || get("Contact 1 Title") || get("Contact 2 Title") || get("Contact 3 Title") || get("Contact 4 Title"),
  };
  return out;
}

function getCustomFieldValue(task, fieldId) {
  const f = (task?.custom_fields || []).find((x) => x.id === fieldId);
  return f ? f.value : undefined;
}

async function setTaskCustomField(taskId, fieldId, value, token) {
  await httpRequest({
    method: "POST",
    path: `${CLICKUP_BASE_PATH}/task/${taskId}/field/${fieldId}`,
    token,
    body: { value },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const overwrite = args.includes("--overwrite");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

  const envFromFile = loadEnvFromFile(path.resolve(__dirname, "..", "config.env"));
  const token = getEnv(envFromFile, "CLICKUP_API_KEY");
  const crmListId = getEnv(envFromFile, "CRM_LIST_ID");

  const fields = await getAccessibleCustomFields(crmListId, token);
  const preferred = findPreferredContactFields(fields);
  const missing = Object.entries(preferred).filter(([, f]) => !f).map(([k]) => k);
  if (missing.length) {
    console.warn(`Warning: Missing expected contact fields: ${missing.join(", ")}`);
  }

  let processed = 0;
  let updates = 0;
  for await (const task of iterateListTasksByStatus(crmListId, "Engaged", token)) {
    if (processed >= limit) break;
    processed += 1;

    const comments = await getTaskComments(task.id, token);
    const text = comments.map(flattenCommentText).join("\n");
    const info = extractContactData(text);

    const toApply = [];
    if (info.name && preferred.name) {
      const cur = getCustomFieldValue(task, preferred.name.id);
      if (overwrite || !cur) toApply.push({ field: preferred.name, value: info.name });
    }
    if (info.email && preferred.email) {
      const cur = getCustomFieldValue(task, preferred.email.id);
      if (overwrite || !cur) toApply.push({ field: preferred.email, value: info.email });
    }
    if (info.phone && preferred.phone) {
      const cur = getCustomFieldValue(task, preferred.phone.id);
      if (overwrite || !cur) toApply.push({ field: preferred.phone, value: info.phone });
    }
    if (info.title && preferred.title) {
      const cur = getCustomFieldValue(task, preferred.title.id);
      if (overwrite || !cur) toApply.push({ field: preferred.title, value: info.title });
    }

    if (toApply.length === 0) {
      console.log(`No updates for ${task.name} (${task.id}).`);
      continue;
    }

    for (const upd of toApply) {
      console.log(`${dryRun ? "Would update" : "Updating"} ${task.name} (${task.id}) field '${upd.field.name}' → ${JSON.stringify(upd.value)}`);
      if (!dryRun) {
        try {
          await setTaskCustomField(task.id, upd.field.id, upd.value, token);
          updates += 1;
          await sleep(150);
        } catch (err) {
          const status = err?.response?.status;
          const body = err?.response?.data;
          console.error(`Failed to update ${task.id} field ${upd.field.id}: ${status} ${JSON.stringify(body)}`);
          if (status === 429) await sleep(1000);
        }
      }
    }
  }

  console.log(`Done. Processed tasks: ${processed}. ${dryRun ? "Planned" : "Applied"} updates: ${updates}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
