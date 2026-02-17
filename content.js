const HERO_BUTTON_ID = "hero-simula-credito-button";
const TAXA_ANUAL = 0.095;
// Observers re-attach UI safely when WhatsApp re-renders the DOM
let observersStarted = false;

// ==========================
// DOM HELPERS
// ==========================

const formatarBRL = (valor) => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2
}).format(valor);

const localizarCampoMensagem = () => {
    const candidatos = Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab]'));
    const campo = candidatos.reverse().find((el) => el.isConnected && el.innerText !== undefined);
    return campo || null;
};

const inserirTextoNoInput = (texto) => {
    const campo = localizarCampoMensagem();
    if (!campo) return false;

    const conteudoAtual = campo.textContent?.trim();
    const combinado = conteudoAtual ? `${conteudoAtual}\n${texto}` : texto;

    campo.focus();
    campo.textContent = combinado;
    try {
        campo.dispatchEvent(new InputEvent("input", { bubbles: true, data: texto, inputType: "insertText" }));
    } catch (e) {
        campo.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return true;
};

const coletarConversa = () => {
    const textos = [];
    const selectors = [
        "span.selectable-text",
        "div[role='row'] span[dir='auto']",
        "div[role='row'] span[dir='ltr']",
        "div.message-in span[dir]",
        "div.message-out span[dir]"
    ];

    document.querySelectorAll(selectors.join(","))
        .forEach((n) => {
            const t = n.innerText?.trim();
            if (t) textos.push(t);
        });

    return textos.join("\n");
};

// ==========================
// PARSING
// ==========================

function normalizarNumero(texto) {
    if (!texto) return null;

    const lower = texto
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const numeroMatch = lower.match(/(\d[\d.,]*)/);
    if (!numeroMatch) return null;
    let numerico = numeroMatch[1];

    let multiplicador = 1;
    if (/(^|\s)milhao(s)?(\s|$)/.test(lower) || /(milh[ao]es)/.test(lower)) {
        multiplicador = 1_000_000;
    } else if (/(^|\s)mil(\s|$)/.test(lower)) {
        multiplicador = 1_000;
    }

    numerico = numerico.replace(/\./g, "");
    if (numerico.includes(",")) {
        const partes = numerico.split(",");
        numerico = `${partes.slice(0, -1).join("")}.${partes.slice(-1)}`;
    }

    const valor = parseFloat(numerico) * multiplicador;
    return Number.isFinite(valor) ? valor : null;
}

function extrairDados(conversa) {
    const linhas = conversa.split("\n");
    const dados = {
        valor: null,
        entrada: null,
        fgts: 0,
        renda: null,
        prazo: null,
        sistema: "PRICE",
        hasSac: false,
        hasPrice: false
    };

    linhas.forEach((linhaRaw) => {
        if (!linhaRaw) return;
        // Ignora timestamps tipo [14:35,...]
        if (/^\s*\[?\d{1,2}:\d{2}/.test(linhaRaw)) return;

        const linha = linhaRaw.trim();
        const lower = linha.toLowerCase();
        const entradaKeywords = ["entrada", "cash", "sinal", "entrada disponivel", "disponivel para entrada", "disponível para entrada"];

        if (/im[oó]vel/.test(lower)) dados.valor = normalizarNumero(linha) ?? dados.valor;
        if (entradaKeywords.some((k) => lower.includes(k))) dados.entrada = normalizarNumero(linha) ?? dados.entrada;
        if (lower.includes("fgts")) {
            const fgts = normalizarNumero(linha);
            if (fgts !== null) dados.fgts = fgts;
        }
        if (lower.includes("renda")) dados.renda = normalizarNumero(linha) ?? dados.renda;
        if (lower.includes("prazo")) dados.prazo = normalizarNumero(linha) ?? dados.prazo;
        if (lower.includes("sac")) {
            dados.sistema = "SAC";
            dados.hasSac = true;
        }
        if (lower.includes("price")) {
            dados.sistema = "PRICE";
            dados.hasPrice = true;
        }
    });

    return dados;
}

const camposObrigatoriosPreenchidos = (dados) => (
    dados.valor !== null && dados.entrada !== null && dados.renda !== null && dados.prazo !== null
);

// ==========================
// CÁLCULOS
// ==========================

function calcularPrice(pv, taxaAnual, meses) {
    const i = taxaAnual / 12;
    return pv * ((i * Math.pow(1 + i, meses)) / (Math.pow(1 + i, meses) - 1));
}

function calcularSAC(pv, taxaAnual, meses) {
    const i = taxaAnual / 12;
    const amortizacao = pv / meses;
    const primeira = amortizacao + (pv * i);
    const saldoFinal = amortizacao;
    const ultima = amortizacao + (saldoFinal * i);
    return { primeira, ultima };
}

const parcelaMaxima = (renda) => renda * 0.3;

function encontrarPrazoIdeal(pv, renda, taxaAnual, sistema) {
    const limite = parcelaMaxima(renda);

    for (let anos = 10; anos <= 35; anos++) {
        const meses = anos * 12;
        const taxaMensal = taxaAnual / 12;

        const parcela = sistema === "SAC"
            ? (pv / meses) + (pv * taxaMensal)
            : calcularPrice(pv, taxaAnual, meses);

        if (parcela <= limite) {
            return { anos, parcela };
        }
    }

    return null;
}

// ==========================
// PRINCIPAL
// ==========================

function montarMensagemSolicitacao() {
    return `💰 Vamos simular seu potencial de compra?

Envie:

• Valor do imóvel
• Valor disponível para Entrada
• valor disponível FGTS
• Renda bruta mensal
• Prazo (anos) Desejado
• Idade do titular (e do cônjuge, se houver)
• Sistema: SAC ou PRICE`;
}

function montarResumoDados(dados, sistemas) {
    const listaSistemas = sistemas.join(" / ");
    return [
        "Dados do solicitante :",
        "",
        `• Valor do imóvel: ${formatarBRL(dados.valor)}`,
        `• Valor disponível para Entrada: ${formatarBRL(dados.entrada)}`,
        `• valor disponível FGTS: ${formatarBRL(dados.fgts || 0)}`,
        `• Renda bruta mensal: ${formatarBRL(dados.renda)}`,
        `• Prazo (anos) Desejado: ${dados.prazo} anos`,
        `• Sistemas solicitados: ${listaSistemas}`
    ].join("\n");
}

function montarBlocoSistema(sistema, parcela, comprometimento, financiado, ajuste, primeiraParcela, ultimaParcela) {
    let mensagem = `Valores da Simulação (${sistema}):

Valor financiado: ${formatarBRL(financiado)}
Taxa considerada: ${(TAXA_ANUAL * 100).toFixed(2)}% a.a.
Parcela: ${formatarBRL(parcela)}
1ª parcela estimada: ${formatarBRL(primeiraParcela)}
Última parcela estimada: ${formatarBRL(ultimaParcela)}
Comprometimento: ${comprometimento.toFixed(1)}%`;

    if (ajuste) {
        mensagem += `

📌 Ajuste Estratégico (auto)
Prazo ideal: ${ajuste.anos} anos
Nova parcela: ${formatarBRL(ajuste.parcela)}`;
    }

    return mensagem;
}

function executarHeroCredito() {
    const conversa = coletarConversa();
    const dados = extrairDados(conversa);

    if (!camposObrigatoriosPreenchidos(dados)) {
        inserirTextoNoInput(montarMensagemSolicitacao());
        return;
    }

    const financiado = Math.max(0, (dados.valor || 0) - (dados.entrada || 0) - (dados.fgts || 0));
    const meses = (dados.prazo || 0) * 12;

    if (!financiado || financiado <= 0 || !meses || meses <= 0) {
        inserirTextoNoInput(montarMensagemSolicitacao());
        return;
    }

    const sistemas = [];
    if (dados.hasSac) sistemas.push("SAC");
    if (dados.hasPrice) sistemas.push("PRICE");
    if (sistemas.length === 0) sistemas.push(dados.sistema || "PRICE");

    const mensagens = sistemas.map((sistema) => {
        const base = sistema === "SAC"
            ? calcularSAC(financiado, TAXA_ANUAL, meses)
            : { primeira: calcularPrice(financiado, TAXA_ANUAL, meses), ultima: calcularPrice(financiado, TAXA_ANUAL, meses) };

        const primeiraParcela = base.primeira;
        const ultimaParcela = base.ultima;
        const parcela = primeiraParcela;
        const comprometimento = (parcela / (dados.renda || 1)) * 100;
        const precisaAjuste = parcela > parcelaMaxima(dados.renda || 0);
        const ajuste = precisaAjuste ? encontrarPrazoIdeal(financiado, dados.renda, TAXA_ANUAL, sistema) : null;

        return montarBlocoSistema(
            sistema,
            ajuste ? ajuste.parcela : parcela,
            ajuste ? (ajuste.parcela / dados.renda) * 100 : comprometimento,
            financiado,
            ajuste,
            primeiraParcela,
            ultimaParcela
        );
    });

    const cabecalho = "💰 Simulação estimada";
    const resumo = montarResumoDados(dados, sistemas);
    const corpo = mensagens.join("\n\n");
    const aviso = "⚠️ Estimativa sujeita à análise do banco. Taxas e CET podem variar.";

    inserirTextoNoInput([cabecalho, "", resumo, "", corpo, "", aviso].join("\n"));
}

// ==========================
// INTEGRAÇÃO UI
// ==========================

function criarBotaoCredito(alvo) {
    if (!alvo || document.getElementById(HERO_BUTTON_ID)) return;

    const container = document.createElement("div");
    container.className = "hero-simula-credito-container";

    const botao = document.createElement("button");
    botao.id = HERO_BUTTON_ID;
    botao.type = "button";
    botao.innerHTML = '<span class="hero-btn-line">💰Simular</span><span class="hero-btn-line"><strong>Credito💰</strong></span>';
    botao.className = "hero-simula-credito-button";
    botao.addEventListener("click", executarHeroCredito);

    container.appendChild(botao);

    alvo.parentNode?.insertBefore(container, alvo);
}

function localizarBotaoRascunho() {
    return Array.from(document.querySelectorAll("button"))
        .find((btn) => btn.textContent?.trim().toLowerCase().includes("gerar rascunho"));
}

function garantirBotao() {
    const alvo = localizarBotaoRascunho();
    if (!document.getElementById(HERO_BUTTON_ID) && alvo) {
        criarBotaoCredito(alvo);
    }
}

function iniciarObservadores() {
    if (observersStarted) return;
    observersStarted = true;

    garantirBotao();

    const observer = new MutationObserver(() => {
        garantirBotao();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener("DOMContentLoaded", iniciarObservadores);
if (document.readyState === "complete" || document.readyState === "interactive") {
    iniciarObservadores();
}