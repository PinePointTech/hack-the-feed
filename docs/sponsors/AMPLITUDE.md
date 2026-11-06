# Amplitude

Owner: Vi. The event is hosted at Amplitude HQ. We use Amplitude for the creator funnel and the live "Did this change your mind?" vote. Docs: [Browser SDK 2](https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2).

## Setup (10 minutes)
1. Create a project in Amplitude, copy the API key into `apps/web/.env.local` as `NEXT_PUBLIC_AMPLITUDE_API_KEY` and into the Vercel env.
2. `cd apps/web && npm install @amplitude/analytics-browser`
3. Init only in browser code (a client component or `useEffect`), with autocapture:
```ts
import * as amplitude from "@amplitude/analytics-browser";
amplitude.init(process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY!, { autocapture: true });
amplitude.track("Myth Opened", { myth_id: "lymphatic-detox" });
```
4. Use the typed wrapper in `../WEB-APP.md` (`track()` inits lazily, because React runs child effects before the parent provider's effect).
5. Fire one test event and find it in User Lookup.

## Notes
- Autocapture records page views, sessions and attribution, including UTM parameters, so the QR's `utm_source=demo_qr` shows up without extra code.
- User ids need 5 or more characters (`creator_demo`, not `vi`).
- If the project lives in the EU data center, add `serverZone: "EU"` to the init options.
- Ad blockers can block the SDK. Use a clean browser profile on the demo laptop.
- Charts can lag a few minutes; User Lookup shows events sooner. Screenshot the dashboard after rehearsal.
- The unified SDK (`@amplitude/unified`, `initAll`) also exists; we don't need it.

Events and dashboard: `../08-TRACKING-PLAN.md`.
