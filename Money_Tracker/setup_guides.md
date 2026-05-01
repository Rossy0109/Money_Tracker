# 🛠️ Money Tracker Setup Guide

This guide will help you set up the Elite Money Tracker on your local machine.

## 📋 Prerequisites
- **Node.js** (v18+)
- **Python** (v3.9+)
- **Supabase Account**
- **Google Cloud Console** (for Google Drive Sync)

## 🗄️ Database Setup (Supabase)
1. Create a new project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** and paste the contents of `Money_Tracker/supabase_schema.sql`.
3. Run the script to create tables, indexes, and RLS policies.
4. Note your **Project URL** and **Anon/Secret Key** from the Project Settings -> API.

## 🐍 Backend Setup (Server)
1. Navigate to the server directory:
   ```bash
   cd Money_Tracker/server
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file based on `.env.example`:
   ```env
   SUPABASE_URL=your_project_url
   SUPABASE_KEY=your_service_role_key
   PORT=5000
   ```
4. Start the server:
   ```bash
   python server.py
   ```

## ⚛️ Frontend Setup (Client)
1. Navigate to the client directory:
   ```bash
   cd Money_Tracker/client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Update `src/supabase.js` with your Supabase credentials if not using environment variables.
4. Start the development server:
   ```bash
   npm start
   ```
   The app will be available at `http://localhost:3001`.

## 🔄 Google Drive Sync Setup
1. Enable the Google Drive API in the [Google Cloud Console](https://console.cloud.google.com/).
2. Create **OAuth 2.0 Client IDs** (Desktop App).
3. Download the JSON and rename it to `credentials.json`.
4. Place it in `Money_Tracker/server/`.
5. Run the backup tool once to authorize:
   ```bash
   python money_tracker_mcp_tools.py
   ```
