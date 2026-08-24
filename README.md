# LearnAI

Next.js app in `web/`.

## How to run

1. Install [Node.js](https://nodejs.org/) and [PostgreSQL](https://www.postgresql.org/download/). Create a database (the default name in `.env.example` is `v2holoroid`):

```sql
CREATE DATABASE v2holoroid;
```

2. From the repo root:

```bash
cd web
cp .env.example .env
```

3. Edit `web/.env` and set `DATABASE_URL` to your PostgreSQL connection string (and any API keys you need). See comments in `.env.example`.

Example:

```
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/v2holoroid"
```

4. Install dependencies, create tables, and import data from the MySQL dump:

```bash
npm install
npm run db:setup:pg
```

This runs `prisma db push` and loads data from `prisma/data/v2holoroid.mysql.sql`.

For a fresh dev database with seed data only (no dump import), use:

```bash
npm run db:setup
```

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For production: `npm run build` then `npm start`.