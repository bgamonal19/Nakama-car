# Officina 3D

Authenticated staff route: `/taller-3d`, sidebar **Officina 3D**. Requires
`work_order.read`; body-only workers cannot access mechanical scene data. No customer
portal access is added by this change. The public Sites demo remains disconnected.

## Data and privacy

`GET /api/v1/workshop-scene?day=YYYY-MM-DD` returns tenant-scoped mechanical cases,
vehicle appearance fields and the selected day's audited status/task events. No
customer contact information, notes or API keys are sent to the scene. The parent
uses the existing bearer-authenticated API client; the same-origin iframe receives
only the sanitized response via `postMessage`, with origin AND source checks on
both sides. The renderer never receives an authentication token.

The 3D assets are self-hosted, including Three.js and its MIT license. They are copied
from the workshop concept demo; original workshop walls are retained. Vehicles are
procedural approximations, not exact licensed replicas. No paid lookup/render APIs
are called. No production rows are modified by opening or playing the scene.

## Current and daily playback

Current data refreshes every 15 seconds while the page is visible, and on focus.
Changed statuses trigger illustrative movement; READY moves to parking and DELIVERED
leaves via the street. On reopening, current state is loaded; choose the daily recap
to play the registered events. Replay starts from the first known pre-event status;
case creation is labeled **Pratica aperta**, never a confirmed physical arrival.
Playback is chronological, with an adjustable pause between events; it waits for an
ongoing vehicle movement. Pause stops both timeline and vehicle motion. Now cancels
replay and restores the current snapshot. Dates use Europe/Rome, including 23/25-hour
DST days. Historical records predating the audit trail cannot be reconstructed fully.

Bay allocation is **illustrative**, not physical tracking: the existing app has no
recorded bay/location field. Up to 4 workshop bays and 9 parking spaces are shown;
the text list retains all returned records. Routes stop at walls; if blocked, the UI
prompts the operator to return to Now. Vehicles are not a collision/traffic simulator.
Truncated API results disable recap instead of presenting a partial full-day replay.
Completing a task alone does NOT mark the work order READY or deliver the vehicle.

## Deployment

Deploy both `apps/api` (Railway) and `apps/web` (Vercel) from the same revision. No
migration, new secret, provider contract or paid 3D service is required. Existing
`NEXT_PUBLIC_API_URL` points the frontend at the authenticated API. Keep the original
public demo independent. Do not embed that external public URL in the private app.

## Checks

API tests: `pytest tests/test_workshop_scene.py tests/test_records.py tests/test_users.py`.
Web: existing `npm test` and `npm run build` (or equivalent package runner).
