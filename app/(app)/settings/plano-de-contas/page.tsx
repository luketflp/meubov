import { RequireAccess } from "@/components/layout/RequireAccess";
import { AccountsPage } from "@/components/finance/plano/AccountsPage";

/** /settings/plano-de-contas: the farm's contas inside the fixed grupos. */
export default function PlanoDeContasPage() {
  return (
    <RequireAccess area="finance" level="view">
      <AccountsPage />
    </RequireAccess>
  );
}
