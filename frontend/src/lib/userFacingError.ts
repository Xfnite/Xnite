// Turns database/server errors into plain-language messages for toasts.
// The real error should still be logged with console.error before calling this.
//
// Messages our own code throws on purpose (`throw new Error("Not enough balance")`)
// are already written for users, so they pass through unchanged. Anything technical
// (Prisma, network, TypeError, ...) is replaced by a readable message or the fallback.

const CONNECTION_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);
const TECHNICAL_TEXT = /prisma|invocation|ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|socket|unexpected token|is not defined|cannot read propert|is not a function|status (code )?\d{3}/i;

export function toUserFacingError(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (code === "P2029" || /parameter limit/i.test(message)) {
    return "There are too many records to load at once. Add a filter to narrow the list, then try again.";
  }
  if (code === "P2024" || /timed out|timeout/i.test(message)) {
    return "The server is busy right now. Please wait a moment and try again.";
  }
  if ((typeof code === "string" && CONNECTION_CODES.has(code)) || /can't reach database|connection (refused|closed|terminated)/i.test(message)) {
    return "We couldn't connect to the database. Please check your internet and try again in a moment.";
  }

  // A plain Error (not a subclass like TypeError or a Prisma error) with no code
  // and readable text was thrown by our own code for the user to see.
  const isOwnMessage =
    error instanceof Error &&
    error.constructor === Error &&
    code === undefined &&
    message.trim() !== "" &&
    !TECHNICAL_TEXT.test(message);
  return isOwnMessage ? message : fallback;
}
