// src/index.ts

export interface Env {
  DB: D1Database;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  APP_URL: string;
}

// ─────────────────────────────────────────────
// PT-BR Engine
// ─────────────────────────────────────────────
function numeroPorExtensoPTBR(n: number): string {
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas   = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas  = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (n === 0) return "zero";
  if (n === 100) return "cem";
  let texto = "";
  const c = Math.floor(n / 100), d = Math.floor((n % 100) / 10), u = n % 10;
  if (c > 0) texto += centenas[c];
  if (d === 1) texto += (texto ? " e " : "") + especiais[u];
  else {
    if (d > 1) texto += (texto ? " e " : "") + dezenas[d];
    if (u > 0) texto += (texto ? " e " : "") + unidades[u];
  }
  return texto;
}

function brl(valor: number): string {
  const v = Math.round(valor * 100) / 100;
  const inteiro = Math.floor(v);
  const centavos = Math.round((v - inteiro) * 100);
  const escalas: Array<[string, string]> = [["",""],["mil","mil"],["milhão","milhões"],["bilhão","bilhões"],["trilhão","trilhões"]];
  let partes: string[] = [];
  if (inteiro === 0) { partes = ["zero"]; }
  else {
    let num = inteiro, escala = 0;
    while (num > 0) {
      const grupo = num % 1000;
      if (grupo > 0) {
        let txt = numeroPorExtensoPTBR(grupo);
        if (escala > 0) { const [s, p] = escalas[escala] ?? ["",""]; txt += " " + (grupo === 1 ? s : p); }
        partes.unshift(txt);
      }
      num = Math.floor(num / 1000); escala++;
    }
  }
  let resultado = partes.join(" e ");
  resultado += inteiro === 1 ? " real" : " reais";
  if (centavos > 0) {
    resultado += " e " + numeroPorExtensoPTBR(centavos);
    resultado += centavos === 1 ? " centavo" : " centavos";
  }
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

// ─────────────────────────────────────────────
// English Engine
// ─────────────────────────────────────────────
const EN_ONES  = ["","one","two","three","four","five","six","seven","eight","nine",
                  "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen",
                  "seventeen","eighteen","nineteen"];
const EN_TENS  = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
const EN_SCALE = ["","thousand","million","billion","trillion"];

function threeDigitsEN(n: number): string {
  if (n === 0) return "";
  if (n < 20) return EN_ONES[n];
  if (n < 100) return EN_TENS[Math.floor(n/10)] + (n%10 ? "-" + EN_ONES[n%10] : "");
  const h = Math.floor(n/100), rem = n % 100;
  return EN_ONES[h] + " hundred" + (rem ? " and " + threeDigitsEN(rem) : "");
}

function integerEN(n: number): string {
  if (n === 0) return "zero";
  let result = "", scale = 0, num = n;
  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const words = threeDigitsEN(chunk);
      result = words + (EN_SCALE[scale] ? " " + EN_SCALE[scale] : "") + (result ? " " + result : "");
    }
    num = Math.floor(num / 1000); scale++;
  }
  return result.trim();
}

interface CurrencyConfig {
  lang: "en" | "ptbr" | "zh";
  major: string;        // singular
  majorPlural: string;  // plural
  minor: string;        // cents singular
  minorPlural: string;  // cents plural
  prefix?: string;      // e.g. "New Zealand"
}

const CURRENCIES: Record<string, CurrencyConfig> = {
  BRL: { lang: "ptbr", major: "real",             majorPlural: "reais",    minor: "centavo",  minorPlural: "centavos" },
  USD: { lang: "en",   major: "dollar",            majorPlural: "dollars",  minor: "cent",     minorPlural: "cents"    },
  NZD: { lang: "en",   major: "dollar",            majorPlural: "dollars",  minor: "cent",     minorPlural: "cents", prefix: "New Zealand" },
  EUR: { lang: "en",   major: "euro",              majorPlural: "euros",    minor: "cent",     minorPlural: "cents"    },
  INR: { lang: "en",   major: "rupee",             majorPlural: "rupees",   minor: "paisa",    minorPlural: "paise"    },
  CNY: { lang: "zh",   major: "",                  majorPlural: "",         minor: "",         minorPlural: ""         },
};

function formatEN(valor: number, cfg: CurrencyConfig): string {
  const v       = Math.round(valor * 100) / 100;
  const inteiro = Math.floor(v);
  const cents   = Math.round((v - inteiro) * 100);
  const prefix  = cfg.prefix ? cfg.prefix + " " : "";
  const majorStr = inteiro === 1
    ? integerEN(inteiro) + " " + prefix + cfg.major
    : integerEN(inteiro) + " " + prefix + cfg.majorPlural;
  if (cents === 0) return cap(majorStr);
  const minorStr = cents === 1
    ? integerEN(cents) + " " + cfg.minor
    : integerEN(cents) + " " + cfg.minorPlural;
  return cap(majorStr + " and " + minorStr);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────
// Chinese Formal 大写 Engine
// ─────────────────────────────────────────────
const ZH_DIGITS  = "零壹贰叁肆伍陆柒捌玖";
const ZH_UNITS   = ["","拾","佰","仟"];
const ZH_SECTIONS= ["","万","亿","万亿"];

function sectionZH(n: number): string {
  let result = "", needZero = false;
  for (let i = 3; i >= 0; i--) {
    const d = Math.floor(n / Math.pow(10, i)) % 10;
    if (d === 0) { if (result) needZero = true; }
    else { if (needZero) { result += "零"; needZero = false; } result += ZH_DIGITS[d] + ZH_UNITS[i]; }
  }
  return result;
}

function integerZH(n: number): string {
  if (n === 0) return "零";
  const sections: number[] = [];
  let num = n;
  while (num > 0) { sections.unshift(num % 10000); num = Math.floor(num / 10000); }
  let result = "", needZero = false;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], scaleIdx = sections.length - 1 - i;
    if (s === 0) { needZero = true; continue; }
    if (needZero && result) { result += "零"; needZero = false; }
    const sStr = sectionZH(s);
    // add leading zero if section < 1000 and there's content before
    if (result && s < 1000) result += "零";
    result += sStr + (ZH_SECTIONS[scaleIdx] ?? "");
  }
  return result || "零";
}

function cny(valor: number): string {
  const v       = Math.round(valor * 100) / 100;
  const inteiro = Math.floor(v);
  const cents   = Math.round((v - inteiro) * 100);
  const jiao    = Math.floor(cents / 10);   // 角
  const fen     = cents % 10;               // 分
  if (inteiro === 0 && cents === 0) return "零元整";
  let result = inteiro > 0 ? integerZH(inteiro) + "元" : "";
  if (cents === 0) { result += "整"; }
  else {
    if (inteiro === 0 || (inteiro > 0 && cents < 10)) result += "零";
    if (jiao > 0) result += ZH_DIGITS[jiao] + "角";
    if (fen  > 0) result += ZH_DIGITS[fen]  + "分";
    else if (jiao > 0) result += "整";
  }
  return result;
}

// ─────────────────────────────────────────────
// Main converter dispatcher
// ─────────────────────────────────────────────
function convertAmount(valor: number, currency: string): string {
  const cfg = CURRENCIES[currency.toUpperCase()];
  if (!cfg) return `[Unsupported currency: ${currency}]`;
  if (cfg.lang === "zh")   return cny(valor);
  if (cfg.lang === "ptbr") return brl(valor);
  return formatEN(valor, cfg);
}

// ─────────────────────────────────────────────
// D1 helpers
// ─────────────────────────────────────────────
interface Installation {
  domain:          string;
  member_id:       string;
  access_token:    string;
  refresh_token:   string;
  expires_at:      number;
  client_endpoint: string;
  field_extenso:   string;
}

async function getInstallation(db: D1Database, domain: string): Promise<Installation | null> {
  return (await db.prepare("SELECT * FROM installations WHERE domain = ?").bind(domain).first<Installation>()) ?? null;
}

async function saveInstallation(db: D1Database, data: Installation): Promise<void> {
  await db.prepare(`
    INSERT INTO installations (domain,member_id,access_token,refresh_token,expires_at,client_endpoint,field_extenso,installed_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(domain) DO UPDATE SET
      member_id=excluded.member_id, access_token=excluded.access_token,
      refresh_token=excluded.refresh_token, expires_at=excluded.expires_at,
      client_endpoint=excluded.client_endpoint, installed_at=excluded.installed_at
  `).bind(data.domain,data.member_id,data.access_token,data.refresh_token,
          data.expires_at,data.client_endpoint,data.field_extenso,
          Math.floor(Date.now()/1000)).run();
}

async function updateField(db: D1Database, domain: string, field: string): Promise<void> {
  await db.prepare("UPDATE installations SET field_extenso=? WHERE domain=?").bind(field,domain).run();
}

async function updateTokens(db: D1Database, domain: string, access: string, refresh: string, expiresAt: number): Promise<void> {
  await db.prepare("UPDATE installations SET access_token=?,refresh_token=?,expires_at=? WHERE domain=?")
    .bind(access,refresh,expiresAt,domain).run();
}

// ─────────────────────────────────────────────
// OAuth helpers
// ─────────────────────────────────────────────
async function refreshToken(env: Env, inst: Installation): Promise<Installation> {
  const now = Math.floor(Date.now()/1000);
  if (inst.expires_at > now + 60) return inst;
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type:"refresh_token", client_id:env.CLIENT_ID, client_secret:env.CLIENT_SECRET, refresh_token:inst.refresh_token }),
  });
  const data: any = await res.json();
  if (!data.access_token) throw new Error("Failed to refresh OAuth token");
  const updated = { ...inst, access_token:data.access_token, refresh_token:data.refresh_token, expires_at:now+(data.expires_in??3600) };
  await updateTokens(env.DB, inst.domain, updated.access_token, updated.refresh_token, updated.expires_at);
  return updated;
}

// ─────────────────────────────────────────────
// Bitrix24 REST helper
// ─────────────────────────────────────────────
async function callBitrix(endpoint: string, method: string, params: Record<string,string>, token: string): Promise<any> {
  const body = new URLSearchParams({ ...params, auth: token });
  const url  = `${endpoint.replace(/\/$/,"")}/${method}.json`;
  const res  = await fetch(url, {
    method: "POST", body,
    headers: { "Content-Type":"application/x-www-form-urlencoded", "User-Agent":"ValorExtensoBR/2.0" },
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Bitrix API [${res.status}] non-JSON: ${text.slice(0,120)}`); }
}

async function registerEvents(endpoint: string, token: string, handlerUrl: string): Promise<void> {
  for (const event of ["ONCRMDEALADD","ONCRMDEALUPDATE"])
    await callBitrix(endpoint, "event.bind", { event, handler: handlerUrl }, token);
}

// ─────────────────────────────────────────────
// HTML helper
// ─────────────────────────────────────────────
function html(body: string, status = 200): Response {
  return new Response(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Amount Writer</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:#f4f5f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
      .card{background:#fff;border-radius:10px;padding:36px;max-width:520px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.1)}
      h2{color:#2e7d32;margin-bottom:16px}h2.error{color:#c62828}
      p{color:#444;line-height:1.6;margin-bottom:12px}
      label{display:block;margin-bottom:6px;font-weight:bold;color:#333}
      input[type=text]{width:100%;padding:10px 14px;border:1px solid #ccc;border-radius:6px;font-size:14px;margin-bottom:16px}
      button{background:#2e7d32;color:#fff;border:none;padding:11px 24px;border-radius:6px;font-size:15px;cursor:pointer}
      button:hover{background:#1b5e20}
      code{background:#eee;padding:2px 6px;border-radius:4px;font-size:.88em}
      .hint{font-size:.82em;color:#777;margin-top:-10px;margin-bottom:16px}
      .success{color:#2e7d32;margin-top:8px;font-weight:bold}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:.88em}
      td,th{padding:6px 8px;border:1px solid #ddd;text-align:left}
      th{background:#f0f0f0}
    </style>
  </head><body><div class="card">${body}</div></body></html>`,
  { status, headers:{"Content-Type":"text/html;charset=utf-8"} });
}

function jsonResp(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}

// ─────────────────────────────────────────────
// Route: POST /install
// ─────────────────────────────────────────────
async function handleInstall(request: Request, env: Env): Promise<Response> {
  const urlObj = new URL(request.url);
  const text   = await request.text();
  const body   = new URLSearchParams(text);
  const get    = (...keys: string[]) => { for (const k of keys) { const v = urlObj.searchParams.get(k)??body.get(k); if(v) return v; } return ""; };

  const domain          = get("DOMAIN","domain");
  const memberId        = get("MEMBER_ID","member_id");
  const accessToken     = get("AUTH_ID","access_token");
  const refreshToken_   = get("REFRESH_ID","refresh_token");
  const expiresIn       = parseInt(get("AUTH_EXPIRES")||"3600");
  const clientEndpoint  = get("client_endpoint");
  const resolvedEndpoint= clientEndpoint || (domain ? `https://${domain}/rest/` : "");

  if (!domain || !accessToken || !resolvedEndpoint)
    return html(`<h2 class="error">❌ Installation error</h2><p>Incomplete data received from Bitrix24. Please reinstall the application.</p>`, 400);

  await saveInstallation(env.DB, { domain, member_id:memberId, access_token:accessToken, refresh_token:refreshToken_, expires_at:Math.floor(Date.now()/1000)+expiresIn, client_endpoint:resolvedEndpoint, field_extenso:"UF_CRM_AMOUNT_WORDS" });
  await registerEvents(resolvedEndpoint, accessToken, `${env.APP_URL}/bitrix`);

  const setupUrl = `${env.APP_URL}/setup?domain=${encodeURIComponent(domain)}`;
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <script src="https://api.bitrix24.com/api/v1/"></script></head>
  <body><p style="font-family:Arial;text-align:center;padding:40px;color:#2e7d32">✅ Installing Amount Writer...</p>
  <script>BX24.init(function(){BX24.installFinish(function(){window.location.href="${setupUrl}";});});</script>
  </body></html>`, { headers:{"Content-Type":"text/html;charset=utf-8"} });
}

// ─────────────────────────────────────────────
// Route: GET /setup
// ─────────────────────────────────────────────
async function handleSetupGet(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? "";
  const saved  = url.searchParams.get("saved");
  const successMsg = saved === "1" ? `<p class="success">✅ Settings saved successfully!</p>` : "";

  const tableHtml = `<table><tr><th>Currency</th><th>Language</th><th>Example</th></tr>
        <tr><td>BRL</td><td>Portuguese</td><td>Quatrocentos reais e cinquenta centavos</td></tr>
        <tr><td>USD</td><td>English</td><td>Four hundred dollars and fifty cents</td></tr>
        <tr><td>NZD</td><td>English</td><td>Four hundred New Zealand dollars and fifty cents</td></tr>
        <tr><td>EUR</td><td>English</td><td>Four hundred euros and fifty cents</td></tr>
        <tr><td>CNY</td><td>Chinese (大写)</td><td>肆佰元伍角整</td></tr>
        <tr><td>INR</td><td>English</td><td>Four hundred rupees and fifty paise</td></tr>
      </table>`;
  const styles    = `*{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:#f4f5f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
      .card{background:#fff;border-radius:10px;padding:36px;max-width:540px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.1)}
      h2{color:#2e7d32;margin-bottom:16px}
      p{color:#444;line-height:1.6;margin-bottom:12px}
      label{display:block;margin-bottom:6px;font-weight:bold;color:#333}
      select{width:100%;padding:10px 14px;border:1px solid #ccc;border-radius:6px;font-size:14px;margin-bottom:16px;background:#fff;cursor:pointer}
      select:disabled{background:#f5f5f5;color:#999;cursor:default}
      button{background:#2e7d32;color:#fff;border:none;padding:11px 24px;border-radius:6px;font-size:15px;cursor:pointer}
      button:hover{background:#1b5e20}
      button:disabled{background:#aaa;cursor:default}
      .hint{font-size:.82em;color:#777;margin-top:-10px;margin-bottom:16px}
      .success{color:#2e7d32;margin-top:0;margin-bottom:12px;font-weight:bold}
      .loading{color:#888;font-size:.9em;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:.85em}
      td,th{padding:6px 8px;border:1px solid #ddd;text-align:left}
      th{background:#f0f0f0}
      code{background:#eee;padding:2px 6px;border-radius:4px;font-size:.85em}`;
  const script    = `
BX24.init(function() {
  var auth   = BX24.getAuth();
  var domain = auth.domain || BX24.getDomain();
  document.getElementById('domainField').value = domain;

  var select  = document.getElementById('fieldSelect');
  var loading = document.getElementById('loadingMsg');
  var btn     = document.getElementById('saveBtn');

  // Load current saved value
  var savedField = '';
  fetch('/setup-data?domain=' + encodeURIComponent(domain))
    .then(function(r) { return r.json(); })
    .then(function(d) { savedField = d.field_extenso || ''; loadFields(); })
    .catch(function() { loadFields(); });

  function loadFields() {
    BX24.callMethod('crm.deal.fields', {}, function(result) {
      if (result.error()) {
        loading.textContent = 'Could not load fields. Please try again.';
        return;
      }
      var fields = result.data();
      var options = [];
      for (var key in fields) {
        var f = fields[key];
        // Only string (text) fields — including custom ones
        if (f.type === 'string') {
          options.push({ code: key, label: (f.formLabel || f.listLabel || f.title || key) + ' (' + key + ')' });
        }
      }
      // Sort: custom fields first, then standard
      options.sort(function(a, b) {
        var aCustom = a.code.indexOf('UF_') === 0 ? 0 : 1;
        var bCustom = b.code.indexOf('UF_') === 0 ? 0 : 1;
        if (aCustom !== bCustom) return aCustom - bCustom;
        return a.label.localeCompare(b.label);
      });

      loading.style.display = 'none';
      select.disabled = false;
      btn.disabled    = false;

      // Add placeholder
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— Select a text field —';
      select.appendChild(placeholder);

      options.forEach(function(opt) {
        var el = document.createElement('option');
        el.value = opt.code;
        el.textContent = opt.label;
        if (opt.code === savedField) el.selected = true;
        select.appendChild(el);
      });

      // If saved field not in list, add it anyway
      if (savedField && !options.find(function(o){ return o.code === savedField; })) {
        var el = document.createElement('option');
        el.value = savedField;
        el.textContent = savedField + ' (current)';
        el.selected = true;
        select.insertBefore(el, select.options[1]);
      }
    });
  }
});
`;

  // Served inside Bitrix24 iframe — use BX24.js to get domain and fields
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Amount Writer — Setup</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>${styles}</style>
</head>
<body>
<div class="card">
  <h2>⚙️ Amount Writer — Setup</h2>
  <p>Select the custom text field where the amount in words will be saved.</p>
  ${successMsg}
  <form id="setupForm" method="POST" action="/setup">
    <input type="hidden" name="domain" id="domainField" value="${domain}">
    <label for="fieldSelect">Text field for amount in words</label>
    <p id="loadingMsg" class="loading">⏳ Loading available fields...</p>
    <select id="fieldSelect" name="field_extenso" disabled>
    </select>
    <p class="hint">Only text fields are listed. Go to CRM → Settings → Deal fields to create one if needed.</p>
    <button type="submit" id="saveBtn" disabled>Save settings</button>
  </form>
  <br>
  ${tableHtml}
  ${domain ? `<p style="margin-top:12px"><small>Domain: <code>${domain}</code></small></p>` : ""}
</div>
<script>
${script}
</script>
</body>
</html>`;

  return new Response(page, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}


// ─────────────────────────────────────────────
// Route: POST /setup
// ─────────────────────────────────────────────
async function handleSetupPost(request: Request, env: Env): Promise<Response> {
  const urlObj = new URL(request.url);
  const text   = await request.text();
  const body   = new URLSearchParams(text);
  const field  = (body.get("field_extenso") ?? "").trim();
  const domain = urlObj.searchParams.get("DOMAIN") ?? urlObj.searchParams.get("domain") ?? body.get("DOMAIN") ?? body.get("domain") ?? "";

  if (!field) return new Response(null, { status:302, headers:{ Location:`/setup?domain=${encodeURIComponent(domain)}` } });
  if (!domain) return html(`<h2 class="error">❌ Domain not identified</h2>`, 400);

  await updateField(env.DB, domain, field);
  return new Response(null, { status:302, headers:{ Location:`/setup?domain=${encodeURIComponent(domain)}&saved=1` } });
}

// ─────────────────────────────────────────────
// Route: GET /setup-data
// ─────────────────────────────────────────────
async function handleSetupData(request: Request, env: Env): Promise<Response> {
  const domain = new URL(request.url).searchParams.get("domain") ?? "";
  if (!domain) return jsonResp({ error:"domain required" }, 400);
  const inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error:"not found" }, 404);
  return jsonResp({ field_extenso: inst.field_extenso });
}

// ─────────────────────────────────────────────
// Route: POST /bitrix  — CRM event handler
// ─────────────────────────────────────────────
async function handleBitrixEvent(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  const body = new URLSearchParams(text);

  const event  = (body.get("event") ?? "").toUpperCase();
  const domain = body.get("auth[domain]") ?? body.get("DOMAIN") ?? body.get("domain") ?? "";
  const dealId = body.get("data[FIELDS][ID]") ?? "";
  const clientEndpoint = body.get("auth[client_endpoint]") ?? "";

  if (!["ONCRMDEALADD","ONCRMDEALUPDATE"].includes(event)) return jsonResp({ skipped:true, event });
  if (!domain || !dealId) return jsonResp({ error:"domain or dealId missing" }, 400);

  let inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error:`Installation not found for ${domain}` }, 404);

  inst = await refreshToken(env, inst);
  const useToken    = inst.access_token;
  const useEndpoint = clientEndpoint || inst.client_endpoint;

  // Fetch deal: OPPORTUNITY, CURRENCY_ID and current extenso field
  const dealResp = await callBitrix(useEndpoint, "crm.deal.list", {
    "filter[ID]": dealId,
    "select[]":   "OPPORTUNITY",
    "select[1]":  "ID",
    "select[2]":  "CURRENCY_ID",
    "select[3]":  inst.field_extenso,
  }, useToken);

  const deal = dealResp?.result?.[0];
  if (!deal) return jsonResp({ error:`Deal ${dealId} not found`, resp:dealResp }, 404);

  const opportunity = Number(deal["OPPORTUNITY"]);
  if (Number.isNaN(opportunity)) return jsonResp({ error:"Invalid OPPORTUNITY value" }, 400);

  const currency = (deal["CURRENCY_ID"] ?? "USD").toString().toUpperCase();
  const extenso  = convertAmount(opportunity, currency);

  // Avoid update loop
  if (deal[inst.field_extenso] === extenso) return jsonResp({ ok:true, skipped:true, reason:"already up to date" });

  const updateResp = await callBitrix(useEndpoint, "crm.deal.update", {
    id: dealId,
    [`fields[${inst.field_extenso}]`]: extenso,
  }, useToken);

  return jsonResp({ ok:true, domain, dealId, currency, opportunity, extenso, update:updateResp?.result });
}

// ─────────────────────────────────────────────
// Route: POST /  — legacy JSON API
// ─────────────────────────────────────────────
async function handleJsonApi(request: Request): Promise<Response> {
  if (request.method !== "POST") return jsonResp({ error:"Use POST" }, 405);
  let data: any;
  try { data = await request.json(); } catch { return jsonResp({ error:"Invalid JSON" }, 400); }

  const currency = (data?.currency ?? "BRL").toString().toUpperCase();

  if (data?.values && typeof data.values === "object" && !Array.isArray(data.values)) {
    const out: Record<string,string> = {};
    for (const [k,v] of Object.entries(data.values)) {
      const num = Number(v);
      if (Number.isNaN(num)) return jsonResp({ error:`Invalid value at values.${k}` }, 400);
      out[k] = convertAmount(num, currency);
    }
    return jsonResp({ extensos: out });
  }
  if (Array.isArray(data?.values)) {
    const out: string[] = [];
    for (let i = 0; i < data.values.length; i++) {
      const num = Number(data.values[i]);
      if (Number.isNaN(num)) return jsonResp({ error:`Invalid value at values[${i}]` }, 400);
      out.push(convertAmount(num, currency));
    }
    return jsonResp({ extensos: out });
  }
  const value = Number(data?.value);
  if (Number.isNaN(value)) return jsonResp({ error:"Invalid 'value' field" }, 400);
  return jsonResp({ extenso: convertAmount(value, currency) });
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;
    if (pathname==="/install"   && method==="POST") return handleInstall(request,env);
    if (pathname==="/install"   && (method==="GET"||method==="HEAD")) return html(`<h2>✅ Amount Writer</h2><p>App running correctly. Access it through Bitrix24.</p>`);
    if (pathname==="/setup"     && (method==="GET"||method==="HEAD")) return handleSetupGet(request,env);
    if (pathname==="/setup"     && method==="POST") return handleSetupPost(request,env);
    if (pathname==="/setup-data"&& method==="GET")  return handleSetupData(request,env);
    if (pathname==="/bitrix"    && method==="POST") return handleBitrixEvent(request,env);
    return handleJsonApi(request);
  },
};
