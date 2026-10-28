// Pure, dependency-free identity of the demo/stub account, safe to import from
// both client and server code. The stateful demo data lives in gingerDemo.ts
// (server-only); this file only answers "is this the demo account?".

export const DEMO_GINGER_EMAIL = "localizeph@gmail.com";

export function isDemoGingerEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === DEMO_GINGER_EMAIL;
}
