# 💰 Elite Money Tracker (Standard Version)

A feature-rich personal finance management system with a modern React frontend and Flask backend.

## 🏗️ Project Architecture

This project follows a professional multi-service architecture:

- **`/client`**: React.js frontend application (Port 3001)
- **`/server`**: Flask API backend (Port 5000), connected to Supabase
- **`/desktop`**: Legacy Tkinter desktop application (SQLite)

## 🚀 Quick Start (Docker - Recommended)

Run the entire stack with a single command:

```bash
docker-compose up --build
```

Access the application at `http://localhost:3001`.

## 🛠️ Manual Setup

### 1. Supabase Setup
- Create a new project on [Supabase](https://supabase.com).
- Run the SQL in `server/supabase_schema.sql` in the Supabase SQL Editor.
- Copy your Project URL and Service Role Key.

### 2. Backend (Server)
```bash
cd server
pip install -r requirements.txt
# Create a .env file with:
# SUPABASE_URL=your_project_url
# SUPABASE_KEY=your_service_role_key
python server.py
```

### 3. Frontend (Client)
```bash
cd client
npm install
npm start
```

## ✨ Features
- ✅ **Daily Transactions** - Track income and expenses
- 📊 **Real-time Summary** - Dashboard with financial insights
- 💳 **Payment Methods** - Manage Cash, Bank, and Mobile wallets
- 🔐 **Secure Access** - Protected by master password
- 🐳 **Docker Ready** - Standardized containerized deployment

## 📝 License
MIT License
