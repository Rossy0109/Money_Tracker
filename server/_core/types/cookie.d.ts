declare module "cookie" {
  export function parseCookie(
    str: string,
    options?: Record<string, unknown>
  ): Record<string, string>;
  export function parse(
    str: string,
    options?: Record<string, unknown>
  ): Record<string, string>;
  export function serialize(
    name: string,
    value: string,
    options?: Record<string, unknown>
  ): string;
}
