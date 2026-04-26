# Installation & Setup

## Prerequisites

| Requirement | Version |
| :--- | :--- |
| Node.js | 22+ |
| npm | 9+ |
| API key | Any supported provider |

## Install

```bash
git clone https://github.com/yellatp/rattle-snake.git
cd rattle-snake
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Build for production

```bash
npm run build     # outputs to ./dist/
npm run preview   # preview the production build locally
```

The build is fully static — deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

## Add an API key

1. Open **Settings** in the sidebar
2. Paste your key for any supported provider
3. Click **Test Connection** — if it shows "Connected", click **Set as Active**

Keys are stored only in your browser's `localStorage`. They are never sent to any Rattle-Snake server.

## Contributing

See [CONTRIBUTORS.md](../CONTRIBUTORS.md) for how to add a new provider, a new role template, or report a bug.
