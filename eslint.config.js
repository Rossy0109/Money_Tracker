import js from "@eslint/js";

export default [
  {
    ignores: [
      ".cache/**",
      ".next/**",
      "node_modules/**",
      "**/node_modules/**",
      "go/**",
      ".cargo/**",
      ".npm/**",
      "storage/**",
      "money_tracker_temp_2/**",
      "client/build/**",
      "vertex-ai-creative-studio/**",
      ".gemini/**",
      "pwa_tests/**",
      ".pub-cache/**",
      "claude-skills/**"
    ]
  },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error"
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        process: "readonly",
        console: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        alert: "readonly",
        prompt: "readonly",
        location: "readonly",
        caches: "readonly",
        self: "readonly",
        Blob: "readonly",
        URL: "readonly",
        FileReader: "readonly",
        IntersectionObserver: "readonly",
        CustomEvent: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        atob: "readonly",
        btoa: "readonly",
        Buffer: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        performance: "readonly",
        crypto: "readonly",
        MessageChannel: "readonly",
        AbortController: "readonly",
        FormData: "readonly",
        ReadableStream: "readonly",
        WritableStream: "readonly",
        TransformStream: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        URLSearchParams: "readonly",
        CustomElements: "readonly",
        customElements: "readonly",
        confirm: "readonly"
      }
    }
  }
];
