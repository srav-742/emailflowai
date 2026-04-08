# EmailFlow AI

EmailFlow AI is a JavaScript full-stack email assistant built with:

- Frontend: React + Vite
- Backend: Express + Socket.IO
- Database: PostgreSQL + Prisma
- Auth: Firebase + JWT
- Email provider: Gmail API
- AI: Groq-backed email summarization, classification, reply drafting, and task extraction

## Current Status

This project is now running on a JavaScript-only source codebase.

Completed and verified:

- Firebase Google login
- Gmail OAuth connect flow
- JWT-protected backend APIs
- Gmail sync into PostgreSQL
- Real-time inbox refresh with Socket.IO
- AI summary generation
- AI classification
- AI reply drafting
- Task extraction from emails
- Dashboard metrics and categorized inbox views
- JavaScript-only frontend and backend source tree

Verified on the current repo state:

- `npm run check`
- `npm --prefix frontend run build`
- `npm --prefix frontend run lint`

## Delivery Snapshot

Current feature progress:

- Auth and login flow: complete
- Gmail connect flow: complete
- Email sync and storage: complete
- Real-time sync updates: complete
- AI summary/classify/reply: complete
- Task extraction: complete
- Dashboard and inbox UI: complete
- JavaScript-only cleanup: complete at source level
- Morning brief: foundation added, not fully wired
- Follow-up automation: foundation added, not fully wired
- Analytics: foundation added, not fully wired
- Style learning: foundation added, not fully wired
- Billing and subscriptions: not implemented yet
- Multi-account OAuth beyond current Gmail flow: not implemented yet

## What Is Built

### 1. Authentication

Implemented in the backend auth flow and React auth context.

Current capabilities:

- Sign in with Google through Firebase
- Create or update a local user record
- Issue JWT tokens
- Load authenticated profile data
- Connect Gmail after login

Main files:

- `backend/src/controllers/authController.js`
- `backend/src/routes/authRoutes.js`
- `backend/src/middleware/auth.js`
- `frontend/src/context/AuthContext.jsx`

### 2. Gmail Connection and Sync

The app can connect a Gmail account and sync messages into PostgreSQL.

Current capabilities:

- Fetch Gmail OAuth URL
- Handle Gmail callback
- Save Gmail tokens
- Pull messages from Gmail
- Store synced messages in Prisma
- Update sync timestamps

Main files:

- `backend/src/utils/gmailOAuth.js`
- `backend/src/utils/gmailClient.js`
- `backend/src/services/inboxSyncService.js`
- `backend/src/controllers/emailController.js`

### 3. Real-Time Updates

The dashboard can receive live updates without a page refresh.

Current capabilities:

- Poll Gmail on the backend
- Detect new emails
- Emit per-user Socket.IO events
- Update dashboard and inbox UI in real time

Main files:

- `backend/src/server.js`
- `backend/src/services/emailSyncService.js`
- `backend/src/utils/socketRooms.js`
- `frontend/src/services/socket.js`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/EmailList.jsx`

### 4. AI Features

The app already supports multiple AI-powered email actions.

Current capabilities:

- AI summary
- AI classification
- AI reply generation
- AI task extraction
- Bulk AI processing for the inbox

Main files:

- `backend/src/utils/groq.js`
- `backend/src/services/taskExtractor.js`
- `backend/src/controllers/emailController.js`
- `frontend/src/components/EmailCard.jsx`
- `frontend/src/components/ReplyGenerator.jsx`

### 5. Dashboard and Inbox UI

The frontend already behaves like an AI inbox workspace instead of a simple email list.

Current capabilities:

- Dashboard overview
- Stats cards
- Category lanes
- Live sync status
- Task board
- Search and filtered inbox views
- Reply drafting UI

Main files:

- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/EmailList.jsx`
- `frontend/src/components/StatsOverview.jsx`
- `frontend/src/components/EmailCard.jsx`
- `frontend/src/index.css`

## API Surface That Is Live

### Auth Routes

Base path: `/api/auth`

- `POST /firebase-login`
- `GET /gmail/url`
- `GET /google/url`
- `GET /gmail/callback`
- `GET /google/callback`
- `POST /gmail/connect`
- `GET /profile`
- `POST /logout`

### Email Routes

Base path: `/api/emails`

- `GET /fetch`
- `GET /sync`
- `GET /`
- `GET /stats`
- `POST /classify`
- `GET /:id`
- `POST /:id/summarize`
- `POST /:id/extract-tasks`
- `POST /:id/reply/send`
- `POST /ai/process-all`
- `POST /ai/:id/summarize`
- `POST /ai/:id/classify`
- `POST /ai/:id/reply`

## Database State

The current Prisma schema already includes:

### User

- identity fields
- Firebase and Gmail connection fields
- sync timestamps
- style placeholder field
- important contacts placeholder field

### Email

- subject, body, snippet, summary
- priority and category
- labels and action-required state
- sender and recipients
- Gmail label IDs
- task extraction JSON
- sent/follow-up fields

### AILog

- AI action history per email and user

### Foundations Added in Schema

These schema-level foundations have been added for the next product phase:

- multi-account support via `EmailAccount`
- analytics support via `UserStats`
- plan and Stripe customer fields on `User`

## JavaScript-Only Cleanup

Completed:

- Removed all `.ts` and `.tsx` source files
- Removed TypeScript config files
- Replaced active TS runtime files with JS equivalents
- Switched Prisma config to `backend/prisma.config.js`
- Switched frontend socket service to `frontend/src/services/socket.js`
- Simplified root ESLint config to JS-only rules
- Removed TypeScript-related entries from `package.json` and `frontend/package.json`

Current note:

- The source tree is JavaScript-only.
- `package-lock.json` may still contain older TypeScript-related entries until the lockfile is fully refreshed with a clean reinstall/uninstall cycle.

## What Is Partially Prepared but Not Fully Wired Yet

These files exist as foundations for the next phase, but they are not yet fully mounted into live routes/UI flows:

- `backend/src/controllers/aiController.js`
- `backend/src/services/analyticsService.js`
- `backend/src/services/briefService.js`
- `backend/src/services/followUpService.js`
- `backend/src/services/styleService.js`
- `backend/src/services/notificationService.js`

This means the repo already has groundwork for:

- morning brief
- follow-up detection
- analytics tracking
- style learning
- smart notifications

But those features still need full route wiring and frontend integration before they should be called "complete."

## Recommended Next Steps

Best next order from here:

1. Finish wiring morning brief to backend routes and dashboard UI.
2. Finish follow-up detection job scheduling and follow-up cards in the UI.
3. Finish analytics API plus dashboard section.
4. Refresh lockfiles so package metadata matches the JS-only repo exactly.
5. After that, move into billing and multi-account support.

## Run Commands

Backend:

```bash
npm run dev:backend
```

Frontend:

```bash
npm run dev:frontend
```

Frontend build:

```bash
npm --prefix frontend run build
```

Frontend lint:

```bash
npm --prefix frontend run lint
```

Backend syntax check:

```bash
npm run check
```
