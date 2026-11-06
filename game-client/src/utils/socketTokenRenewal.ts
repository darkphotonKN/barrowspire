/**
 * Every access token the auth store takes in after the first, from any renewal (the proactive
 * timer, a 401, a 4001), is handed to the game socket, so the server renews the token it holds for
 * the player too (FS-ZPX58 R27). A sign-out hands nothing.
 */

type AuthSlice = { accessToken: string | null };

export function forwardRenewedTokens(
  subscribe: (listener: (state: AuthSlice, previous: AuthSlice) => void) => () => void,
  socket: { renewToken(token: string): void },
): () => void {
  return subscribe((state, previous) => {
    if (state.accessToken && state.accessToken !== previous.accessToken) {
      socket.renewToken(state.accessToken);
    }
  });
}
