// Run with: npm test (node --test --experimental-strip-types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptLegal, needsLegal, signIn, WRONG_CREDENTIALS, SERVER_ERROR, SERVER_UNREACHABLE } from "./signin.ts";

const API = "https://api.test/api/v1";
const staffSession = { access_token: "staff-token", first_name: "Luca", last_name: "M", tenant_id: "t1", permissions: ["case.read"], roles: ["MECHANIC"], work_area: "MECHANICAL" };

/** Fake API: who exists on each endpoint, and what each endpoint answers. */
function api({ staff = {}, portal = {}, staffStatus, portalStatus, down = false } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(url.replace(API, ""));
    if (down) throw new TypeError("Failed to fetch");
    const { email, password } = JSON.parse(init.body);
    const isStaff = url.endsWith("/auth/login") && !url.includes("/portal/");
    const forced = isStaff ? staffStatus : portalStatus;
    if (forced) return new Response(forced >= 500 ? "Internal Server Error" : JSON.stringify({ detail: "No tenant membership" }), { status: forced });
    const accounts = isStaff ? staff : portal;
    if (accounts[email] !== password) return new Response(JSON.stringify({ detail: "Invalid credentials" }), { status: 401 });
    return new Response(JSON.stringify(isStaff ? staffSession : { access_token: "portal-token", full_name: "Univex" }), { status: 200 });
  };
  return { fetcher, calls };
}

const accounts = { staff: { "admin@nakamacar.it": "Admin12345!", "meccanico@nakamacar.it": "Mecc123456!" }, portal: { "flotta@univex.it": "Cliente123!" } };

for (const prefer of ["staff", "portal"]) {
  test(`${prefer} page: admin and mechanic get into the workshop`, async () => {
    for (const [email, password] of Object.entries(accounts.staff)) {
      const { fetcher } = api(accounts);
      const result = await signIn(API, email, password, prefer, fetcher);
      assert.equal(result.kind, "staff", email);
      assert.equal(result.session.access_token, "staff-token");
    }
  });

  test(`${prefer} page: customer gets into the portal`, async () => {
    const { fetcher } = api(accounts);
    const result = await signIn(API, "flotta@univex.it", "Cliente123!", prefer, fetcher);
    assert.deepEqual(result, { kind: "portal", token: "portal-token", legalRequired: false });
    assert.equal(needsLegal(result), false);
  });

  test(`${prefer} page: wrong password says so`, async () => {
    const { fetcher, calls } = api(accounts);
    const result = await signIn(API, "admin@nakamacar.it", "wrong", prefer, fetcher);
    assert.deepEqual(result, { kind: "error", message: WRONG_CREDENTIALS });
    assert.equal(calls.length, 2);
  });
}

test("workshop page tries the workshop login first", async () => {
  const { fetcher, calls } = api(accounts);
  await signIn(API, "admin@nakamacar.it", "Admin12345!", "staff", fetcher);
  assert.deepEqual(calls, ["/auth/login"]);
});

test("email typed on a phone with spaces and capitals still works", async () => {
  const { fetcher } = api(accounts);
  const result = await signIn(API, " Admin@NakamaCar.it ", "Admin12345!", "staff", fetcher);
  assert.equal(result.kind, "staff");
});

test("server errors are not reported as a wrong password", async () => {
  assert.deepEqual(await signIn(API, "admin@nakamacar.it", "Admin12345!", "staff", api({ ...accounts, staffStatus: 500 }).fetcher), { kind: "error", message: SERVER_ERROR });
  assert.deepEqual(await signIn(API, "admin@nakamacar.it", "Admin12345!", "staff", api({ down: true }).fetcher), { kind: "error", message: SERVER_UNREACHABLE });
  assert.deepEqual(await signIn(API, "admin@nakamacar.it", "Admin12345!", "staff", api({ ...accounts, staffStatus: 403 }).fetcher), { kind: "error", message: "No tenant membership" });
});

test("accounts that have not accepted terms and privacy are asked, then the acceptance is sent", async () => {
  const sent = [];
  const fetcher = async (url, init) => {
    sent.push({ url: url.replace(API, ""), auth: init.headers.Authorization, body: JSON.parse(init.body) });
    if (url.endsWith("/legal")) return new Response("{}", { status: 200 });
    return new Response(JSON.stringify(url.includes("/portal/") ? { access_token: "portal-token", legal_required: true } : { detail: "Invalid credentials" }), { status: url.includes("/portal/") ? 200 : 401 });
  };
  const result = await signIn(API, "flotta@univex.it", "Cliente123!", "staff", fetcher);
  assert.equal(needsLegal(result), true);
  assert.equal(await acceptLegal(API, result, fetcher), true);
  assert.deepEqual(sent.at(-1), { url: "/portal/legal", auth: "Bearer portal-token", body: { accept_terms: true, accept_privacy: true } });

  const staff = { kind: "staff", session: { ...staffSession, legal_required: true } };
  assert.equal(needsLegal(staff), true);
  await acceptLegal(API, staff, fetcher);
  assert.deepEqual(sent.at(-1).url, "/auth/legal");
  assert.equal(sent.at(-1).auth, "Bearer staff-token");
});
