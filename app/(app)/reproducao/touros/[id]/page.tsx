"use client";

/**
 * Página do touro (/reproducao/touros/[id]): a semen bull's stock,
 * cost and pregnancy rate, its purchases and the coberturas that used its
 * doses. Opened from the bull's name on the Reprodução screen.
 */
import { useParams } from "next/navigation";
import { SemenBullPage } from "@/components/semen/semen-bull-page";

export default function SemenBullRoutePage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <SemenBullPage bullId={params.id} />
    </div>
  );
}
