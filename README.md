# 💰 Foot Print of Money (Next.js Edition)

আপনার নিরাপদ আর্থিক বন্ধু - Now powered by Next.js 14.

## 🚀 Tech Stack
- **Frontend**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + Lucide Icons
- **Database**: Supabase (PostgreSQL)
- **Auth**: Firebase Auth (with Supabase Profile Sync)
- **PWA**: next-pwa (Offline support)
- **Hosting**: Vercel

## 🛠️ Setup Instructions

### 1. Environment Variables
Create a `.env.local` file in the root directory and add the following:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id

NEXT_PUBLIC_ADMIN_EMAIL=your_primary_admin_email
```

### 2. Installation
```bash
npm install
```

### 3. Development
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
npm start
```

## 🛡️ Architecture & Features
- **DataHub**: A centralized library for real-time data sync with offline-first caching and transaction queueing.
- **Role-Based Access**: Multi-role support (ADMIN, ACCOUNTANT, VIEWER).
- **Financial Lab**: Advanced calculators for Debt Snowball, Zakat, and EMI.
- **Auto-Sync**: Seamless synchronization between Firebase Auth and Supabase profiles.
- **Error Boundaries**: Prevents app-wide crashes during runtime errors.

## 📄 License
Copyright Reserved © Md Kamrul Ahmed
