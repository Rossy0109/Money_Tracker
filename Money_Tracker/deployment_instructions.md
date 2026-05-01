# 🚀 Deployment Instructions

The Money Tracker is designed to be deployed on **Vercel** or **Render**.

## 🔼 Vercel (Recommended)
This project includes a `vercel.json` for a seamless full-stack deployment.

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project root.
3. Add the following Environment Variables in the Vercel Dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `REACT_APP_API_URL` (Point to your Vercel deployment URL)

## ☁️ Render
Use `render.yaml` to deploy as a Web Service.

1. Connect your GitHub repository to Render.
2. Render will automatically detect `render.yaml` and prompt for environment variables.
3. Ensure `PYTHON_VERSION` is set to `3.9.0` or higher.

## 📦 Docker
Run the entire stack using Docker Compose:
```bash
docker-compose up --build
```
This will spin up:
- **Client**: Port 3001
- **Server**: Port 5000
