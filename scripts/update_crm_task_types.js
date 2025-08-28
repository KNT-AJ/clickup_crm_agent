#!/usr/bin/env node
"use strict";

// Update ClickUp tasks in the CRM list: for tasks in status "Engaged" whose
// Task Type custom field is "task", set it to "account".

const fs = require("fs");
const path = require("path");
const https = require("https");

const CLICKUP_HOST = "api.clickup.com";
const CLICKUP_BASE_PATH = "/api/v2";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function getAccessibleCustomFields(listId, token) {
  const { data } = await httpRequest({
    method: "GET",
    path: `${CLICKUP_BASE_PATH}/list/${listId}/field`,
    token,
  });
  return (data && data.fields) || [];
}

function findTaskTypeField(fields) {
  if (!Array.isArray(fields)) return null;
  const lower = (s) => String(s || "").toLowerCase();

  // 1) Prefer explicit name matches
  const nameMatches = [
    "task type",
    "type",
    "record type",
    "crm type",
  ];
  for (const nm of nameMatches) {
    const byName = fields.find((f) => lower(f.name) === nm && f.type_config && Array.isArray(f.type_config.options));
    if (byName) return byName;
  }
  const containsMatches = ["task type", "type"];
  for (const cm of containsMatches) {
    const byContains = fields.find(
      (f) => lower(f.name).includes(cm) && f.type_config && Array.isArray(f.type_config.options)
    );
    if (byContains) return byContains;
  }

  // 2) Fallback: find any dropdown/labels field whose options include both 'task' and 'account'
  const candidates = fields.filter((f) => {
    const t = lower(f.type || f.type_config?.type);
    const isDropdownLike = t === "drop_down" || t === "labels" || f.type_config?.options;
    if (!isDropdownLike) return false;
    const opts = (f.type_config && Array.isArray(f.type_config.options) ? f.type_config.options : [])
      .map((o) => lower(o.name));
    return opts.includes("task") && opts.includes("account");
  });
  return candidates[0] || null;
}

function resolveDropdownOptionId(field, optionName) {
  if (!field || !field.type_config || !Array.isArray(field.type_config.options)) {
    return null;
  }
  const target = String(optionName).toLowerCase();
  // Prefer exact matches on name or label
  let match = field.type_config.options.find((opt) => {
    const disp = (opt && (opt.name ?? opt.label)) || "";
    return String(disp).toLowerCase() === target;
  });
  if (match) return match.id;
  // Fallback: substring contains
  match = field.type_config.options.find((opt) => {
    const disp = (opt && (opt.name ?? opt.label)) || "";
    return String(disp).toLowerCase().includes(target);
  });
  return match ? match.id : null;
}

function valueRepresentsName(fieldMeta, value, targetName) {
  const lower = (s) => String(s || "").toLowerCase();
  const t = lower(fieldMeta?.type || fieldMeta?.type_config?.type);
  const options = (fieldMeta?.type_config?.options || []).map((o) => ({
    id: o?.id,
    name: lower(o?.name ?? o?.label),
  }));
  const target = lower(targetName);
  if (t === "labels" && Array.isArray(value)) {
    return value.some((id) => options.find((o) => o.id === id && o.name === target));
  }
  if (Array.isArray(value)) {
    return value.some((v) => lower(v) === target);
  }
  // If value is option id
  const asIdMatch = options.find((o) => o.id === value && o.name === target);
  if (asIdMatch) return true;
  // If value already a string name
  if (lower(value) === target) return true;
  return false;
}

function buildValueForName(fieldMeta, targetName) {
  const lower = (s) => String(s || "").toLowerCase();
  const t = lower(fieldMeta?.type || fieldMeta?.type_config?.type);
  const options = (fieldMeta?.type_config?.options || []).map((o) => ({
    id: o?.id,
    name: lower(o?.name ?? o?.label),
  }));
  const target = lower(targetName);
  const targetOpt = options.find((o) => o.name === target);
  if (t === "labels") {
    return targetOpt ? [targetOpt.id] : [targetName];
  }
  if (t === "drop_down") {
    return targetOpt ? targetOpt.id : targetName;
  }
  // Fallback for text/short_text
  return targetName;
}

async function* iterateListTasksByStatus(listId, statusName, token) {
  // Paginate tasks in a list filtered by status
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
    for (const task of tasks) {
      yield task;
    }
    page += 1;
    // Respect ClickUp rate limits a bit when deep paging
    await sleep(200);
  }
}

function getCustomFieldValue(task, fieldId) {
  const fields = task?.custom_fields || [];
  const match = fields.find((f) => f.id === fieldId);
  return match ? match.value : undefined;
}

async function setTaskCustomField(taskId, fieldId, value, token) {
  await httpRequest({
    method: "POST",
    path: `${CLICKUP_BASE_PATH}/task/${taskId}/field/${fieldId}`,
    token,
    body: { value },
  });
}

async function updateTaskType(taskId, customType, token) {
  // Attempt to set ClickUp Custom Task Type (e.g., 'account') directly on the task
  return httpRequest({
    method: "PUT",
    path: `${CLICKUP_BASE_PATH}/task/${taskId}`,
    token,
    body: { custom_type: customType },
  });
}

async function main() {
  const envFromFile = loadEnvFromFile(path.resolve(__dirname, "..", "config.env"));
  const token = getEnv(envFromFile, "CLICKUP_API_KEY");
  const crmListId = getEnv(envFromFile, "CRM_LIST_ID");

  console.log(`Scanning list ${crmListId} for Engaged tasks with type 'task'...`);

  const accessibleFields = await getAccessibleCustomFields(crmListId, token);
  const taskTypeField = findTaskTypeField(accessibleFields);
  if (!taskTypeField) {
    console.warn("Task Type field not clearly identified by name; using heuristic per-task detection.");
  }
  // Option IDs are best-effort; robust detection below does not require them.
  const taskOptionId = taskTypeField ? resolveDropdownOptionId(taskTypeField, "task") : null;
  const accountOptionId = taskTypeField ? resolveDropdownOptionId(taskTypeField, "account") : null;

  let scanned = 0;
  let updated = 0;

  for await (const task of iterateListTasksByStatus(crmListId, "Engaged", token)) {
    scanned += 1;
    // Try robust detection across all custom fields
    const fieldById = new Map((accessibleFields || []).map((f) => [f.id, f]));
    const cfs = Array.isArray(task?.custom_fields) ? task.custom_fields : [];
    let didUpdate = false;
    for (const cf of cfs) {
      const meta = fieldById.get(cf.id) || {};
      const nameLower = String(meta?.name || cf?.name || "").toLowerCase();
      const looksLikeType = nameLower.includes("type") || nameLower.includes("record");
      const hasOptions = Array.isArray(meta?.type_config?.options) && meta.type_config.options.length > 0;
      const mentionsTaskAccount = hasOptions
        ? meta.type_config.options.some((o) => {
            const nm = String(o?.name ?? o?.label ?? "").toLowerCase();
            return nm.includes("task") || nm.includes("account");
          })
        : false;
      const isCandidate = looksLikeType || mentionsTaskAccount;
      if (!isCandidate) continue;

      const isTask = valueRepresentsName(meta, cf.value, "task");
      if (!isTask) continue;

      try {
        const newValue = hasOptions ? buildValueForName(meta, "account") : "account";
        await setTaskCustomField(task.id, cf.id, newValue, token);
        updated += 1;
        didUpdate = true;
        console.log(`Updated task ${task.id} field '${meta?.name || cf?.id}' → account`);
        await sleep(120);
        break; // Update only one field per task
      } catch (err) {
        const status = err?.response?.status;
        const body = err?.response?.data;
        console.error(`Failed updating task ${task?.id} on field ${cf?.id}: ${status} ${JSON.stringify(body)}`);
        if (status === 429) await sleep(1000);
      }
    }
    if (!didUpdate) {
      // Fallback to Custom Task Type update
      const currentType = task.custom_type || task.type || null;
      const looksLikeTask = !currentType || String(currentType).toLowerCase() === "task";
      if (looksLikeTask) {
        try {
          await updateTaskType(task.id, "account", token);
          updated += 1;
          console.log(`Updated task ${task.id} custom_type → account`);
          await sleep(120);
          continue;
        } catch (err) {
          const status = err?.response?.status;
          const body = err?.response?.data;
          console.error(`Failed setting custom_type for task ${task?.id}: ${status} ${JSON.stringify(body)}`);
          if (status === 429) await sleep(1000);
        }
      }

      // Debug log showing potential fields when nothing updated
      const summaries = cfs.map((cf) => {
        const meta = fieldById.get(cf.id) || {};
        return {
          id: cf.id,
          name: meta?.name || cf?.name,
          type: meta?.type || meta?.type_config?.type,
          value: cf.value,
        };
      });
      console.log(`No matching type field found on task ${task.id}. Fields: ${JSON.stringify(summaries).slice(0, 800)}...`);
    }
  }

  console.log(`Done. Scanned: ${scanned}, Updated: ${updated}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


