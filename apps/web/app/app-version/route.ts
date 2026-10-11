// Identifies the running deployment: the app (browser, installed app, Android APK) compares it
// with the one it was loaded from and refreshes itself when a new version is online.
export const dynamic = "force-dynamic";

const STARTED = String(Date.now());
const BUILD = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || STARTED;

export function GET() {
  return Response.json({ build: BUILD }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
