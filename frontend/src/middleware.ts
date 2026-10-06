import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  
  // Publiczne ścieżki - tylko strony logowania i rejestracji
  const isPublicPath = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');
  
  // Jeśli to nie jest publiczna ścieżka, wymuś autoryzację
  if (!isPublicPath) {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
      return redirectToSignIn();
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|svgz|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
