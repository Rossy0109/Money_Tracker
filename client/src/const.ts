export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the Google OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// In password mode there is no OAuth redirect — the email/password form
// (AuthCard) handles sign-in, so this is a no-op there.
export const startLogin = () => {
  if (import.meta.env.VITE_AUTH_MODE === "google") {
    window.location.assign("/api/auth/google/login");
  }
};
