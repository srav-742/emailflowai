# EmailFlow AI

EmailFlow AI is a Gmail-first AI inbox workspace that combines Firebase login, Gmail OAuth, PostgreSQL persistence, and AI-powered email summarization, classification, and reply flows.

## Correct Project Paths

- Frontend app: `C:\Users\sravy\OneDrive\Desktop\Email\frontend`
- Backend API: `C:\Users\sravy\OneDrive\Desktop\Email\backend`
- Root workspace: `C:\Users\sravy\OneDrive\Desktop\Email`

## Run From Root

Use these commands from `C:\Users\sravy\OneDrive\Desktop\Email`:

```powershell
npm run dev:backend
npm run dev:frontend
```

Frontend:

- Local app URL: `http://localhost:5173`
- Preview URL: `http://localhost:4173`

Backend:

- API base URL: `http://localhost:5050/api`
- Health check: `http://localhost:5050/api/health`
- Gmail OAuth callback: `http://localhost:5050/auth/google/callback`

## Google OAuth Fix

If Google shows `Error 400: redirect_uri_mismatch`, open your Google Cloud OAuth client and add this exact Authorized redirect URI:

```text
http://localhost:5050/auth/google/callback
```

If you run the backend on another port, the redirect URI in Google Cloud must use that same port exactly.

## Frontend Environment

Create `frontend/.env` only if you need to override defaults:

```env
VITE_API_URL=/api
VITE_API_PROXY_TARGET=http://localhost:5050
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

## Backend Environment

The backend expects these variables in `backend/.env`:

```env
PORT=5050
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://...
JWT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5050/auth/google/callback
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
```

## Product Flow

1. Sign in with Google through Firebase.
2. Connect Gmail through the backend OAuth flow.
3. Sync emails into PostgreSQL.
4. Review AI summaries, classifications, action-required flags, and reply drafts in the dashboard.

## Current Smart Views

- Dashboard overview
- Full inbox
- Finance queue
- Developer queue
- Meetings queue
- Newsletter queue
- Social queue

## Database Notes

If the Prisma schema changes, run:

```powershell
npm run db:generate
cd backend
npx prisma db push
```

The current schema stores Gmail tokens, sync metadata, email categories, labels, action-required flags, and AI logs.

## Local Port Note

If you need another backend port, update both the backend env file and the Google OAuth redirect URI to the same value:

```powershell
cd backend
$env:PORT=5051
node src/server.js
```

If you do that, also set `frontend/.env` to:

```env
VITE_API_PROXY_TARGET=http://localhost:5051
```

For Gmail OAuth, the redirect URI in Google Cloud must match the same backend port you choose.
