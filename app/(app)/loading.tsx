/** While a screen of the app streams in: the drawing Nelore, as on the first load. */
import { LoadingOverlay } from "@/components/ui/loading-overlay";

export default function AppLoading() {
  return (
    <div className="relative min-h-[60dvh]">
      <LoadingOverlay />
    </div>
  );
}
