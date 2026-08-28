# কাস্টম ডোমেইন ও DNS কনফিগারেশন টপোলজি

এই নথিতে Money Tracker (আমার হিসাব) অ্যাপ্লিকেশনের জন্য কাস্টম ডোমেইন, DNS রেকর্ডস এবং রিডাইরেক্ট টপোলজি বিস্তারিতভাবে নির্ধারণ করা হলো।

---

## ১. ডোমেইন রাউটিং আর্কিটেকচার

একটি একক কাস্টম ডোমেইন (যেমন: `example.com` বা `amra-hisab.com`) ব্যবহার করার সময় নিচের নিরাপদ টপোলজি প্রযোজ্য:

```
[ ইউজার ট্রাফিক ]
        │
        ├──► app.example.com  ──────► [ Vercel Serverless / Full-Stack Node Application ]
        │                             (Live API, SSR, Database, Google Auth)
        │
        ├──► www.example.com  ──────► [ GitHub Pages Static App Redirect ]
        │                             (301/302 Redirect to app.example.com)
        │
        └──► example.com (Apex) ────► [ DNS Flattening / ALIAS / ANAME to Vercel ]
```

---

## ২. প্রয়োজনীয় DNS রেকর্ডস টেবিল

DNS প্রোভাইডারে (যেমন: Cloudflare, Namecheap, GoDaddy) নিচের রেকর্ডসমূহ কনফিগার করতে হবে:

| টাইপ (Type) | হোস্ট / নেম (Name) | টার্গেট / ভ্যালু (Value) | প্রক্সি / TTL | উদ্দেশ্য |
|---|---|---|---|---|
| **A / ALIAS** | `@` (Apex Domain) | `76.76.21.21` (Vercel IP) | Auto / DNS Only | Apex ডোমেইনকে মূল অ্যাপ্লিকেশনে পয়েন্ট করা |
| **CNAME** | `app` | `cname.vercel-dns.com` | DNS Only | লাইভ ফুল-স্ট্যাক Vercel অ্যাপ্লিকেশনের জন্য |
| **CNAME** | `www` | `rossy0109.github.io` | DNS Only | GitHub Pages রিডাইরেক্ট অ্যাপ্লিকেশনের জন্য |
| **TXT** | `_github-pages-challenge-rossy0109` | GitHub ভেরিফিকেশন কোড | Auto | GitHub Pages কাস্টম ডোমেইন মালিকানা প্রমাণ |

---

## ৩. HTTPS ও SSL সার্টিফিকেট হ্যান্ডলিং

1. **Vercel Managed TLS:**
   - `app.example.com` এবং apex ডোমেইন যুক্ত করার সাথে সাথে Vercel স্বয়ংক্রিয়ভাবে Let's Encrypt SSL সার্টিফিকেট ইস্যু এবং রিনিউ করে।
   - HSTS এবং HTTPS Redirection ডিফল্টভাবে সক্রিয় থাকে।

2. **GitHub Pages TLS:**
   - GitHub Repository Settings ➔ Pages ➔ Custom Domain-এ `www.example.com` দিন।
   - **Enforce HTTPS** চেকবক্সে টিক দিন। DNS প্রোপাগেশন শেষে সার্টিফিকেট অ্যাক্টিভ হবে।

---

## ৪. ব্রাঞ্চ প্রটেকশন ও নিরাপত্তা নীতি

- `main` ব্রাঞ্চে পুশ করার সময় GitHub Actions CI টেস্ট বাধ্যতামূলক।
- DNS বা সিক্রেট কি কোনো অবস্থাতেই সোর্স কোডে কমিট করা যাবে না।
