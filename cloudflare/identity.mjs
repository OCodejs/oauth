const SESSION_COOKIE = "ocodejs_session";
const CSRF_COOKIE = "ocodejs_csrf";
const PASSWORD_ITERATIONS = 600000;
const TOKEN_TTL_SECONDS = 1800;
const EMAIL_ENDPOINT = "https://api.resend.com/emails";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers }
});
const fail = (error, status, message) => json({ error, ...(message ? { message } : {}) }, status);

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}
async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
export async function createCsrfToken(secret) {
  const nonce = randomToken(24);
  return nonce + "." + bytesToBase64Url(await hmac(secret, nonce));
}
export async function validateCsrfToken(token, secret) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const expected = bytesToBase64Url(await hmac(secret, parts[0]));
    return constantTimeEqual(expected, parts[1]);
  } catch { return false; }
}
export async function hashPassword(password, iterations = PASSWORD_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return "pbkdf2-sha256$" + iterations + "$" + bytesToBase64Url(salt) + "$" + bytesToBase64Url(new Uint8Array(bits));
}
export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, count, saltText, hashText] = encoded.split("$");
    const iterations = Number(count);
    if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(saltText), iterations }, material, 256);
    return constantTimeEqual(bytesToBase64Url(new Uint8Array(bits)), hashText);
  } catch { return false; }
}
function parseCookies(header = "") {
  const values = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { values[key] = decodeURIComponent(value); } catch { values[key] = value; }
  }
  return values;
}
function cookie(name, value, maxAge, httpOnly) {
  return name + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + maxAge + "; Secure; SameSite=Lax" + (httpOnly ? "; HttpOnly" : "");
}
function clientIp(request) { return request.headers.get("cf-connecting-ip") || null; }
function userAgent(request) { return (request.headers.get("user-agent") || "").slice(0, 512) || null; }
async function audit(env, request, event, userId = null) {
  try {
    await env.DB.prepare("INSERT INTO audit_logs(user_id,event_type,ip_address,user_agent,created_at) VALUES(?,?,?,?,?)")
      .bind(userId, event, clientIp(request), userAgent(request), Math.floor(Date.now() / 1000)).run();
  } catch { /* Audit failure must not disclose internals or break an auth response. */ }
}
async function rateLimit(env, request, route, max, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const ip = clientIp(request) || "unknown";
  const key = await sha256(route + ":" + ip);
  const result = await env.DB.prepare(`INSERT INTO rate_limits(rate_key,hits,reset_at) VALUES(?,1,?)
    ON CONFLICT(rate_key) DO UPDATE SET
      hits=CASE WHEN rate_limits.reset_at<=? THEN 1 ELSE rate_limits.hits+1 END,
      reset_at=CASE WHEN rate_limits.reset_at<=? THEN ? ELSE rate_limits.reset_at END
    RETURNING hits`).bind(key, now + windowSeconds, now, now, now + windowSeconds).first();
  return Number(result?.hits || 0) <= max;
}
async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16384) throw new Error("body_too_large");
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) throw new Error("invalid_content_type");
  return await request.json();
}
function validEmail(value) {
  return typeof value === "string" && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function validPassword(value) { return typeof value === "string" && value.length >= 12 && value.length <= 128; }
async function issueAccountToken(env, userId, purpose) {
  const raw = randomToken(32);
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    env.DB.prepare("UPDATE account_action_tokens SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL").bind(now, userId, purpose),
    env.DB.prepare("INSERT INTO account_action_tokens(id,user_id,token_hash,purpose,expires_at,created_at) VALUES(?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), userId, await sha256(raw), purpose, now + TOKEN_TTL_SECONDS, now)
  ];
  await env.DB.batch(statements);
  return raw;
}
async function sendEmail(env, to, subject, text, html) {
  if (!env.EMAIL_API_KEY) throw new Error("email_provider_not_configured");
  const endpoint = env.EMAIL_API_URL || EMAIL_ENDPOINT;
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("email_provider_must_use_https");
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + env.EMAIL_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM || "OCodeJS <onboarding@resend.dev>", to: [to], subject, text, html }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("email_provider_rejected_request");
}
function accountUrl(env, parameter, token) {
  const base = new URL(env.APP_BASE_URL || "https://example.invalid");
  if (base.protocol !== "https:") throw new Error("app_base_url_must_use_https");
  base.searchParams.set(parameter, token);
  return base.toString();
}
async function sendActionEmail(env, email, purpose, token) {
  const verify = purpose === "email_verification";
  const link = accountUrl(env, verify ? "verify" : "reset", token);
  const subject = verify ? "Verify your OCodeJS account" : "Reset your OCodeJS password";
  const text = verify ? `Verify your email address: ${link}\nThis link expires in 30 minutes.` :
    `Reset your password: ${link}\nThis link expires in 30 minutes. If you did not request this, ignore this email.`;
  const html = verify ? `<p>Verify your OCodeJS email address.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 30 minutes.</p>` :
    `<p>A password reset was requested.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 30 minutes.</p>`;
  await sendEmail(env, email, subject, text, html);
}
async function requireCsrf(request, env) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const header = request.headers.get("x-csrf-token");
  return Boolean(cookies[CSRF_COOKIE] && header && constantTimeEqual(cookies[CSRF_COOKIE], header) &&
    await validateCsrfToken(header, env.CSRF_SECRET));
}
async function getCurrentUser(request, env) {
  const raw = parseCookies(request.headers.get("cookie") || "")[SESSION_COOKIE];
  if (!raw) return null;
  const tokenHash = await sha256(raw);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`SELECT u.id,u.email,u.email_verified_at,s.token_hash
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' LIMIT 1`).bind(tokenHash, now).first();
  if (!row) return null;
  await env.DB.prepare("UPDATE user_sessions SET last_seen_at=? WHERE token_hash=?").bind(now, tokenHash).run();
  return { id: row.id, email: row.email, email_verified: Boolean(row.email_verified_at), tokenHash };
}
async function createSession(request, env, userId) {
  const raw = randomToken(48);
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(300, Math.min(2592000, Number(env.SESSION_TTL_SECONDS) || 604800));
  await env.DB.prepare(`INSERT INTO user_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at,user_agent,ip_address)
    VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, await sha256(raw), now, now + ttl, now, userAgent(request), clientIp(request)).run();
  return { raw, ttl };
}

export async function handleIdentity(request, env, url) {
  if (!env.DB || !env.CSRF_SECRET || env.CSRF_SECRET.length < 32) return fail("IDENTITY_PREVIEW_NOT_CONFIGURED", 503, "D1 and the Preview CSRF secret must be configured.");
  const path = url.pathname;
  const method = request.method;
  const now = Math.floor(Date.now() / 1000);
  const cookies = parseCookies(request.headers.get("cookie") || "");

  try {
    if (path === "/api/v1/auth/csrf" && method === "GET") {
      const token = await createCsrfToken(env.CSRF_SECRET);
      return json({ csrfToken: token }, 200, { "set-cookie": cookie(CSRF_COOKIE, token, 3600, false) });
    }

    const writeRoutes = new Set([
      "/api/v1/auth/register", "/api/v1/auth/verify-email", "/api/v1/auth/resend-verification",
      "/api/v1/auth/request-password-reset", "/api/v1/auth/reset-password", "/api/v1/auth/login",
      "/api/v1/auth/logout"
    ]);
    if (writeRoutes.has(path) && !(await requireCsrf(request, env))) return fail("csrf_failed", 403, "CSRF validation failed.");

    if (path === "/api/v1/auth/register" && method === "POST") {
      if (!(await rateLimit(env, request, "register", 5, 900))) return fail("rate_limited", 429, "Too many registration attempts.");
      const body = await readJson(request);
      if (!validEmail(body.email) || !validPassword(body.password)) return fail("invalid_input", 400, "Enter a valid email and a password of at least 12 characters.");
      const email = body.email.trim(), normalized = email.toLowerCase();
      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(body.password);
      try {
        await env.DB.prepare("INSERT INTO users(id,email,email_normalized,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)")
          .bind(userId, email, normalized, passwordHash, now, now).run();
      } catch {
        return fail("account_exists", 409, "An account with this email already exists.");
      }
      const token = await issueAccountToken(env, userId, "email_verification");
      try {
        await sendActionEmail(env, email, "email_verification", token);
        await audit(env, request, "account.registered", userId);
        return json({ ok: true, verification_required: true, message: "Check your email for a verification link." }, 201);
      } catch {
        await audit(env, request, "account.registered_email_pending", userId);
        return fail("email_delivery_unavailable", 503, "The account was created but verification email delivery is not configured. Retry verification after configuring the Preview email provider.");
      }
    }

    if (path === "/api/v1/auth/verify-email" && method === "POST") {
      if (!(await rateLimit(env, request, "verify-email", 10, 900))) return fail("rate_limited", 429);
      const body = await readJson(request);
      if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 256) return fail("invalid_token", 400);
      const tokenHash = await sha256(body.token);
      const consumed = await env.DB.prepare(`UPDATE account_action_tokens SET consumed_at=?
        WHERE token_hash=? AND purpose='email_verification' AND consumed_at IS NULL AND expires_at>? RETURNING user_id`)
        .bind(now, tokenHash, now).first();
      if (!consumed?.user_id) return fail("invalid_or_expired_token", 400);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET email_verified_at=?,updated_at=? WHERE id=?").bind(now, now, consumed.user_id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,event_type,ip_address,user_agent,created_at) VALUES(?,?,?,?,?)")
          .bind(consumed.user_id, "account.email_verified", clientIp(request), userAgent(request), now)
      ]);
      return json({ ok: true, message: "Email verified. You can now log in." });
    }

    if (path === "/api/v1/auth/resend-verification" && method === "POST") {
      if (!(await rateLimit(env, request, "resend-verification", 3, 900))) return fail("rate_limited", 429);
      const body = await readJson(request);
      if (!validEmail(body.email)) return fail("invalid_input", 400);
      const user = await env.DB.prepare("SELECT id,email FROM users WHERE email_normalized=? AND email_verified_at IS NULL AND status='active' LIMIT 1")
        .bind(body.email.trim().toLowerCase()).first();
      if (user) {
        const token = await issueAccountToken(env, user.id, "email_verification");
        try { await sendActionEmail(env, user.email, "email_verification", token); }
        catch { /* Keep the response non-enumerating. */ }
      }
      return json({ ok: true, message: "If the account needs verification, an email will be sent." });
    }

    if (path === "/api/v1/auth/request-password-reset" && method === "POST") {
      if (!(await rateLimit(env, request, "password-reset-request", 3, 900))) return fail("rate_limited", 429);
      const body = await readJson(request);
      if (!validEmail(body.email)) return fail("invalid_input", 400);
      const user = await env.DB.prepare("SELECT id,email FROM users WHERE email_normalized=? AND status='active' LIMIT 1")
        .bind(body.email.trim().toLowerCase()).first();
      if (user) {
        const token = await issueAccountToken(env, user.id, "password_reset");
        try {
          await sendActionEmail(env, user.email, "password_reset", token);
          await audit(env, request, "auth.password_reset_requested", user.id);
        } catch { /* Keep the response non-enumerating. */ }
      }
      return json({ ok: true, message: "If an account matches that address, a reset link will be sent." });
    }

    if (path === "/api/v1/auth/reset-password" && method === "POST") {
      if (!(await rateLimit(env, request, "password-reset", 5, 900))) return fail("rate_limited", 429);
      const body = await readJson(request);
      if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 256 || !validPassword(body.password)) return fail("invalid_input", 400);
      const tokenHash = await sha256(body.token);
      const consumed = await env.DB.prepare(`UPDATE account_action_tokens SET consumed_at=?
        WHERE token_hash=? AND purpose='password_reset' AND consumed_at IS NULL AND expires_at>? RETURNING user_id`)
        .bind(now, tokenHash, now).first();
      if (!consumed?.user_id) return fail("invalid_or_expired_token", 400);
      const passwordHash = await hashPassword(body.password);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").bind(passwordHash, now, consumed.user_id),
        env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(consumed.user_id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,event_type,ip_address,user_agent,created_at) VALUES(?,?,?,?,?)")
          .bind(consumed.user_id, "auth.password_reset_completed", clientIp(request), userAgent(request), now)
      ]);
      return json({ ok: true, message: "Password updated. Please log in again." });
    }

    if (path === "/api/v1/auth/login" && method === "POST") {
      if (!(await rateLimit(env, request, "login", 10, 900))) return fail("rate_limited", 429);
      const body = await readJson(request);
      if (!validEmail(body.email) || !validPassword(body.password)) return fail("invalid_credentials", 401, "Invalid email or password.");
      const user = await env.DB.prepare("SELECT id,email,password_hash,status,email_verified_at FROM users WHERE email_normalized=? LIMIT 1")
        .bind(body.email.trim().toLowerCase()).first();
      const valid = user && user.status === "active" ? await verifyPassword(body.password, user.password_hash) : false;
      if (!valid || !user) {
        await audit(env, request, "auth.login_failed");
        return fail("invalid_credentials", 401, "Invalid email or password.");
      }
      if (!user.email_verified_at) return fail("email_not_verified", 403, "Verify your email before logging in.");
      await env.DB.prepare("DELETE FROM user_sessions WHERE user_id=? AND expires_at<=?").bind(user.id, now).run();
      const session = await createSession(request, env, user.id);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET last_login_at=? WHERE id=?").bind(now, user.id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,event_type,ip_address,user_agent,created_at) VALUES(?,?,?,?,?)")
          .bind(user.id, "auth.login_succeeded", clientIp(request), userAgent(request), now)
      ]);
      return json({ user: { id: user.id, email: user.email, email_verified: true } }, 200, {
        "set-cookie": cookie(SESSION_COOKIE, session.raw, session.ttl, true)
      });
    }

    if (path === "/api/v1/me" && method === "GET") {
      const user = await getCurrentUser(request, env);
      if (!user) return fail("unauthenticated", 401);
      return json({ user: { id: user.id, email: user.email, email_verified: user.email_verified } });
    }

    if (path === "/api/v1/auth/logout" && method === "POST") {
      const user = await getCurrentUser(request, env);
      if (cookies[SESSION_COOKIE]) await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash=?").bind(await sha256(cookies[SESSION_COOKIE])).run();
      await audit(env, request, "auth.logout", user?.id || null);
      return json({ ok: true }, 200, {
        "set-cookie": cookie(SESSION_COOKIE, "", 0, true)
      });
    }

    return fail("not_found", 404);
  } catch (error) {
    if (error?.message === "body_too_large") return fail("payload_too_large", 413);
    if (error?.message === "invalid_content_type") return fail("invalid_content_type", 415);
    return fail("identity_service_unavailable", 503, "The Preview identity service could not complete the request.");
  }
}
