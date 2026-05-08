# 💰 Foot Print of Money (Ultimate Version)

A professional personal finance management system designed for longevity and sustainability.

## 🏗️ Architecture: The Serverless Stack
This project follows a **10-Year Sustainability** mandate using a robust, decoupled architecture:
- **Primary Database**: **Supabase (PostgreSQL)** for real-time data sync and relational integrity.
- **Authentication**: **Firebase Auth** for secure Google and Email logins.
- **AI Orchestration**: **Vercel Edge Functions** powering the Financial Assistant.
- **Frontend**: 
  - **Ultimate (Root)**: Lightweight Vanilla JS PWA (Hosted on Firebase/GitHub Pages).
  - **Standard (`/Foot_Print_of_Money`)**: Robust React application (Hosted on Vercel).
- **Hardened Security**: Unified `env.js` configuration system with secure GitHub Actions injection.

## 🚀 Advanced Features

1.  **🤖 AI Financial Assistant**: Real-time streaming assistant powered by Google AI SDK to answer questions about your spending and budgets.
2.  **🧪 Financial Lab**: Deep analytical tools:
    - **Financial Runway**: Savings longevity calculation.
    - **Burn Rate**: Monthly spending power analysis.
    - **Wealth Simulator**: Compound interest growth projections.
    - **Debt Payoff Lab**: Strategic payoff timelines (Snowball/Avalanche).
3.  **📈 Financial Health Score**: Dynamic 0-100 score based on savings rate, budget compliance, and emergency fund status.
4.  **📱 Mobile-First UX**: Floating Action Button (FAB), Dark Mode, and Offline-First PWA support.
5.  **💾 Data Sovereignty**: 100% data portability with exports to **PDF**, **Excel**, and full **JSON Backups**.

## 🛠️ Setup & Development

### 1. Environment Configuration
The project uses a hardened `env.js` system. For local development, ensure `env.js` contains your API keys. In production, these are injected securely via GitHub Actions.

### 2. Local Development
```bash
# Serve the Ultimate Version
python3 -m http.server 8000
```
Visit `http://localhost:8000`.

## 🔐 Copyright
**Copyright Reserved: Md Kamrul Ahmed**

## 🚢 Deployment
Every push to the `main` branch automatically triggers:
1. **Playwright E2E Tests** for quality assurance.
2. **Secure Secret Injection** for production environments.
3. **Multi-Platform Deploy** to Firebase Hosting, Vercel, and GitHub Pages.
