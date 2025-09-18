export { default } from 'next-auth/middleware';

export const config = {
  matcher: ['/submit', '/admin/:path*', '/api/matches/:path*', '/api/admin/:path*']
};
