export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Use POST" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    let data: any;
    try {
      data = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "JSON inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const value = Number(data.value);
    if (isNaN(value)) {
      return new Response(
        JSON.stringify({ error: "Campo 'value' inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
      const inteiro = Math.floor(valor);
      const centavos = Math.round((valor - inteiro) * 100);

      const escalas = [
        ["", ""],
        ["mil", "mil"],
        ["milhão", "milhões"],
        ["bilhão", "bilhões"]
      ];

      let partes: string[] = [];
      let num = inteiro;
      let escala = 0;

      while (num > 0) {
        const grupo = num % 1000;
        if (grupo > 0) {
          let txt = numeroPorExtenso(grupo);
          if (escala > 0) {
            txt += " " + (grupo === 1 ? escalas[escala][0] : escalas[escala][1]);
          }
          partes.unshift(txt);
        }
        num = Math.floor(num / 1000);
        escala++;
      }

      let resultado = partes.join(" e ");
      resultado += inteiro === 1 ? " real" : " reais";

      if (centavos > 0) {
        resultado += " e " + numeroPorExtenso(centavos);
        resultado += centavos === 1 ? " centavo" : " centavos";
      }

      return resultado.charAt(0).toUpperCase() + resultado.slice(1);
    }

    const extenso = valorPorExtensoBR(value);

    return new Response(
      JSON.stringify({ extenso }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
};
