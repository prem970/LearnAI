# LearnAI

Next.js app in `web/`.

## How to run

1. Install [Node.js](https://nodejs.org/) and MySQL. Create a database (the default name in `.env.example` is `v2holoroid`).
2. From the repo root:

```bash
cd web
cp .env.example .env
```

3. Edit `web/.env` and set `DATABASE_URL` (and any API keys you need). See comments in `.env.example`.
4. Install dependencies, create tables, and seed:

```bash
npm install
npm run db:setup
```

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For production: `npm run build` then `npm start`.

Try it