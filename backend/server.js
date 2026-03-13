const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = path.resolve(__dirname, "..");
const DB_PATH = path.join(__dirname, "data.json");
const MAX_BODY_BYTES = 35 * 1024 * 1024;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const TOKEN_SECRET = process.env.AUTH_SECRET || "replace-me-in-production";
const BASE_URL = process.env.BASE_URL || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function nowIso() {
  return new Date().toISOString();
}

function addMsToIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createRawToken() {
  return crypto.randomBytes(24).toString("hex");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function signTokenPart(value) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest("base64url");
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createToken(userId) {
  const payload = {
    sub: userId,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = signTokenPart(encoded);
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  const expectedSig = signTokenPart(encoded);
  if (!safeEqualText(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload || typeof payload.sub !== "string" || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return {
    hashHex: hash.toString("hex"),
    saltHex: salt.toString("hex")
  };
}

function verifyPassword(password, user) {
  const computed = hashPassword(password, user.saltHex);
  return safeEqualText(computed.hashHex, user.passwordHashHex);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified)
  };
}

function sanitizeProject(project) {
  return {
    id: project.id,
    ownerId: project.ownerId,
    title: project.title,
    state: project.state,
    isPublic: project.isPublic,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(body);
}

function getAllowedOrigins() {
  const origins = new Set();

  if (BASE_URL) {
    try {
      origins.add(new URL(BASE_URL).origin);
    } catch (_error) {
      throw new Error("BASE_URL must be a valid absolute URL.");
    }
  }

  if (!IS_PRODUCTION) {
    origins.add("http://localhost:8787");
    origins.add("http://127.0.0.1:8787");
  }

  return origins;
}

function applySecurityHeaders(req, res, allowedOrigins) {
  const origin = req.headers.origin || "";

  res.setHeader("Vary", "Origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src https://open.spotify.com",
      "media-src 'self' data: blob: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'"
    ].join("; ")
  );

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
}

function validateProductionConfig() {
  if (!IS_PRODUCTION) return;

  if (TOKEN_SECRET === "replace-me-in-production") {
    throw new Error("AUTH_SECRET must be set to a strong secret in production.");
  }

  if (!BASE_URL) {
    throw new Error("BASE_URL must be set in production.");
  }

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in production.");
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let body = "";

    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", (error) => reject(error));
  });
}

function buildAbsoluteUrl(req, pathname, query = {}) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `localhost:${PORT}`;
  const root = BASE_URL || `${protocol}://${host}`;
  const url = new URL(pathname, root.endsWith("/") ? root : `${root}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async init() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ users: [], projects: [], authTokens: [] }, null, 2)
      );
    }
  }

  readDb() {
    const raw = fs.readFileSync(this.filePath, "utf-8");
    const parsed = JSON.parse(raw || "{}");
    if (!Array.isArray(parsed.users)) parsed.users = [];
    if (!Array.isArray(parsed.projects)) parsed.projects = [];
    if (!Array.isArray(parsed.authTokens)) parsed.authTokens = [];
    return parsed;
  }

  writeDb(db) {
    fs.writeFileSync(this.filePath, JSON.stringify(db, null, 2));
  }

  async getUserByEmail(email) {
    const db = this.readDb();
    return db.users.find((user) => user.email === email) || null;
  }

  async getUserById(id) {
    const db = this.readDb();
    return db.users.find((user) => user.id === id) || null;
  }

  async createUser(user) {
    const db = this.readDb();
    db.users.push(user);
    this.writeDb(db);
    return user;
  }

  async updateUser(userId, updates) {
    const db = this.readDb();
    const user = db.users.find((entry) => entry.id === userId);
    if (!user) return null;
    Object.assign(user, updates);
    this.writeDb(db);
    return user;
  }

  async listProjectsByOwner(ownerId) {
    const db = this.readDb();
    return db.projects
      .filter((project) => project.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProject(project) {
    const db = this.readDb();
    db.projects.push(project);
    this.writeDb(db);
    return project;
  }

  async getProjectById(projectId) {
    const db = this.readDb();
    return db.projects.find((project) => project.id === projectId) || null;
  }

  async updateProject(projectId, updates) {
    const db = this.readDb();
    const project = db.projects.find((entry) => entry.id === projectId);
    if (!project) return null;
    Object.assign(project, updates);
    this.writeDb(db);
    return project;
  }

  async saveAuthToken(tokenRow) {
    const db = this.readDb();
    db.authTokens.push(tokenRow);
    this.writeDb(db);
    return tokenRow;
  }

  async consumeAuthToken(type, tokenHash) {
    const db = this.readDb();
    const token = db.authTokens.find(
      (entry) =>
        entry.type === type &&
        entry.tokenHash === tokenHash &&
        !entry.usedAt &&
        new Date(entry.expiresAt).getTime() > Date.now()
    );

    if (!token) return null;
    token.usedAt = nowIso();
    this.writeDb(db);
    return token;
  }
}

class PostgresStore {
  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl;
    this.client = null;
  }

  async init() {
    let pg;
    try {
      pg = require("pg");
    } catch (_error) {
      throw new Error(
        "DATABASE_URL is set but pg is not installed. Run: npm install --prefix backend"
      );
    }

    const { Client } = pg;
    this.client = new Client({ connectionString: this.databaseUrl });
    await this.client.connect();

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash_hex TEXT NOT NULL,
        salt_hex TEXT NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        state JSONB NOT NULL,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_owner_updated ON projects(owner_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(type, token_hash);
    `);
  }

  toUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHashHex: row.password_hash_hex,
      saltHex: row.salt_hex,
      emailVerified: row.email_verified,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  toProject(row) {
    if (!row) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      state: row.state,
      isPublic: row.is_public,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  toAuthToken(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at).toISOString(),
      usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  async getUserByEmail(email) {
    const result = await this.client.query("SELECT * FROM users WHERE email = $1", [email]);
    return this.toUser(result.rows[0]);
  }

  async getUserById(id) {
    const result = await this.client.query("SELECT * FROM users WHERE id = $1", [id]);
    return this.toUser(result.rows[0]);
  }

  async createUser(user) {
    await this.client.query(
      `INSERT INTO users (id, name, email, password_hash_hex, salt_hex, email_verified, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        user.id,
        user.name,
        user.email,
        user.passwordHashHex,
        user.saltHex,
        user.emailVerified,
        user.createdAt,
        user.updatedAt
      ]
    );
    return user;
  }

  async updateUser(userId, updates) {
    const fields = [];
    const values = [];
    let idx = 1;

    const mapping = {
      name: "name",
      passwordHashHex: "password_hash_hex",
      saltHex: "salt_hex",
      emailVerified: "email_verified",
      updatedAt: "updated_at"
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (!(key in mapping)) return;
      fields.push(`${mapping[key]} = $${idx}`);
      values.push(value);
      idx += 1;
    });

    if (!fields.length) {
      return this.getUserById(userId);
    }

    values.push(userId);
    const result = await this.client.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    return this.toUser(result.rows[0]);
  }

  async listProjectsByOwner(ownerId) {
    const result = await this.client.query(
      "SELECT * FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC",
      [ownerId]
    );
    return result.rows.map((row) => this.toProject(row));
  }

  async createProject(project) {
    await this.client.query(
      `INSERT INTO projects (id, owner_id, title, state, is_public, created_at, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
      [
        project.id,
        project.ownerId,
        project.title,
        JSON.stringify(project.state),
        project.isPublic,
        project.createdAt,
        project.updatedAt
      ]
    );
    return project;
  }

  async getProjectById(projectId) {
    const result = await this.client.query("SELECT * FROM projects WHERE id = $1", [projectId]);
    return this.toProject(result.rows[0]);
  }

  async updateProject(projectId, updates) {
    const fields = [];
    const values = [];
    let idx = 1;

    if ("title" in updates) {
      fields.push(`title = $${idx}`);
      values.push(updates.title);
      idx += 1;
    }

    if ("state" in updates) {
      fields.push(`state = $${idx}::jsonb`);
      values.push(JSON.stringify(updates.state));
      idx += 1;
    }

    if ("isPublic" in updates) {
      fields.push(`is_public = $${idx}`);
      values.push(updates.isPublic);
      idx += 1;
    }

    if ("updatedAt" in updates) {
      fields.push(`updated_at = $${idx}`);
      values.push(updates.updatedAt);
      idx += 1;
    }

    values.push(projectId);
    const result = await this.client.query(
      `UPDATE projects SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return this.toProject(result.rows[0]);
  }

  async saveAuthToken(tokenRow) {
    await this.client.query(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, used_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        tokenRow.id,
        tokenRow.userId,
        tokenRow.type,
        tokenRow.tokenHash,
        tokenRow.expiresAt,
        tokenRow.usedAt,
        tokenRow.createdAt
      ]
    );
    return tokenRow;
  }

  async consumeAuthToken(type, tokenHash) {
    const result = await this.client.query(
      `UPDATE auth_tokens
       SET used_at = NOW()
       WHERE id = (
         SELECT id
         FROM auth_tokens
         WHERE type = $1
           AND token_hash = $2
           AND used_at IS NULL
           AND expires_at > NOW()
         LIMIT 1
       )
       RETURNING *`,
      [type, tokenHash]
    );
    return this.toAuthToken(result.rows[0]);
  }
}

async function createStore() {
  if (DATABASE_URL) {
    const store = new PostgresStore(DATABASE_URL);
    await store.init();
    console.log("Using PostgreSQL storage");
    return store;
  }

  const store = new FileStore(DB_PATH);
  await store.init();
  console.log("Using file storage at backend/data.json");
  return store;
}

async function getAuthUser(req, store) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) return null;
  return store.getUserById(payload.sub);
}

async function issueActionToken(store, userId, type, ttlMs) {
  const rawToken = createRawToken();
  const tokenHash = sha256(rawToken);
  const tokenRow = {
    id: crypto.randomUUID(),
    userId,
    type,
    tokenHash,
    expiresAt: addMsToIso(ttlMs),
    usedAt: null,
    createdAt: nowIso()
  };

  await store.saveAuthToken(tokenRow);
  return rawToken;
}

async function handleApi(req, res, pathname, store) {
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, database: DATABASE_URL ? "postgres" : "file" });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/signup") {
    const body = await readJsonBody(req);
    const name = String(body.name || "").trim() || "Guest";
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      sendJson(res, 400, { error: "Email and password are required." });
      return;
    }

    if (password.length < 8) {
      sendJson(res, 400, { error: "Password must be at least 8 characters." });
      return;
    }

    const existing = await store.getUserByEmail(email);
    if (existing) {
      sendJson(res, 409, { error: "Email is already registered." });
      return;
    }

    const { hashHex, saltHex } = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHashHex: hashHex,
      saltHex,
      emailVerified: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await store.createUser(user);

    const verifyTokenRaw = await issueActionToken(
      store,
      user.id,
      "email_verify",
      EMAIL_VERIFY_TTL_MS
    );

    const verificationPlaceholderUrl = buildAbsoluteUrl(req, "/photobooth/index.html", {
      mode: "verify-email",
      token: verifyTokenRaw
    });

    sendJson(res, 201, {
      token: createToken(user.id),
      user: sanitizeUser(user),
      verificationPlaceholderUrl
    });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const user = await store.getUserByEmail(email);
    if (!user || !verifyPassword(password, user)) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }

    sendJson(res, 200, {
      token: createToken(user.id),
      user: sanitizeUser(user)
    });
    return;
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    const user = await getAuthUser(req, store);
    if (!user) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }
    sendJson(res, 200, { user: sanitizeUser(user) });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/request-email-verification") {
    const body = await readJsonBody(req);
    const incomingEmail = String(body.email || "").trim().toLowerCase();
    let user = null;

    if (incomingEmail) {
      user = await store.getUserByEmail(incomingEmail);
    }

    if (!user) {
      user = await getAuthUser(req, store);
    }

    if (!user) {
      sendJson(res, 200, { message: "If the account exists, a verification link was sent." });
      return;
    }

    if (user.emailVerified) {
      sendJson(res, 200, { message: "Email is already verified." });
      return;
    }

    const verifyTokenRaw = await issueActionToken(
      store,
      user.id,
      "email_verify",
      EMAIL_VERIFY_TTL_MS
    );

    const verificationPlaceholderUrl = buildAbsoluteUrl(req, "/photobooth/index.html", {
      mode: "verify-email",
      token: verifyTokenRaw
    });

    sendJson(res, 200, {
      message: "Verification link generated.",
      verificationPlaceholderUrl
    });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/verify-email") {
    const body = await readJsonBody(req);
    const token = String(body.token || "").trim();
    if (!token) {
      sendJson(res, 400, { error: "Verification token is required." });
      return;
    }

    const consumed = await store.consumeAuthToken("email_verify", sha256(token));
    if (!consumed) {
      sendJson(res, 400, { error: "Invalid or expired verification token." });
      return;
    }

    const user = await store.updateUser(consumed.userId, {
      emailVerified: true,
      updatedAt: nowIso()
    });

    sendJson(res, 200, {
      message: "Email verified.",
      user: sanitizeUser(user)
    });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/request-password-reset") {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) {
      sendJson(res, 400, { error: "Email is required." });
      return;
    }

    const user = await store.getUserByEmail(email);
    if (!user) {
      sendJson(res, 200, { message: "If the account exists, a reset link was sent." });
      return;
    }

    const resetTokenRaw = await issueActionToken(
      store,
      user.id,
      "password_reset",
      PASSWORD_RESET_TTL_MS
    );

    const resetPlaceholderUrl = buildAbsoluteUrl(req, "/photobooth/index.html", {
      mode: "reset-password",
      token: resetTokenRaw
    });

    sendJson(res, 200, {
      message: "Password reset link generated.",
      resetPlaceholderUrl
    });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/reset-password") {
    const body = await readJsonBody(req);
    const token = String(body.token || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!token || !newPassword) {
      sendJson(res, 400, { error: "Token and new password are required." });
      return;
    }

    if (newPassword.length < 8) {
      sendJson(res, 400, { error: "New password must be at least 8 characters." });
      return;
    }

    const consumed = await store.consumeAuthToken("password_reset", sha256(token));
    if (!consumed) {
      sendJson(res, 400, { error: "Invalid or expired reset token." });
      return;
    }

    const { hashHex, saltHex } = hashPassword(newPassword);
    await store.updateUser(consumed.userId, {
      passwordHashHex: hashHex,
      saltHex,
      updatedAt: nowIso()
    });

    sendJson(res, 200, { message: "Password reset successful." });
    return;
  }

  if (method === "GET" && pathname === "/api/projects/mine") {
    const user = await getAuthUser(req, store);
    if (!user) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    const projects = (await store.listProjectsByOwner(user.id)).map((project) => ({
      id: project.id,
      title: project.title,
      updatedAt: project.updatedAt,
      isPublic: project.isPublic
    }));

    sendJson(res, 200, { projects });
    return;
  }

  if (method === "POST" && pathname === "/api/projects") {
    const user = await getAuthUser(req, store);
    if (!user) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    if (!user.emailVerified) {
      sendJson(res, 403, { error: "Please verify your email before saving online." });
      return;
    }

    const body = await readJsonBody(req);
    if (!body.state || typeof body.state !== "object") {
      sendJson(res, 400, { error: "Project state is required." });
      return;
    }

    const now = nowIso();
    const project = {
      id: crypto.randomUUID(),
      ownerId: user.id,
      title: String(body.title || "Photobooth"),
      state: body.state,
      isPublic: body.isPublic !== false,
      createdAt: now,
      updatedAt: now
    };

    await store.createProject(project);

    sendJson(res, 201, {
      project: sanitizeProject(project),
      sharePath: `/photobooth/index.html?project=${project.id}`
    });
    return;
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)$/);
  if (projectMatch) {
    const projectId = projectMatch[1];
    const project = await store.getProjectById(projectId);
    if (!project) {
      sendJson(res, 404, { error: "Project not found." });
      return;
    }

    if (method === "GET") {
      const user = await getAuthUser(req, store);
      if (!project.isPublic && (!user || user.id !== project.ownerId)) {
        sendJson(res, 403, { error: "Project is private." });
        return;
      }

      sendJson(res, 200, { project: sanitizeProject(project) });
      return;
    }

    if (method === "PUT") {
      const user = await getAuthUser(req, store);
      if (!user) {
        sendJson(res, 401, { error: "Unauthorized." });
        return;
      }
      if (user.id !== project.ownerId) {
        sendJson(res, 403, { error: "Only the owner can update this project." });
        return;
      }
      if (!user.emailVerified) {
        sendJson(res, 403, { error: "Please verify your email before saving online." });
        return;
      }

      const body = await readJsonBody(req);
      if (!body.state || typeof body.state !== "object") {
        sendJson(res, 400, { error: "Project state is required." });
        return;
      }

      const updated = await store.updateProject(project.id, {
        state: body.state,
        title: String(body.title || project.title || "Photobooth"),
        isPublic: typeof body.isPublic === "boolean" ? body.isPublic : project.isPublic,
        updatedAt: nowIso()
      });

      sendJson(res, 200, {
        project: sanitizeProject(updated),
        sharePath: `/photobooth/index.html?project=${project.id}`
      });
      return;
    }
  }

  sendJson(res, 404, { error: "API route not found." });
}

function serveStatic(req, res, pathname) {
  let relativePath = pathname;
  if (relativePath === "/") {
    relativePath = "/index.html";
  }

  const absolutePath = path.resolve(ROOT_DIR, `.${relativePath}`);
  if (!absolutePath.startsWith(ROOT_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  let targetPath = absolutePath;
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    targetPath = path.join(targetPath, "index.html");
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(targetPath).pipe(res);
}

(async function start() {
  validateProductionConfig();
  const store = await createStore();
  const allowedOrigins = getAllowedOrigins();

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    applySecurityHeaders(req, res, allowedOrigins);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname.startsWith("/api/")) {
        await handleApi(req, res, pathname, store);
        return;
      }
      serveStatic(req, res, pathname);
    } catch (error) {
      const message = error && error.message ? error.message : "Unexpected server error";
      const status = message === "Payload too large" ? 413 : 500;
      sendJson(res, status, { error: message });
    }
  });

  server.listen(PORT, () => {
    console.log(`Photobooth server running on http://localhost:${PORT}`);
    if (TOKEN_SECRET === "replace-me-in-production") {
      console.log("Warning: using default AUTH secret. Set AUTH_SECRET in production.");
    }
  });
})();
