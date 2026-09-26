// Auth TypeScript types
// Generic OAuth types

export interface AuthorizeRequest {
  redirectUri: string;
  projectId: string;
  state: string;
  responseType: string;
  scope: string;
}

export interface AuthorizeResponse {
  redirectUrl: string;
}

export interface ExchangeTokenRequest {
  grantType: string;
  code: string;
  refreshToken?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

export interface ExchangeTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  scope: string;
  idToken: string;
}

export interface GetUserInfoRequest {
  accessToken: string;
}

export interface GetUserInfoResponse {
  openId: string;
  projectId: string;
  name: string;
  email?: string | null;
  platform?: string | null;
  loginMethod?: string | null;
}

export interface CanAccessRequest {
  openId: string;
  projectId: string;
}

export interface GetUserInfoWithJwtRequest {
  jwtToken: string;
  projectId: string;
}

export interface GetUserInfoWithJwtResponse {
  openId: string;
  projectId: string;
  name: string;
  email?: string | null;
  platform?: string | null;
  loginMethod?: string | null;
  taskUid?: string | null;
}
