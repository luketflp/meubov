/** The MeuBov mark and name, for the screens drawn without the app's rail. */
import Link from "next/link";
import { FarmMark } from "@/components/print/PrintSheet";

export function BrandBar() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 rounded-md">
      <span className="flex size-8 items-center justify-center overflow-hidden rounded-md border border-hairline bg-panel">
        <FarmMark className="size-[26px]" />
      </span>
      <span className="font-heading text-lg font-semibold text-ink">MeuBov</span>
    </Link>
  );
}
