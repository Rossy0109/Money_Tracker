/**
 * Test-only stand-in for `cloudflare:sockets`, which only exists inside the
 * Workers runtime. Vitest (Node) aliases the specifier here so modules that
 * statically import `connect` can be loaded outside workerd.
 */
export function connect(): never {
  throw new Error(
    "cloudflare:sockets is not available outside the Workers runtime"
  );
}
