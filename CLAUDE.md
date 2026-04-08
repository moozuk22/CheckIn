# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

```bash
# Development
npm run dev              # Start Next.js dev server (http://localhost:3000)
npm run build            # Build the project (runs prisma generate first)
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npx prisma migrate dev   # Create and apply migrations
npx prisma studio       # Open Prisma Studio GUI for data inspection
npx prisma generate     # Generate Prisma client (run on dependency updates)
```

## Architecture Overview

This is a Next.js full-stack application with two main interfaces:

### Core Structure
- **Admin Interface** (`/admin/*`): Web portal for managing members, questions, and sending notifications. Protected by JWT-based session authentication via middleware.
- **Member Interface** (`/member/[cardCode]/*`): Public-facing check-in and question interface for individual members, accessed via unique card codes.
- **Public APIs** (`/api/members/*`, `/api/questions`): Card-based endpoints that don't require authentication.
- **Admin APIs** (`/api/admin/*`): Protected endpoints for administrative operations.

### Authentication & Authorization

- **Admin Auth**: JWT token (created via `createAdminToken()` in `src/lib/adminAuth.ts`) stored in `admin_session` HTTP-only cookie.
- **Middleware** (`src/middleware.ts`): Protects all `/admin` and `/api/admin` routes. Validates JWT on each request; invalid tokens trigger logout and redirect to login.
- **Member Access**: No authentication required; members access content via unique card codes in the URL (e.g., `/member/CARD123`).

### Database (PostgreSQL + Prisma)

Schema located in `prisma/schema.prisma`. Key models:

- **Member**: Core user entity (firstName, secondName, visitsTotal, visitsUsed)
- **Card**: Unique card codes linked to members (one member can have multiple cards)
- **Question**: Surveys/questions that members answer
- **MemberQuestionAnswer**: Responses with unique constraint per (memberId, questionId)
- **PushSubscription**: Web push subscription objects (indexed by memberId + isActive)
- **MemberNotification**: Notification history with read tracking

All models use UUID primary keys and `createdAt`/`updatedAt` timestamps. Cascade deletes ensure referential integrity.

### Event System (`src/lib/memberEvents.ts`)

In-memory pub/sub for real-time updates:

- **`subscribeMemberEvents(cardCode, subscriber)`**: Subscribe to member-specific events (check-in, reset, notification-created). Returns unsubscribe function.
- **`publishMemberUpdated(cardCode, type)`**: Broadcast events to all subscribers for a card code.
- **`subscribeQuestionsUpdated(subscriber)`** / **`publishQuestionsUpdated()`**: Global question update notifications.

Used for real-time UI updates (e.g., SSE streams in API routes) and cache invalidation. Note: in-memory only—lost on server restart.

### Web Push Notifications

- **Keys**: VAPID public/private keys configured in `.env` (required for web push).
- **Component**: `src/components/push/PushNotificationsPanel.tsx` handles client-side subscription and registration.
- **API**: `/api/members/[cardCode]/push-subscriptions` (POST to register, DELETE to remove).
- **Sending**: `/api/admin/notifications/send` triggers push notifications via `web-push` package.
- **Service Worker**: Defined in `public/` directory; handles background push events.

### PWA Setup

- **Manifest**: `public/manifest.json` configures standalone mode and app metadata.
- **Bootstrap**: `src/components/pwa/PwaClientBootstrap.tsx` initializes PWA and service worker.
- Integrated into main layout for automatic initialization.

### API Response Patterns

Routes use standard `NextRequest`/`NextResponse`:
- Success responses: `NextResponse.json({ ...data }, { status: 200 })`
- Errors: `NextResponse.json({ error: "message" }, { status: 4xx|5xx })`
- Authenticated endpoints: Middleware handles auth; no need to check tokens in route handlers.

### Media System (`/admin/media`)

Video upload and management system for the `MEDIA_MANAGER` role.

**Roles**: Two admin roles exist — `ADMIN` (full access) and `MEDIA_MANAGER` (restricted to `/admin/media` and related APIs only). Role is embedded in the JWT and enforced in middleware.

**Storage layout** (configured via `MEDIA_STORAGE_PATH` env var, default `/var/www/checkin/media`):
- `files/` — finalized video files
- `chunks/` — temporary chunk storage during upload

**Chunked upload flow** (supports arbitrarily large files, including multi-GB):
1. `POST /api/admin/media/upload-init` — creates DB record, checks disk space (`fileSize * 2.5` headroom required)
2. `POST /api/admin/media/upload-chunk` — receives individual 5MB chunks (FormData)
3. `GET /api/admin/media/upload-status?uploadId=...` — returns already-received chunks (for resume support)
4. `POST /api/admin/media/upload-finalize` — assembles chunks, runs ffprobe, triggers transcoding if needed

**Shared constant**: `CHUNK_SIZE` lives in `src/lib/media/chunk-size.ts` (no Node.js imports) so both server (`src/lib/media/config.ts`) and client (`upload/page.tsx`) can import it without issues. Do not move CHUNK_SIZE back into `config.ts` directly — `config.ts` imports `path` which breaks `"use client"` components.

**nginx requirement**: Chunk uploads on slow connections require increased proxy timeouts. The default 60s timeout will kill large chunk transfers. Production nginx must have in the `location /` block:
```nginx
proxy_read_timeout 600;
proxy_send_timeout 600;
client_body_timeout 600;
client_max_body_size 100M;
```

**ffmpeg/ffprobe**: Required on the server for video processing. Paths configured via `FFMPEG_PATH` / `FFPROBE_PATH` env vars.

### Key Routes Structure

```
/app
  /admin
    /login             # Admin login page
    /members          # List members
    /members/[id]     # Member detail & edit pages
    /members/add      # Add member form
    /notifications    # Send notifications UI
    /questions        # Manage questions
    /media            # Media manager (MEDIA_MANAGER role)
    /media/folders/[id]  # Folder contents
    /media/upload     # Chunked video upload
  /api/admin          # Protected admin endpoints
  /api/admin/media    # Media upload/management APIs
  /api/admin/folders  # Folder management APIs
  /api/admin/shares   # Share link APIs
  /api/members        # Card-based member endpoints
  /api/questions      # Public question endpoints
  /member/[cardCode]  # Member check-in interface
  /watch/[token]      # Public share-link video player
```

## Environment Variables

See `.env.example`. Required for local development:

- `DATABASE_URL`: PostgreSQL connection string
- `ADMIN_PASSWORD`: Simple password for admin login (not production-grade)
- `MEDIA_MANAGER_PASSWORD`: Password for the restricted media-manager login
- `ADMIN_SESSION_SECRET`: Long random string for JWT signing
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: Web push keys (generate with web-push CLI)
- `VAPID_SUBJECT`: Contact email for push notifications
- `CRON_SECRET`: Security token for any scheduled jobs
- `MEDIA_STORAGE_PATH`: Root directory for video storage (default `/var/www/checkin/media`)
- `MEDIA_MIN_FREE_SPACE_GB`: Minimum free disk space required before allowing uploads (default `5`)
- `FFMPEG_PATH` / `FFPROBE_PATH`: Paths to ffmpeg/ffprobe binaries
- `SHARE_LINK_BASE_URL`: Base URL for generated share links (e.g. `https://yourdomain.com/watch`)

## Development Tips

1. **Database changes**: Edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <migration_name>`, then `npm run build`.
2. **Real-time updates**: Use member events system for member-specific UI updates; prefer polling/revalidation over complex state management.
3. **Testing member flows**: Use card codes from the database (via Prisma Studio or API) to test as a member.
4. **Admin session testing**: The `/api/admin/check-session` endpoint validates current session without login.
5. **Styling**: Tailwind CSS v4 is configured via PostCSS.

## Notes

- Middleware uses cookie-based JWT, not Authorization headers.
- Member events are in-memory; integrations with external systems should use database records as the source of truth.
- Web push requires valid VAPID keys; test notifications will fail without them.
- ESLint config uses Next.js core-web-vitals and TypeScript rules.
