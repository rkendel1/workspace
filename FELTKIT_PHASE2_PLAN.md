# FeltKit Phase 2: auth, tenancy and UX: verified implementation plan (Phase A)

Date: 2026-11-05.

**Repository state before implementation:**
- **Everything clean, nothing pushed by this phase yet.**
- **feltkit:** new branch `claude/auth-tenancy` from `origin/main` e567504, which includes the merged events and file-links work. npm `@feltdb/feltkit` is still 0.3.16 while the owner publishes; this branch does not touch versions or release metadata.
- **workspace:** `claude/happy-allen-vldje7` 8899266.
- **AppPort main:** cdecc9a (core 1.7.0 / server 1.3.0 / sdk 1.6.0 published).
- **AppBoundry main:** 321a004.
- **Read-only references:** authboundry b8ed659, appport-services ac20b5a (0.15.0), mailport 21b3913.

The audit's FeltKit claims below were re-read in source on this branch. File references are under `packages/sdk/src/`.

## 1. Implementation map

### Reuse as is
| Primitive | Where | Why it stays |
|---|---|---|
| scrypt password hashing, decoy hash, constant answers | `runtime/accounts.ts` | Correct and tested |
| Sessions as AppPort `SessionStore`, digest-only `fks_` tokens | `runtime/sessions.ts` | Conformance-tested AppPort contract; cookies carry the same token |
| OAuth / OIDC with PKCE S256 and a signed state cookie | `server/oauth.ts` | Correct; only the session hand-off changes (no `#feltkit-session=` fragment for cookie clients) |
| Roles → permissions, `access`, `authorize` hook, activity log | `runtime/authority.ts`, `authorize.ts` | Tenant roles feed the **same** role map. No second authorization system |
| Account mail: FeltKit → AppPort Services notification (`EmailNotificationChannel`) → MailPort | `runtime/runtime.ts:455-475`, `runtime/mail.ts` | The required delivery path. Messages are rendered at delivery, so secrets are never stored |
| `ctx.crypto.token`, file links' digest-store pattern | `runtime/content.ts` | Same pattern for challenges and invitations |
| API keys, CLI and agent sessions, `auth.authenticate` | `runtime/runtime.ts:662` | Unchanged: bearer only |

### Extend
| Primitive | Change |
|---|---|
| `feltkit({ auth })` | Add `tenant`, `claims`, `providers` entries `"email"` and `"magic-link"`, `session: { cookie, trustProxy }`, `mail: { from, identity, templates }`. The existing `accounts` and `providers` shapes keep working (migration in §5). |
| Session resolution (`principalForToken`) | Account sessions are **re-resolved on every request**: roles from the account record, tenant role and claims from the live membership. A disabled account, or a revoked membership, takes effect on the next request. Roles are no longer trusted as copied at sign-in. Dev, CLI and agent sessions keep their issued roles (they are operator-issued). |
| HTTP session transport | Browser: an HttpOnly cookie, `__Host-` prefixed when served over HTTPS, `SameSite=Lax`, with a session-bound CSRF token required on unsafe methods and an `Origin` check. Non-browser: bearer, unchanged. |
| Client IP for throttles | `auth.session.trustProxy` (hop count). `X-Forwarded-For` and `-Proto` are ignored unless configured. |
| Verify and reset links | Become durable challenges: digest only, at most 15 minutes, single use, superseded by a newer one. Today's links are stateless HMAC (verify lasts 7 days). |
| `AccountStore` | Add profile update, e-mail change (re-verified through a challenge), password change (current password required, other sessions revoked), disable, and connected providers. Account ids stay stable: an e-mail index record maps address → id, because ids are derived from the first address (`accountId(email)`). |
| `SessionStore` | Record `tenantId`, `kind` and `lastSeen`. Add `listFor(principal)`, `revokeFor(principal, ref)` and rotation (issue a new token and delete the old one). |
| `ctx.auth` | Add `tenant: { id, name, role, claims } \| null` and typed `claims`, so handlers and the `authorize` hook read the same values. |
| `app.collection` | `{ tenant: true \| { field } }`. FeltKit stamps the tenant on insert from the session, filters every read by it, refuses cross-tenant get, patch and delete as NOT_FOUND, and refuses a client-supplied tenant value. Runs in FeltKit's runtime and in the AppBoundry guest's data layer. |
| React package | Add `AuthProvider` state, `useAuth`, `useTenant` and the components in §3. `useSession` keeps working. |

### Implement (missing)
| Primitive | Storage (FeltDB, app instance) |
|---|---|
| Challenges: verify, reset, magic link (link and code), e-mail change, invitation | `_feltkit_challenges` (digest id, purpose, subject, expiresAt ≤ 15 min, attempts, usedAt) plus a `current` pointer per purpose and subject for superseding |
| Tenants | `_feltkit_tenants` |
| Memberships `{ tenantId, principalId, role, claims, status, createdAt, updatedAt, invitedBy }` | `_feltkit_memberships`, id derived from (tenant, principal), so unique |
| Invitations `{ tenantId, email, role, claims, invitedBy, expiresAt, status, acceptedBy }` | `_feltkit_invitations`. The token is a challenge; the link is rendered at delivery |
| Tenant routes (create, list mine, switch, members, invite, accept, set role, remove, leave) | `server/tenancy.ts`. Every route goes through `Runtime#call`'s authority, which is built in, not app code |
| Account routes (profile, e-mail, password, providers, sessions, sign out everywhere) | `server/index.ts` |

### Security-sensitive decisions
1. **The tenant comes only from the server-side session.** Never from a request argument. Switching re-checks membership, rotates the session, and the client refetches every live query.
2. **One role model.** `claims.role` must be an `s.enum` whose values are all declared `roles`. The order is the rank (first is highest). A manager may assign only roles ranked below their own, and may not change someone at or above their rank. The last owner cannot leave or be demoted. Managing members needs a declared permission (`tenant.members.manage`), so the app's role map decides who manages. Tenant admins therefore cannot create a capability.
3. **Claims are server-held.** Typed by the app's `claims` schema and validated on write. A client value is never read: there is no claims field in any request the server trusts.
4. **Challenge codes are low-entropy** (8 digits), so they carry an attempt limit (5 per challenge) and a per-address issue budget. Link tokens are 256-bit. Both are derived at delivery as `HMAC(FELTKIT_AUTH_SECRET, nonce)`, so a database reader cannot use a stored challenge.
5. **CSRF.** Cookie-authenticated POST, PUT and DELETE need `X-FeltKit-CSRF` equal to an HMAC of the session digest, given by `GET /api/session`. A foreign `Origin` is refused. Bearer requests are unaffected (no ambient credential).
6. **Uniform answers.** Magic-link, reset and verify requests answer the same for unknown addresses. Invitation acceptance for the wrong address refuses without saying who was invited.

### AppBoundry
- An AppBoundry host has operator-issued sessions and **no accounts** (FK-GAP-013, open). It passes `{ id, type, roles }` to the guest.
- In this phase, the guest honours a `tenant` carried on the principal, and tenant-scoped collections are enforced in the guest's data layer. This is tested with a FeltKit-built artifact on AppBoundry's host.
- Sign-in, invitations and switching stay on FeltKit's Node server until AppBoundry implements accounts. That is recorded, not worked around.
- Deployment requirements are documented: `FELTKIT_AUTH_SECRET`, HTTPS for `__Host-` cookies, `trustProxy`, and the public origin for OAuth callbacks and e-mail links (`FELTKIT_PUBLIC_URL`).

## 2. API proposal (TypeScript, existing conventions)

```ts
export const app = feltkit({
  name: "multiplayer",
  roles: { owner: [...], admin: [...], member: [...], guest: [...] },  // unchanged: the only authority
  auth: {
    providers: ["email", "magic-link", "google", "github"],  // "email" = password accounts
    signUp: { roles: ["member"] },          // replaces accounts.roles (accounts still accepted)
    google: { clientId: "…" }, github: { clientId: "…" },   // as today (accounts.providers form still accepted)
    tenant: { name: "workspace", invitations: true, switching: true, create: "anyone" },
    claims: { role: s.enum(["owner", "admin", "member", "guest"]), plan: s.optional(s.enum(["free", "pro"])) },
    session: { ttlMs, cookie: "auto", trustProxy: 1 },
  },
  mail: { from: "Multiplayer <auth@example.com>", identity: "auth", templates: { "auth.magic-link": ({ link, code, app }) => ({ subject, text }) } },
});
// handlers
ctx.auth.tenant   // { id, name, role: "owner" | "admin" | "member" | "guest", claims: { role, plan? } } | null
app.collection("channels", { … }, { tenant: true });
```

The final shape is fixed by the smallest change that type-checks against the existing `FeltKitOptions`. Deviations are recorded in the report.

## 3. UI inventory

- **Existing, reused or promoted:**
  - The starter `create/template/src/App.tsx` (569 lines) sign-in, sign-up, reset and verify screens, and `theme.tsx`.
  - Multiplayer's `src/auth.tsx` (202 lines) is a copy of them.
- **New components in `@feltdb/feltkit/react`:**
  - `SignIn` (password, magic link, providers, sign-up toggle, safe `returnTo`);
  - `VerifyEmail`, `MagicLinkConfirm`, `ResetPassword` (request and complete);
  - `AuthCallback` (provider errors, expired links);
  - `AcceptInvitation` (valid, expired, revoked, accepted, wrong-account, sign-in-first);
  - `TenantSwitcher` (with create);
  - `MembersPanel` (list, roles, remove, leave);
  - `InvitationsPanel` (create, list, revoke, copy link);
  - `AccountSettings` (profile, e-mail and verification, password, providers, sessions, sign out of others, sign out).
- **Shared behaviour:**
  - Hooks: `useAuth`, `useTenant`, `useAccount`.
  - Styling: CSS custom properties under `.fk-auth` with a `theme` prop, and `className` / `slots` overrides. There is no CSS framework.
  - Accessibility: labelled controls, `aria-live` status, focus management, and keyboard support.

## 4. Test plan

Deterministic `node:test` against the real HTTP server and FeltDB, with no browser mocks for security claims:
- **Auth:** invalid credentials, expired, reused and attempt-limited challenges, enumeration (identical responses and status codes), session expiry and revocation, cookie flags, CSRF refused and accepted, OAuth state (existing tests are kept).
- **Tenancy:** cross-tenant read and write through a tenant-scoped collection, a forged tenant argument, a missing or revoked membership (next request), an expired or reused invitation, unauthorized role changes (rank, last owner, self-elevation), and a stale session after a switch.
- **Authorization:** client-supplied claims are ignored, membership changes apply on the next call, claims are validated, and an admin cannot assign an undeclared role.
- **Integration:**
  - Mail through **real MailPort**: `@mailerport/service` started in-process over HTTP, with FeltKit using `MAILPORT_URL`.
  - The AppPort Services notification records.
  - FeltDB persistence across a runtime restart (challenge and membership durability).
  - An AppBoundry host running a FeltKit artifact with a tenant-scoped collection.
- **UI:** a component test with `react-dom/server` and jsdom where it is available. The full journey is checked in a real browser (Playwright, preinstalled) on desktop and mobile viewports, against Multiplayer.

## 5. Migration

- **FeltKit apps:**
  - `auth.accounts`, `auth.providers` and the bearer client keep working. Existing bearer sessions stay valid.
  - The client defaults to cookie sessions in browsers; `createClient({ session: "bearer" })` keeps the old behaviour.
  - Old verify and reset links stop working at deploy, because they become durable challenges. Users ask for a new link, as after any expiry.
- **Multiplayer:**
  - `workspaces`, `memberships`, `invitations` and `src/auth.tsx` move to FeltKit tenants, memberships, invitations and components.
  - Workspace data collections become tenant-scoped (`{ tenant: { field: "workspaceId" } }`), so existing records and code keep their field.
  - `_authz.ts` keeps channel-level policy, which is application semantics, and loses workspace membership resolution.
  - `participants` stays as the app's profile and handle record, keyed by principal.

## 6. Explicitly not in this phase

The following are not in this phase: MFA, agent definitions, agent principals, delegation, triggers, evaluation, AuthBoundry runtime dependencies, deployment, and new infrastructure.
