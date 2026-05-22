/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.cache = false;
    return config;
  },
  images: {
    unoptimized: true
  },
  // Ensure we are NOT using output: 'export'
  // output: 'export', 
  // Disable static page generation to avoid prerender errors with Context hooks
  experimental: {
    // This often helps with dynamic context apps
    ppr: false,
  }
};

module.exports = withPWA(nextConfig);
