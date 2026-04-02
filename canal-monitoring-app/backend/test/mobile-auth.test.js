const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const { createMobileAuthRouter } = require("../routes/mobileAuth");

function createRefreshTokenModel() {
  const store = new Map();

  class TokenDoc {
    constructor(value) {
      this.userId = value.userId;
      this.tokenHash = value.tokenHash;
      this.expiresAt = value.expiresAt;
      this.revokedAt = value.revokedAt || null;
      this.replacedByTokenHash = value.replacedByTokenHash || null;
      this.lastUsedAt = value.lastUsedAt || null;
    }

    async save() {
      store.set(this.tokenHash, this);
      return this;
    }
  }

  return {
    async create(value) {
      const doc = new TokenDoc(value);
      store.set(doc.tokenHash, doc);
      return doc;
    },
    async findOne(query) {
      return store.get(query.tokenHash) || null;
    },
    _store: store,
  };
}

function createAppAndState() {
  const user = {
    _id: "u1",
    id: "u1",
    email: "user@example.com",
    name: "Mobile User",
    role: "user",
    isApproved: true,
  };

  const refreshModel = createRefreshTokenModel();
  let refreshCounter = 1;

  const tokenHelpers = {
    ACCESS_EXPIRES_SECONDS: 900,
    ALLOWED_MOBILE_ROLES: new Set(["admin", "user"]),
    hashToken(token) {
      return `hash:${String(token)}`;
    },
    issueMobileAccessToken(subjectUser) {
      return `access:${subjectUser._id || subjectUser.id}`;
    },
    issueMobileRefreshToken(subjectUser) {
      const token = `refresh:${subjectUser._id || subjectUser.id}:${refreshCounter}`;
      refreshCounter += 1;
      return token;
    },
    verifyMobileRefreshToken(token) {
      const value = String(token || "");
      const parts = value.split(":");
      if (parts.length !== 3 || parts[0] !== "refresh") {
        throw new Error("invalid refresh token");
      }
      return {
        sub: parts[1],
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
    },
    getExpDateFromPayload(payload) {
      return new Date((payload.exp || 0) * 1000);
    },
    buildMobileUserPayload(subjectUser) {
      return {
        id: String(subjectUser._id || subjectUser.id),
        email: subjectUser.email,
        name: subjectUser.name,
        role: subjectUser.role,
      };
    },
  };

  const authHelpers = {
    async authenticateUserCredentials(_UserModel, email, password) {
      if (String(email).toLowerCase().trim() !== user.email || password !== "pass123") {
        return { ok: false, status: 401, error: "Invalid credentials" };
      }
      return { ok: true, user };
    },
    async writeLoginAudit() {
      return undefined;
    },
  };

  const UserModel = {
    findById(id) {
      if (String(id) !== user._id) {
        return {
          select() {
            return {
              lean: async () => null,
            };
          },
        };
      }

      return {
        select() {
          return {
            lean: async () => ({ ...user }),
          };
        },
      };
    },
  };

  const noRateLimit = () => (_req, _res, next) => next();

  const requireMobileJwtAuth = (req, res, next) => {
    const header = String(req.headers.authorization || "").trim();
    if (header !== "Bearer valid-access-token") {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
    }

    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    return next();
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/mobile-auth",
    createMobileAuthRouter({
      User: UserModel,
      MobileRefreshToken: refreshModel,
      requireMobileJwtAuth,
      authHelpers,
      tokenHelpers,
      rateLimit: noRateLimit,
    }),
  );

  return { app, user, refreshModel };
}

test("POST /api/mobile-auth/login success", async () => {
  const { app } = createAppAndState();

  const response = await request(app)
    .post("/api/mobile-auth/login")
    .send({ email: "user@example.com", password: "pass123" });

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.accessToken, "string");
  assert.equal(typeof response.body.refreshToken, "string");
  assert.equal(response.body.expiresIn, 900);
  assert.equal(response.body.user.email, "user@example.com");
  assert.equal(response.body.user.role, "user");
});

test("POST /api/mobile-auth/login failure", async () => {
  const { app } = createAppAndState();

  const response = await request(app)
    .post("/api/mobile-auth/login")
    .send({ email: "user@example.com", password: "wrong-pass" });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Invalid credentials");
});

test("GET /api/mobile-auth/me with valid token", async () => {
  const { app, user } = createAppAndState();

  const response = await request(app)
    .get("/api/mobile-auth/me")
    .set("Authorization", "Bearer valid-access-token");

  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, user._id);
  assert.equal(response.body.user.email, user.email);
  assert.equal(response.body.user.role, user.role);
});

test("GET /api/mobile-auth/me with invalid token", async () => {
  const { app } = createAppAndState();

  const response = await request(app)
    .get("/api/mobile-auth/me")
    .set("Authorization", "Bearer invalid-token");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Unauthorized");
});

test("POST /api/mobile-auth/refresh success and failure", async () => {
  const { app } = createAppAndState();

  const login = await request(app)
    .post("/api/mobile-auth/login")
    .send({ email: "user@example.com", password: "pass123" });

  assert.equal(login.status, 200);

  const refreshOk = await request(app)
    .post("/api/mobile-auth/refresh")
    .send({ refreshToken: login.body.refreshToken });

  assert.equal(refreshOk.status, 200);
  assert.equal(typeof refreshOk.body.accessToken, "string");
  assert.equal(typeof refreshOk.body.refreshToken, "string");

  const refreshFail = await request(app)
    .post("/api/mobile-auth/refresh")
    .send({ refreshToken: "bad-refresh-token" });

  assert.equal(refreshFail.status, 401);
  assert.equal(refreshFail.body.error, "Invalid or expired refresh token");
});

test("POST /api/mobile-auth/logout revokes refresh token", async () => {
  const { app, refreshModel } = createAppAndState();

  const login = await request(app)
    .post("/api/mobile-auth/login")
    .send({ email: "user@example.com", password: "pass123" });

  assert.equal(login.status, 200);

  const logout = await request(app)
    .post("/api/mobile-auth/logout")
    .send({ refreshToken: login.body.refreshToken });

  assert.equal(logout.status, 200);
  assert.equal(logout.body.success, true);

  const tokenHash = `hash:${login.body.refreshToken}`;
  const stored = refreshModel._store.get(tokenHash);
  assert.ok(stored);
  assert.ok(stored.revokedAt instanceof Date);

  const refreshAfterLogout = await request(app)
    .post("/api/mobile-auth/refresh")
    .send({ refreshToken: login.body.refreshToken });

  assert.equal(refreshAfterLogout.status, 401);
  assert.equal(refreshAfterLogout.body.error, "Invalid or expired refresh token");
});
