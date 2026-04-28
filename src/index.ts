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
  // client_endpoint já termina com /rest/ — não adicionar .json
  const url = `${endpoint.replace(/\/$/, "")}/${method}.json`;
  const res = await fetch(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch(e) {
    console.error("callBitrix parse error:", url, text.slice(0, 200));
    throw new Error(`Bitrix API returned non-JSON: ${text.slice(0, 100)}`);
  }
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
  // Bitrix24 pode enviar dados na query string ou no corpo do POST
  const urlObj = new URL(request.url);
  const text   = await request.text();
  const body   = new URLSearchParams(text);

  const get = (key: string, ...aliases: string[]): string => {
    for (const k of [key, ...aliases]) {
      const v = urlObj.searchParams.get(k) ?? body.get(k);
      if (v) return v;
    }
    return "";
  };

  const domain         = get("DOMAIN", "domain");
  const memberId       = get("MEMBER_ID", "member_id");
  const accessToken    = get("AUTH_ID", "access_token");
  const refreshToken_  = get("REFRESH_ID", "refresh_token");
  const expiresIn      = parseInt(get("AUTH_EXPIRES") || "3600");
  const clientEndpoint = get("client_endpoint");

  // Monta client_endpoint a partir do domínio se não vier explícito
  const resolvedEndpoint = clientEndpoint || (domain ? `https://${domain}/rest/` : "");

  if (!domain || !accessToken || !resolvedEndpoint) {
    return html(`<h2 class="error">❌ Erro na instalação</h2>
      <p>Dados incompletos recebidos do Bitrix24. Tente reinstalar o aplicativo.</p>`, 400);
  }

  const installation: Installation = {
    domain,
    member_id:       memberId,
    access_token:    accessToken,
    refresh_token:   refreshToken_,
    expires_at:      Math.floor(Date.now() / 1000) + expiresIn,
    client_endpoint: resolvedEndpoint,
    field_extenso:   "UF_CRM_VALOR_EXTENSO", // padrão, cliente troca no /setup
  };

  await saveInstallation(env.DB, installation);

  // Registra os eventos de CRM
  const handlerUrl = `${env.APP_URL}/bitrix`;
  await registerEvents(resolvedEndpoint, accessToken, handlerUrl);

  // Retorna página com BX24.installFinish() — obrigatório para INSTALLED=true
  const setupUrl = `${env.APP_URL}/setup?domain=${encodeURIComponent(domain)}`;
  return new Response(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://api.bitrix24.com/api/v1/"></script>
</head>
<body>
  <p style="font-family:Arial;text-align:center;padding:40px;color:#2e7d32">
    ✅ Instalando Valor por Extenso...
  </p>
  <script>
    BX24.init(function() {
      BX24.installFinish(function() {
        window.location.href = "${setupUrl}";
      });
    });
  </script>
</body>
</html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
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

  const successMsg = saved === "1"
    ? `<p class="success">✅ Campo salvo com sucesso!</p>`
    : "";

  // Se não tem domínio na URL, usa BX24.js para obtê-lo dinamicamente
  if (!domain) {
    return new Response(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Valor por Extenso</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f4f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #fff; border-radius: 10px; padding: 36px; max-width: 500px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,.1); }
    h2 { color: #2e7d32; margin-bottom: 16px; }
    p { color: #444; line-height: 1.6; margin-bottom: 12px; }
    label { display: block; margin-bottom: 6px; font-weight: bold; color: #333; }
    input[type=text] { width: 100%; padding: 10px 14px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; margin-bottom: 16px; }
    button { background: #2e7d32; color: #fff; border: none; padding: 11px 24px; border-radius: 6px; font-size: 15px; cursor: pointer; }
    button:hover { background: #1b5e20; }
    code { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: .88em; }
    .hint { font-size: .82em; color: #777; margin-top: -10px; margin-bottom: 16px; }
  </style>
</head>
<body>
<div class="card">
  <h2>⚙️ Valor por Extenso</h2>
  <p>Configure o campo de texto que receberá o valor do negócio por extenso.</p>
  ${successMsg}
  <form id="setupForm" method="POST" action="/setup">
    <input type="hidden" name="domain" id="domainField" value="">
    <label for="field">Código do campo personalizado</label>
    <input type="text" id="field" name="field_extenso"
      placeholder="Ex: UF_CRM_1234567890">
    <p class="hint">Encontre o código em CRM → Configurações → Campos do negócio.</p>
    <button type="submit">Salvar configuração</button>
  </form>
</div>
<script>
  BX24.init(function() {
    var auth = BX24.getAuth();
    var domain = auth.domain || BX24.getDomain();
    document.getElementById('domainField').value = domain;

    // Carrega o campo atual via fetch
    fetch('/setup-data?domain=' + encodeURIComponent(domain))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.field_extenso) {
          document.getElementById('field').value = d.field_extenso;
        }
      });
  });
</script>
</body>
</html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const inst = await getInstallation(env.DB, domain);
  if (!inst) return html(`<h2 class="error">❌ Instalação não encontrada</h2>
    <p>Reinstale o aplicativo no Bitrix24.</p>`);

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
  const text = await request.text();
  const body = new URLSearchParams(text);

  const urlObj2  = new URL(request.url);
  const field    = (body.get("field_extenso") ?? "").trim();

  // DOMAIN pode vir na query string (Bitrix24) ou no body (nosso formulário)
  const bitrixDomain = urlObj2.searchParams.get("DOMAIN")
    ?? urlObj2.searchParams.get("domain")
    ?? body.get("DOMAIN")
    ?? body.get("domain")
    ?? "";

  // Se não tem field_extenso, é o POST do Bitrix24 → redireciona para GET /setup
  if (!field) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/setup?domain=${encodeURIComponent(bitrixDomain)}` },
    });
  }

  if (!bitrixDomain) {
    return html(`<h2 class="error">❌ Domínio não identificado</h2>`, 400);
  }

  await updateField(env.DB, bitrixDomain, field);

  return new Response(null, {
    status: 302,
    headers: { Location: `/setup?domain=${encodeURIComponent(bitrixDomain)}&saved=1` },
  });
}

// ─────────────────────────────────────────────
// Rota: POST /bitrix
// Recebe eventos de CRM do Bitrix24
// ─────────────────────────────────────────────
async function handleBitrixEvent(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  const body = new URLSearchParams(text);

  // Debug: loga todos os campos recebidos
  const allFields: Record<string, string> = {};
  body.forEach((v, k) => { allFields[k] = v; });
  console.log("BITRIX EVENT PAYLOAD:", JSON.stringify(allFields));

  const event          = (body.get("event") ?? "").toUpperCase();
  const domain         = body.get("auth[domain]") ?? body.get("DOMAIN") ?? body.get("domain") ?? "";
  const dealId         = body.get("data[FIELDS][ID]") ?? "";
  const clientEndpoint = body.get("auth[client_endpoint]") ?? "";
  const serverEndpoint = body.get("auth[server_endpoint]") ?? "";
  const accessToken    = body.get("auth[access_token]") ?? "";

  // Usa server_endpoint (oauth.bitrix.info) pois é o que aceita tokens OAuth de apps
  const apiEndpoint    = serverEndpoint || clientEndpoint;

  console.log("EVENT:", event, "DOMAIN:", domain, "DEAL_ID:", dealId, "API_ENDPOINT:", apiEndpoint);

  if (!["ONCRMDEALADD", "ONCRMDEALUPDATE"].includes(event)) {
    return jsonResp({ skipped: true, event });
  }

  if (!domain || !dealId) {
    return jsonResp({ error: "domain ou dealId ausente", fields: allFields }, 400);
  }

  let inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error: `Instalação não encontrada para ${domain}` }, 404);

  // Atualiza endpoint no banco se mudou
  if (clientEndpoint && clientEndpoint !== inst.client_endpoint) {
    inst.client_endpoint = clientEndpoint;
  }

  // Sempre renova o token via refresh para garantir permissões corretas
  inst = await refreshToken(env, inst);
  const useToken    = inst.access_token;
  const useEndpoint = apiEndpoint || inst.client_endpoint;

  // Busca o negócio
  const dealResp = await callBitrix(useEndpoint, "crm.deal.get", { id: dealId }, useToken);
  console.log("DEAL RESP:", JSON.stringify(dealResp));
  const deal     = dealResp?.result;
  if (!deal) return jsonResp({ error: `Deal ${dealId} não encontrado`, resp: dealResp }, 404);

  const opportunity = Number(deal["OPPORTUNITY"]);
  if (Number.isNaN(opportunity)) return jsonResp({ error: "OPPORTUNITY inválido" }, 400);

  const extenso = valorPorExtensoBR(opportunity);
  console.log("EXTENSO:", extenso, "FIELD:", inst.field_extenso);

  // Atualiza o campo personalizado
  const updateResp = await callBitrix(useEndpoint, "crm.deal.update", {
    id: dealId,
    [`fields[${inst.field_extenso}]`]: extenso,
  }, useToken);
  console.log("UPDATE RESP:", JSON.stringify(updateResp));

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
// Rota: GET /setup-data
// Retorna JSON com dados da instalação para o setup via BX24
// ─────────────────────────────────────────────
async function handleSetupData(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? "";
  if (!domain) return jsonResp({ error: "domain ausente" }, 400);

  const inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error: "não encontrado" }, 404);

  return jsonResp({ field_extenso: inst.field_extenso });
}

// ─────────────────────────────────────────────
// Rota: GET /debug
// Renova token e exibe status do app
// ─────────────────────────────────────────────
async function handleDebug(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? "tljmkt2.bitrix24.com.br";

  let inst = await getInstallation(env.DB, domain);
  if (!inst) return jsonResp({ error: "Instalação não encontrada" }, 404);

  // Força renovação do token
  try {
    inst = await refreshToken(env, inst);
  } catch(e: any) {
    return jsonResp({ error: "Falha ao renovar token", detail: e.message });
  }

  // Checa app.info
  const info = await callBitrix(inst.client_endpoint, "app.info", {}, inst.access_token);

  // Checa eventos registrados
  const events = await callBitrix(inst.client_endpoint, "event.get", {}, inst.access_token);

  return jsonResp({ domain, access_token: inst.access_token, app_info: info, events });
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/install" && method === "POST") return handleInstall(request, env);
    if (pathname === "/install" && (method === "GET" || method === "HEAD"))  return html(`<h2>✅ Valor por Extenso</h2><p>App instalado corretamente. Acesse pelo Bitrix24.</p>`);
    if (pathname === "/debug"   && method === "GET")  return handleDebug(request, env);
    if (pathname === "/setup"   && (method === "GET" || method === "HEAD"))  return handleSetupGet(request, env);
    if (pathname === "/setup-data" && method === "GET") return handleSetupData(request, env);
    if (pathname === "/setup"   && method === "POST") return handleSetupPost(request, env);
    if (pathname === "/bitrix"  && method === "POST") return handleBitrixEvent(request, env);

    return handleJsonApi(request);
  },
};
