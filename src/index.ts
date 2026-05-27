// src/index.ts

export interface Env {
  DB: D1Database;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  APP_URL: string;
  /** KV namespace para status de assinatura por portal Bitrix24 */
  SUBSCRIPTIONS: KVNamespace;
  /** Chave secreta da API Stripe (sk_live_... ou sk_test_...) */
  STRIPE_SECRET_KEY: string;
  /** Segredo para verificar assinatura dos webhooks Stripe */
  STRIPE_WEBHOOK_SECRET: string;
  /** Price ID do plano mensal no Stripe (price_XXXX) */
  STRIPE_PRICE_ID: string;
  /** URL de webhook próprio para receber notificações de pagamento (opcional) */
  NOTIFY_WEBHOOK_URL?: string;
  /** Chave secreta para autenticar chamadas administrativas (header X-Admin-Key) */
  ADMIN_KEY: string;
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
  major: string;
  majorPlural: string;
  minor: string;
  minorPlural: string;
  prefix?: string;
}

const CURRENCIES: Record<string, CurrencyConfig> = {
  BRL: { lang: "ptbr", major: "real",   majorPlural: "reais",   minor: "centavo", minorPlural: "centavos" },
  USD: { lang: "en",   major: "dollar",  majorPlural: "dollars", minor: "cent",    minorPlural: "cents"    },
  NZD: { lang: "en",   major: "dollar",  majorPlural: "dollars", minor: "cent",    minorPlural: "cents", prefix: "New Zealand" },
  EUR: { lang: "en",   major: "euro",    majorPlural: "euros",   minor: "cent",    minorPlural: "cents"    },
  INR: { lang: "en",   major: "rupee",   majorPlural: "rupees",  minor: "paisa",   minorPlural: "paise"    },
  CNY: { lang: "zh",   major: "",        majorPlural: "",        minor: "",         minorPlural: ""         },
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
    if (result && s < 1000) result += "零";
    result += sStr + (ZH_SECTIONS[scaleIdx] ?? "");
  }
  return result || "零";
}

function cny(valor: number): string {
  const v       = Math.round(valor * 100) / 100;
  const inteiro = Math.floor(v);
  const cents   = Math.round((v - inteiro) * 100);
  const jiao    = Math.floor(cents / 10);
  const fen     = cents % 10;
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
// Money field parser
// Campos tipo "money" no Bitrix24 chegam como "1234.56|BRL"
// ─────────────────────────────────────────────
function parseMoneyField(value: unknown, defaultCurrency: string): { amount: number; currency: string } {
  const str = String(value ?? "");
  if (str.includes("|")) {
    const [amountStr, cur] = str.split("|");
    return { amount: parseFloat(amountStr) || 0, currency: (cur || defaultCurrency).toUpperCase() };
  }
  return { amount: Number(str) || 0, currency: defaultCurrency };
}

// ─────────────────────────────────────────────
// Stripe service (inline — sem pacote npm)
// Mesmo padrão do app Consulta CNPJ
// ─────────────────────────────────────────────
const STRIPE_API = "https://api.stripe.com/v1";

function encodeStripeForm(obj: Record<string, string | number | undefined | null>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function stripePost(secretKey: string, path: string, body: Record<string, string | number | undefined | null>): Promise<unknown> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeStripeForm(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) { const err = json["error"] as Record<string, string> | undefined; throw new Error(err?.message ?? `Stripe error ${res.status}`); }
  return json;
}

async function stripeGet(secretKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) { const err = json["error"] as Record<string, string> | undefined; throw new Error(err?.message ?? `Stripe error ${res.status}`); }
  return json;
}

async function createCheckoutSession(opts: {
  secretKey: string; priceId: string; successUrl: string; cancelUrl: string; memberId: string; domain: string;
}): Promise<{ id: string; url: string }> {
  const session = await stripePost(opts.secretKey, "/checkout/sessions", {
    mode:                                     "subscription",
    "line_items[0][price]":                   opts.priceId,
    "line_items[0][quantity]":                "1",
    success_url:                              opts.successUrl,
    cancel_url:                               opts.cancelUrl,
    "metadata[member_id]":                    opts.memberId,
    "metadata[domain]":                       opts.domain,
    "subscription_data[metadata][member_id]": opts.memberId,
    "subscription_data[metadata][domain]":    opts.domain,
  }) as { id: string; url: string };
  return { id: session.id, url: session.url };
}

async function retrieveCheckoutSession(secretKey: string, sessionId: string): Promise<Record<string, unknown>> {
  return stripeGet(secretKey, `/checkout/sessions/${sessionId}?expand[]=subscription`) as Promise<Record<string, unknown>>;
}

async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(
      sigHeader.split(",").map(p => p.split("=")).filter(p => p.length === 2),
    ) as Record<string, string>;
    const timestamp = parts["t"], v1sig = parts["v1"];
    if (!timestamp || !v1sig) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
    const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, "0")).join("");
    return expected === v1sig;
  } catch { return false; }
}

function extractMetaMemberId(obj: Record<string, unknown>): string {
  const meta = obj["metadata"] as Record<string, string> | undefined;
  return meta?.["member_id"] ?? "";
}

// ─────────────────────────────────────────────
// Subscription service (KV-based)
// Mesmo padrão do app Consulta CNPJ
// ─────────────────────────────────────────────
type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "unpaid";

interface SubscriptionRecord {
  memberId:             string;
  domain:               string;
  status:               SubscriptionStatus;
  installedAt:          number;  // unix ms
  trialEnd:             number;  // unix ms
  stripeCustomerId?:    string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?:    number;  // unix ms
  cancelAtPeriodEnd?:   boolean;
  updatedAt:            number;
}

interface AccessResult {
  allowed:        boolean;
  reason:         "active" | "trialing" | "trial_expired" | "cancelled" | "no_record" | "past_due";
  daysRemaining?: number;
}

const TRIAL_DAYS = 7;
const KV_PREFIX  = "sub:";

async function getSubscription(kv: KVNamespace, memberId: string): Promise<SubscriptionRecord | null> {
  try {
    const raw = await kv.get(`${KV_PREFIX}${memberId}`);
    return raw ? (JSON.parse(raw) as SubscriptionRecord) : null;
  } catch { return null; }
}

async function saveSubscriptionKV(kv: KVNamespace, record: SubscriptionRecord): Promise<void> {
  await kv.put(`${KV_PREFIX}${record.memberId}`, JSON.stringify(record));
}

async function createTrialRecord(kv: KVNamespace, memberId: string, domain: string): Promise<void> {
  const existing = await getSubscription(kv, memberId);
  if (existing) return; // Reinstalação — preserva trial/assinatura original
  const now = Date.now();
  await saveSubscriptionKV(kv, {
    memberId, domain, status: "trialing",
    installedAt: now, trialEnd: now + TRIAL_DAYS * 24 * 60 * 60 * 1000, updatedAt: now,
  });
}

async function updateSubscriptionFromStripe(
  kv: KVNamespace, memberId: string,
  patch: { status: SubscriptionStatus; stripeCustomerId?: string; stripeSubscriptionId?: string; currentPeriodEnd?: number; cancelAtPeriodEnd?: boolean },
): Promise<void> {
  const existing = await getSubscription(kv, memberId);
  if (!existing) return;
  await saveSubscriptionKV(kv, { ...existing, ...patch, updatedAt: Date.now() });
}

function checkAccess(record: SubscriptionRecord | null): AccessResult {
  if (!record) return { allowed: false, reason: "no_record" };
  const now = Date.now();
  if (record.status === "active")   return { allowed: true,  reason: "active" };
  if (record.status === "trialing") {
    if (now < record.trialEnd) return { allowed: true, reason: "trialing", daysRemaining: Math.ceil((record.trialEnd - now) / 86400000) };
    return { allowed: false, reason: "trial_expired" };
  }
  if (record.status === "past_due") return { allowed: false, reason: "past_due" };
  return { allowed: false, reason: "cancelled" };
}

async function findMemberIdByStripeIds(kv: KVNamespace, customerId: string, subscriptionId: string): Promise<string | null> {
  try {
    const list = await kv.list({ prefix: KV_PREFIX });
    for (const key of list.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const rec = JSON.parse(raw) as SubscriptionRecord;
      if (rec.stripeCustomerId === customerId || rec.stripeSubscriptionId === subscriptionId) return rec.memberId;
    }
  } catch { /* ignora */ }
  return null;
}

function mapStripeStatus(s: string): SubscriptionStatus {
  const m: Record<string, SubscriptionStatus> = { active: "active", past_due: "past_due", unpaid: "unpaid", canceled: "cancelled", trialing: "trialing" };
  return m[s] ?? "past_due";
}

// ─────────────────────────────────────────────
// D1 helpers
// ─────────────────────────────────────────────
interface FieldMapping {
  money_field: string;
  text_field:  string;
}

interface Installation {
  domain:          string;
  member_id:       string;
  access_token:    string;
  refresh_token:   string;
  expires_at:      number;
  client_endpoint: string;
  field_extenso:   string;
  extra_mappings:  string; // JSON: FieldMapping[]
}

function parseExtraMappings(raw: string | null | undefined): FieldMapping[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

async function getInstallation(db: D1Database, domain: string): Promise<Installation | null> {
  return (await db.prepare("SELECT * FROM installations WHERE domain = ?").bind(domain).first<Installation>()) ?? null;
}

async function saveInstallation(db: D1Database, data: Omit<Installation, "extra_mappings">): Promise<void> {
  await db.prepare(`
    INSERT INTO installations (domain,member_id,access_token,refresh_token,expires_at,client_endpoint,field_extenso,installed_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(domain) DO UPDATE SET
      member_id=excluded.member_id, access_token=excluded.access_token,
      refresh_token=excluded.refresh_token, expires_at=excluded.expires_at,
      client_endpoint=excluded.client_endpoint, installed_at=excluded.installed_at
  `).bind(data.domain, data.member_id, data.access_token, data.refresh_token,
          data.expires_at, data.client_endpoint, data.field_extenso,
          Math.floor(Date.now() / 1000)).run();
}

async function updateSettings(db: D1Database, domain: string, fieldExtenso: string, extraMappings: FieldMapping[]): Promise<void> {
  await db.prepare("UPDATE installations SET field_extenso=?, extra_mappings=? WHERE domain=?")
    .bind(fieldExtenso, JSON.stringify(extraMappings), domain).run();
}

async function updateTokens(db: D1Database, domain: string, access: string, refresh: string, expiresAt: number): Promise<void> {
  await db.prepare("UPDATE installations SET access_token=?,refresh_token=?,expires_at=? WHERE domain=?")
    .bind(access, refresh, expiresAt, domain).run();
}

// ─────────────────────────────────────────────
// OAuth helpers
// ─────────────────────────────────────────────
async function refreshToken(env: Env, inst: Installation): Promise<Installation> {
  const now = Math.floor(Date.now() / 1000);
  if (inst.expires_at > now + 60) return inst;
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, refresh_token: inst.refresh_token }),
  });
  const data: any = await res.json();
  if (!data.access_token) throw new Error("Failed to refresh OAuth token");
  const updated = { ...inst, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: now + (data.expires_in ?? 3600) };
  await updateTokens(env.DB, inst.domain, updated.access_token, updated.refresh_token, updated.expires_at);
  return updated;
}

// ─────────────────────────────────────────────
// Bitrix24 REST helper
// ─────────────────────────────────────────────
async function callBitrix(endpoint: string, method: string, params: Record<string, string>, token: string): Promise<any> {
  const body = new URLSearchParams({ ...params, auth: token });
  const url  = `${endpoint.replace(/\/$/,"")}/${method}.json`;
  const res  = await fetch(url, {
    method: "POST", body,
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ValorExtensoBR/2.0" },
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Bitrix API [${res.status}] non-JSON: ${text.slice(0, 120)}`); }
}

async function registerEvents(endpoint: string, token: string, handlerUrl: string): Promise<void> {
  for (const event of ["ONCRMDEALADD", "ONCRMDEALUPDATE"])
    await callBitrix(endpoint, "event.bind", { event, handler: handlerUrl }, token);
}

// ─────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────
function html(body: string, status = 200): Response {
  return new Response(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Amount Writer</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:#f4f5f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
      .card{background:#fff;border-radius:10px;padding:36px;max-width:520px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.1)}
      h2{color:#2e7d32;margin-bottom:16px}h2.error{color:#c62828}
      p{color:#444;line-height:1.6;margin-bottom:12px}
    </style>
  </head><body><div class="card">${body}</div></body></html>`,
  { status, headers: { "Content-Type": "text/html;charset=utf-8" } });
}

function jsonResp(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// ─────────────────────────────────────────────
// Route: POST /install
// ─────────────────────────────────────────────
async function handleInstall(request: Request, env: Env): Promise<Response> {
  const urlObj = new URL(request.url);
  const text   = await request.text();
  const body   = new URLSearchParams(text);
  const get    = (...keys: string[]) => { for (const k of keys) { const v = urlObj.searchParams.get(k) ?? body.get(k); if (v) return v; } return ""; };

  const domain         = get("DOMAIN", "domain");
  const memberId       = get("MEMBER_ID", "member_id");
  const accessToken    = get("AUTH_ID", "access_token");
  const refreshToken_  = get("REFRESH_ID", "refresh_token");
  const expiresIn      = parseInt(get("AUTH_EXPIRES") || "3600");
  const clientEndpoint = get("client_endpoint");
  const resolvedEndpoint = clientEndpoint || (domain ? `https://${domain}/rest/` : "");

  if (!domain || !accessToken || !resolvedEndpoint)
    return html(`<h2 class="error">❌ Erro na instalação</h2><p>Dados incompletos recebidos do Bitrix24. Por favor, reinstale o aplicativo.</p>`, 400);

  await saveInstallation(env.DB, { domain, member_id: memberId, access_token: accessToken, refresh_token: refreshToken_, expires_at: Math.floor(Date.now() / 1000) + expiresIn, client_endpoint: resolvedEndpoint, field_extenso: "UF_CRM_AMOUNT_WORDS" });
  await registerEvents(resolvedEndpoint, accessToken, `${env.APP_URL}/bitrix`);

  // Cria registro de trial de 7 dias no KV
  if (env.SUBSCRIPTIONS && memberId) {
    await createTrialRecord(env.SUBSCRIPTIONS, memberId, domain).catch(
      err => console.error("[install] Erro ao criar trial:", err)
    );
  }

  const setupUrl = `${env.APP_URL}/setup?domain=${encodeURIComponent(domain)}`;
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <script src="https://api.bitrix24.com/api/v1/"></script></head>
  <body><p style="font-family:Arial;text-align:center;padding:40px;color:#2e7d32">✅ Instalando Amount Writer...</p>
  <script>BX24.init(function(){BX24.installFinish(function(){window.location.href="${setupUrl}";});});</script>
  </body></html>`, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

// ─────────────────────────────────────────────
// Route: GET /setup
// ─────────────────────────────────────────────
async function handleSetupGet(request: Request, env: Env): Promise<Response> {
  const url   = new URL(request.url);
  const saved = url.searchParams.get("saved");
  // Toast rendered in HTML but text updated by JS i18n on load
  const successMsg = saved === "1"
    ? `<div class="toast toast-success" id="savedToast"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg><span data-i18n="savedSuccess">Configurações salvas com sucesso!</span></div>`
    : "";

  const tableHtml = `
    <div class="currencies-card">
      <div class="section-label" data-i18n="currenciesTitle">Moedas suportadas</div>
      <table><thead><tr><th data-i18n="colCurrency">Moeda</th><th data-i18n="colLanguage">Idioma</th><th data-i18n="colExample">Exemplo</th></tr></thead>
      <tbody>
        <tr><td><span class="badge-currency">BRL</span></td><td data-i18n="langPortuguese">Português</td><td>Quatrocentos reais e cinquenta centavos</td></tr>
        <tr><td><span class="badge-currency">USD</span></td><td data-i18n="langEnglish">Inglês</td><td>Four hundred dollars and fifty cents</td></tr>
        <tr><td><span class="badge-currency">NZD</span></td><td data-i18n="langEnglish2">Inglês</td><td>Four hundred New Zealand dollars and fifty cents</td></tr>
        <tr><td><span class="badge-currency">EUR</span></td><td data-i18n="langEnglish3">Inglês</td><td>Four hundred euros and fifty cents</td></tr>
        <tr><td><span class="badge-currency">CNY</span></td><td data-i18n="langChinese">Chinês (大写)</td><td>肆佰元伍角整</td></tr>
        <tr><td><span class="badge-currency">INR</span></td><td data-i18n="langEnglish4">Inglês</td><td>Four hundred rupees and fifty paise</td></tr>
      </tbody></table>
    </div>`;

  const styles = `
    :root{--blue:#5BA4CF;--blue-dark:#4a8db8;--blue-light:#e8f3fb;--black:#1a1a1a;--gray-dark:#333;--gray:#666;--gray-light:#999;--border:#e2e6ea;--bg:#f0f4f8;--white:#fff;--success:#1a7e40;--success-bg:#e6f9ee;--danger:#cc0000;--danger-bg:#fff2f2}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);display:flex;flex-direction:column;align-items:center;padding:0;min-height:100vh}

    /* ── Header ── */
    .app-header{width:100%;background:var(--black);padding:14px 24px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .app-header img{height:36px;width:auto;object-fit:contain}
    .app-header-divider{width:1px;height:28px;background:rgba(255,255,255,.18)}
    .app-header-title{color:var(--white);font-size:15px;font-weight:600;letter-spacing:.01em}
    .app-header-sub{color:rgba(255,255,255,.5);font-size:11px;margin-top:1px}

    /* ── Tabs ── */
    .tab-bar{width:100%;max-width:680px;padding:16px 20px 0;display:flex;gap:4px}
    .tab-btn{padding:9px 20px;border:none;background:transparent;font-size:13px;font-weight:600;color:var(--gray-light);cursor:pointer;border-radius:8px 8px 0 0;border:1.5px solid transparent;border-bottom:none;transition:all .15s;position:relative;bottom:-1px}
    .tab-btn:hover{color:var(--blue)}
    .tab-btn.active{background:var(--white);color:var(--blue);border-color:var(--border)}

    /* ── Page layout (sidebar + content) ── */
    .page-wrapper{display:flex;width:100%;min-height:calc(100vh - 64px)}
    .lang-sidebar{width:58px;background:var(--white);border-right:1.5px solid var(--border);display:flex;flex-direction:column;align-items:center;padding:20px 0;gap:8px;flex-shrink:0}
    .lang-sidebar-label{font-size:9px;font-weight:700;color:var(--gray-light);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .flag-btn{width:38px;height:38px;background:none;border:2px solid transparent;border-radius:50%;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;transition:all .15s;padding:0;line-height:1}
    .flag-btn:hover{border-color:var(--blue);background:var(--blue-light)}
    .flag-btn.active{border-color:var(--blue);background:var(--blue-light);box-shadow:0 0 0 3px rgba(91,164,207,.15)}
    .page-right{flex:1;display:flex;flex-direction:column;align-items:center;overflow:hidden;min-width:0}

    /* ── Main content ── */
    .main{width:100%;max-width:680px;padding:0 20px 40px;display:flex;flex-direction:column;gap:16px;border-top:1.5px solid var(--border)}
    .tab-content{padding-top:20px}

    /* ── Cards ── */
    .card{background:var(--white);border-radius:12px;border:1px solid var(--border);padding:22px 24px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    .card-title{font-size:13px;font-weight:700;color:var(--gray-dark);text-transform:uppercase;letter-spacing:.07em;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .card-title-dot{width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0}

    /* ── Toast ── */
    .toast{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600}
    .toast-success{background:var(--success-bg);color:var(--success);border:1.5px solid #8ecfa6}
    .toast-info{background:var(--blue-light);border:1.5px solid #a8d5f5;color:#1c5f92}
    .toast-warning{background:#fff8ec;border:1.5px solid #f5c97a;color:#92600a}

    /* ── Loading ── */
    .loading-row{display:flex;align-items:center;gap:8px;color:var(--gray-light);font-size:13px}
    .spinner{width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--blue);border-radius:50%;animation:spin .6s linear infinite;flex-shrink:0}
    @keyframes spin{to{transform:rotate(360deg)}}

    /* ── Form elements ── */
    label{display:block;margin-bottom:5px;font-weight:600;color:var(--gray-dark);font-size:12px;letter-spacing:.02em}
    select{width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--white);cursor:pointer;color:var(--gray-dark);outline:none;transition:border-color .15s}
    select:focus{border-color:var(--blue)}
    select:disabled{background:#f8f9fa;color:var(--gray-light);cursor:default}
    input.fake-select{width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:#f8f9fa;color:var(--gray-light)}
    .hint{font-size:11.5px;color:var(--gray-light);margin-top:5px;line-height:1.5}

    /* ── Buttons ── */
    button{border:none;border-radius:8px;cursor:pointer;font-size:13px;padding:9px 20px;font-weight:600;transition:all .15s}
    button:disabled{opacity:.4;cursor:default}
    .btn-primary{background:var(--blue);color:var(--white)}.btn-primary:hover:not(:disabled){background:var(--blue-dark)}
    .btn-outline{background:var(--white);color:var(--blue);border:1.5px solid var(--blue)}.btn-outline:hover:not(:disabled){background:var(--blue-light)}
    .btn-danger{background:var(--white);color:var(--danger);border:1.5px solid #e8b4b8}.btn-danger:hover:not(:disabled){background:var(--danger-bg)}
    .btn-remove{background:var(--white);color:#c0392b;border:1.5px solid #e8b4b8;font-size:12px;padding:7px 12px;border-radius:6px;line-height:1}.btn-remove:hover:not(:disabled){background:#fff0f0}

    /* ── Mapping box ── */
    .mapping-box{background:#fafbfc;border:1.5px solid var(--border);border-radius:10px;padding:16px;margin-bottom:10px}
    .mapping-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end}
    .mapping-badge{display:inline-block;font-size:10px;font-weight:700;background:var(--blue-light);color:var(--blue-dark);padding:2px 8px;border-radius:10px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em}

    /* ── Save row ── */
    .save-row{display:flex;align-items:center;gap:12px;padding-top:4px}

    /* ── Plan card ── */
    .plan-card{border-radius:12px;border:2px solid var(--border);padding:24px;text-align:center}
    .plan-card.active-plan{border-color:var(--blue);background:var(--blue-light)}
    .plan-name{font-size:18px;font-weight:700;color:var(--black);margin-bottom:4px}
    .plan-price{font-size:32px;font-weight:800;color:var(--blue);margin:10px 0 2px}
    .plan-price span{font-size:14px;font-weight:500;color:var(--gray)}
    .plan-desc{font-size:12.5px;color:var(--gray);margin-bottom:20px;line-height:1.6}
    .plan-status-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:16px}
    .badge-active{background:var(--success-bg);color:var(--success)}
    .badge-trial{background:var(--blue-light);color:#1c5f92}
    .badge-cancelled{background:#fff8ec;color:#92600a}
    .badge-expired{background:var(--danger-bg);color:var(--danger)}
    .plan-detail{font-size:12px;color:var(--gray);margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}

    /* ── Currencies table ── */
    .currencies-card{background:var(--white);border-radius:12px;border:1px solid var(--border);padding:20px 24px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    .section-label{font-size:12px;font-weight:700;color:var(--gray-light);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:12.5px}
    td,th{padding:7px 10px;border-bottom:1px solid #f0f2f4;text-align:left}
    th{color:var(--gray-light);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;background:#fafbfc}
    tr:last-child td{border-bottom:none}
    .badge-currency{display:inline-block;background:var(--black);color:var(--white);font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.05em}

    /* ── Footer ── */
    .app-footer{color:var(--gray-light);font-size:11px;text-align:center;padding:8px 0 24px}
  `;

  const appUrl = env.APP_URL;

  const script = `
// ── Translations ───────────────────────────────────────────────────
var _subUrl = '';   // preenchido dentro do BX24.init

var T = {
  pt: {
    appName: 'Valor por Extenso',
    tabConfig: '⚙️ Configuração', tabSub: '💳 Assinatura',
    configCardTitle: 'Configuração de campos',
    loadingFields: 'Carregando campos disponíveis...',
    errorFields: '❌ Erro ao carregar campos. Tente novamente.',
    mainFieldBadge: 'Campo principal', extraBadge: 'Mapeamento extra',
    moneyFieldLabel: 'Campo de dinheiro', textFieldLabel: 'Campo de texto (extenso)',
    mainMoneyHint: 'Campo padrão do Bitrix24 — sempre ativo',
    mainMoneyValue: 'Valor do Negócio (OPPORTUNITY)',
    mainTextHint: 'Campo onde o valor será gravado por extenso',
    selectPlaceholder: '— Selecione um campo —',
    extraFieldsTitle: 'Campos adicionais',
    addMappingBtn: '＋ Adicionar mapeamento',
    extraHint: 'Cada mapeamento converte um campo de dinheiro para extenso e grava o resultado num campo de texto de sua escolha.',
    saveBtn: 'Salvar configurações',
    savedSuccess: 'Configurações salvas com sucesso!',
    subCardTitle: 'Plano e cobrança',
    loadingSub: 'Carregando assinatura...',
    errorSub: 'Erro ao carregar informações da assinatura.',
    pricePerMonth: '/mês',
    planDesc: 'Conversão automática de valores para extenso em todos os seus negócios no Bitrix24.',
    nextBilling: 'Próxima cobrança:',
    cancelBtn: 'Cancelar assinatura', cancellingBtn: 'Cancelando...',
    cancelConfirm: 'Tem certeza que deseja cancelar a assinatura? O acesso continuará ativo até o final do período já pago.',
    cancelError: 'Erro ao cancelar: ', cancelConnError: 'Erro de conexão. Tente novamente.',
    renewBtn: '⚡ Renovar assinatura', subscribeBtn: '⚡ Assinar agora — $5/mês',
    badgeActive: '✅ Assinatura ativa', badgeTrial: '⏳ Período de avaliação',
    badgeCancelled: '⚠️ Cancelamento agendado', badgeExpired: '⛔ Sem assinatura ativa',
    trialDesc: function(days){ return 'Você tem <strong>' + days + ' dia' + (days===1?'':'s') + '</strong> restante' + (days===1?'':'s') + ' de avaliação gratuita.<br>Assine antes do prazo para não perder o acesso.'; },
    cancelledDesc: function(date){ return 'Sua assinatura foi cancelada e estará ativa até o final da vigência atual.' + (date ? ' O acesso expira em <strong>' + date + '</strong>.' : ''); },
    expiredDesc: 'Assine para continuar convertendo valores para extenso automaticamente nos seus negócios.',
    currenciesTitle: 'Moedas suportadas', colCurrency: 'Moeda', colLanguage: 'Idioma', colExample: 'Exemplo',
    langPortuguese: 'Português', langEnglish: 'Inglês', langEnglish2: 'Inglês', langEnglish3: 'Inglês', langEnglish4: 'Inglês', langChinese: 'Chinês (大写)',
    footer: 'Amount Writer — TLJ Apps'
  },
  en: {
    appName: 'Amount Writer',
    tabConfig: '⚙️ Configuration', tabSub: '💳 Subscription',
    configCardTitle: 'Field configuration',
    loadingFields: 'Loading available fields...',
    errorFields: '❌ Error loading fields. Please try again.',
    mainFieldBadge: 'Main field', extraBadge: 'Extra mapping',
    moneyFieldLabel: 'Money field', textFieldLabel: 'Text field (written out)',
    mainMoneyHint: 'Default Bitrix24 field — always active',
    mainMoneyValue: 'Deal Value (OPPORTUNITY)',
    mainTextHint: 'Field where the value will be written out',
    selectPlaceholder: '— Select a field —',
    extraFieldsTitle: 'Additional fields',
    addMappingBtn: '＋ Add mapping',
    extraHint: 'Each mapping converts a money field to written form and saves the result in a text field of your choice.',
    saveBtn: 'Save settings',
    savedSuccess: 'Settings saved successfully!',
    subCardTitle: 'Plan & billing',
    loadingSub: 'Loading subscription...',
    errorSub: 'Error loading subscription information.',
    pricePerMonth: '/month',
    planDesc: 'Automatic conversion of values to written form for all your deals in Bitrix24.',
    nextBilling: 'Next billing:',
    cancelBtn: 'Cancel subscription', cancellingBtn: 'Cancelling...',
    cancelConfirm: 'Are you sure you want to cancel? Access will remain active until the end of the current billing period.',
    cancelError: 'Error cancelling: ', cancelConnError: 'Connection error. Please try again.',
    renewBtn: '⚡ Renew subscription', subscribeBtn: '⚡ Subscribe now — $5/month',
    badgeActive: '✅ Active subscription', badgeTrial: '⏳ Trial period',
    badgeCancelled: '⚠️ Cancellation scheduled', badgeExpired: '⛔ No active subscription',
    trialDesc: function(days){ return 'You have <strong>' + days + ' day' + (days===1?'':'s') + '</strong> remaining in your free trial.<br>Subscribe before it ends to keep your access.'; },
    cancelledDesc: function(date){ return 'Your subscription has been cancelled and will remain active until the end of the current billing period.' + (date ? ' Access expires on <strong>' + date + '</strong>.' : ''); },
    expiredDesc: 'Subscribe to continue converting values to written form automatically in your deals.',
    currenciesTitle: 'Supported currencies', colCurrency: 'Currency', colLanguage: 'Language', colExample: 'Example',
    langPortuguese: 'Portuguese', langEnglish: 'English', langEnglish2: 'English', langEnglish3: 'English', langEnglish4: 'English', langChinese: 'Chinese (大写)',
    footer: 'Amount Writer — TLJ Apps'
  }
};

// ── Language system ────────────────────────────────────────────────
var LANG = localStorage.getItem('aw_lang') || 'pt';

window.setLang = function(lang) {
  LANG = lang;
  localStorage.setItem('aw_lang', lang);
  applyLang(lang);
  if (window._lastSubData) window.renderSubTab(window._lastSubData);
};

function applyLang(lang) {
  var t = T[lang];
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var k = el.getAttribute('data-i18n');
    if (t[k] !== undefined) el.textContent = t[k];
  });
  document.querySelectorAll('[data-i18n-val]').forEach(function(el) {
    var k = el.getAttribute('data-i18n-val');
    if (t[k] !== undefined) el.value = t[k];
  });
  document.querySelectorAll('.flag-btn').forEach(function(b){ b.classList.remove('active'); });
  var f = document.getElementById('flag-' + lang);
  if (f) f.classList.add('active');
  // Update dynamic mapping rows
  document.querySelectorAll('.m-sel-label').forEach(function(el){ el.textContent = t.moneyFieldLabel; });
  document.querySelectorAll('.t-sel-label').forEach(function(el){ el.textContent = t.textFieldLabel; });
  document.querySelectorAll('.extra-badge').forEach(function(el){ el.textContent = t.extraBadge; });
  document.querySelectorAll('.sel-placeholder').forEach(function(el){ el.textContent = t.selectPlaceholder; });
}

function formatDate(ms) {
  if (!ms) return '';
  var d = new Date(ms);
  return LANG === 'en'
    ? d.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
    : d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

window.renderSubTab = function(d) {
  window._lastSubData = d;
  var t  = T[LANG];
  var el = document.getElementById('subContent');
  if (!el) return;
  var btnStyle = 'display:inline-block;text-decoration:none;padding:9px 20px';
  var html = '';

  if (d.status === 'active' && !d.cancelAtPeriodEnd) {
    html = '<div class="plan-card active-plan">'
      + '<div class="plan-status-badge badge-active">' + t.badgeActive + '</div>'
      + '<div class="plan-name">' + t.appName + '</div>'
      + '<div class="plan-price">$5<span>' + t.pricePerMonth + '</span></div>'
      + '<div class="plan-desc">' + t.planDesc + '</div>'
      + (d.currentPeriodEnd ? '<div class="plan-detail">' + t.nextBilling + ' <strong>' + formatDate(d.currentPeriodEnd) + '</strong></div>' : '')
      + '</div>'
      + '<div style="margin-top:16px;text-align:center">'
      + '<button class="btn-danger" onclick="cancelSubscription()" id="cancelBtn">' + t.cancelBtn + '</button>'
      + '</div>';

  } else if (d.status === 'active' && d.cancelAtPeriodEnd) {
    html = '<div class="plan-card">'
      + '<div class="plan-status-badge badge-cancelled">' + t.badgeCancelled + '</div>'
      + '<div class="plan-name">' + t.appName + '</div>'
      + '<div class="plan-desc" style="margin-top:12px">' + t.cancelledDesc(formatDate(d.currentPeriodEnd)) + '</div>'
      + '</div>'
      + '<div style="margin-top:16px;text-align:center">'
      + '<a class="btn-primary" style="' + btnStyle + '" href="' + _subUrl + '" target="_blank">' + t.renewBtn + '</a>'
      + '</div>';

  } else if (d.status === 'trialing') {
    var days = d.daysRemaining || 0;
    html = '<div class="plan-card">'
      + '<div class="plan-status-badge badge-trial">' + t.badgeTrial + '</div>'
      + '<div class="plan-name">' + t.appName + '</div>'
      + '<div class="plan-price">$5<span>' + t.pricePerMonth + '</span></div>'
      + '<div class="plan-desc">' + t.trialDesc(days) + '</div>'
      + '</div>'
      + '<div style="margin-top:16px;text-align:center">'
      + '<a class="btn-primary" style="' + btnStyle + '" href="' + _subUrl + '" target="_blank">' + t.subscribeBtn + '</a>'
      + '</div>';

  } else {
    html = '<div class="plan-card">'
      + '<div class="plan-status-badge badge-expired">' + t.badgeExpired + '</div>'
      + '<div class="plan-name">' + t.appName + '</div>'
      + '<div class="plan-price">$5<span>' + t.pricePerMonth + '</span></div>'
      + '<div class="plan-desc">' + t.expiredDesc + '</div>'
      + '</div>'
      + '<div style="margin-top:16px;text-align:center">'
      + '<a class="btn-primary" style="' + btnStyle + '" href="' + _subUrl + '" target="_blank">' + t.subscribeBtn + '</a>'
      + '</div>';
  }
  el.innerHTML = html;
};

BX24.init(function() {
  var auth     = BX24.getAuth();
  var domain   = auth.domain || BX24.getDomain();
  var memberId = (auth && auth.member_id) ? auth.member_id : '';
  document.getElementById('domainField').value = domain;

  var moneyFields = [], textFields = [];
  var savedFieldExtenso = '', savedExtras = [];
  var gotConfig = false, gotFields = false;

  // Apply saved language on init
  applyLang(LANG);

  // ── Tab switching ──────────────────────────────────────────
  window.showTab = function(name) {
    document.querySelectorAll('.tab-content').forEach(function(el){ el.style.display = 'none'; });
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
    document.getElementById('tab-' + name).style.display = 'block';
    document.querySelector('[data-tab="' + name + '"]').classList.add('active');
  };
  var initTab = (new URLSearchParams(window.location.search)).get('tab') || 'config';
  showTab(initTab);

  // ── Subscription tab ───────────────────────────────────────
  _subUrl = ${JSON.stringify(appUrl)} + '/subscribe?member_id=' + encodeURIComponent(memberId) + '&domain=' + encodeURIComponent(domain);

  function loadStatus() {
    if (!memberId) return;
    document.getElementById('subContent').innerHTML =
      '<div class="loading-row"><div class="spinner"></div><span>' + T[LANG].loadingSub + '</span></div>';
    fetch('/api/status?member_id=' + encodeURIComponent(memberId) + '&domain=' + encodeURIComponent(domain))
      .then(function(r){ return r.json(); })
      .then(function(d){ window.renderSubTab(d); })
      .catch(function(){
        document.getElementById('subContent').innerHTML =
          '<p style="color:var(--gray)">' + T[LANG].errorSub + '</p>';
      });
  }
  loadStatus();

  window.cancelSubscription = function() {
    var t = T[LANG];
    if (!confirm(t.cancelConfirm)) return;
    var btn = document.getElementById('cancelBtn');
    if (btn) { btn.disabled = true; btn.textContent = t.cancellingBtn; }
    fetch('/api/cancel-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId }),
    })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.ok) { loadStatus(); }
        else {
          alert(t.cancelError + (d.error || ''));
          if (btn) { btn.disabled = false; btn.textContent = t.cancelBtn; }
        }
      })
      .catch(function(){
        alert(t.cancelConnError);
        if (btn) { btn.disabled = false; btn.textContent = t.cancelBtn; }
      });
  };

  // ── Config tab: load fields ────────────────────────────────
  fetch('/setup-data?domain=' + encodeURIComponent(domain))
    .then(function(r){ return r.json(); })
    .then(function(d){
      savedFieldExtenso = d.field_extenso || '';
      savedExtras = Array.isArray(d.extra_mappings) ? d.extra_mappings : [];
      gotConfig = true; tryRender();
    })
    .catch(function(){ gotConfig = true; tryRender(); });

  BX24.callMethod('crm.deal.fields', {}, function(result) {
    if (result.error()) {
      var ld = document.getElementById('loadingMsg');
      ld.innerHTML = '<span style="color:#cc0000">' + T[LANG].errorFields + '</span>';
      return;
    }
    var fields = result.data();
    for (var key in fields) {
      var f = fields[key];
      var lbl = (f.formLabel || f.listLabel || f.title || key) + ' (' + key + ')';
      if (f.type === 'double' || f.type === 'money') moneyFields.push({ code: key, label: lbl });
      if (f.type === 'string')                        textFields.push({ code: key, label: lbl });
    }
    function sortF(arr) {
      arr.sort(function(a,b){
        var aC = a.code.indexOf('UF_')===0?0:1, bC = b.code.indexOf('UF_')===0?0:1;
        return aC!==bC ? aC-bC : a.label.localeCompare(b.label);
      });
    }
    sortF(moneyFields); sortF(textFields);
    gotFields = true; tryRender();
  });

  function tryRender() {
    if (!gotConfig || !gotFields) return;
    document.getElementById('loadingMsg').style.display = 'none';
    fillSelect(document.getElementById('mainTextSel'), textFields, savedFieldExtenso);
    document.getElementById('mainTextSel').disabled = false;
    document.getElementById('addBtn').disabled       = false;
    document.getElementById('saveBtn').disabled      = false;
    savedExtras.forEach(function(m){ addRow(m.money_field, m.text_field); });
  }

  function fillSelect(sel, opts, val) {
    var ph = document.createElement('option');
    ph.value = ''; ph.className = 'sel-placeholder'; ph.textContent = T[LANG].selectPlaceholder;
    sel.innerHTML = ''; sel.appendChild(ph);
    opts.forEach(function(o){
      var el = document.createElement('option');
      el.value = o.code; el.textContent = o.label;
      if (o.code === val) el.selected = true;
      sel.appendChild(el);
    });
    if (val && !opts.find(function(o){ return o.code === val; })) {
      var el = document.createElement('option');
      el.value = val; el.textContent = val + ' (saved)'; el.selected = true;
      sel.insertBefore(el, sel.options[1]);
    }
  }

  var rowIdx = 0;
  window.addRow = function(moneyVal, textVal) {
    var t   = T[LANG];
    var idx = rowIdx++;
    var box = document.createElement('div');
    box.className = 'mapping-box'; box.id = 'row-' + idx;
    box.innerHTML =
      '<span class="mapping-badge extra-badge">' + t.extraBadge + '</span>'
      + '<div class="mapping-grid">'
      + '<div><label class="m-sel-label">' + t.moneyFieldLabel + '</label><select class="m-sel" id="ms-'+idx+'"></select></div>'
      + '<div><label class="t-sel-label">' + t.textFieldLabel + '</label><select class="t-sel" id="ts-'+idx+'"></select></div>'
      + '<div><button type="button" class="btn-remove" onclick="removeRow('+idx+')" title="Remove">✕</button></div>'
      + '</div>';
    document.getElementById('extraList').appendChild(box);
    fillSelect(document.getElementById('ms-'+idx), moneyFields, moneyVal || '');
    fillSelect(document.getElementById('ts-'+idx), textFields, textVal  || '');
  };

  window.removeRow = function(idx) {
    var el = document.getElementById('row-' + idx);
    if (el) el.remove();
  };

  document.getElementById('setupForm').addEventListener('submit', function() {
    var rows = document.querySelectorAll('.mapping-box');
    var extras = [];
    rows.forEach(function(r){
      var m = r.querySelector('.m-sel'), t = r.querySelector('.t-sel');
      if (m && t && m.value && t.value) extras.push({ money_field: m.value, text_field: t.value });
    });
    document.getElementById('extraJson').value = JSON.stringify(extras);
  });
});
  `;

  const page = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Amount Writer</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>${styles}</style>
</head>
<body>

<header class="app-header">
  <img src="/logo-tlj.png" alt="TLJ Apps">
  <div class="app-header-divider"></div>
  <div>
    <div class="app-header-title" data-i18n="appName">Amount Writer</div>
    <div class="app-header-sub">by TLJ Apps</div>
  </div>
</header>

<div class="page-wrapper">

  <!-- ── Sidebar: Language selector ──────────────── -->
  <aside class="lang-sidebar">
    <div class="lang-sidebar-label">Lang</div>
    <button class="flag-btn active" id="flag-pt" onclick="setLang('pt')" title="Português (BR)">🇧🇷</button>
    <button class="flag-btn" id="flag-en" onclick="setLang('en')" title="English (US)">🇺🇸</button>
  </aside>

  <!-- ── Main area ─────────────────────────────────── -->
  <div class="page-right">

    <div class="tab-bar">
      <button class="tab-btn active" data-tab="config" onclick="showTab('config')"><span data-i18n="tabConfig">⚙️ Configuração</span></button>
      <button class="tab-btn" data-tab="assinatura" onclick="showTab('assinatura')"><span data-i18n="tabSub">💳 Assinatura</span></button>
    </div>

    <div class="main">

      <!-- ── Aba: Configuração ──────────────────── -->
      <div id="tab-config" class="tab-content">

        ${successMsg}

        <div class="card">
          <div class="card-title"><span class="card-title-dot"></span><span data-i18n="configCardTitle">Configuração de campos</span></div>

          <div id="loadingMsg" class="loading-row">
            <div class="spinner"></div>
            <span data-i18n="loadingFields">Carregando campos disponíveis...</span>
          </div>

          <form id="setupForm" method="POST" action="/setup">
            <input type="hidden" name="domain" id="domainField">
            <input type="hidden" name="extra_mappings" id="extraJson" value="[]">

            <div style="margin-bottom:20px">
              <div class="mapping-box">
                <span class="mapping-badge" data-i18n="mainFieldBadge">Campo principal</span>
                <div class="mapping-grid">
                  <div>
                    <label data-i18n="moneyFieldLabel">Campo de dinheiro</label>
                    <input type="text" class="fake-select" data-i18n-val="mainMoneyValue" value="Valor do Negócio (OPPORTUNITY)" disabled>
                    <p class="hint" data-i18n="mainMoneyHint">Campo padrão do Bitrix24 — sempre ativo</p>
                  </div>
                  <div>
                    <label data-i18n="textFieldLabel">Campo de texto (extenso)</label>
                    <select id="mainTextSel" name="field_extenso" disabled>
                      <option value="" class="sel-placeholder">Aguardando...</option>
                    </select>
                    <p class="hint" data-i18n="mainTextHint">Campo onde o valor será gravado por extenso</p>
                  </div>
                  <div></div>
                </div>
              </div>
            </div>

            <div style="margin-bottom:20px">
              <div class="card-title" style="margin-bottom:12px"><span class="card-title-dot"></span><span data-i18n="extraFieldsTitle">Campos adicionais</span></div>
              <div id="extraList"></div>
              <button type="button" id="addBtn" class="btn-outline" onclick="addRow('','')" disabled style="font-size:12px;padding:7px 16px"><span data-i18n="addMappingBtn">＋ Adicionar mapeamento</span></button>
              <p class="hint" style="margin-top:8px" data-i18n="extraHint">Cada mapeamento converte um campo de dinheiro para extenso e grava o resultado num campo de texto de sua escolha.</p>
            </div>

            <div class="save-row">
              <button type="submit" id="saveBtn" class="btn-primary" disabled><span data-i18n="saveBtn">Salvar configurações</span></button>
            </div>
          </form>
        </div>

        ${tableHtml}
      </div>

      <!-- ── Aba: Assinatura ────────────────────── -->
      <div id="tab-assinatura" class="tab-content" style="display:none">
        <div class="card">
          <div class="card-title"><span class="card-title-dot"></span><span data-i18n="subCardTitle">Plano e cobrança</span></div>
          <div id="subContent">
            <div class="loading-row"><div class="spinner"></div><span data-i18n="loadingSub">Carregando...</span></div>
          </div>
        </div>
      </div>

      <div class="app-footer"><span data-i18n="footer">Amount Writer — TLJ Apps</span> &copy; ${new Date().getFullYear()}</div>

    </div><!-- /main -->
  </div><!-- /page-right -->
</div><!-- /page-wrapper -->

<script>${script}</script>
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
  const domain = urlObj.searchParams.get("DOMAIN") ?? urlObj.searchParams.get("domain")
               ?? body.get("DOMAIN") ?? body.get("domain") ?? "";
  const extraJson = body.get("extra_mappings") ?? "[]";

  if (!field)  return new Response(null, { status: 302, headers: { Location: `/setup?domain=${encodeURIComponent(domain)}` } });
  if (!domain) return html(`<h2 class="error">❌ Domínio não identificado</h2>`, 400);

  let extraMappings: FieldMapping[] = [];
  try {
    const parsed = JSON.parse(extraJson);
    if (Array.isArray(parsed))
      extraMappings = parsed.filter((m: any) => m && typeof m.money_field === "string" && typeof m.text_field === "string" && m.money_field.trim() && m.text_field.trim());
  } catch { /* ignora JSON inválido */ }

  await updateSettings(env.DB, domain, field, extraMappings);
  return new Response(null, { status: 302, headers: { Location: `/setup?domain=${encodeURIComponent(domain)}&saved=1` } });
}

// ─────────────────────────────────────────────
// Route: GET /setup-data
// ─────────────────────────────────────────────
async function handleSetupData(request: Request, env: Env): Promise<Response> {
  const domain = new URL(request.url).searchParams.get("domain") ?? "";
  if (!domain) return jsonResp({ error: "domain required" }, 400);
  const inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error: "not found" }, 404);
  return jsonResp({
    field_extenso:  inst.field_extenso,
    extra_mappings: parseExtraMappings(inst.extra_mappings),
    member_id:      inst.member_id,
  });
}

// ─────────────────────────────────────────────
// Route: GET /api/status
// ─────────────────────────────────────────────
async function handleApiStatus(request: Request, env: Env): Promise<Response> {
  const url      = new URL(request.url);
  const memberId = url.searchParams.get("member_id") ?? "";
  const domain   = url.searchParams.get("domain") ?? "";

  if (!env.SUBSCRIPTIONS) return jsonResp({ status: "active", allowed: true });
  if (!memberId)           return jsonResp({ status: "no_record", allowed: false }, 400);

  let record = await getSubscription(env.SUBSCRIPTIONS, memberId);

  // Portal instalado antes do sistema de assinaturas — cria trial automaticamente
  if (!record && domain) {
    const inst = await getInstallation(env.DB, domain);
    if (inst) {
      await createTrialRecord(env.SUBSCRIPTIONS, memberId, domain);
      record = await getSubscription(env.SUBSCRIPTIONS, memberId);
    }
  }

  const access = checkAccess(record);
  return jsonResp({
    status:            access.reason,
    allowed:           access.allowed,
    daysRemaining:     access.daysRemaining ?? null,
    currentPeriodEnd:  record?.currentPeriodEnd  ?? null,
    cancelAtPeriodEnd: record?.cancelAtPeriodEnd ?? false,
  });
}

// ─────────────────────────────────────────────
// Route: POST /api/cancel-subscription
// ─────────────────────────────────────────────
async function handleCancelSubscription(request: Request, env: Env): Promise<Response> {
  let body: { member_id?: string } = {};
  try { body = await request.json() as { member_id?: string }; } catch { /* ignora */ }
  const memberId = body.member_id ?? "";

  if (!memberId) return jsonResp({ error: "member_id required" }, 400);
  if (!env.SUBSCRIPTIONS) return jsonResp({ error: "subscriptions not configured" }, 500);

  const record = await getSubscription(env.SUBSCRIPTIONS, memberId);
  if (!record) return jsonResp({ error: "subscription not found" }, 404);
  if (!record.stripeSubscriptionId) return jsonResp({ error: "no active stripe subscription" }, 400);

  try {
    await stripePost(env.STRIPE_SECRET_KEY, `/subscriptions/${record.stripeSubscriptionId}`, {
      cancel_at_period_end: "true",
    });
    await saveSubscriptionKV(env.SUBSCRIPTIONS, { ...record, cancelAtPeriodEnd: true, updatedAt: Date.now() });
    return jsonResp({ ok: true, currentPeriodEnd: record.currentPeriodEnd ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cancel-subscription] Erro:", msg);
    return jsonResp({ error: msg }, 500);
  }
}

// ─────────────────────────────────────────────
// Route: GET /subscribe
// ─────────────────────────────────────────────
async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  const url      = new URL(request.url);
  const memberId = url.searchParams.get("member_id") ?? "";
  const domain   = url.searchParams.get("domain") ?? "";

  if (!memberId || !domain)
    return html(`<h2 class="error">⚠️ Parâmetros inválidos. Feche esta janela e tente novamente pelo Bitrix24.</h2>`, 400);

  try {
    const session = await createCheckoutSession({
      secretKey:  env.STRIPE_SECRET_KEY,
      priceId:    env.STRIPE_PRICE_ID,
      successUrl: `${env.APP_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl:  `${env.APP_URL}/subscribe/cancel`,
      memberId, domain,
    });
    return new Response(null, { status: 303, headers: { Location: session.url } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar sessão de pagamento.";
    console.error("[subscribe] Erro ao criar checkout:", msg);
    return html(`<h2 class="error">⚠️ Erro ao iniciar pagamento: ${msg}</h2>`, 500);
  }
}

// ─────────────────────────────────────────────
// Route: GET /subscribe/success
// ─────────────────────────────────────────────
async function handleSubscribeSuccess(request: Request, env: Env): Promise<Response> {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!sessionId) return html(`<h2 class="error">⚠️ Sessão inválida.</h2>`, 400);

  try {
    const session  = await retrieveCheckoutSession(env.STRIPE_SECRET_KEY, sessionId);
    const memberId = extractMetaMemberId(session);
    const sub      = session["subscription"] as Record<string, unknown> | null;
    if (memberId && sub) {
      await updateSubscriptionFromStripe(env.SUBSCRIPTIONS, memberId, {
        status:               "active",
        stripeCustomerId:     session["customer"] as string,
        stripeSubscriptionId: sub["id"] as string,
        currentPeriodEnd:     (sub["current_period_end"] as number) * 1000,
      });
    }
  } catch (err) {
    console.error("[subscribe/success] Erro ao atualizar KV:", err);
  }

  return new Response(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pagamento confirmado – Amount Writer</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:40px 48px;max-width:480px;width:100%;text-align:center}
    .icon{font-size:56px;margin-bottom:16px}
    h1{font-size:22px;color:#1a1a2e;margin-bottom:8px}
    p{font-size:14px;color:#555;line-height:1.6;margin-bottom:16px}
    .badge{display:inline-block;background:#e6f9ee;color:#1a7e40;font-size:13px;font-weight:700;padding:6px 18px;border-radius:20px;margin-bottom:24px}
    .step{background:#f5f7fa;border-radius:8px;padding:14px 18px;font-size:13px;color:#444;text-align:left;margin-top:16px;line-height:1.7}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎉</div>
    <h1>Assinatura ativada!</h1>
    <div class="badge">✅ Pagamento confirmado</div>
    <p>Sua assinatura do <strong>Amount Writer — Grupo TLJ</strong> foi ativada com sucesso.</p>
    <div class="step">
      <strong>Próximo passo:</strong><br>
      Feche esta aba e reabra as configurações do aplicativo no Bitrix24 para confirmar que tudo está em ordem.
    </div>
  </div>
</body>
</html>`, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

// ─────────────────────────────────────────────
// Route: GET /subscribe/cancel
// ─────────────────────────────────────────────
function handleSubscribeCancel(): Response {
  return new Response(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pagamento cancelado – Amount Writer</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:40px 48px;max-width:480px;width:100%;text-align:center}
    .icon{font-size:56px;margin-bottom:16px}
    h1{font-size:22px;color:#1a1a2e;margin-bottom:8px}
    p{font-size:14px;color:#555;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">↩️</div>
    <h1>Pagamento cancelado</h1>
    <p>Você cancelou o processo de pagamento. Feche esta aba e tente novamente quando quiser assinar.</p>
  </div>
</body>
</html>`, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

// ─────────────────────────────────────────────
// Route: POST /api/stripe-webhook
// ─────────────────────────────────────────────
async function handleStripeWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const rawBody   = await request.text();
  const sigHeader = request.headers.get("stripe-signature") ?? "";

  const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error("[webhook] Assinatura Stripe inválida");
    return new Response("Unauthorized", { status: 401 });
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody) as Record<string, unknown>; }
  catch { return new Response("Bad Request", { status: 400 }); }

  const eventType = event["type"] as string;
  const data      = (event["data"] as Record<string, unknown>)?.["object"] as Record<string, unknown>;
  if (!data) return new Response("OK");

  try {
    switch (eventType) {

      case "checkout.session.completed": {
        const memberId = extractMetaMemberId(data);
        const sub      = data["subscription"] as Record<string, unknown> | string | null;
        const subId    = typeof sub === "string" ? sub : (sub?.["id"] as string | undefined);
        const custId   = data["customer"] as string | undefined;
        if (memberId) {
          await updateSubscriptionFromStripe(env.SUBSCRIPTIONS, memberId, {
            status: "active", stripeCustomerId: custId, stripeSubscriptionId: subId,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const memberId         = extractMetaMemberId(data);
        const status           = mapStripeStatus(data["status"] as string);
        const periodEnd        = data["current_period_end"] as number | undefined;
        const cancelAtPeriodEnd = !!(data["cancel_at_period_end"] as boolean | undefined);
        if (memberId) {
          await updateSubscriptionFromStripe(env.SUBSCRIPTIONS, memberId, {
            status,
            stripeSubscriptionId: data["id"] as string,
            stripeCustomerId:     data["customer"] as string,
            currentPeriodEnd:     periodEnd ? periodEnd * 1000 : undefined,
            cancelAtPeriodEnd,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const memberId = extractMetaMemberId(data);
        if (memberId) {
          await updateSubscriptionFromStripe(env.SUBSCRIPTIONS, memberId, {
            status: "cancelled", stripeSubscriptionId: data["id"] as string,
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const subId  = data["subscription"] as string | undefined;
        const custId = data["customer"]     as string | undefined;
        const lines  = (data["lines"] as Record<string, unknown>)?.["data"] as Array<Record<string, unknown>> | undefined;
        const end    = lines?.[0]?.["period"] as Record<string, number> | undefined;
        if (subId && custId) {
          const memberId = await findMemberIdByStripeIds(env.SUBSCRIPTIONS, custId, subId);
          if (memberId) {
            await updateSubscriptionFromStripe(env.SUBSCRIPTIONS, memberId, {
              status: "active",
              currentPeriodEnd: end?.["end"] ? end["end"] * 1000 : undefined,
            });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const custId = data["customer"]     as string | undefined;
        const subId  = data["subscription"] as string | undefined;
        if (custId && subId) {
          const memberId = await findMemberIdByStripeIds(env.SUBSCRIPTIONS, custId, subId);
          if (memberId) await updateSubscriptionFromStripe(env.SUBSCRIPTIONS, memberId, { status: "past_due" });
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[webhook] Erro ao processar evento ${eventType}:`, err);
  }

  // Forward para webhook próprio (opcional)
  if (env.NOTIFY_WEBHOOK_URL) {
    ctx.waitUntil(
      fetch(env.NOTIFY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Stripe-Event": eventType, "X-Forwarded-By": "amount-writer-worker" },
        body: rawBody,
      }).catch(() => {})
    );
  }

  return new Response("OK");
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

  if (!["ONCRMDEALADD", "ONCRMDEALUPDATE"].includes(event)) return jsonResp({ skipped: true, event });
  if (!domain || !dealId) return jsonResp({ error: "domain or dealId missing" }, 400);

  let inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error: `Installation not found for ${domain}` }, 404);

  // ── Gate de assinatura ──────────────────────────────────────────────────────
  if (env.SUBSCRIPTIONS) {
    let record = await getSubscription(env.SUBSCRIPTIONS, inst.member_id);

    // Portal instalado antes do sistema de assinaturas — cria trial automaticamente
    if (!record) {
      await createTrialRecord(env.SUBSCRIPTIONS, inst.member_id, domain);
      record = await getSubscription(env.SUBSCRIPTIONS, inst.member_id);
    }

    const access = checkAccess(record);
    if (!access.allowed) {
      console.warn(`[bitrix] Acesso negado para ${domain} (${inst.member_id}): ${access.reason}`);
      return jsonResp({ skipped: true, reason: access.reason, message: "Active subscription required" });
    }
  }

  inst = await refreshToken(env, inst);
  const useToken    = inst.access_token;
  const useEndpoint = clientEndpoint || inst.client_endpoint;

  const extraMappings = parseExtraMappings(inst.extra_mappings);

  // Monta lista de campos a buscar (sem duplicatas)
  const fieldsToFetch = [
    "OPPORTUNITY", "ID", "CURRENCY_ID",
    inst.field_extenso,
    ...extraMappings.map(m => m.money_field),
    ...extraMappings.map(m => m.text_field),
  ];
  const uniqueFields  = [...new Set(fieldsToFetch)];
  const selectParams  = Object.fromEntries(uniqueFields.map((f, i) => [`select[${i}]`, f]));

  const dealResp = await callBitrix(useEndpoint, "crm.deal.list", {
    "filter[ID]": dealId,
    ...selectParams,
  }, useToken);

  const deal = dealResp?.result?.[0];
  if (!deal) return jsonResp({ error: `Deal ${dealId} not found`, resp: dealResp }, 404);

  const dealCurrency = (deal["CURRENCY_ID"] ?? "USD").toString().toUpperCase();
  const opportunity  = Number(deal["OPPORTUNITY"]);
  if (Number.isNaN(opportunity)) return jsonResp({ error: "Invalid OPPORTUNITY value" }, 400);

  // Acumula todos os campos a atualizar numa única chamada
  const updateParams: Record<string, string> = { id: dealId };
  const log: Array<{ field: string; value: string; skipped: boolean }> = [];

  // Campo principal (OPPORTUNITY)
  const mainExtenso = convertAmount(opportunity, dealCurrency);
  if (deal[inst.field_extenso] !== mainExtenso) {
    updateParams[`fields[${inst.field_extenso}]`] = mainExtenso;
    log.push({ field: inst.field_extenso, value: mainExtenso, skipped: false });
  } else {
    log.push({ field: inst.field_extenso, value: mainExtenso, skipped: true });
  }

  // Campos extras
  for (const mapping of extraMappings) {
    const rawValue = deal[mapping.money_field];
    if (rawValue === undefined || rawValue === null) continue;
    const { amount, currency } = parseMoneyField(rawValue, dealCurrency);
    const extenso = convertAmount(amount, currency);
    if (deal[mapping.text_field] !== extenso) {
      updateParams[`fields[${mapping.text_field}]`] = extenso;
      log.push({ field: mapping.text_field, value: extenso, skipped: false });
    } else {
      log.push({ field: mapping.text_field, value: extenso, skipped: true });
    }
  }

  const hasUpdates = Object.keys(updateParams).length > 1;
  if (!hasUpdates) return jsonResp({ ok: true, skipped: true, reason: "all fields already up to date", log });

  const updateResp = await callBitrix(useEndpoint, "crm.deal.update", updateParams, useToken);
  return jsonResp({ ok: true, domain, dealId, log, update: updateResp?.result });
}

// ─────────────────────────────────────────────
// Route: POST /  — legacy JSON API
// ─────────────────────────────────────────────
async function handleJsonApi(request: Request): Promise<Response> {
  if (request.method !== "POST") return jsonResp({ error: "Use POST" }, 405);
  let data: any;
  try { data = await request.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }

  const currency = (data?.currency ?? "BRL").toString().toUpperCase();

  if (data?.values && typeof data.values === "object" && !Array.isArray(data.values)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.values)) {
      const num = Number(v);
      if (Number.isNaN(num)) return jsonResp({ error: `Invalid value at values.${k}` }, 400);
      out[k] = convertAmount(num, currency);
    }
    return jsonResp({ extensos: out });
  }
  if (Array.isArray(data?.values)) {
    const out: string[] = [];
    for (let i = 0; i < data.values.length; i++) {
      const num = Number(data.values[i]);
      if (Number.isNaN(num)) return jsonResp({ error: `Invalid value at values[${i}]` }, 400);
      out.push(convertAmount(num, currency));
    }
    return jsonResp({ extensos: out });
  }
  const value = Number(data?.value);
  if (Number.isNaN(value)) return jsonResp({ error: "Invalid 'value' field" }, 400);
  return jsonResp({ extenso: convertAmount(value, currency) });
}


// ─────────────────────────────────────────────
// Admin API — protegida por X-Admin-Key
// Usada pelo painel administrativo (admin-panel)
// ─────────────────────────────────────────────

function checkAdminKey(request: Request, env: Env): boolean {
  const key = request.headers.get("X-Admin-Key") ?? new URL(request.url).searchParams.get("key") ?? "";
  return !!env.ADMIN_KEY && key === env.ADMIN_KEY;
}

// GET /api/admin/extenso-subscriptions
async function handleAdminListSubscriptions(request: Request, env: Env): Promise<Response> {
  if (!checkAdminKey(request, env)) return jsonResp({ error: "Unauthorized" }, 401);

  const list = await env.SUBSCRIPTIONS.list({ prefix: KV_PREFIX });
  const records: SubscriptionRecord[] = [];
  for (const key of list.keys) {
    const raw = await env.SUBSCRIPTIONS.get(key.name);
    if (!raw) continue;
    try { records.push(JSON.parse(raw) as SubscriptionRecord); } catch { /* skip */ }
  }
  records.sort((a, b) => (b.installedAt ?? 0) - (a.installedAt ?? 0));

  const subscriptions = records.map(r => ({
    memberId:             r.memberId,
    domain:               r.domain,
    status:               r.status,
    trialEnd:             r.trialEnd ? new Date(r.trialEnd).toISOString() : null,
    installedAt:          r.installedAt ? new Date(r.installedAt).toISOString() : null,
    stripeSubscriptionId: r.stripeSubscriptionId ?? null,
    stripeCustomerId:     r.stripeCustomerId ?? null,
    currentPeriodEnd:     r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toISOString() : null,
    cancelAtPeriodEnd:    !!r.cancelAtPeriodEnd,
  }));

  return jsonResp({ total: subscriptions.length, subscriptions });
}

// POST /api/admin/extenso-subscriptions/restore  { memberId, days }
async function handleAdminRestoreSubscription(request: Request, env: Env): Promise<Response> {
  if (!checkAdminKey(request, env)) return jsonResp({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({})) as { memberId?: string; days?: number };
  const memberId = body.memberId ?? "";
  const days     = Math.min(Math.max(body.days ?? 7, 1), 365);
  if (!memberId) return jsonResp({ error: "memberId obrigatorio" }, 400);

  const now      = Date.now();
  const trialEnd = now + days * 86_400_000;
  const existing = await getSubscription(env.SUBSCRIPTIONS, memberId);

  const record: SubscriptionRecord = existing
    ? { ...existing, status: "trialing", trialEnd, cancelAtPeriodEnd: false, updatedAt: now }
    : { memberId, domain: "", status: "trialing", installedAt: now, trialEnd, updatedAt: now };

  await saveSubscriptionKV(env.SUBSCRIPTIONS, record);
  return jsonResp({ ok: true, memberId, trialEnd, days });
}

// POST /api/admin/extenso-subscriptions/revoke  { memberId }
async function handleAdminRevokeSubscription(request: Request, env: Env): Promise<Response> {
  if (!checkAdminKey(request, env)) return jsonResp({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({})) as { memberId?: string };
  const memberId = body.memberId ?? "";
  if (!memberId) return jsonResp({ error: "memberId obrigatorio" }, 400);

  const existing = await getSubscription(env.SUBSCRIPTIONS, memberId);
  if (!existing) return jsonResp({ error: "not_found" }, 404);

  const updated: SubscriptionRecord = {
    ...existing,
    status:    "cancelled",
    trialEnd:  Date.now(),
    updatedAt: Date.now(),
  };
  await saveSubscriptionKV(env.SUBSCRIPTIONS, updated);
  return jsonResp({ ok: true, memberId });
}

// DELETE /api/admin/extenso-subscriptions?mid=xxx
async function handleAdminDeleteSubscription(request: Request, env: Env): Promise<Response> {
  if (!checkAdminKey(request, env)) return jsonResp({ error: "Unauthorized" }, 401);

  const memberId = new URL(request.url).searchParams.get("mid") ?? "";
  if (!memberId) return jsonResp({ error: "mid obrigatorio" }, 400);

  await env.SUBSCRIPTIONS.delete(`${KV_PREFIX}${memberId}`);
  return jsonResp({ ok: true, memberId });
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/install"              && method === "POST")                   return handleInstall(request, env);
    if (pathname === "/install"              && (method === "GET" || method === "HEAD")) return html(`<h2>✅ Amount Writer</h2><p>App rodando corretamente. Acesse pelo Bitrix24.</p>`);
    if (pathname === "/setup"               && (method === "GET" || method === "HEAD")) return handleSetupGet(request, env);
    if (pathname === "/setup"               && method === "POST")                   return handleSetupPost(request, env);
    if (pathname === "/setup-data"          && method === "GET")                    return handleSetupData(request, env);
    if (pathname === "/api/status"          && method === "GET")                    return handleApiStatus(request, env);
    if (pathname === "/api/cancel-subscription" && method === "POST")              return handleCancelSubscription(request, env);
    if (pathname === "/subscribe"           && method === "GET")                    return handleSubscribe(request, env);
    if (pathname === "/subscribe/success"   && method === "GET")                    return handleSubscribeSuccess(request, env);
    if (pathname === "/subscribe/cancel"    && method === "GET")                    return handleSubscribeCancel();
    if (pathname === "/api/stripe-webhook"  && method === "POST")                   return handleStripeWebhook(request, env, ctx);
    if (pathname === "/api/admin/extenso-subscriptions"         && method === "GET")    return handleAdminListSubscriptions(request, env);
    if (pathname === "/api/admin/extenso-subscriptions/restore" && method === "POST")   return handleAdminRestoreSubscription(request, env);
    if (pathname === "/api/admin/extenso-subscriptions/revoke"  && method === "POST")   return handleAdminRevokeSubscription(request, env);
    if (pathname === "/api/admin/extenso-subscriptions"         && method === "DELETE") return handleAdminDeleteSubscription(request, env);
    if (pathname === "/bitrix"              && method === "POST")                   return handleBitrixEvent(request, env);
    return handleJsonApi(request);
  },
};
