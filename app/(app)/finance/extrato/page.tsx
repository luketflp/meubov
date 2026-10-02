import { redirect } from "next/navigation";
import { legacySearch } from "@/components/finance/lancamentos/legacySearch";

/** The old Extrato: its links and bookmarks land on Lançamentos with the same window and filters. */
export default async function ExtratoRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = legacySearch(await searchParams);
  redirect(query ? `/finance/lancamentos?${query}` : "/finance/lancamentos");
}
