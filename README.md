# Robo Academias

Monitor local de precos de academias com:

- Selenium para scraping
- API HTTP para status e disparo manual
- Bot do Telegram com botoes
- Banco local em JSON
- Agendamento por cron

## O que foi montado

O projeto foi estruturado em camadas para evitar virar um unico `index.js` dificil de manter:

- `src/config`: leitura e validacao das variaveis de ambiente
- `src/modules/storage`: persistencia local em `data/db.json`
- `src/modules/academies`: arquivos de scraping por academia e Selenium
- `src/modules/monitor`: caso de uso principal e agendamento
- `src/modules/api`: API HTTP
- `src/modules/telegram`: interface do bot

## Fontes configuradas

Em 26/04/2026:

- Smart Fit: `https://www.smartfit.com.br/planos`
- Bluefit: `https://www.bluefit.com.br/unidade/aclimacao`

Observacao: a Bluefit nao estava respondendo em `https://www.bluefit.com.br/planos` nessa data. Como os valores podem variar por unidade, troque `BLUEFIT_SOURCE_URL` no `.env` para a unidade que fizer mais sentido para voce.

## Como rodar

1. Preencha o `TELEGRAM_BOT_TOKEN` no arquivo `.env`.
2. Se quiser restringir quem usa o bot, preencha `TELEGRAM_ALLOWED_CHAT_IDS` com IDs separados por virgula.
3. Instale o Google Chrome se ele ainda nao estiver instalado.
4. Rode:

```bash
npm run dev
```

Para build de producao:

```bash
npm run build
npm start
```

Para executar somente uma varredura e encerrar:

```bash
npm run scrape:once
```

## Modo visual do Chrome

Se voce quiser ver o robo abrindo o navegador de verdade, ajuste no `.env`:

```txt
SCRAPER_SHOW_BROWSER=true
SCRAPER_STEP_DELAY_MS=1200
```

Com isso o Chrome abre visivelmente e o robo faz pequenas pausas entre as etapas para ficar mais facil de acompanhar.

## Como rodar o scraping

Voce tem 4 jeitos de usar o scraping:

1. Rodar uma unica vez no terminal:

```bash
npm run scrape:once
```

2. Subir o projeto inteiro em modo desenvolvimento:

```bash
npm run dev
```

Com isso, ficam ativos ao mesmo tempo:

- API local em `http://localhost:3000`
- bot do Telegram
- agendamento automatico definido em `SCRAPE_SCHEDULE`

3. Disparar pelo Telegram depois que o projeto estiver rodando:

- `/varrer`
- ou o botao `Forcar varredura`

4. Disparar pela API local:

```bash
curl -X POST http://localhost:3000/api/scrape ^
  -H "Content-Type: application/json" ^
  -d "{\"trigger\":\"manual\"}"
```

O resultado mais recente fica salvo em `data/db.json`.
Agora cada academia salva tambem a lista de planos detectados com nome do plano, preco principal e mensalidade ou periodicidade quando essa informacao aparece no site.

## Como adicionar uma nova academia

Hoje o jeito mais simples de adicionar outra academia e seguir o mesmo padrao de `smartfit-site.ts` e `bluefit-site.ts`.

1. Crie um novo arquivo em `src/modules/academies`, por exemplo `panobianco-site.ts`.

2. Dentro dele, exporte:

- um objeto da academia, como `panobiancoGym`
- uma funcao de scraping, como `scrapePanobianco`

Exemplo:

```ts
import { By, type WebDriver } from "selenium-webdriver";

import { env } from "../../config/env.js";
import type { GymDefinition, GymPlan, GymScrapeData } from "./types.js";

export const panobiancoGym: GymDefinition = {
  id: "panobianco",
  name: "Panobianco",
  sourceUrl: env.PANOBIANCO_SOURCE_URL
};

export const scrapePanobianco = async (driver: WebDriver): Promise<GymScrapeData> => {
  const xpaths = [
    {
      title: "SEU_XPATH_DO_TITULO_1",
      price: "SEU_XPATH_DO_PRECO_1",
      monthly: "SEU_XPATH_DA_MENSALIDADE_1"
    }
  ];

  const plans: GymPlan[] = [];
  const detectedPrices: string[] = [];

  for (const item of xpaths) {
    const title = (await driver.findElement(By.xpath(item.title)).getText()).trim();
    const price = (await driver.findElement(By.xpath(item.price)).getText()).trim();
    const monthly = (await driver.findElement(By.xpath(item.monthly)).getText()).trim();

    if (price) {
      detectedPrices.push(price);
    }

    plans.push({
      name: title,
      headlinePrice: price || null,
      pricePeriod: monthly || null
    });
  }

  return {
    currentPrice: plans[0]?.headlinePrice ?? null,
    currentPlanName: plans[0]?.name ?? null,
    detectedPrices,
    plans,
    sourceHint: "xpath:panobianco"
  };
};
```

3. Adicione o novo `id` em `src/modules/academies/types.ts`.

Exemplo:

```ts
export type GymId = "smartfit" | "bluefit" | "panobianco";
```

4. Adicione a URL da nova academia em `src/config/env.ts`, `.env` e `.env.example`.

Exemplo:

```txt
PANOBIANCO_SOURCE_URL=https://site-da-academia.com/planos
```

5. Importe a nova academia em `src/app/create-application.ts` e inclua no array:

```ts
const gyms = [smartFitGym, bluefitGym, panobiancoGym];
```

6. Importe a funcao e o objeto em `src/modules/academies/selenium-price-scraper.ts` e adicione mais um caso na escolha do scraper:

```ts
const scrapeGym =
  gym.id === smartFitGym.id
    ? scrapeSmartFit
    : gym.id === bluefitGym.id
      ? scrapeBluefit
      : gym.id === panobiancoGym.id
        ? scrapePanobianco
        : null;
```

7. Rode uma varredura de teste:

```bash
npm run scrape:once
```

Se a nova academia entrou no array `gyms` e o `selenium-price-scraper.ts` souber chamar o scraper dela, ela passa a aparecer automaticamente na API, no Telegram e no `data/db.json`.

## Endpoints da API

- `GET /health`
- `GET /api/overview`
- `GET /api/gyms`
- `GET /api/logs`
- `POST /api/scrape`

Se `API_AUTH_TOKEN` estiver preenchido, envie o header `x-api-token`.

Exemplo de disparo manual:

```bash
curl -X POST http://localhost:3000/api/scrape ^
  -H "Content-Type: application/json" ^
  -d "{\"trigger\":\"manual\"}"
```

## Comandos do Telegram

- `/start`
- `/precos`
- `/status`
- `/logs`
- `/varrer`

## Observacoes importantes

- Os sites podem mudar layout e seletores. O scraper foi montado com estrategia por texto e fallback para reduzir fragilidade, mas ajustes futuros ainda podem ser necessarios.
- Os precos da Bluefit podem mudar por unidade.
- Em falhas de scraping, o robo salva screenshot em `data/screenshots/`.
- Quando `APP_BASE_URL` aponta para `localhost`, o Telegram nao recebe botao de link para a API, porque o app do Telegram rejeita URL local em inline keyboard.
- Se aparecer algum aviso do Chrome sobre GPU, media ou video, em geral isso e um warning do Chromium e nao um erro fatal do scraping. Mesmo assim, o projeto agora sobe o Chrome com flags extras para reduzir esse ruido.

## Validacoes feitas

- `npx tsc --noEmit`
- `npm run build`
- inicializacao do contexto da aplicacao
- subida da API e teste do endpoint `/health`
