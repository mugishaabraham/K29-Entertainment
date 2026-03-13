# K29 Entertainment (Full-Stack News + Admin)

Professional news website with:
- Public homepage with featured and latest stories
- Category subpages (`/category.html?category=...`)
- Full article subpages (`/article.html?id=...`)
- Protected admin panel (`/admin.html`) for create/edit/delete stories
- Image support and optional video URL support (YouTube embed or MP4)
- Reserved ad spaces for monetization
- Kigali live clock and animated background

## Run locally

```bash
npm start
```

Open:
- `http://localhost:3000/` (homepage)
- `http://localhost:3000/admin-login.html` (admin login)

## Admin credentials

Local default:
- Username: `k29`
- Password: `gisenyi@12`

Production (recommended):
- Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in your hosting environment.
- Do not use the default credentials in production.

## Environment variables

Create a `.env` (or set in hosting dashboard):

```bash
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_strong_password
NODE_ENV=production
PORT=3000
```

An example file is provided at `.env.example`.

## API endpoints

Public:
- `GET /api/categories`
- `GET /api/news?category=all&q=`
- `GET /api/news/:id`

Admin auth:
- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/admin/logout`

Protected write endpoints (require login):
- `POST /api/news`
- `PUT /api/news/:id`
- `DELETE /api/news/:id`

## Admin panel usage

1. Open `/admin-login.html`
2. Sign in with admin credentials
3. Go to `/admin.html` and create/edit/delete stories
4. Add image URL and optional video URL

Data is persisted in `data/articles.json`.

## Deploy on Cloudflare Pages

This repo now includes Cloudflare Pages Functions:
- `functions/api/[[path]].js` for `/api/*`
- `functions/uploads/[[path]].js` for `/uploads/*`
- `functions/_lib/cloudflare-backend.js` shared API logic

### 1. Create KV namespaces

In Cloudflare dashboard:
1. Go to `Workers & Pages` -> `KV`.
2. Create one namespace for app data. Example name: `K29_DATA`.
3. Create one namespace for sessions. Example name: `K29_SESSIONS`.

### 2. Bind KV + env vars to your Pages project

In your Pages project settings:
1. Open `Settings` -> `Functions` -> `KV namespace bindings`.
2. Add:
   - Binding: `K29_DATA` -> namespace: your `K29_DATA`
   - Binding: `K29_SESSIONS` -> namespace: your `K29_SESSIONS`
3. Open `Settings` -> `Environment variables` and set:
   - `ADMIN_USERNAME=your_admin_username`
   - `ADMIN_PASSWORD=your_strong_password`
   - `NODE_ENV=production`

### 3. Deploy

Deploy this repo root (not only `public/`).

Cloudflare will serve static files from `public/` and run Functions from `functions/`.

### 4. Verify

After deploy, test:
- `https://<your-domain>/api/categories` returns JSON.
- Login at `/admin-login.html` works.
- Upload image from admin panel works (stored in KV and served from `/uploads/...`).
