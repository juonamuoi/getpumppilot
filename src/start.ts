import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import {
  newRequestId,
  runWithRequestId,
  sanitizeRequestId,
} from "./lib/request-context.server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

/**
 * Assigns (or adopts) a correlation id for every server request and echoes it
 * back as `x-request-id` so a single access attempt can be traced end-to-end.
 */
const requestIdMiddleware = createMiddleware().server(async ({ next, request }) => {
  const requestId =
    sanitizeRequestId(request.headers.get("x-request-id")) ?? newRequestId();
  const result = await runWithRequestId(requestId, () => next());
  try {
    (result as { response?: Response }).response?.headers.set("x-request-id", requestId);
  } catch {
    /* headers may be immutable — tracing must never break the response */
  }
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [requestIdMiddleware, errorMiddleware],
}));
