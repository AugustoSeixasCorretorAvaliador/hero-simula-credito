// ==========================
// UTILIDADES
// ==========================

function obterCampoMensagem() {
    return document.querySelector('[contenteditable="true"]');
}

function inserirTexto(texto) {
    const campo = obterCampoMensagem();
    if (!campo) return;
    campo.focus();
    document.execCommand("insertText", false, texto + "\n\n");
}

function normalizarNumero(texto) {
    if (!texto) return null;

    texto = texto.toLowerCase()
        .replace(/r\$/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace("milhões", "000000")
        .replace("milhao", "000000")
        .replace("mil", "000");

    const match = texto.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
}

function extrairDados(conversa) {
    const linhas = conversa.split("\n");

    let dados = {
        valor: null,
        entrada: null,
        renda: null,
        prazo: null,
        sistema: "PRICE"
    };

    linhas.forEach(l => {
        const lower = l.toLowerCase();

        if (lower.includes("imóvel") || lower.includes("imovel"))
            dados.valor = normalizarNumero(l);

        if (lower.includes("entrada"))
            dados.entrada = normalizarNumero(l);

        if (lower.includes("renda"))
            dados.renda = normalizarNumero(l);

        if (lower.includes("prazo"))
            dados.prazo = normalizarNumero(l);

        if (lower.includes("sac"))
            dados.sistema = "SAC";

        if (lower.includes("price"))
            dados.sistema = "PRICE";
    });

    return dados;
}

// ==========================
// CÁLCULOS
// ==========================

function calcularPrice(pv, taxaAnual, meses) {
    const i = taxaAnual / 12;
    return pv * (i * Math.pow(1 + i, meses)) /
        (Math.pow(1 + i, meses) - 1);
}

function calcularSAC(pv, taxaAnual, meses) {
    const i = taxaAnual / 12;
    const amortizacao = pv / meses;
    const primeira = amortizacao + (pv * i);
    const ultima = amortizacao + (amortizacao * i);
    return { primeira, ultima };
}

function parcelaMaxima(renda) {
    return renda * 0.30;
}

function encontrarPrazoIdeal(pv, renda, taxaAnual) {
    const taxaMensal = taxaAnual / 12;
    const limite = parcelaMaxima(renda);

    for (let anos = 10; anos <= 35; anos++) {
        const meses = anos * 12;

        const parcela = pv *
            (taxaMensal * Math.pow(1 + taxaMensal, meses)) /
            (Math.pow(1 + taxaMensal, meses) - 1);

        if (parcela <= limite) {
            return { anos, parcela };
        }
    }

    return null;
}

// ==========================
// EXECUÇÃO PRINCIPAL
// ==========================

function executarHeroCredito() {

    const mensagens = document.querySelectorAll("span.selectable-text");
    let conversa = "";
    mensagens.forEach(m => conversa += m.innerText + "\n");

    if (!conversa.toLowerCase().includes("valor do imóvel")) {

        inserirTexto(
`💰 Vamos simular seu potencial de compra?

Envie:

• Valor do imóvel  
• Entrada  
• Renda bruta mensal  
• Prazo (anos)  
• Sistema: SAC ou PRICE`
        );
        return;
    }

    const dados = extrairDados(conversa);

    if (!dados.valor || !dados.entrada || !dados.renda || !dados.prazo) {
        inserirTexto("⚠️ Ainda faltam informações para calcular. Verifique os dados enviados.");
        return;
    }

    const financiado = dados.valor - dados.entrada;
    const taxaAnual = 0.095;
    const meses = dados.prazo * 12;

    let resultado = `💰 Simulação estimada (${dados.sistema})

Valor financiado: R$ ${financiado.toFixed(2)}
`;

    let parcela;
    let comprometimento;

    if (dados.sistema === "PRICE") {
        parcela = calcularPrice(financiado, taxaAnual, meses);
        comprometimento = (parcela / dados.renda) * 100;

        resultado += `
Parcela fixa: R$ ${parcela.toFixed(2)}
Comprometimento de renda: ${comprometimento.toFixed(1)}%
`;
    } else {
        const sac = calcularSAC(financiado, taxaAnual, meses);
        parcela = sac.primeira;
        comprometimento = (sac.primeira / dados.renda) * 100;

        resultado += `
Parcela inicial: R$ ${sac.primeira.toFixed(2)}
Parcela final: R$ ${sac.ultima.toFixed(2)}
Comprometimento de renda: ${comprometimento.toFixed(1)}%
`;
    }

    const limite = parcelaMaxima(dados.renda);

    if (parcela > limite) {

        const alternativa = encontrarPrazoIdeal(financiado, dados.renda, taxaAnual);

        if (alternativa) {
            resultado += `
📌 Ajuste Estratégico Automático:

Para manter até 30% da renda,
o prazo ideal seria ${alternativa.anos} anos.

Nova parcela estimada:
R$ ${alternativa.parcela.toFixed(2)}
`;
        } else {
            resultado += `
⚠️ Mesmo com prazo máximo, a parcela ultrapassa 30%.
Pode ser necessário aumentar entrada.
`;
        }
    }

    resultado += `
⚠️ Estimativa sujeita à análise do banco. Taxas e CET podem variar.
`;

    inserirTexto(resultado);
}

// ==========================
// INTEGRAÇÃO AO BOTÃO
// ==========================

function integrarAoBotaoRascunho() {
    const botoes = document.querySelectorAll("button");

    botoes.forEach(b => {
        if (b.innerText.includes("Gerar rascunho") &&
            !document.getElementById("heroCreditoInline")) {

            const novo = document.createElement("button");
            novo.id = "heroCreditoInline";
            novo.innerText = "💰 Crédito";
            novo.onclick = executarHeroCredito;

            b.parentNode.appendChild(novo);
        }
    });
}

// ==========================
// CHIPS
// ==========================

function criarChips() {
    if (document.getElementById("heroChips")) return;

    const container = document.createElement("div");
    container.id = "heroChips";

    ["SAC", "PRICE"].forEach(tipo => {
        const chip = document.createElement("button");
        chip.innerText = tipo;
        chip.className = "heroChip";

        chip.onclick = () => inserirTexto(`Sistema: ${tipo}`);

        container.appendChild(chip);
    });

    document.body.appendChild(container);
}

// ==========================
// LOOP DE INICIALIZAÇÃO
// ==========================

setInterval(() => {
    integrarAoBotaoRascunho();
    criarChips();
}, 3000);