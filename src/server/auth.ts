import { getServerSession, type DefaultSession, type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GithubProvider from 'next-auth/providers/github';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { User } from '@prisma/client';
import { prisma } from '@/lib/prisma';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user?: DefaultSession['user'] & {
      id: string;
      role: string;
      rating: number;
      rd: number;
    };
  }
}

const allowlistCache = new Map<string, boolean>();

async function isEmailAllowlisted(email?: string | null) {
  if (!email) return false;
  if (allowlistCache.has(email)) {
    return allowlistCache.get(email) ?? false;
  }
  const entry = await prisma.allowlistEmail.findUnique({ where: { email } });
  const allowed = Boolean(entry);
  allowlistCache.set(email, allowed);
  return allowed;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'database'
  },
  pages: {
    signIn: '/auth/signin'
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ''
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ''
    })
  ],
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowlisted(user.email);
    },
    async session({ session, user }) {
      const prismaUser = user as unknown as User;
      if (session.user) {
        session.user.id = prismaUser.id;
        session.user.role = prismaUser.role;
        session.user.rating = prismaUser.glickoRating;
        session.user.rd = prismaUser.glickoRd;
      }
      return session;
    }
  },
  events: {
    async signIn({ user }) {
      const prismaUser = user as unknown as User;
      if (!prismaUser.email) return;
      await prisma.auditLog.create({
        data: {
          actorId: prismaUser.id,
          message: 'USER_SIGNED_IN'
        }
      });
    }
  }
};

export async function auth() {
  return getServerSession(authOptions);
}
