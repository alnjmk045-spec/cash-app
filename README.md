# CASH - quick start

1) Install dependencies

   npm install

2) Generate Prisma client

   npx prisma generate

3) Update .env (copy .env.example -> .env) if you want to override defaults

4) Apply database migrations (creates dev.db)

   npx prisma migrate dev --name init

5) Seed demo/admin users (optional)

   npm run seed

6) Start the server

   npm start

Open http://localhost:3001

Notes:
- The frontend is now in public/index.html and the app is PWA-capable (see manifest).
- For production: set a strong JWT_SECRET and run behind HTTPS. Do not keep seeded passwords in production.
