# Security & Performance Audit — HR Leave System

**Date:** 2026-07-10  
**Scope:** Member 3 backend + React frontend  

---

## Summary scorecard

| Area | Score | Notes |
|------|-------|--------|
| Authentication | **Good** | JWT + bcrypt; rate-limited login; weak-secret warning |
| Authorisation | **Good** | RBAC + assigned approver / delegate checks |
| Injection | **Good** | Parameterized SQL only |
| Secrets | **OK / care** | `.env` gitignored; do not commit real keys |
| Transport | **Depends** | Use HTTPS in production (hosting) |
| Input validation | **Good** | Business validation + body size limit |
| Error handling | **Good** | No stack traces to client in production |
| Audit | **Excellent** | before/after JSON on state changes |
| Performance | **Improved** | Queue AI uses rules (not N× LLM); parallel team counts |
| Rate limiting | **Good (basic)** | In-memory; use Redis at scale |
| Frontend XSS | **Good** | React escapes text; no raw HTML from AI rendered as HTML |
| CSRF | **N/A-ish** | Bearer token in header (not cookie session) |

---

## Security — controls in place

| Control | Implementation |
|---------|----------------|
| Password hashing | bcrypt on seed/login |
| JWT | Signed with `JWT_SECRET`, expiry `JWT_EXPIRES_IN` |
| Auth middleware | Loads user from DB; inactive users rejected |
| RBAC | `requireRole` + service-level supervisor/manager checks |
| SQL injection | `$1` / `?` parameters; no string-concat SQL |
| XSS (API) | JSON API; FE uses React text binding |
| CORS | Restricted to `FRONTEND_URL` in production |
| Headers | `X-Content-Type-Options`, `X-Frame-Options`, etc. |
| Body limit | `express.json({ limit: '100kb' })` |
| Login abuse | Rate limit on `POST /api/auth/login` |
| API abuse | Light rate limit on `/api/*` |
| User enumeration | Dummy bcrypt when email missing |
| Secrets | `.env` not committed; production refuses weak JWT |

---

## Performance — notes & fixes applied

| Issue | Risk | Mitigation |
|-------|------|------------|
| LLM call per queue item | Slow queue, high cost | **Fixed:** list uses **rule-based** AI-3; LLM only via dedicated AI routes |
| Serial N+1 team counts | Slow list | **Fixed:** `Promise.all` parallel counts |
| Dashboard loading full queue | Extra work | Acceptable for demo; pagination later |
| SQLite single writer | Concurrent write limits | Fine for demos; use Postgres for multi-instance |
| Unbounded leave list | Memory | Seed-sized; add `LIMIT`/`OFFSET` for production |
| AI endpoints | Latency | Fail soft; timeouts via provider |

---

## Remaining risks (acceptable for course; fix for production)

1. **In-memory rate limit** resets on restart; multi-instance needs Redis.  
2. **No refresh tokens** — 8h JWT only; logout is client-side.  
3. **localStorage JWT** — XSS on FE could steal token (mitigate with CSP on FE host, short expiry).  
4. **Demo password** `Password123!` — change for real deploy.  
5. **SQLite** not for multi-server production.  
6. **No request ID / structured logging** yet.  
7. **Pagination** not on all lists.  
8. **AI routes** cost money if key set — monitor usage.

---

## Checklist before production

- [ ] Strong unique `JWT_SECRET`  
- [ ] `NODE_ENV=production`  
- [ ] `FRONTEND_URL=https://your-frontend`  
- [ ] HTTPS terminator (Cloudflare / nginx / PaaS)  
- [ ] Real SMTP + rotate mailbox password  
- [ ] Postgres + backups  
- [ ] Remove or disable seed demo accounts  
- [ ] Review CORS and rate limits  

---

## Quick verify after hardening

```bash
cd backend
npm run dev
npm test
npm run grade
```

Expect: login still works; 429 after many failed logins from same IP; queue stays fast without OpenRouter.
