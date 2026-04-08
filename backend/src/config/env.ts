

function parsePort(rawPort: string | undefined, fallback: number) {
  const parsed = Number(rawPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parsePort(process.env.PORT, 5050),
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI ??
    `http://localhost:${parsePort(process.env.PORT, 5050)}/auth/google/callback`,
};
