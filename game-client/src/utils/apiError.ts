/**
 * The client half of the gateway's error contract (FS-0001).
 *
 * The gateway returns RFC 9457 `application/problem+json` on every 4xx/5xx. The
 * member that matters is `code`: a stable SCREAMING_SNAKE domain code that client
 * code switches on. `detail` is human-readable prose and is explicitly NOT
 * contract — display it, never branch on it.
 */

/** One field-level entry from the problem body's `errors[]`. */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * A gateway error, parsed. `message` carries `detail` so existing call sites that
 * display `err.message` keep working without change.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: string;
  readonly errors: FieldError[];

  constructor(args: {
    code: string;
    status: number;
    detail: string;
    errors: FieldError[];
  }) {
    super(args.detail);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.detail = args.detail;
    this.errors = args.errors;
  }
}

/**
 * Client-minted code for a failure that never passed through the gateway seam and
 * so carries no problem body — a proxy error page, a CORS rejection, a gateway
 * that never answered. The server never sends this; it is not part of the domain
 * vocabulary in `common/errcode`.
 */
export const UNKNOWN_ERROR = "UNKNOWN_ERROR";

/** Build an ApiError from an HTTP status and a parsed problem+json body. */
export function fromProblem(status: number, body: unknown): ApiError {
  const problem = (body ?? {}) as Record<string, unknown>;

  const code =
    typeof problem.code === "string" && problem.code !== ""
      ? problem.code
      : UNKNOWN_ERROR;

  const detail =
    typeof problem.detail === "string" && problem.detail !== ""
      ? problem.detail
      : `Request failed with status ${status}`;

  // The gateway always emits errors[] (never omitempty), so a missing or
  // non-array value means this did not come from the seam.
  const errors = Array.isArray(problem.errors)
    ? (problem.errors as FieldError[])
    : [];

  return new ApiError({ code, status, detail, errors });
}

/**
 * Read an error out of a failed Response.
 *
 * Tolerates a body that is not JSON: anything that did not come from the gateway
 * seam — an nginx 502 page, a CORS preflight failure — has an HTML or empty body,
 * and rejecting with a SyntaxError there would bury the real status behind a
 * parser error.
 */
export async function readApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not a problem document; fromProblem's fallbacks handle it.
  }
  return fromProblem(response.status, body);
}

/**
 * Resolve the text to show a user for an error.
 *
 * Callers pass overrides for the codes where they want their own wording — a login
 * form phrasing UNAUTHENTICATED as "wrong email or password", say. Any other code
 * falls through to the server's `detail`, which is already client-safe prose.
 *
 * This is what keeps the client honest against a vocabulary that grows: adding a
 * code is non-breaking, so an unrecognised one must degrade to something readable
 * rather than produce a blank message.
 */
export function userMessage(
  err: ApiError,
  overrides: Record<string, string> = {},
): string {
  return overrides[err.code] ?? err.detail;
}
