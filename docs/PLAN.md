# Roadbook — project plan

A shared trip itinerary for long family trips: flights, drives, lodging, rentals, activities
and notes laid out day by day, so everyone on the trip knows what is happening and when.

## Decisions

| Topic | Decision |
| --- | --- |
| App | Expo (React Native) SDK 57, Expo Router. Web first; App Store / Play Store builds later from the same code. |
| Hosting | GitHub Pages at roadtrip.thejumpvault.com (DNS on Cloudflare). Deploys on every push to `main`. |
| Data | Self-hosted Supabase on the owner's homelab server (shared with other apps), reached over SSH for schema changes. Tables live in a private `roadbook` schema; the app only calls ten RPC functions in `public`. The public API hostname passes only those functions and Realtime. |
| Access | No accounts. Anyone with a trip's link can view and edit it. The link holds an unguessable 16-character code. Deleted events can be restored for 30 days. |
| Identity | No passwords. Each device picks "who you are" from the trip's travelers (or adds itself); that name is recorded on every change and message. Honour system. |
| Times | Stored as local wall-clock time at the place (no time-zone conversion), like a printed itinerary. |
| Map | OpenStreetMap (no API key), with cached address lookups. |
| Notifications | Web push ("Notify me" per device). iPhone users must add the site to the home screen first. |
| Server-side pieces | Calendar subscription feed and push sending will run on the Supabase server (Edge Functions), since GitHub Pages is static. |

## Stages

1. **Itinerary** — *built.* Trips, events of 11 kinds, travelers and per-person filtering,
   today / next-up view, "tonight" lodging per day, map and directions links, offline copy
   of each trip plus an offline-capable site, calendar file download, recently deleted /
   restore, share link. Remaining: live calendar subscription feed (needs a server function).
   - *Added 2026-10-14:* "who are you" per device; every change signed; per-item history,
     Activity tab and a "since you last looked" card; the trip **Messenger** (group chat, live
     updates with a 15-second fallback, unread badge, messages can point at an item).
2. **Together** — packing and to-do checklists, costs and who-owes-what. (Comments on events
   are covered by "Message the group about this".)
3. **Files and map** — attachments (tickets, boarding passes, PDFs) in Supabase Storage, route map.
4. **Notifications** — web push when the trip changes.

## Going live (2026-10-14)

- Done: schema applied on the server in its own `roadbook` schema; public API at
  `roadtrip-api.thejumpvault.com` through a dedicated, path-restricted Cloudflare tunnel;
  GitHub Pages and the `SUPABASE_URL` variable set. See [SETUP.md](SETUP.md).
- Done: the `SUPABASE_PUBLISHABLE_KEY` variable; the site runs against the server.
- Each later stage that adds database functions must also add them to the tunnel's path regex.

## Known gaps

- "Trip not found" comes back from the API as HTTP 500 (PostgREST's mapping of `P0002`). The app
  handles it; raising it as a 404 would need PostgREST's custom-status errors.
- Names are on the honour system: anyone with the link can pick any name.
- Anyone can create trips through the public API. Fine for a family site; add rate
  limiting if it is ever abused.
- The native apps use typed dates (YYYY-MM-DD) instead of a date picker; the website uses
  the browser's picker. Add a native picker before store builds, along with new
  splash/adaptive icons.
