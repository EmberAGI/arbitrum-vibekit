import NextAuth from 'next-auth';

import { authConfig } from '@/app/(auth)/auth.config';

// Wrap the generated middleware in a constant and cast to `any` to prevent
// the compiler from trying to reference private `next-auth` types.
const authMiddleware: any = NextAuth(authConfig).auth;

export default authMiddleware;

export const config = {
  matcher: ['/', '/:id', '/api/:path*'],
};
