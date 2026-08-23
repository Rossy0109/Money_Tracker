import "dotenv/config";
import { createApiApp } from "./server/_core/app";

// Vercel detects this root-level default Express export and captures it as a
// Node.js function. No port is bound here, so local persistent hosting keeps
// using server/_core/index.ts while Vercel uses the same route configuration.
export default createApiApp();
