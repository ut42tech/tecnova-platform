export type Bindings = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_SHEETS_ID: string;
  GAS_DRIVE_WEBHOOK_URL?: string;
  GAS_DRIVE_WEBHOOK_SECRET?: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  TRUSTED_ORIGINS: string;
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthMentor {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'mentor';
}

export type Variables = {
  user: AuthUser;
  mentor: AuthMentor;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
