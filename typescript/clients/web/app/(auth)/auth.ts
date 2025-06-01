import NextAuth, { type DefaultSession } from 'next-auth';

import { authConfig } from './auth.config';
import Credentials from 'next-auth/providers/credentials';
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { getOrCreateUser } from '@/lib/db/queries';
import type { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      address: string;
    } & DefaultSession['user'];
  }
  interface User {
    id?: string;
    address?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    address: string;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'RainbowKit',
      credentials: {
        message: {
          label: 'Message',
          placeholder: '0x0',
          type: 'text',
        },
        signature: {
          label: 'Signature',
          placeholder: '0x0',
          type: 'text',
        },
      },
      async authorize(credentials: any) {
        try {
          const siweMessage = parseSiweMessage(credentials?.message);

          if (!siweMessage.address) {
            return null;
          }

          if (
            !validateSiweMessage({
              address: siweMessage?.address,
              message: siweMessage,
            })
          ) {
            return null;
          }

          const user = (await getOrCreateUser(siweMessage.address))[0];
          return {
            id: user.id,
            address: user.address,
          };
        } catch (e) {
          console.error('Error authorizing user', e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id && user?.address) {
        token.id = user.id;
        token.address = user.address;
      }

      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id,
          address: token.address,
        },
      };
    },
  },
});
