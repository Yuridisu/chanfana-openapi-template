// src/index.ts
export default {
  async fetch(request: Request): Promise<Response> {
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

    // ========= Conversão pt-BR =========
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
      // garante 2 casas (evita sujeira de float)
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

      // Trata zero explicitamente
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
              // pt-BR: "mil" não varia no plural
              txt += " " + (grupo === 1 ? sing : plur);
            }

            partes.unshift(txt);
          }

          num = Math.floor(num / 1000);
          escala++;
        }
      }

      // OBS: aqui está o comportamento que você disse que está OK:
      // junta grupos com " e " (ex.: "quinhentos e sessenta e três mil e setecentos e dez")
      let resultado = partes.join(" e ");

      resultado += inteiro === 1 ? " real" : " reais";

      if (centavos > 0) {
        resultado += " e " + numeroPorExtenso(centavos);
        resultado += centavos === 1 ? " centavo" : " centavos";
      }

      return resultado.charAt(0).toUpperCase() + resultado.slice(1);
    }

    // ========= Entrada: múltiplos valores (recomendado) =========
    // Formato:
    // { "values": { "total": 123.45, "frete": 10 } }
    if (data?.values && typeof data.values === "object" && !Array.isArray(data.values)) {
      const out: Record<string, string> = {};

      for (const [k, v] of Object.entries(data.values)) {
        const num = Number(v);
        if (Number.isNaN(num)) {
          return json({ error: `Valor inválido em values.${k}` }, 400);
        }
        out[k] = valorPorExtensoBR(num);
      }

      return json({ extensos: out });
    }

    // Formato:
    // { "values": [123.45, 10, 0.99] }
    if (Array.isArray(data?.values)) {
      const out: string[] = [];
      for (let i = 0; i < data.values.length; i++) {
        const num = Number(data.values[i]);
        if (Number.isNaN(num)) {
          return json({ error: `Valor inválido no índice values[${i}]` }, 400);
        }
        out.push(valorPorExtensoBR(num));
      }
      return json({ extensos: out });
    }

    // ========= Compatibilidade: valor único =========
    // Formato:
    // { "value": 123.45 }
    const value = Number(data?.value);
    if (Number.isNaN(value)) {
      return json({ error: "Campo 'value' inválido (use 'value' ou 'values')" }, 400);
    }

    return json({ extenso: valorPorExtensoBR(value) });
  },
};
