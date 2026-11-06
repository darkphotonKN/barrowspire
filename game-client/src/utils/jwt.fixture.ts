/**
 * Test fixture: an unsigned JWT carrying this payload. The client never verifies a token, it only
 * reads `exp` (FS-ZPX58 R18), so the signature is a placeholder.
 */
export function jwtWith(payload: object): string {
  const b64url = (s: string) =>
    btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.sig`;
}
