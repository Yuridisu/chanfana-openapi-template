// src/index.ts

export interface Env {
  // URL do webhook de entrada do Bitrix24
  // Ex: https://seudominio.bitrix24.com.br/rest/1/SEU_TOKEN
  BITRIX_WEBHOOK_URL: string;

  // Nome do campo personalizado que receberá o valor por extenso
  // Ex: UF_CRM_VALOR_EXTENSO
  BITRIX_FIELD_EXTENSO: string;
}

// =========================================================
// Utilitários de conversão pt-BR
// =========================================================
function numeroPorExtenso(n: number): string {
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

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
  const v = Math.round(valor * 100) / 100;
  const inteiro = Math.floor(v);
  const centavos = Math.round((v - inteiro) * 100);

  const escalas: Array<[string, string]> = [
    ["", ""],
    ["mil", "mil"],
    ["milhão", "milhões"],
    ["bilhão", "bilhões"],
    ["trilhão", "trilhões"],
  ];

  let partes: string[] = [];
  if (inteiro === 0) {
    partes = ["zero"];
  } else {
    let num = inteiro;
    let escala = 0;

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

// =========================================================
// Bitrix24 REST API helpers
// =========================================================
async function bitrixGet(webhookUrl: string, method: string, params: Record<string, string>) {
  const url = new URL(`${webhookUrl.replace(/\/$/, "")}/${method}.json`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Bitrix API error: ${res.status}`);
  return res.json() as Promise<any>;
}

async function getDeal(webhookUrl: string, dealId: string) {
  const data = await bitrixGet(webhookUrl, "crm.deal.get", { id: dealId });
  if (!data?.result) throw new Error(`Deal ${dealId} não encontrado`);
  return data.result as Record<string, any>;
}

async function updateDeal(webhookUrl: string, dealId: string, fields: Record<string, string>) {
  const url = `${webhookUrl.replace(/\/$/, "")}/crm.deal.update.json`;

  const body = new URLSearchParams();
  body.set("id", dealId);
  for (const [k, v] of Object.entries(fields)) {
    body.set(`fields[${k}]`, v);
  }

  const res = await fetch(url, { method: "POST", body });
  if (!res.ok) throw new Error(`Bitrix update error: ${res.status}`);
  return res.json();
}

// =========================================================
// Handler: Webhook do Bitrix24
// =========================================================
async function handleBitrixWebhook(request: Request, env: Env): Promise<Response> {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  // Bitrix envia form-encoded
  let body: URLSearchParams;
  try {
    const text = await request.text();
    body = new URLSearchParams(text);
  } catch {
    return json({ error: "Payload inválido" }, 400);
  }

  const event = body.get("event") ?? "";

  // Aceita criação e atualização de negócios
  if (!["ONCRMDEALADD", "ONCRMDEALUPDATE"].includes(event.toUpperCase())) {
    return json({ skipped: true, event });
  }

  const dealId = body.get("data[FIELDS][ID]");
  if (!dealId) {
    return json({ error: "ID do negócio não encontrado no payload" }, 400);
  }

  if (!env.BITRIX_WEBHOOK_URL || !env.BITRIX_FIELD_EXTENSO) {
    return json({ error: "Variáveis de ambiente BITRIX_WEBHOOK_URL e BITRIX_FIELD_EXTENSO não configuradas" }, 500);
  }

  let deal: Record<string, any>;
  try {
    deal = await getDeal(env.BITRIX_WEBHOOK_URL, dealId);
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }

  const opportunity = Number(deal["OPPORTUNITY"]);
  if (Number.isNaN(opportunity)) {
    return json({ error: "OPPORTUNITY inválido", raw: deal["OPPORTUNITY"] }, 400);
  }

  const extenso = valorPorExtensoBR(opportunity);

  try {
    await updateDeal(env.BITRIX_WEBHOOK_URL, dealId, {
      [env.BITRIX_FIELD_EXTENSO]: extenso,
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }

  return json({ ok: true, dealId, opportunity, extenso });
}

// =========================================================
// Handler: API JSON original (conversão avulsa)
// =========================================================
async function handleJsonApi(request: Request): Promise<Response> {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (request.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let data: any;
  try {
    data = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  // Múltiplos valores (objeto)
  if (data?.values && typeof data.values === "object" && !Array.isArray(data.values)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.values)) {
      const num = Number(v);
      if (Number.isNaN(num)) return json({ error: `Valor inválido em values.${k}` }, 400);
      out[k] = valorPorExtensoBR(num);
    }
    return json({ extensos: out });
  }

  // Múltiplos valores (array)
  if (Array.isArray(data?.values)) {
    const out: string[] = [];
    for (let i = 0; i < data.values.length; i++) {
      const num = Number(data.values[i]);
      if (Number.isNaN(num)) return json({ error: `Valor inválido em values[${i}]` }, 400);
      out.push(valorPorExtensoBR(num));
    }
    return json({ extensos: out });
  }

  // Valor único
  const value = Number(data?.value);
  if (Number.isNaN(value)) {
    return json({ error: "Campo 'value' inválido (use 'value' ou 'values')" }, 400);
  }
  return json({ extenso: valorPorExtensoBR(value) });
}

// =========================================================
// Entry point
// =========================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /bitrix ? recebe webhook do Bitrix24
    if (request.method === "POST" && url.pathname === "/bitrix") {
      return handleBitrixWebhook(request, env);
    }

    // POST / ? API JSON original
    return handleJsonApi(request);
  },
};