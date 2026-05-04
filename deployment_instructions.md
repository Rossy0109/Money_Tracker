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

## 🗄️ Supabase (Database)
The application uses Supabase as its primary PostgreSQL data store.

1. Create a new project on [Supabase](https://supabase.com/).
2. Go to the **SQL Editor** and paste the contents of `supabase_schema.sql` to initialize your tables and security rules.
3. Retrieve your **Project URL** and **Service Role/Anon Key** from Project Settings > API.
4. Add these as `SUPABASE_URL` and `SUPABASE_KEY` in your Vercel or Render environment variables.

---

## 🛡️ Long-Term Sustainability (7-10 Year Roadmap)
This project is architected for maximum longevity on free-tier infrastructure.

### 1. Data Sovereignty (Backups)
- **Automatic**: Use the built-in "Backup as JSON" feature in the data management section regularly.
- **Manual**: Periodically export your Supabase tables as CSV from the dashboard.

### 2. Infrastructure Resilience
- **Database**: PostgreSQL is the industry standard. If Supabase ever changes its pricing, your data is 100% portable to any other PostgreSQL provider (Neon, DigitalOcean, or self-hosted).
- **Frontend**: The React client uses standard Web APIs. It can be hosted on GitHub Pages (for free) if Vercel ever limits its features.
- **Backend**: The Flask API is lightweight and container-ready. It can move to any Linux-based VPS or serverless provider (AWS Lambda, Google Cloud Run) with minimal changes.

### 3. Maintenance
- **Dependencies**: Keep `package.json` and `requirements.txt` updated. The project uses a **Python 3.13 compatibility patch** to ensure it works on the latest runtimes.
- **Zero-Touch**: Once deployed, the app will run indefinitely as long as your API keys are active.
