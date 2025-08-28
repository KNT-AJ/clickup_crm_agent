#!/usr/bin/env node
"use strict";

// Update CRM custom fields for Engaged breweries using data/brewery_data.csv.
// Only updates empty fields by default; use --overwrite to replace existing values.
// Fields mapped (if present in the list):
// - Address ← CSV: Address (short_text)
// - City ← CSV: City (short_text)
// - State ← CSV: State (short_text)
// - ZIP Code ← CSV: ZIP Code (short_text)
// - Company_Website ← CSV: Website (url)
// - Twitter ← CSV: Twitter (url)
// - LinkedIn ← CSV: Linked-In (url)
// - Facebook ← CSV: Facebook (url)
// - Contact (Main) Phone Number ← CSV: Phone Number Combined (normalized E.164, US only)
// - Employee Count (drop_down) ← CSV: Location Employee Size Actual (bucketed 0-25/26-100/101+),
//   else Location Employee Size Range parsed to same buckets
//
// Usage:
//   node scripts/update_fields_from_csv.js --dry-run
//   node scripts/update_fields_from_csv.js --overwrite --limit 10

const fs = require("fs");
const path = require("path");
const https = require("https");

const CLICKUP_HOST = "api.clickup.com";
const CLICKUP_BASE_PATH = "/api/v2";

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function loadEnvFromFile(envFilePath){
  const env={};
  const full=path.resolve(envFilePath);
  if(!fs.existsSync(full))return env;
  for(const line of fs.readFileSync(full,"utf8").split(/\r?\n/)){
    if(!line||/^\s*#/.test(line))continue;
    const i=line.indexOf("="); if(i===-1)continue; env[line.slice(0,i).trim()]=line.slice(i+1).trim();
  }
  return env;
}

function getEnv(env,name,fb){ const v=env[name]??process.env[name]??fb; if(!v) throw new Error(`Missing required env var ${name}`); return v; }

function httpRequest({ method, path: reqPath, token, query, body }){
  return new Promise((resolve,reject)=>{
    const qs=query?`?${new URLSearchParams(query).toString()}`:"";
    const payload=body?JSON.stringify(body):undefined;
    const options={hostname:CLICKUP_HOST,method,path:`${reqPath}${qs}`,headers:{Authorization:token}};
    if(payload){ options.headers["Content-Type"]="application/json"; options.headers["Content-Length"]=Buffer.byteLength(payload); }
    const req=https.request(options,res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{const s=res.statusCode||0; if(s<200||s>=300){return reject({response:{status:s,data:safeJsonParse(d)}});} resolve({status:s,data:safeJsonParse(d)});});});
    req.on("error",reject); if(payload)req.write(payload); req.end();
  });
}

function safeJsonParse(t){ try{return t?JSON.parse(t):null;}catch{return t;} }

async function* iterateEngagedTasks(listId, token){
  let page=0;
  for(;;){
    const {data}=await httpRequest({method:"GET", path:`${CLICKUP_BASE_PATH}/list/${listId}/task`, token, query:{page:String(page), order_by:"created", subtasks:"true", "statuses[]":"Engaged"}});
    const tasks=(data&&data.tasks)||[]; if(tasks.length===0)break; for(const t of tasks)yield t; page+=1; await sleep(100);
  }
}

async function getAccessibleCustomFields(listId, token){
  const {data}=await httpRequest({method:"GET", path:`${CLICKUP_BASE_PATH}/list/${listId}/field`, token});
  return (data&&data.fields)||[];
}

async function setTaskCustomField(taskId, fieldId, value, token){
  await httpRequest({method:"POST", path:`${CLICKUP_BASE_PATH}/task/${taskId}/field/${fieldId}`, token, body:{value}});
}

function normalizeNameTokens(str){
  const s=String(str||"").toLowerCase();
  const words=s.replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(Boolean).filter(w=>!STOP.has(w));
  const seen=new Set(); const out=[]; for(const w of words){ if(!seen.has(w)){ seen.add(w); out.push(w);} }
  return out;
}
const STOP=new Set(["the","and","&","of","ltd","limited","llc","inc","corp","corporation","company","co","co.","sa","s.a.","plc","gmbh","brewing","brewery","breweries","beer","ale","ales","works","beverage","beverages","bros","brothers","coop","co-op","city","st","saint","louis"]);

function scoreCoverage(aTokens,bTokens){ if(aTokens.length===0||bTokens.length===0)return 0; const a=new Set(aTokens), b=new Set(bTokens); let inter=0; for(const t of a) if(b.has(t)) inter++; return inter/a.size; }
function hasDistinctiveOverlap(aTokens,bTokens){ const a=new Set(aTokens.filter(t=>t.length>=4)), b=new Set(bTokens.filter(t=>t.length>=4)); for(const t of a) if(b.has(t)) return true; return false; }

function parseCSVLine(line){ const out=[]; let cur="", inQ=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(inQ){ if(ch==='"'){ if(i+1<line.length && line[i+1]==='"'){ cur+='"'; i++; } else inQ=false; } else cur+=ch; } else { if(ch==='"') inQ=true; else if(ch===','){ out.push(cur); cur=""; } else cur+=ch; } } out.push(cur); return out; }

function* readCSV(filePath){ const data=fs.readFileSync(filePath,"utf8"); const lines=data.split(/\r?\n/); for(const line of lines){ if(!line)continue; yield parseCSVLine(line);} }

function indexFields(fields){ const byName=new Map(); for(const f of fields){ byName.set(String(f.name||"").toLowerCase(), f); } return byName; }

function getCustomFieldValue(task, fieldId){ const f=(task?.custom_fields||[]).find(x=>x.id===fieldId); return f?f.value:undefined; }

function normalizeUSPhone(raw){ if(!raw) return null; const digits=String(raw).replace(/\D/g,""); if(digits.length===10) return `+1${digits}`; if(digits.length===11 && digits.startsWith("1")) return `+1${digits.slice(1)}`; return null; }

function pickEmployeeBucket(actual, rangeStr){
  const n = Number(String(actual||"").replace(/[^0-9.]/g, ""));
  const toBucket=(x)=> x<=25?"0-25": x<=100?"26-100":"101+";
  if(!Number.isNaN(n) && n>0) return toBucket(n);
  const m = String(rangeStr||"").match(/(\d+)\s*[-to]+\s*(\d+)/i);
  if(m){ const low=Number(m[1]); const high=Number(m[2]); if(!Number.isNaN(high)) return toBucket(high); }
  return null;
}

async function main(){
  const args=process.argv.slice(2);
  const dryRun=args.includes("--dry-run");
  const overwrite=args.includes("--overwrite");
  const limitIdx=args.indexOf("--limit");
  const limit=limitIdx!==-1?parseInt(args[limitIdx+1],10):Infinity;

  const envFromFile=loadEnvFromFile(path.resolve(__dirname, "..", "config.env"));
  const token=getEnv(envFromFile, "CLICKUP_API_KEY");
  const listId=getEnv(envFromFile, "CRM_LIST_ID");

  // Load CSV
  const csvPath=path.resolve(__dirname, "..", "data", "brewery_data.csv");
  if(!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
  const it=readCSV(csvPath);
  const header=it.next().value;
  const colIdx=(name)=> header.indexOf(name);
  const IDX={
    company: colIdx("Company Name"),
    address: colIdx("Address"), city: colIdx("City"), state: colIdx("State"), zip: colIdx("ZIP Code"),
    website: colIdx("Website"), twitter: colIdx("Twitter"), linkedin: colIdx("Linked-In"), facebook: colIdx("Facebook"),
    phone: colIdx("Phone Number Combined"),
    empActual: colIdx("Location Employee Size Actual"), empRange: colIdx("Location Employee Size Range"),
    salesActual: colIdx("Location Sales Volume Actual"),
  };
  for(const key of Object.keys(IDX)) if(IDX[key]===-1){ /* missing columns tolerated */ }

  const csvRows=[];
  for(const row of it){
    const name=row[IDX.company]||"";
    const rawnorm=(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
    csvRows.push({ name, rawnorm, tokens: normalizeNameTokens(name), row });
  }

  // Load fields
  const fields=await getAccessibleCustomFields(listId, token);
  const byName=indexFields(fields);

  // Prepare target field handles
  const F={
    address: byName.get("address"),
    city: byName.get("city"),
    state: byName.get("state"),
    zip: byName.get("zip code"),
    website: byName.get("company_website"),
    twitter: byName.get("twitter"),
    linkedin: byName.get("linkedin"),
    facebook: byName.get("facebook"),
    phone: byName.get("contact (main) phone number"),
    emp: byName.get("employee count"),
  };

  // Build Employee Count option map
  const empOptions = (F.emp?.type_config?.options||[]).map(o=>({id:o.id, name:o.name}));
  const empByName = new Map(empOptions.map(o=>[String(o.name).toLowerCase(), o.id]));

  let processed=0, applied=0;
  for await (const task of iterateEngagedTasks(listId, token)){
    if(processed>=limit) break; processed++;
    const eRaw=(task.name||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
    const eTok=normalizeNameTokens(task.name);
    // find best CSV match
    let best=null;
    for(const r of csvRows){
      if(r.rawnorm===eRaw){ best={name:r.name, row:r.row, score:1}; break; }
      const coverage=scoreCoverage(eTok, r.tokens);
      const contains=( (r.rawnorm.length>=8 && (r.rawnorm.includes(eRaw) || eRaw.includes(r.rawnorm))) && hasDistinctiveOverlap(eTok, r.tokens) );
      if((coverage>=0.9 && hasDistinctiveOverlap(eTok, r.tokens)) || contains){ best={name:r.name,row:r.row,score:coverage||0.95}; break; }
      if(coverage>=0.75 && hasDistinctiveOverlap(eTok, r.tokens)){
        if(!best || coverage>best.score) best={name:r.name,row:r.row,score:coverage};
      }
    }
    if(!best){ console.log(`No CSV match for ${task.name}`); continue; }

    const row=best.row;
    const planned=[];
    function maybePlan(field, newVal){
      if(!field || newVal==null || newVal==='') return;
      const cur=getCustomFieldValue(task, field.id);
      if(!overwrite && cur) return;
      planned.push({ field, value:newVal });
    }

    // Text/URL fields
    if(F.address) maybePlan(F.address, row[IDX.address]||"");
    if(F.city) maybePlan(F.city, row[IDX.city]||"");
    if(F.state) maybePlan(F.state, row[IDX.state]||"");
    if(F.zip) maybePlan(F.zip, row[IDX.zip]||"");
    if(F.website) maybePlan(F.website, row[IDX.website]||"");
    if(F.twitter) maybePlan(F.twitter, row[IDX.twitter]||"");
    if(F.linkedin) maybePlan(F.linkedin, row[IDX.linkedin]||"");
    if(F.facebook) maybePlan(F.facebook, row[IDX.facebook]||"");

    // Phone (E.164 normalize US)
    if(F.phone){ const norm=normalizeUSPhone(row[IDX.phone]||""); if(norm) maybePlan(F.phone, norm); }

    // Employee Count bucket
    if(F.emp){
      const bucket=pickEmployeeBucket(row[IDX.empActual], row[IDX.empRange]);
      if(bucket && empByName.has(bucket)) maybePlan(F.emp, empByName.get(bucket));
    }

    if(planned.length===0){ console.log(`No updates for ${task.name} (match: ${best.name}).`); continue; }

    for(const upd of planned){
      console.log(`${dryRun?"Would update":"Updating"} ${task.name} (${task.id}) field '${upd.field.name}' → ${JSON.stringify(upd.value)}`);
      if(!dryRun){
        try{ await setTaskCustomField(task.id, upd.field.id, upd.value, token); applied++; await sleep(120);}catch(err){ const s=err?.response?.status; const b=err?.response?.data; console.error(`Failed updating ${task.id} ${upd.field.name}: ${s} ${JSON.stringify(b)}`); if(s===429) await sleep(1000); }
      }
    }
  }

  console.log(`Done. Processed: ${processed}. ${dryRun?"Planned":"Applied"} updates: ${applied}.`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
