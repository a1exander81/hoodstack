// Ported from @x402/next 2.21.0 (Apache-2.0, https://github.com/x402-foundation/x402),
// specifically its `NextAdapter`, `createRequestContext`, `handlePaymentError`,
// `handleSettlement`, and `withX402`/`withX402FromHTTPServer`.
//
// We can't install @x402/next directly -- its package.json pins
// `peerDependencies: { next: ">=16.2.6" }`, and this repo is deliberately on
// `^15.4.8` for the CVE-2025-66478 fix (see progress-tracker.md). Everything
// this file actually touches (`NextRequest`/`NextResponse`/`Headers` from
// `next/server`) is stable Web-standard App Router API that hasn't changed
// between 15 and 16 -- the peer range looks like a support-matrix decision on
// the package's part, not a real technical dependency on Next 16.
//
// Trimmed relative to the original: no paywall HTML support (this is a JSON
// API route, never rendered to a browser) and no Bazaar discovery extension
// (this endpoint is intentionally not publicly listed). Re-add both by
// diffing against a future @x402/next release if either becomes relevant.
//
// If/when this repo moves to Next 16, prefer swapping this file for the real
// `@x402/next` package rather than maintaining this port further.

import { NextRequest, NextResponse } from "next/server";
import {
  x402HTTPResourceServer,
  x402ResourceServer,
  FacilitatorResponseError,
  getFacilitatorResponseError,
  SETTLEMENT_OVERRIDES_HEADER,
  withPrivateCacheControl,
  type HTTPAdapter,
  type HTTPRequestContext,
  type RouteConfig,
  type PaymentCancellationDispatcher,
  type HTTPResponseInstructions,
} from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

/** Adapts a Next.js App Router `NextRequest` to the x402 `HTTPAdapter` interface. */
export class NextAdapter implements HTTPAdapter {
  constructor(private readonly req: NextRequest) {}

  getHeader(name: string): string | undefined {
    return this.req.headers.get(name) || undefined;
  }

  getMethod(): string {
    return this.req.method;
  }

  getPath(): string {
    return this.req.nextUrl.pathname;
  }

  getUrl(): string {
    return this.req.url;
  }

  getAcceptHeader(): string {
    return this.req.headers.get("Accept") || "";
  }

  getUserAgent(): string {
    return this.req.headers.get("User-Agent") || "";
  }

  getQueryParams(): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    this.req.nextUrl.searchParams.forEach((value, key) => {
      const existing = params[key];
      if (existing === undefined) {
        params[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        params[key] = [existing, value];
      }
    });
    return params;
  }

  getQueryParam(name: string): string | string[] | undefined {
    const all = this.req.nextUrl.searchParams.getAll(name);
    if (all.length === 0) return undefined;
    return all.length === 1 ? all[0] : all;
  }

  /**
   * Parses the JSON body. Native `Request.json()` can only be read once --
   * callers that need the body more than once per request (e.g. more than
   * one dynamic `price` function evaluating in the same request) MUST
   * memoize this themselves; this adapter does not cache it. See the
   * `bodyCache` pattern in the deposit route.
   */
  async getBody(): Promise<unknown> {
    try {
      return await this.req.json();
    } catch {
      return undefined;
    }
  }
}

function createRequestContext(request: NextRequest): HTTPRequestContext {
  const adapter = new NextAdapter(request);
  return {
    adapter,
    path: request.nextUrl.pathname,
    method: request.method,
    paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment"),
  };
}

function createFacilitatorErrorResponse(error: FacilitatorResponseError): NextResponse {
  return new NextResponse(JSON.stringify({ error: error.message }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}

function handlePaymentError(response: HTTPResponseInstructions): NextResponse {
  const headers = new Headers(response.headers);
  if (response.isHtml) {
    headers.set("Content-Type", "text/html");
    return new NextResponse(response.body as BodyInit, { status: response.status, headers });
  }
  headers.set("Content-Type", "application/json");
  return new NextResponse(JSON.stringify(response.body ?? {}), {
    status: response.status,
    headers,
  });
}

async function handleSettlement(
  httpServer: x402HTTPResourceServer,
  response: NextResponse,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  declaredExtensions: Record<string, unknown> | undefined,
  cancellationDispatcher: PaymentCancellationDispatcher,
  httpContext: HTTPRequestContext,
): Promise<NextResponse> {
  if (response.status >= 400) {
    await cancellationDispatcher.cancel({
      reason: "handler_failed",
      responseStatus: response.status,
    });
    response.headers.delete(SETTLEMENT_OVERRIDES_HEADER);
    return response;
  }

  try {
    const responseBody = Buffer.from(await response.clone().arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const result = await httpServer.processSettlement(
      paymentPayload,
      paymentRequirements,
      declaredExtensions,
      { request: httpContext, responseBody, responseHeaders },
    );

    if (!result.success) {
      const { response: failResponse } = result;
      const body = failResponse.isHtml
        ? (failResponse.body as BodyInit)
        : JSON.stringify(failResponse.body ?? {});
      return new NextResponse(body, {
        status: failResponse.status,
        headers: failResponse.headers,
      });
    }

    Object.entries(result.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    response.headers.set(
      "Cache-Control",
      withPrivateCacheControl(response.headers.get("Cache-Control")),
    );
    response.headers.delete(SETTLEMENT_OVERRIDES_HEADER);
    return response;
  } catch (error) {
    if (error instanceof FacilitatorResponseError) {
      return createFacilitatorErrorResponse(error);
    }
    console.error("Settlement failed:", error);
    return new NextResponse(JSON.stringify({}), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Wraps a Next.js App Router route handler with x402 payment protection.
 * On first request (no X-PAYMENT header): returns the 402 challenge.
 * On retry (signed X-PAYMENT header present): verifies the payment, runs
 * `routeHandler`, then settles against the facilitator and attaches
 * settlement headers to whatever `routeHandler` returned.
 */
export function withX402(
  routeHandler: (request: NextRequest) => Promise<NextResponse>,
  routeConfig: RouteConfig,
  server: x402ResourceServer,
  syncFacilitatorOnStart = true,
): (request: NextRequest) => Promise<NextResponse> {
  const httpServer = new x402HTTPResourceServer(server, { "*": routeConfig });

  let initPromise: Promise<void> | null = syncFacilitatorOnStart
    ? httpServer.initialize()
    : null;
  void initPromise?.catch(() => {});
  let isInitialized = false;

  async function init() {
    if (!syncFacilitatorOnStart || isInitialized) return;
    if (!initPromise) initPromise = httpServer.initialize();
    try {
      await initPromise;
      isInitialized = true;
    } catch (error) {
      initPromise = null;
      throw error;
    }
  }

  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      await init();
    } catch (error) {
      const facilitatorError = getFacilitatorResponseError(error);
      if (facilitatorError) {
        return createFacilitatorErrorResponse(facilitatorError);
      }
      throw error;
    }

    const context = createRequestContext(request);
    const result = await httpServer.processHTTPRequest(context);

    switch (result.type) {
      case "no-payment-required":
        return routeHandler(request);
      case "payment-error":
        return handlePaymentError(result.response);
      case "payment-verified": {
        let handlerResponse: NextResponse;
        try {
          handlerResponse = await routeHandler(request);
        } catch (error) {
          await result.cancellationDispatcher.cancel({ reason: "handler_threw", error });
          throw error;
        }
        return handleSettlement(
          httpServer,
          handlerResponse,
          result.paymentPayload,
          result.paymentRequirements,
          result.declaredExtensions,
          result.cancellationDispatcher,
          context,
        );
      }
    }
  };
}
