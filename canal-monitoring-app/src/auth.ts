import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/** Decode a JWT payload without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Returns true if the JWT has already expired. */
function isApiTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return payload.exp * 1000 < Date.now();
}

/** Call the backend to exchange a (possibly expired) apiToken for a fresh one. */
async function refreshApiToken(expiredToken: string): Promise<string | null> {
  try {
    const apiUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001";
    const res = await fetch(`${apiUrl}/api/auth/reissue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.apiToken === "string" ? data.apiToken : null;
  } catch {
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const apiUrl =
            process.env.NEXT_PUBLIC_BACKEND_URL ||
            process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:3001";
          const res = await fetch(`${apiUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;

          const user = await res.json();
          if (!user?.id) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            apiToken: user.apiToken,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in: populate token from the user returned by authorize()
        token.id = user.id;
        token.role = (
          user as { id: string; role: "user" | "admin" | "superadmin" }
        ).role;
        token.apiToken = (user as { apiToken?: string }).apiToken;
      } else if (
        typeof token.apiToken === "string" &&
        token.apiToken &&
        isApiTokenExpired(token.apiToken)
      ) {
        // apiToken has expired — silently refresh it so the session stays alive
        const fresh = await refreshApiToken(token.apiToken);
        if (fresh) {
          token.apiToken = fresh;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "user" | "admin" | "superadmin";
        session.user.apiToken = (token.apiToken as string | undefined) || "";
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      try {
        const target = new URL(url);

        if (target.origin === baseUrl) return url;

        // Allow localhost/loopback redirects during local development,
        // even if NEXTAUTH_URL points to a hosted deployment.
        if (
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(target.origin)
        ) {
          return url;
        }
      } catch {
        return baseUrl;
      }

      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Session cookie lasts 7 days; the apiToken is silently refreshed each
    // time the jwt callback fires (on every request), so users stay logged in
    // as long as their account remains active.
    maxAge: 7 * 24 * 60 * 60,
  },
});
