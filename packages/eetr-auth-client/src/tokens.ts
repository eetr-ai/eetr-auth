import { exchangeToken, OAuthError } from "./api.js";
import type { TokenResponse, AuthClientConfig } from "./types.js";

export class TokenManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: number | null = null;

  constructor(private readonly config: AuthClientConfig) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.expiresAt && Date.now() < this.expiresAt - 30_000) {
      return this.accessToken;
    }
    if (this.refreshToken) {
      await this.refresh(this.refreshToken);
      return this.accessToken!;
    }
    throw new OAuthError(
      "no_token",
      "No valid access token available. Call setTokens() first or perform an initial token exchange."
    );
  }

  setTokens(tokens: TokenResponse): void {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token ?? null;
    this.expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const tokens = await exchangeToken(
      {
        grantType: "refresh_token",
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        refreshToken,
      },
      { tokenEndpoint: this.config.tokenEndpoint }
    );
    this.setTokens(tokens);
    return tokens;
  }
}
