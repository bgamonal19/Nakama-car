// Test copies of the app (Railway PR environments) must talk to their own API, never to the real one.
const PRODUCTION_API_HOST = "nakama-car-production.up.railway.app";

function apiUrl() {
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME;
  const configured = process.env.NEXT_PUBLIC_API_URL || "";
  if (!environment || environment === "production") return configured;
  // Railway gives every service the public domain of the others in the same environment.
  const sameEnvironmentApi = process.env.RAILWAY_SERVICE_NAKAMA_CAR_URL;
  const url = sameEnvironmentApi ? `https://${sameEnvironmentApi}/api/v1` : configured;
  if (!url || url.includes(PRODUCTION_API_HOST)) {
    throw new Error(
      `Test environment "${environment}" would use the production API (${url || "empty"}). ` +
        "Set NEXT_PUBLIC_API_URL=https://${{Nakama-car.RAILWAY_PUBLIC_DOMAIN}}/api/v1 on the web service in Railway.",
    );
  }
  return url;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_API_URL: apiUrl() },
};

export default nextConfig;
