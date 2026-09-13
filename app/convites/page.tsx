import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { InvitesScreen } from "@/components/invites/InvitesScreen";

/**
 * /convites: where a signed-in user answers the convites waiting for their
 * e-mail. It sits outside the (app) group on purpose: that layout hydrates the
 * herd store, and for a user with no farm yet that would create one. The
 * session check mirrors app/(app)/layout.tsx.
 */
export default async function InvitesPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  return <InvitesScreen email={session.user.email} />;
}
