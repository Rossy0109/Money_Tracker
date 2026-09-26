// Global setup - runs before any test files are loaded
// Ensures NODE_ENV is set to 'test' before any modules are loaded
export default function globalSetup() {
  process.env.NODE_ENV = "test";
}
