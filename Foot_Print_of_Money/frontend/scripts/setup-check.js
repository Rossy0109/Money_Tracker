/**
 * scripts/setup-check.js
 * Diagnostic tool to verify environment and database configuration.
 */
const fs = require('fs');
const path = require('path');

const REQUIRED_ENV = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_ADMIN_EMAIL'
];

const OPTIONAL_ENV = [
    'GOOGLE_GENERATIVE_AI_API_KEY'
];

console.log("🔍 Starting Setup Diagnostic...\n");

// 1. Check .env file
const envPath = path.join(process.cwd(), '.env');
const envLocalPath = path.join(process.cwd(), '.env.local');
let envContent = '';

if (fs.existsSync(envLocalPath)) {
    console.log("✅ .env.local found.");
    envContent = fs.readFileSync(envLocalPath, 'utf8');
} else if (fs.existsSync(envPath)) {
    console.log("✅ .env found.");
    envContent = fs.readFileSync(envPath, 'utf8');
} else {
    console.error("❌ NO .env or .env.local file found! Please create one based on .env.example.");
    process.exit(1);
}

// 2. Validate Keys
let missing = 0;
REQUIRED_ENV.forEach(key => {
    if (!envContent.includes(key)) {
        console.error(`❌ Missing REQUIRED variable: ${key}`);
        missing++;
    } else {
        const val = envContent.split(`${key}=`)[1]?.split('\n')[0]?.trim();
        if (!val || val.length < 5) {
            console.warn(`⚠️ Variable ${key} appears to be empty or too short.`);
        }
    }
});

OPTIONAL_ENV.forEach(key => {
    if (!envContent.includes(key)) {
        console.warn(`💡 Missing OPTIONAL variable: ${key} (AI Assistant will be disabled).`);
    }
});

if (missing > 0) {
    console.log(`\n❌ Diagnostic FAILED: ${missing} required variables are missing.`);
} else {
    console.log("\n✅ Diagnostic PASSED: Basic environment is configured.");
}

console.log("\n🚀 Next Steps:");
console.log("1. Run 'npm install' if you haven't already.");
console.log("2. Run the SQL in 'supabase/migrations/20260515120000_master_sync.sql' in your Supabase Editor.");
console.log("3. Start development with 'npm run dev'.");
