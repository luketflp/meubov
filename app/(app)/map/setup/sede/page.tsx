"use client";

/**
 * Step one: where the farm is.
 *
 * Everything else on this screen depends on it. Without a saved sede the map
 * opens on a fixed point in Uberaba, which for most farms is the wrong state,
 * the wrong hour of driving, and a satellite view of someone else's rooftops —
 * so this is the first thing the flow asks, and the only step it never skips
 * past on its own.
 */
import { useState } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { roundCoordinate } from "@/lib/domain/geo";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MapPanel,
  MapPanelActions,
  MapPanelHeader,
} from "@/components/map/map-panel";
import { useMapFlow } from "@/components/map/map-flow-provider";
import { useSetupNavigation } from "@/components/map/use-setup-navigation";
import { useToast } from "@/components/providers/Toasts";

export default function SetupHeadquartersPage() {
  const farm = useHerdStore((s) => s.farm);
  const saveHeadquarters = useHerdStore((s) => s.saveHeadquarters);
  const { mapRef, focusSearch } = useMapFlow();
  const { goToNextStep, leaveSetup } = useSetupNavigation();
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const map = mapRef.current;
    if (!map) return;
    const { lat, lng } = map.getCenter();
    setSaving(true);
    try {
      // Same precision the outlines are stored at; the extra digits Leaflet
      // hands out are far below what any of this can mean.
      await saveHeadquarters({
        lat: roundCoordinate(lat),
        lng: roundCoordinate(lng),
        zoom: Math.round(map.getZoom()),
      });
      addToast({
        messageType: "success",
        text: "Sede salva. O mapa vai abrir nesta vista.",
      });
      goToNextStep();
    } catch {
      // Store already surfaced the failure; staying here keeps the view the
      // farmer framed, so "Salvar" is one tap away from working.
    } finally {
      setSaving(false);
    }
  }

  return (
    <MapPanel>
      <MapPanelHeader
        eyebrow={farm.headquarters ? "Sede" : "Passo 1 de 2"}
        title="Onde fica sua fazenda?"
        description="Busque o endereço ou o município, arraste até enquadrar a sede e salve. É essa vista que o mapa vai abrir daqui em diante."
      />
      <MapPanelActions>
        <Button
          type="button"
          variant="outline"
          onClick={focusSearch}
          disabled={saving}
          className="min-h-11"
        >
          <Search aria-hidden />
          Buscar endereço
        </Button>
        <Button type="button" onClick={onSave} disabled={saving} className="min-h-11">
          {saving ? "Salvando…" : "Salvar sede aqui"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={leaveSetup}
          disabled={saving}
          className="ml-auto min-h-11 text-ink-soft"
        >
          Agora não
        </Button>
      </MapPanelActions>
    </MapPanel>
  );
}
