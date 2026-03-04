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
