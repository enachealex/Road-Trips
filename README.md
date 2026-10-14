# Roadbook

A shared, day-by-day plan for long family trips. Flights, drives, hotels, rental cars,
activities and notes go on the day they happen, and everyone with the trip's link sees the
same plan, on their phone or computer.

Live at **https://roadtrip.thejumpvault.com**.

## What it does

- **Day-by-day itinerary.** Every day of the trip is listed, even empty ones, so gaps are
  obvious. Each day shows where everyone sleeps that night.
- **Every kind of plan.** Flights, drives, trains, buses, ferries, rental cars, other
  transport, lodging, activities, meals and notes, each with the right fields
  (flight number, seats, check-in/out, pick-up/return, confirmation numbers…).
- **Per-person plans.** Mark who each plan is for, then filter the trip to "just Grandma".
- **Today and next up.** During the trip, past days fold away and the next thing on the
  schedule sits at the top.
- **One link to share.** No accounts. Anyone with the link can view and edit; deleted items
  can be restored for 30 days.
- **Everyone signs their changes.** Each device picks who it is from the trip's travelers.
  Every addition, edit and deletion carries that name: each item shows its history, the
  Activity tab lists every change, and a "since you last looked" card shows what others did.
- **Messenger.** A group chat for the trip, live between devices, with an unread badge.
  "Message the group about this" links a message to a flight, hotel or plan.
- **Works offline.** The last copy of each trip stays readable without signal, and the site
  itself opens offline once it has been visited.
- **Maps and calendars.** Directions and map links for every place, flight status links,
  and a calendar file for everyone or one person.

Times are stored exactly as written on the ticket (local time where it happens), with no
time-zone conversion.

## How it is built

- [Expo](https://expo.dev) SDK 57 (React Native + React Native Web) with Expo Router.
  The website is the main target; iOS and Android builds come from the same code later.
- Data lives in a self-hosted [Supabase](https://supabase.com). The app only calls the
  functions in [supabase/schema.sql](supabase/schema.sql); the tables are closed to the
  public key, and a trip's unguessable link code is what grants access to it.
- Hosted on GitHub Pages behind Cloudflare. Pushing to `main` deploys
  ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).

```
src/app/            Screens (Expo Router): home, new trip, trip itinerary, event details/edit, settings
src/components/     UI building blocks and forms
src/lib/            Trip logic: itinerary layout, dates, event kinds, calendar export, data store
supabase/           Database schema and its tests
public/             Web page shell, manifest, icons and the offline service worker
scripts/            Post-build step for GitHub Pages
docs/               Setup guide and project plan
```

## Working on it

```bash
npm install
npx expo start        # then open http://localhost:8081
npm test              # logic and database tests
npm run typecheck
npx expo lint
npm run build:web     # production build into dist/
```

Without Supabase settings the app runs in **demo mode**, keeping trips in the browser only.
To use a real server, copy `.env.example` to `.env.local` and fill it in.

Setup for the server and hosting: [docs/SETUP.md](docs/SETUP.md). Roadmap: [docs/PLAN.md](docs/PLAN.md).
