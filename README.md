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
- `src/modules/academies`: catalogo das academias, parser de preco e Selenium
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
Agora cada academia salva tambem a lista de planos detectados com nome do plano, preco principal, promocao, fidelidade e beneficios.

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
