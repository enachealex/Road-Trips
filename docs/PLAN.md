# Roadbook — project plan

A shared trip itinerary for long family trips: flights, drives, lodging, rentals, activities
and notes laid out day by day, so everyone on the trip knows what is happening and when.

## Decisions

| Topic | Decision |
| --- | --- |
| App | Expo (React Native) SDK 57, Expo Router. Web first; App Store / Play Store builds later from the same code. |
| Hosting | GitHub Pages at roadtrip.thejumpvault.com (DNS on Cloudflare). Deploys on every push to `main`. |
| Data | Self-hosted Supabase on the owner's homelab server (shared with other apps), reached over SSH for schema changes. Tables live in a private `roadbook` schema; the app only calls seven RPC functions in `public`. The public API hostname passes only those functions and Realtime. |
| Access | No accounts. Anyone with a trip's link can view and edit it. The link holds an unguessable 16-character code. Deleted events can be restored for 30 days. |
| Times | Stored as local wall-clock time at the place (no time-zone conversion), like a printed itinerary. |
| Map | OpenStreetMap (no API key), with cached address lookups. |
| Notifications | Web push ("Notify me" per device). iPhone users must add the site to the home screen first. |
| Server-side pieces | Calendar subscription feed and push sending will run on the Supabase server (Edge Functions), since GitHub Pages is static. |

## Stages

1. **Itinerary** — *built.* Trips, events of 11 kinds, travelers and per-person filtering,
   today / next-up view, "tonight" lodging per day, map and directions links, offline copy
   of each trip plus an offline-capable site, calendar file download, recently deleted /
   restore, share link. Remaining: live calendar subscription feed (needs a server function).
2. **Together** — packing and to-do checklists, costs and who-owes-what, comments on events.
3. **Files and map** — attachments (tickets, boarding passes, PDFs) in Supabase Storage, route map.
4. **Notifications** — web push when the trip changes.

## Going live (2026-10-14)

- Done: schema applied on the server in its own `roadbook` schema; public API at
  `roadtrip-api.thejumpvault.com` through a dedicated, path-restricted Cloudflare tunnel;
  GitHub Pages and the `SUPABASE_URL` variable set. See [SETUP.md](SETUP.md).
- Owner sets the `SUPABASE_PUBLISHABLE_KEY` variable (one command in SETUP.md), then reruns the deploy.
- Each later stage that adds database functions must also add them to the tunnel's path regex.

## Known gaps

- Realtime updates between devices use Supabase Realtime broadcast. They have not been
  tested against the real server yet (the end-to-end tests used a stand-in without Realtime).
  Without it, changes still appear on refresh, on returning to the tab, and on reconnect.
- Anyone can create trips through the public API. Fine for a family site; add rate
  limiting if it is ever abused.
- The native apps use typed dates (YYYY-MM-DD) instead of a date picker; the website uses
  the browser's picker. Add a native picker before store builds, along with new
  splash/adaptive icons.
