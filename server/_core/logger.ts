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
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
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
