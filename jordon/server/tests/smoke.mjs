// End-to-end HTTP smoke test for every Member 1 endpoint. Self-boots the app on
// an ephemeral port against a throwaway SQLite DB, seeds via the shared seeder,
// then drives the real routes with fetch. Run: npm test  (or node tests/smoke.mjs)
import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Env MUST be set before the (dynamic) model import — Sequelize reads it then.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DB_DIALECT = "sqlite";
process.env.DB_STORAGE = path.join(os.tmpdir(), `m1-test-${Date.now()}.sqlite`);
process.env.APP_SECRET = "test_secret";

const db = (await import("../models/index.js")).default;
const app = (await import("../app.js")).default;
const { seed } = await import("../seedData.js");

await db.sequelize.sync({ force: true });
await seed();
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const BASE = `http://localhost:${server.address().port}`;

let passed = 0;
const check = (name, cond) => {
  assert.ok(cond, name);
  console.log(`  ✓ ${name}`);
  passed++;
};

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

const login = async (email, password = "demo123!") => {
  const { data } = await api("POST", "/user/login", { body: { email, password } });
  return data.accessToken;
};

console.log("\n== Auth (UC-01) ==");
{
  const bad = await api("POST", "/user/login", { body: { email: "weiling@innovare.com", password: "wrong" } });
  check("wrong password → 401", bad.status === 401);
  const ok = await api("POST", "/user/login", { body: { email: "weiling@innovare.com", password: "demo123!" } });
  check("valid login → 200 + token", ok.status === 200 && ok.data.accessToken);
  check("login strips password", ok.data.user && ok.data.user.password === undefined);
  const me = await api("GET", "/user/auth", { token: ok.data.accessToken });
  check("GET /user/auth → 200 with user", me.status === 200 && me.data.user.email === "weiling@innovare.com");
  const noTok = await api("GET", "/user/auth");
  check("GET /user/auth without token → 401", noTok.status === 401);
}

console.log("\n== Profile & preferences (UC-23) ==");
{
  const token = await login("weiling@innovare.com");
  const prof = await api("GET", "/user/profile", { token });
  check("GET /user/profile → 200", prof.status === 200 && prof.data.email === "weiling@innovare.com");
  const upd = await api("PUT", "/user/profile", { token, body: { phone: "+65 0000 0000", locale: "zh", notifyInApp: false } });
  check("PUT /user/profile → 200 + persisted", upd.status === 200 && upd.data.user.phone === "+65 0000 0000" && upd.data.user.locale === "zh");
  const badPw = await api("PUT", "/user/password", { token, body: { currentPassword: "nope", newPassword: "abcd1234" } });
  check("PUT /user/password wrong current → 400", badPw.status === 400);
  const okPw = await api("PUT", "/user/password", { token, body: { currentPassword: "demo123!", newPassword: "newpass123" } });
  check("PUT /user/password → 200", okPw.status === 200);
  const relogin = await api("POST", "/user/login", { body: { email: "weiling@innovare.com", password: "newpass123" } });
  check("re-login with new password → 200", relogin.status === 200);
}

console.log("\n== Forgot / reset password (UC-23) ==");
{
  const fp = await api("POST", "/user/forgot-password", { body: { email: "priya@innovare.com" } });
  check("forgot-password → 200 + demo token", fp.status === 200 && /^[0-9a-f]{64}$/.test(fp.data.demoResetToken));
  const rp = await api("POST", "/user/reset-password", { body: { token: fp.data.demoResetToken, password: "resetme123" } });
  check("reset-password → 200", rp.status === 200);
  const reused = await api("POST", "/user/reset-password", { body: { token: fp.data.demoResetToken, password: "again1234" } });
  check("reset token is single-use → 400", reused.status === 400);
  const login2 = await api("POST", "/user/login", { body: { email: "priya@innovare.com", password: "resetme123" } });
  check("login with reset password → 200", login2.status === 200);
  const unknown = await api("POST", "/user/forgot-password", { body: { email: "nobody@nowhere.com" } });
  check("forgot-password for unknown email → 200 (no enumeration)", unknown.status === 200);
}

console.log("\n== Sessions & security log (UC-25) ==");
{
  const token = await login("kumar@innovare.com");
  const s1 = await api("GET", "/user/sessions", { token });
  check("GET /user/sessions → 200 array", s1.status === 200 && Array.isArray(s1.data) && s1.data.length >= 1);
  const sid = s1.data[0].id;
  const rev = await api("PUT", `/user/sessions/${sid}/revoke`, { token });
  check("revoke own session → 200", rev.status === 200);
  const s2 = await api("GET", "/user/sessions", { token });
  check("revoked session drops from list", !s2.data.some((s) => s.id === sid));
  const log = await api("GET", "/user/security-log", { token });
  check("security log → 200 with LOGIN + SESSION_REVOKED", log.status === 200 && log.data.some((e) => e.eventType === "SESSION_REVOKED"));

  // Cross-user revoke forbidden
  const otherToken = await login("weiling@innovare.com", "newpass123");
  const s3 = await api("GET", "/user/sessions", { token: otherToken });
  const foreign = await api("PUT", `/user/sessions/${s3.data[0].id}/revoke`, { token }); // kumar revoking weiling's
  check("revoking another user's session → 403", foreign.status === 403);
}

console.log("\n== Lockout after 3 failures (UC-25) ==");
{
  for (let i = 0; i < 3; i++) {
    await api("POST", "/user/login", { body: { email: "diana@innovare.com", password: "wrong" } });
  }
  const locked = await api("POST", "/user/login", { body: { email: "diana@innovare.com", password: "demo123!" } });
  check("account locked after 3 failures → 423", locked.status === 423);
  // HR unlock. Diana is user #5 in the seed order (weiling,priya,kumar,marcus,diana,hr).
  const hr = await login("hr@innovare.com");
  const unlock = await api("PUT", `/user/5/unlock`, { token: hr });
  check("HR unlock → 200", unlock.status === 200);
  const after = await api("POST", "/user/login", { body: { email: "diana@innovare.com", password: "demo123!" } });
  check("login works after unlock → 200", after.status === 200);
}

console.log("\n== Announcements (UC-26) ==");
{
  const emp = await login("weiling@innovare.com", "newpass123");
  const active = await api("GET", "/announcement/active", { token: emp });
  check("employee sees active announcements", active.status === 200 && active.data.length >= 1);
  const mandatory = active.data.find((a) => a.requiresAck);
  check("employee sees a mandatory (ROLE=EMPLOYEE) announcement", !!mandatory);
  const ack = await api("POST", `/announcement/${mandatory.id}/ack`, { token: emp });
  check("ack mandatory → 200", ack.status === 200);
  const active2 = await api("GET", "/announcement/active", { token: emp });
  check("acked mandatory disappears", !active2.data.some((a) => a.id === mandatory.id));

  // RBAC: employee cannot manage
  const empCreate = await api("POST", "/announcement", { token: emp, body: { title: "x", body: "y", startDate: "2026-01-01", endDate: "2026-02-01" } });
  check("employee POST /announcement → 403", empCreate.status === 403);

  const hr = await login("hr@innovare.com");
  const created = await api("POST", "/announcement", {
    token: hr,
    body: { title: "Town hall", body: "All-hands Friday 3pm.", targetType: "ALL", startDate: "2026-01-01", endDate: "2026-12-31" },
  });
  check("HR create announcement → 200", created.status === 200 && created.data.id);
  const list = await api("GET", "/announcement", { token: hr });
  check("HR list includes ackCount", list.status === 200 && list.data.every((a) => "ackCount" in a));
  const deact = await api("PUT", `/announcement/${created.data.id}/deactivate`, { token: hr });
  check("HR deactivate → 200", deact.status === 200);
  const badDates = await api("POST", "/announcement", { token: hr, body: { title: "bad", body: "bad", startDate: "2026-05-01", endDate: "2026-01-01" } });
  check("end before start → 400", badDates.status === 400);
}

console.log("\n== Invitations + onboarding + pro-ration (UC-24 → UC-20) ==");
let inviteToken;
{
  const emp = await login("weiling@innovare.com", "newpass123");
  const empInvite = await api("POST", "/invitation", { token: emp, body: { name: "X", email: "x@x.com" } });
  check("employee POST /invitation → 403", empInvite.status === 403);

  const hr = await login("hr@innovare.com");
  const inv = await api("POST", "/invitation", {
    token: hr,
    body: { name: "Test Newhire", email: "newhire@innovare.com", countryCode: "SG", team: "Finance", role: "EMPLOYEE", startDate: "2026-04-15" },
  });
  check("HR send invite → 200 + demo token", inv.status === 200 && /^[0-9a-f]{64}$/.test(inv.data.demoInviteToken));
  inviteToken = inv.data.demoInviteToken;

  const dup = await api("POST", "/invitation", { token: hr, body: { name: "Dup", email: "newhire@innovare.com" } });
  check("duplicate pending invite → 400", dup.status === 400);

  // invited account cannot log in yet
  const preLogin = await api("POST", "/user/login", { body: { email: "newhire@innovare.com", password: "demo123!" } });
  check("INVITED account login blocked → 403", preLogin.status === 403);

  // verify (public)
  const verify = await api("GET", `/invitation/verify?token=${inviteToken}`);
  check("verify token → 200 with details", verify.status === 200 && verify.data.email === "newhire@innovare.com");
  const badVerify = await api("GET", `/invitation/verify?token=${"0".repeat(64)}`);
  check("verify bad token → 400", badVerify.status === 400);

  // accept (public)
  const accept = await api("POST", "/invitation/accept", { body: { token: inviteToken, password: "welcome123", locale: "en" } });
  check("accept invite → 200", accept.status === 200);

  // now can log in
  const postLogin = await api("POST", "/user/login", { body: { email: "newhire@innovare.com", password: "welcome123" } });
  check("activated account login → 200", postLogin.status === 200);

  // pro-ration: start 2026-04-15 → SG annualMin 14 → 14 * (8.5/12) round .5 = 10
  const list = await api("GET", "/invitation", { token: hr });
  check("HR invitation list shows ACCEPTED", list.data.some((v) => v.email === "newhire@innovare.com" && v.status === "ACCEPTED"));
}

console.log("\n== Bulk entitlement & pro-ration (UC-20) ==");
{
  const hr = await login("hr@innovare.com");
  const prorate = await api("POST", "/admin/entitlement/prorate", { token: hr, body: { fullEntitlement: 14, startDate: "2026-07-01" } });
  check("prorate 14 from Jul 1 → 7", prorate.status === 200 && prorate.data.prorated === 7);
  // Apr 15: monthsRemaining = 9 - 0.5 = 8.5 → 14 * 8.5/12 = 9.92 → nearest 0.5 = 10
  const prorate2 = await api("POST", "/admin/entitlement/prorate", { token: hr, body: { fullEntitlement: 14, startDate: "2026-04-15" } });
  check("prorate 14 from Apr 15 (mid-month) → 10", prorate2.status === 200 && prorate2.data.prorated === 10);
  const preview = await api("GET", "/admin/entitlement/preview?year=2026", { token: hr });
  check("preview → rows for active users", preview.status === 200 && preview.data.rows.length >= 6);
  const commit = await api("POST", "/admin/entitlement/commit", { token: hr, body: { year: 2026 } });
  check("commit → updated count", commit.status === 200 && commit.data.updated >= 6);
  const policies = await api("GET", "/admin/policies", { token: hr });
  check("policies → 10 countries", policies.status === 200 && policies.data.length === 10);
  // RBAC
  const emp = await login("weiling@innovare.com", "newpass123");
  const empCommit = await api("POST", "/admin/entitlement/commit", { token: emp, body: { year: 2026 } });
  check("employee commit → 403", empCommit.status === 403);
}

server.close();
await db.sequelize.close();
try {
  const { unlinkSync } = await import("node:fs");
  unlinkSync(process.env.DB_STORAGE);
} catch { /* temp file cleanup — ignore */ }

console.log(`\n${passed} checks passed.`);
