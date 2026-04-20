// src/index.ts

export interface Env {
  DB: D1Database;
  CLIENT_ID: string;       // secret: npx wrangler secret put CLIENT_ID
  CLIENT_SECRET: string;   // secret: npx wrangler secret put CLIENT_SECRET
  APP_URL: string;         // var: URL pública do Worker (sem barra final)
}

// ─────────────────────────────────────────────
// Conversão pt-BR
// ─────────────────────────────────────────────
function numeroPorExtenso(n: number): string {
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas   = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas  = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (n === 0) return "zero";
  if (n === 100) return "cem";

  let texto = "";
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;

  if (c > 0) texto += centenas[c];
  if (d === 1) {
    texto += (texto ? " e " : "") + especiais[u];
  } else {
    if (d > 1) texto += (texto ? " e " : "") + dezenas[d];
    if (u > 0) texto += (texto ? " e " : "") + unidades[u];
  }
  return texto;
}

function valorPorExtensoBR(valor: number): string {
  const v        = Math.round(valor * 100) / 100;
  const inteiro  = Math.floor(v);
  const centavos = Math.round((v - inteiro) * 100);

  const escalas: Array<[string, string]> = [
    ["", ""], ["mil", "mil"], ["milhão", "milhões"],
    ["bilhão", "bilhões"], ["trilhão", "trilhões"],
  ];

  let partes: string[] = [];
  if (inteiro === 0) {
    partes = ["zero"];
  } else {
    let num = inteiro, escala = 0;
    while (num > 0) {
      const grupo = num % 1000;
      if (grupo > 0) {
        let txt = numeroPorExtenso(grupo);
        if (escala > 0) {
          const [sing, plur] = escalas[escala] ?? ["", ""];
          txt += " " + (grupo === 1 ? sing : plur);
        }
        partes.unshift(txt);
      }
      num = Math.floor(num / 1000);
      escala++;
    }
  }

  let resultado = partes.join(" e ");
  resultado += inteiro === 1 ? " real" : " reais";
  if (centavos > 0) {
    resultado += " e " + numeroPorExtenso(centavos);
    resultado += centavos === 1 ? " centavo" : " centavos";
  }
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
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
  const row = await db
    .prepare("SELECT * FROM installations WHERE domain = ?")
    .bind(domain)
    .first<Installation>();
  return row ?? null;
}

async function saveInstallation(db: D1Database, data: Installation): Promise<void> {
  await db.prepare(`
    INSERT INTO installations
      (domain, member_id, access_token, refresh_token, expires_at, client_endpoint, field_extenso, installed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain) DO UPDATE SET
      member_id        = excluded.member_id,
      access_token     = excluded.access_token,
      refresh_token    = excluded.refresh_token,
      expires_at       = excluded.expires_at,
      client_endpoint  = excluded.client_endpoint,
      installed_at     = excluded.installed_at
  `)
  .bind(
    data.domain, data.member_id, data.access_token, data.refresh_token,
    data.expires_at, data.client_endpoint, data.field_extenso, Math.floor(Date.now() / 1000)
  )
  .run();
}

async function updateField(db: D1Database, domain: string, field: string): Promise<void> {
  await db.prepare("UPDATE installations SET field_extenso = ? WHERE domain = ?")
    .bind(field, domain)
    .run();
}

async function updateTokens(db: D1Database, domain: string, access: string, refresh: string, expiresAt: number): Promise<void> {
  await db.prepare("UPDATE installations SET access_token = ?, refresh_token = ?, expires_at = ? WHERE domain = ?")
    .bind(access, refresh, expiresAt, domain)
    .run();
}

// ─────────────────────────────────────────────
// OAuth helpers
// ─────────────────────────────────────────────
async function refreshToken(env: Env, inst: Installation): Promise<Installation> {
  const now = Math.floor(Date.now() / 1000);
  if (inst.expires_at > now + 60) return inst; // ainda válido

  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      refresh_token: inst.refresh_token,
    }),
  });

  const data: any = await res.json();
  if (!data.access_token) throw new Error("Falha ao renovar token OAuth");

  const updated = {
    ...inst,
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    now + (data.expires_in ?? 3600),
  };

  await updateTokens(env.DB, inst.domain, updated.access_token, updated.refresh_token, updated.expires_at);
  return updated;
}

// ─────────────────────────────────────────────
// Bitrix24 REST helpers
// ─────────────────────────────────────────────
async function callBitrix(endpoint: string, method: string, params: Record<string, string>, token: string): Promise<any> {
  const body = new URLSearchParams({ ...params, auth: token });
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/${method}.json`, {
    method: "POST",
    body,
  });
  return res.json();
}

async function registerEvents(endpoint: string, token: string, handlerUrl: string): Promise<void> {
  for (const event of ["ONCRMDEALADD", "ONCRMDEALUPDATE"]) {
    await callBitrix(endpoint, "event.bind", { event, handler: handlerUrl }, token);
  }
}

// ─────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────
function html(body: string, status = 200): Response {
  return new Response(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Valor por Extenso</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; background: #f4f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
      .card { background: #fff; border-radius: 10px; padding: 36px; max-width: 500px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,.1); }
      h2 { color: #2e7d32; margin-bottom: 16px; }
      h2.error { color: #c62828; }
      p { color: #444; line-height: 1.6; margin-bottom: 12px; }
      label { display: block; margin-bottom: 6px; font-weight: bold; color: #333; }
      input[type=text] { width: 100%; padding: 10px 14px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; margin-bottom: 16px; }
      button { background: #2e7d32; color: #fff; border: none; padding: 11px 24px; border-radius: 6px; font-size: 15px; cursor: pointer; }
      button:hover { background: #1b5e20; }
      code { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: .88em; }
      .success { color: #2e7d32; margin-top: 8px; font-weight: bold; }
      .hint { font-size: .82em; color: #777; margin-top: -10px; margin-bottom: 16px; }
    </style>
  </head><body><div class="card">${body}</div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function jsonResp(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────
// Rota: POST /install
// Chamada pelo Bitrix24 ao instalar o app
// ─────────────────────────────────────────────
async function handleInstall(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  const body = new URLSearchParams(text);

  const domain          = body.get("DOMAIN")          ?? body.get("domain")          ?? "";
  const memberId        = body.get("MEMBER_ID")        ?? body.get("member_id")        ?? "";
  const accessToken     = body.get("AUTH_ID")          ?? body.get("access_token")     ?? "";
  const refreshToken_   = body.get("REFRESH_ID")       ?? body.get("refresh_token")    ?? "";
  const expiresIn       = parseInt(body.get("AUTH_EXPIRES") ?? "3600");
  const clientEndpoint  = body.get("client_endpoint")  ?? "";

  if (!domain || !accessToken || !clientEndpoint) {
    return html(`<h2 class="error">❌ Erro na instalação</h2>
      <p>Dados incompletos recebidos do Bitrix24. Tente reinstalar o aplicativo.</p>`, 400);
  }

  const installation: Installation = {
    domain,
    member_id:       memberId,
    access_token:    accessToken,
    refresh_token:   refreshToken_,
    expires_at:      Math.floor(Date.now() / 1000) + expiresIn,
    client_endpoint: clientEndpoint,
    field_extenso:   "UF_CRM_VALOR_EXTENSO", // padrão, cliente troca no /setup
  };

  await saveInstallation(env.DB, installation);

  // Registra os eventos de CRM
  const handlerUrl = `${env.APP_URL}/bitrix`;
  await registerEvents(clientEndpoint, accessToken, handlerUrl);

  // Redireciona para a tela de configuração
  const setupUrl = `${env.APP_URL}/setup?domain=${encodeURIComponent(domain)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: setupUrl },
  });
}

// ─────────────────────────────────────────────
// Rota: GET /setup
// Tela de configuração do campo (iframe no Bitrix24)
// ─────────────────────────────────────────────
async function handleSetupGet(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? "";
  const saved  = url.searchParams.get("saved");

  if (!domain) return html(`<h2 class="error">❌ Domínio não informado</h2>`);

  const inst = await getInstallation(env.DB, domain);
  if (!inst) return html(`<h2 class="error">❌ Instalação não encontrada</h2>
    <p>Reinstale o aplicativo no Bitrix24.</p>`);

  const successMsg = saved === "1"
    ? `<p class="success">✅ Campo salvo com sucesso!</p>`
    : "";

  return html(`
    <h2>⚙️ Valor por Extenso</h2>
    <p>Configure abaixo o campo de texto que receberá o valor do negócio por extenso.</p>
    ${successMsg}
    <form method="POST" action="/setup">
      <input type="hidden" name="domain" value="${domain}">
      <label for="field">Código do campo personalizado</label>
      <input type="text" id="field" name="field_extenso"
        value="${inst.field_extenso}"
        placeholder="Ex: UF_CRM_1234567890">
      <p class="hint">Encontre o código em CRM → Configurações → Campos do negócio.</p>
      <button type="submit">Salvar configuração</button>
    </form>
    <br>
    <p><small>Domínio: <code>${domain}</code></small></p>
  `);
}

// ─────────────────────────────────────────────
// Rota: POST /setup
// Salva a escolha do campo
// ─────────────────────────────────────────────
async function handleSetupPost(request: Request, env: Env): Promise<Response> {
  const text   = await request.text();
  const body   = new URLSearchParams(text);
  const domain = body.get("domain") ?? "";
  const field  = (body.get("field_extenso") ?? "").trim();

  if (!domain || !field) {
    return html(`<h2 class="error">❌ Dados inválidos</h2>`, 400);
  }

  await updateField(env.DB, domain, field);

  return new Response(null, {
    status: 302,
    headers: { Location: `/setup?domain=${encodeURIComponent(domain)}&saved=1` },
  });
}

// ─────────────────────────────────────────────
// Rota: POST /bitrix
// Recebe eventos de CRM do Bitrix24
// ─────────────────────────────────────────────
async function handleBitrixEvent(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  const body = new URLSearchParams(text);

  const event  = (body.get("event") ?? "").toUpperCase();
  const domain = body.get("auth[domain]") ?? body.get("DOMAIN") ?? "";
  const dealId = body.get("data[FIELDS][ID]") ?? "";

  if (!["ONCRMDEALADD", "ONCRMDEALUPDATE"].includes(event)) {
    return jsonResp({ skipped: true, event });
  }

  if (!domain || !dealId) {
    return jsonResp({ error: "domain ou dealId ausente" }, 400);
  }

  let inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error: `Instalação não encontrada para ${domain}` }, 404);

  // Renova token se necessário
  inst = await refreshToken(env, inst);

  // Busca o negócio
  const dealResp = await callBitrix(inst.client_endpoint, "crm.deal.get", { id: dealId }, inst.access_token);
  const deal     = dealResp?.result;
  if (!deal) return jsonResp({ error: `Deal ${dealId} não encontrado` }, 404);

  const opportunity = Number(deal["OPPORTUNITY"]);
  if (Number.isNaN(opportunity)) return jsonResp({ error: "OPPORTUNITY inválido" }, 400);

  const extenso = valorPorExtensoBR(opportunity);

  // Atualiza o campo personalizado
  await callBitrix(inst.client_endpoint, "crm.deal.update", {
    id: dealId,
    [`fields[${inst.field_extenso}]`]: extenso,
  }, inst.access_token);

  return jsonResp({ ok: true, domain, dealId, opportunity, extenso });
}

// ─────────────────────────────────────────────
// Rota: POST / — API JSON legada (avulsa)
// ─────────────────────────────────────────────
async function handleJsonApi(request: Request): Promise<Response> {
  if (request.method !== "POST") return jsonResp({ error: "Use POST" }, 405);

  let data: any;
  try { data = await request.json(); }
  catch { return jsonResp({ error: "JSON inválido" }, 400); }

  if (data?.values && typeof data.values === "object" && !Array.isArray(data.values)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.values)) {
      const num = Number(v);
      if (Number.isNaN(num)) return jsonResp({ error: `Valor inválido em values.${k}` }, 400);
      out[k] = valorPorExtensoBR(num);
    }
    return jsonResp({ extensos: out });
  }

  if (Array.isArray(data?.values)) {
    const out: string[] = [];
    for (let i = 0; i < data.values.length; i++) {
      const num = Number(data.values[i]);
      if (Number.isNaN(num)) return jsonResp({ error: `Valor inválido em values[${i}]` }, 400);
      out.push(valorPorExtensoBR(num));
    }
    return jsonResp({ extensos: out });
  }

  const value = Number(data?.value);
  if (Number.isNaN(value)) return jsonResp({ error: "Campo 'value' inválido" }, 400);
  return jsonResp({ extenso: valorPorExtensoBR(value) });
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/install" && method === "POST") return handleInstall(request, env);
    if (pathname === "/install" && method === "GET")  return html(`<h2>✅ Valor por Extenso</h2><p>App instalado corretamente. Acesse pelo Bitrix24.</p>`);
    if (pathname === "/setup"   && method === "GET")  return handleSetupGet(request, env);
    if (pathname === "/setup"   && method === "POST") return handleSetupPost(request, env);
    if (pathname === "/bitrix"  && method === "POST") return handleBitrixEvent(request, env);

    return handleJsonApi(request);
  },
};
