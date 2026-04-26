import { env } from "../../config/env.js";
import type { ScrapeProgressEvent } from "../academies/types.js";
import type { AppDatabase, GymPlanState } from "../storage/schema.js";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: env.APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
};

const normalizeLegacyText = (value: string): string => {
  return value
    .replaceAll("Preco", "Preço")
    .replaceAll("preco", "preço")
    .replaceAll("concluida", "concluída")
    .replaceAll("concluido", "concluído")
    .replaceAll("nao", "não");
};

const formatDateTime = (value: string | null | undefined, fallback = "Nunca"): string => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return dateTimeFormatter.format(date).replace(",", "");
};

const formatTriggerLabel = (value: string | null): string => {
  if (!value) {
    return "Não informado";
  }

  if (value.startsWith("telegram:")) {
    return "Telegram";
  }

  if (value.startsWith("api:")) {
    return `API (${value.slice(4) || "manual"})`;
  }

  if (value === "cli") {
    return "Terminal";
  }

  if (value === "scheduler") {
    return "Agendamento";
  }

  if (value === "startup") {
    return "Inicialização";
  }

  return value;
};

const formatOverallStatus = (value: AppDatabase["status"]["lastRunStatus"]): string => {
  if (value === "success") {
    return "Sucesso";
  }

  if (value === "partial") {
    return "Parcial";
  }

  if (value === "error") {
    return "Falha";
  }

  if (value === "running") {
    return "Em execução";
  }

  return "Nunca executado";
};

const formatResultStatus = (value: string): string => {
  if (value === "success") {
    return "Sucesso";
  }

  if (value === "partial") {
    return "Parcial";
  }

  if (value === "error") {
    return "Falha";
  }

  if (value === "ok") {
    return "OK";
  }

  return value;
};

const formatGymBadge = (value: "unknown" | "ok" | "error"): string => {
  if (value === "ok") {
    return "✅";
  }

  if (value === "error") {
    return "⚠️";
  }

  return "⏳";
};

const formatPlanHighlight = (
  currentPlanName: string | null | undefined,
  currentPrice: string | null | undefined,
  fallback = "sem preço em destaque"
): string => {
  if (currentPlanName && currentPrice) {
    return `<b>${escapeHtml(currentPlanName)}</b> — <b>${escapeHtml(currentPrice)}</b>`;
  }

  if (currentPrice) {
    return `<b>${escapeHtml(currentPrice)}</b>`;
  }

  return fallback;
};

const formatScrapeStep = (index: number, total: number): string => {
  return `<b>${index}/${total}</b>`;
};

const truncateText = (value: string, limit = 180): string => {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1)}…`;
};

const parsePriceValue = (value: string | null): number => {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const sortPlansByPrice = (plans: GymPlanState[]): GymPlanState[] => {
  return [...plans].sort((left, right) => {
    return parsePriceValue(left.headlinePrice) - parsePriceValue(right.headlinePrice);
  });
};

const summarizePlan = (plan: GymPlanState): string => {
  const summary = [plan.headlinePrice, plan.commitment].filter(Boolean).join(" • ");
  const promo = plan.promotionalText ? `Promoção: ${plan.promotionalText}` : null;
  const fees = [plan.enrollmentFee ? `Matrícula: ${plan.enrollmentFee}` : null, plan.annualFee ? `Anuidade: ${plan.annualFee}` : null]
    .filter(Boolean)
    .join(" • ");
  const benefits =
    plan.benefits.length > 0 ? `Benefícios: ${plan.benefits.slice(0, 3).join(", ")}` : null;

  return [
    `• <b>${escapeHtml(plan.name)}</b>${summary ? ` — ${escapeHtml(summary)}` : ""}`,
    promo ? `  ${escapeHtml(promo)}` : null,
    fees ? `  ${escapeHtml(fees)}` : null,
    benefits ? `  ${escapeHtml(benefits)}` : null
  ]
    .filter(Boolean)
    .join("\n");
};

export const formatWelcomeMessage = (publicApiUrl: string | null, localApiUrl: string): string => {
  const lines = [
    "<b>🤖 Robô de Academias</b>",
    "Acompanhe preços, planos e a saúde do monitor por aqui."
  ];

  if (publicApiUrl) {
    lines.push(`API pública: <code>${escapeHtml(publicApiUrl)}</code>`);
  } else {
    lines.push(`API local neste computador: <code>${escapeHtml(localApiUrl)}</code>`);
  }

  lines.push("Use os botões abaixo para navegar.");

  return lines.join("\n");
};

export const formatPricesMessage = (database: AppDatabase): string => {
  const sections = database.gyms.map((gym) => {
    const primaryLine =
      gym.currentPrice && gym.currentPlanName
        ? `Principal: <b>${escapeHtml(gym.currentPlanName)}</b> — <b>${escapeHtml(gym.currentPrice)}</b>`
        : gym.currentPrice
          ? `Principal: <b>${escapeHtml(gym.currentPrice)}</b>`
          : "Principal: <i>sem preço coletado</i>";
    const plans =
      gym.plans.length > 0
        ? sortPlansByPrice(gym.plans).map(summarizePlan).join("\n")
        : "• Nenhum plano detalhado foi identificado.";

    return [
      `<b>${formatGymBadge(gym.status)} ${escapeHtml(gym.name)}</b>`,
      primaryLine,
      `Atualizado em: <code>${escapeHtml(formatDateTime(gym.lastSuccessfulCheckAt, "Nunca"))}</code>`,
      plans
    ].join("\n");
  });

  return [`<b>💸 Planos e Preços</b>`, ...sections].join("\n\n");
};

export const formatDashboardMessage = (database: AppDatabase, running: boolean): string => {
  const gymHealth = database.gyms
    .map((gym) => {
      return `${formatGymBadge(gym.status)} ${escapeHtml(gym.name)} — ${escapeHtml(formatDateTime(gym.lastSuccessfulCheckAt, "Nunca"))}`;
    })
    .join("\n");

  return [
    "<b>📊 Dashboard do Robô</b>",
    "",
    "<b>Estado Atual</b>",
    `• Em execução: <b>${running ? "Sim" : "Não"}</b>`,
    `• Último status: <b>${escapeHtml(formatOverallStatus(database.status.lastRunStatus))}</b>`,
    `• Última execução: <code>${escapeHtml(formatDateTime(database.status.lastRunAt, "Nunca"))}</code>`,
    `• Último gatilho: <b>${escapeHtml(formatTriggerLabel(database.status.lastTrigger))}</b>`,
    "",
    "<b>Resumo</b>",
    `• Execuções com sucesso: <b>${database.status.successfulRuns}</b>`,
    `• Execuções parciais: <b>${database.status.partialRuns}</b>`,
    `• Execuções com falha: <b>${database.status.failedRuns}</b>`,
    `• Total de execuções: <b>${database.status.totalRuns}</b>`,
    "",
    "<b>Saúde das Fontes</b>",
    gymHealth
  ].join("\n");
};

export const formatLogsMessage = (database: AppDatabase): string => {
  if (database.logs.length === 0) {
    return "<b>🧾 Logs</b>\n\nNenhum evento relevante foi registrado ainda.";
  }

  const contextLabels: Record<string, string> = {
    executionId: "Execução",
    trigger: "Origem",
    status: "Status",
    successfulGyms: "Sucessos",
    failedGyms: "Falhas",
    gymId: "Academia",
    planName: "Plano",
    price: "Preço",
    planCount: "Planos",
    sourceHint: "Fonte",
    error: "Erro",
    screenshotPath: "Screenshot"
  };
  const formatContextValue = (key: string, value: unknown): string => {
    if (key === "status") {
      return formatResultStatus(String(value));
    }

    if (key === "trigger") {
      return formatTriggerLabel(String(value));
    }

    if (key === "gymId") {
      if (String(value) === "smartfit") {
        return "Smart Fit";
      }

      if (String(value) === "bluefit") {
        return "Bluefit";
      }
    }

    return normalizeLegacyText(String(value));
  };

  const entries = database.logs.slice(-5).reverse().map((entry) => {
    const context = entry.context
      ? Object.entries(entry.context)
          .map(([key, value]) => `${contextLabels[key] ?? key}: ${formatContextValue(key, value)}`)
          .join(" | ")
      : null;

    return [
      `• <b>${escapeHtml(formatDateTime(entry.timestamp))}</b> — <b>${escapeHtml(entry.level.toUpperCase())}</b>`,
      escapeHtml(normalizeLegacyText(entry.message)),
      context ? `<code>${escapeHtml(context)}</code>` : null
    ]
      .filter(Boolean)
      .join("\n");
  });

  return ["<b>🧾 Logs</b>", ...entries].join("\n\n");
};

export const formatScrapeProgressMessage = (event: ScrapeProgressEvent): string => {
  if (event.type === "queued_existing_run") {
    return [
      "<b>⏳ Varredura já em andamento</b>",
      "Já existe uma coleta rodando neste momento.",
      "Vou acompanhar essa execução por aqui e te avisar assim que houver novas etapas."
    ].join("\n");
  }

  if (event.type === "started") {
    return [
      "<b>🚀 Varredura iniciada</b>",
      `Início: <code>${escapeHtml(formatDateTime(event.startedAt, "Agora"))}</code>`,
      `Academias na fila: <b>${event.gymCount}</b>`,
      "O navegador está sendo preparado para começar a coleta."
    ].join("\n");
  }

  if (event.type === "gym_started") {
    return [
      "<b>🔎 Coletando dados</b>",
      `Etapa atual: ${formatScrapeStep(event.index, event.total)}`,
      `Academia: <b>${escapeHtml(event.gymName)}</b>`,
      "O robô está navegando no site e identificando os planos desta etapa."
    ].join("\n");
  }

  if (event.type === "gym_finished") {
    const lines = [
      event.status === "ok" ? "<b>✅ Etapa concluída</b>" : "<b>⚠️ Etapa com falha</b>",
      `Etapa atual: ${formatScrapeStep(event.index, event.total)}`,
      `Academia: <b>${escapeHtml(event.gymName)}</b>`
    ];

    if (event.status === "ok") {
      lines.push(`Plano em destaque: ${formatPlanHighlight(event.currentPlanName, event.currentPrice)}`);
      lines.push(`Planos encontrados: <b>${event.planCount}</b>`);

      if (event.index < event.total) {
        lines.push(`Próxima etapa: ${formatScrapeStep(event.index + 1, event.total)}`);
      } else {
        lines.push("Todas as academias desta execução já foram visitadas.");
      }

      return lines.join("\n");
    }

    lines.push("Não foi possível coletar os dados desta academia nesta tentativa.");

    if (event.errorMessage) {
      lines.push(`<code>${escapeHtml(truncateText(event.errorMessage))}</code>`);
    }

    if (event.index < event.total) {
      lines.push(`Seguindo para a próxima etapa: ${formatScrapeStep(event.index + 1, event.total)}`);
    }

    return lines.join("\n");
  }

  return [
    "<b>🧾 Montando o resumo final</b>",
    `Encerrada em: <code>${escapeHtml(formatDateTime(event.finishedAt, "Agora"))}</code>`,
    `Status final: <b>${escapeHtml(formatResultStatus(event.status))}</b>`,
    `Sucessos: <b>${event.successfulGyms}</b>`,
    `Falhas: <b>${event.failedGyms}</b>`,
    "Estou organizando os detalhes para te enviar logo abaixo."
  ].join("\n");
};

export const formatSummaryMessage = (summary: {
  status: string;
  successfulGyms: number;
  failedGyms: number;
  finishedAt?: string | null;
  results: Array<{
    gymName: string;
    currentPrice: string | null;
    currentPlanName: string | null;
    plans?: GymPlanState[];
    status: string;
  }>;
  reusedExistingRun: boolean;
}): string => {
  const details = summary.results.map((result) => {
    const sortedPlans = result.plans && result.plans.length > 0 ? sortPlansByPrice(result.plans) : [];
    const cheapestPlan = sortedPlans.find((plan) => plan.headlinePrice) ?? null;
    const highlightedPlan =
      result.currentPlanName && result.currentPrice
        ? `${result.currentPlanName} — ${result.currentPrice}`
        : result.currentPrice ?? "sem preço";

    const planLines =
      sortedPlans.length > 0
        ? sortedPlans
            .map((plan) => {
              const planSummary = [plan.headlinePrice, plan.commitment].filter(Boolean).join(" • ");
              return `  • ${escapeHtml(plan.name)}${planSummary ? ` — ${escapeHtml(planSummary)}` : ""}`;
            })
            .join("\n")
        : "  • Nenhum plano detalhado encontrado.";

    return [
      `• <b>${escapeHtml(result.gymName)}</b> [${escapeHtml(formatResultStatus(result.status))}]`,
      cheapestPlan
        ? `  Menor preço encontrado: <b>${escapeHtml(cheapestPlan.name)}</b> — <b>${escapeHtml(cheapestPlan.headlinePrice ?? "sem preço")}</b>`
        : null,
      `  Plano em destaque no site: ${escapeHtml(highlightedPlan)}`,
      planLines
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    summary.reusedExistingRun ? "<b>⏳ Já havia uma varredura em andamento.</b>" : "<b>✅ Varredura concluída.</b>",
    `Finalizada em: <code>${escapeHtml(formatDateTime(summary.finishedAt ?? null, "Agora"))}</code>`,
    `Status final: <b>${escapeHtml(formatResultStatus(summary.status))}</b>`,
    `Sucessos: <b>${summary.successfulGyms}</b>`,
    `Falhas: <b>${summary.failedGyms}</b>`,
    "",
    ...details
  ].join("\n");
};
