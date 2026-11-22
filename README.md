This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Safe Directions (`/home/directions`)

Fastest-vs-safest routing for Delhi NCR. It needs two extra pieces next to the
Next.js app: a Python analysis pipeline (run once) and a local GraphHopper
routing server. Background and design: [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md).

**One-time setup** (Windows; Java 21 and uv via winget, then open a new terminal):

```bash
winget install EclipseAdoptium.Temurin.21.JRE astral-sh.uv
npm run safety:setup     # Python 3.13 env for scripts/safety
npm run safety:build     # download OSM (~550 MB) → analyse → tag → export → calibrate  (~6 min)
npm run gh:jar           # GraphHopper 11.1 jar from Maven Central, checksum-verified
npm run gh:import        # build the routing graph with the risk model  (~22 min)
```

**Every session:** `npm run gh:start` (routing engine on :8989), then `npm run dev`.

| Command | What it does |
|---|---|
| `npm run safety:build -- analyze export calibrate` | Re-run individual pipeline steps |
| `npm run safety:test` | Pipeline unit tests (pytest) |
| `npm run safety:bench` | 200 random NCR trips against the API: latency and route trade-offs |
| `npx playwright test e2e/safety` | Unit, API and UI tests (API/UI skip if the engine is down) |

All weights live in `config/safety-model.json`. After changing it, run
`npm run safety:build` **and** `npm run gh:import`; the page shows a "data out of
date" banner until both have run. `npm run safety:build` fails if calibration
against `config/safety-checkpoints.json` regresses.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
