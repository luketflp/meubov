import { RequireAccess } from "@/components/layout/RequireAccess";
import { BatchRegisterForm } from "@/components/herd/batch/BatchRegisterForm";

/** /herd/cadastrar-varios: a group of animals from one padrão and a list of brincos. */
export default function RegisterManyAnimalsPage() {
  return (
    <RequireAccess area="herd" level="edit">
      <BatchRegisterForm />
    </RequireAccess>
  );
}
