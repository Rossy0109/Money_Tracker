import pino from "pino";

const level =
  process.env.NODE_ENV === "test"
    ? "silent"
    : process.env.NODE_ENV === "development"
      ? "debug"
      : "info";

const logger = pino({
  level,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "sessionSecret",
      "adminAccessPassword",
      "jwtSecret",
      "backupEncryptionKey",
      "cookieSecret",
      "s3SecretAccessKey",
      "awsSecretAccessKey",
      "googleOAuthClientSecret",
      "googleDriveClientSecret",
      "supabaseServiceRoleKey",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-admin-password']",
      "req.headers['x-cron-secret']",
      "req.url",
      "req.query",
      "*.password",
      "*.passwordHash",
      "*.sessionSecret",
      "*.adminAccessPassword",
      "*.jwtSecret",
      "*.backupEncryptionKey",
      "*.cookieSecret",
      "*.s3SecretAccessKey",
      "*.awsSecretAccessKey",
      "*.googleOAuthClientSecret",
      "*.googleDriveClientSecret",
      "*.supabaseServiceRoleKey",
      "query.password",
      "url",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    // Redact credentials that may appear as query params on logged URLs.
    req(request: { url?: string; method?: string; headers?: unknown } | undefined) {
      if (!request) return request;
      const safeUrl =
        typeof request.url === "string"
          ? request.url.replace(
              /([?&](?:password|adminPassword|pwd|token|secret|apiKey)=)[^&#]*/gi,
              "$1[REDACTED]"
            )
          : request.url;
      return { ...request, url: safeUrl };
    },
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
        },
      }
    : {}),
});

export default logger;
