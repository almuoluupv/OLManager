import { invoke } from "@tauri-apps/api/core";

const MAX_STACK_LENGTH = 2000;

function sendToDiscord(message: string, stack?: string, source?: string) {
  const component = source || "unknown";
  const truncated = stack && stack.length > MAX_STACK_LENGTH
    ? stack.slice(0, MAX_STACK_LENGTH) + "...[truncated]"
    : stack;

  invoke("report_frontend_error", {
    error: message,
    component,
    stack: truncated,
  }).catch(() => {});
}

export function initFrontendErrorReporting() {
  window.addEventListener("error", (event) => {
    const message = event.error?.toString() || event.message || "Unknown error";
    const stack = event.error?.stack;
    const source = event.filename || event.target?.toString() || "window";
    sendToDiscord(message, stack, source);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason?.toString() || "Unhandled promise rejection";
    const stack = event.reason?.stack;
    sendToDiscord(message, stack, "unhandled-promise");
  });

  const originalConsoleError = console.error;
  console.error = function (...args: unknown[]) {
    const message = args.map((a) => String(a)).join(" ");
    const stack = new Error().stack;
    sendToDiscord(message, stack, "console.error");
    originalConsoleError.apply(console, args);
  };
}
