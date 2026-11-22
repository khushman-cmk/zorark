import { SvgDefs } from "@/components/zippi/art/SvgDefs";
import { getDisplayName, getSession } from "@/lib/session";
import { HomeProviders } from "./_components/HomeProviders";
import { Shell } from "./_components/Shell";

/**
 * The customer dashboard shell.
 *
 * A server component so the session is resolved before first paint. Passing it
 * into SessionProvider removes both the client round-trip to
 * /api/auth/session and the flash where the user's name renders as "User".
 *
 * Note this layout no longer imports the admin stylesheet. Next.js does not
 * unload global CSS on navigation, so that import made the admin design system
 * resident on every customer page.
 */
export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, userName] = await Promise.all([getSession(), getDisplayName()]);

  return (
    <HomeProviders session={session}>
      <SvgDefs />
      <Shell userName={userName}>{children}</Shell>
    </HomeProviders>
  );
}
