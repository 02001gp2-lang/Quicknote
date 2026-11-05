# Quicknote

PWA de notas — Node.js + Express + PostgreSQL (Render). Front-end em HTML, CSS e JavaScript puros.

## Estrutura

```
quicknote/
├── server.js                 API (/api/notebooks, /api/notes), /healthz e arquivos estáticos
├── package.json
├── render.yaml               Blueprint do Render (banco + serviço web)
└── public/                   tudo que o navegador recebe
    ├── index.html            interface e estilos
    ├── app.js                lógica do app
    ├── sw.js                 service worker (cache offline do shell)
    ├── favicon.ico           fallback para navegadores antigos (16/32/48)
    ├── manifest.webmanifest  manifest padrão (tema base: claro)
    ├── manifest-claro.webmanifest
    ├── manifest-escuro.webmanifest
    └── icons/
        ├── icon.svg · favicon.svg          vetor (aba do navegador e ícone "any")
        ├── favicon-16.png · favicon-32.png abas
        ├── apple-touch-icon.png            iOS (180×180)
        ├── icon-192.png · icon-512.png     Android/desktop ("any")
        └── icon-maskable-512.png           Android adaptativo (conteúdo na zona segura)
```

## Manifests — função de cada um

| Arquivo | Quando é usado | Cores |
|---|---|---|
| `manifest.webmanifest` | Padrão no HTML; vale se o JavaScript ainda não rodou | claro (`#FFFFFF`) |
| `manifest-claro.webmanifest` | O `index.html` aponta para ele quando o app está no tema claro | `#FFFFFF` |
| `manifest-escuro.webmanifest` | Idem, no tema escuro | `#141414` |

Os três têm o mesmo `id` (`/`), então o navegador os trata como **um único app**; só mudam `theme_color` e
`background_color` (barra do sistema e tela de abertura). O link do manifest é trocado no carregamento e
ao alternar o tema, e o app instalado guarda as cores do tema ativo **no momento da instalação**.
Todos incluem `shortcuts` (toque longo no ícone): **Nova nota** (`/?action=new-note`) e **Cadernos** (`/?view=notebooks`).

## Deploy no Render
1. Suba esta pasta para um repositório no GitHub (o `render.yaml` fica na raiz).
2. No Render: **New > Blueprint** e selecione o repositório.
3. O Render cria o PostgreSQL e o serviço web; as tabelas são criadas/migradas automaticamente na inicialização.
4. Abra a URL `https://…onrender.com` no celular e use **Instalar app / Adicionar à tela inicial**.

## Local
```
DATABASE_URL=postgres://… npm install && npm start
```
(`PGSSL=true` se o banco exigir SSL.)

## Ao alterar arquivos de `public/`
Incremente `CACHE` em `public/sw.js` (ex.: `quicknote-v6`) para o app instalado baixar a nova versão.

## Evitar que o Render "durma" (plano gratuito)
O serviço gratuito é suspenso após ~15 min sem requisições. Um ping externo a `/healthz` o mantém ativo:
- **UptimeRobot / cron-job.org (recomendado):** monitor HTTP em `https://SEU-APP.onrender.com/healthz`, a cada 5 min.
- **GitHub Actions (já incluído):** `.github/workflows/keep-alive.yml`. Defina a variável de repositório `APP_URL`
  e ative o workflow na aba Actions. O agendamento do GitHub pode atrasar e, em repositórios públicos, é pausado
  após 60 dias sem atividade.
- Um serviço 24h consome ~744 das 750 horas gratuitas do mês: serve para **um** serviço por conta.
