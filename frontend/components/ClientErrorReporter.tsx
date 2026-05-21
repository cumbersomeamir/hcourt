"use client";

import { useEffect } from "react";

type ErrorPayload = {
  type: string;
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  url: string;
  userAgent: string;
  timestamp: string;
  request?: {
    method?: string;
    url?: string;
    status?: number;
    statusText?: string;
    responseBody?: string;
  };
};

function getPath(value: string) {
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return value;
  }
}

function shouldReportFetch(requestUrl: string, status?: number) {
  const path = getPath(requestUrl);
  if (path.includes("/__monitor/client-error")) return false;
  if (path.startsWith("/_next/") || requestUrl.includes("_rsc=")) return false;
  if (!path.startsWith("/api/")) return false;
  return !status || status >= 500;
}

function postClientError(payload: ErrorPayload) {
  if (payload.url.includes("/__monitor/client-error")) return;
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/__monitor/client-error", new Blob([body], { type: "application/json" }));
    return;
  }

  fetch("/__monitor/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function normalizeReason(reason: unknown) {
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack };
  }
  if (typeof reason === "string") return { message: reason };
  return { message: JSON.stringify(reason) };
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const requestMethod =
        init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET");

      try {
        const response = await originalFetch(input, init);
        if (response.status >= 500 && shouldReportFetch(requestUrl, response.status)) {
          let responseBody = "";
          try {
            responseBody = (await response.clone().text()).slice(0, 4000);
          } catch {
            responseBody = "(response body unavailable)";
          }

          postClientError({
            type: "fetch-5xx",
            message: `Fetch failed with HTTP ${response.status}: ${requestUrl}`,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            request: {
              method: requestMethod,
              url: requestUrl,
              status: response.status,
              statusText: response.statusText,
              responseBody,
            },
          });
        }
        return response;
      } catch (error) {
        const reason = normalizeReason(error);
        if (shouldReportFetch(requestUrl)) {
          postClientError({
            type: "fetch-network-error",
            message: `Fetch network error: ${requestUrl}`,
            stack: reason.stack,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            request: {
              method: requestMethod,
              url: requestUrl,
              responseBody: reason.message,
            },
          });
        }
        throw error;
      }
    };

    const onError = (event: ErrorEvent) => {
      postClientError({
        type: "error",
        message: event.message || "Unhandled browser error",
        stack: event.error?.stack,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = normalizeReason(event.reason);
      postClientError({
        type: "unhandledrejection",
        message: reason.message || "Unhandled promise rejection",
        stack: reason.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
