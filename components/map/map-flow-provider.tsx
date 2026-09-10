"use client";

/**
 * State the map screen shares between the Leaflet surface and whichever step
 * is on top of it.
 *
 * It lives in the map's layout, which Next keeps mounted while the child route
 * changes, so walking from one setup step to the next never remounts the map,
 * never refetches a tile and never drops a trace in progress.
 *
 * NOTHING here may import a value from `leaflet` — only types. This module is
 * pulled in by the layout, which is not lazy: a runtime import of Leaflet would
 * touch `window` during prerender. Anything needing the real library (flying to
 * a place, reading the viewport) happens inside MapCanvas or through the map
 * instance handed up in `mapRef`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Map as LeafletMap } from "leaflet";
import type { PlaceHit } from "@/lib/data/nominatim";
import type { Ring } from "@/lib/domain/geo";

/** A handler a step page lends to the map surface for the duration of a trace. */
type TraceHandler = () => void;

interface MapFlowValue {
  /** The Leaflet instance, once MapCanvas has mounted it. */
  mapRef: React.RefObject<LeafletMap | null>;
  /** The address search input, so a step can send the farmer straight to it. */
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  focusSearch: () => void;

  /** Last place chosen in the search; MapCanvas flies to it and marks it. */
  searchedPlace: PlaceHit | null;
  goToPlace: (hit: PlaceHit) => void;

  /**
   * The outline being traced, in domain order ([lng, lat]). Component state,
   * never the store: walking a fence is minutes of someone's day, and an
   * unrelated store update must not be able to rebuild it.
   */
  draft: Ring | null;
  isDrawing: boolean;
  startDraw: () => void;
  addVertex: (point: [number, number]) => void;
  undoVertex: () => void;
  setDraft: (ring: Ring | null) => void;
  clearDraft: () => void;

  /**
   * What a double-tap, an Enter or the first-vertex tap should do. The step
   * page owns the meaning of "done" (save this invernada, open the dialog), so
   * it registers the handler and the map surface only fires it.
   */
  registerTraceHandlers: (handlers: {
    onFinish: TraceHandler;
    onCancel: TraceHandler;
  }) => () => void;
  requestFinish: TraceHandler;
  requestCancel: TraceHandler;

  /** Invernada whose summary is open on the operational map. */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  /**
   * Invernadas passed over in this session. Not persisted on purpose: skipping
   * means "not now", and the next visit is a new now.
   */
  skipped: string[];
  skipInvernada: (id: string) => void;
  /** Collapses the guide on the operational map until the next visit. */
  guideDismissed: boolean;
  dismissGuide: () => void;
}

const MapFlowContext = createContext<MapFlowValue | null>(null);

export function MapFlowProvider({ children }: { children: React.ReactNode }) {
  const mapRef = useRef<LeafletMap | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const traceHandlers = useRef<{
    onFinish: TraceHandler;
    onCancel: TraceHandler;
  } | null>(null);

  const [searchedPlace, setSearchedPlace] = useState<PlaceHit | null>(null);
  const [draft, setDraftState] = useState<Ring | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [guideDismissed, setGuideDismissed] = useState(false);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  const goToPlace = useCallback((hit: PlaceHit) => {
    setSearchedPlace(hit);
  }, []);

  const startDraw = useCallback(() => setDraftState([]), []);
  const clearDraft = useCallback(() => setDraftState(null), []);
  const setDraft = useCallback((ring: Ring | null) => setDraftState(ring), []);
  const addVertex = useCallback((point: [number, number]) => {
    setDraftState((current) => [...(current ?? []), point]);
  }, []);
  const undoVertex = useCallback(() => {
    setDraftState((current) => (current ? current.slice(0, -1) : current));
  }, []);

  const registerTraceHandlers = useCallback(
    (handlers: { onFinish: TraceHandler; onCancel: TraceHandler }) => {
      traceHandlers.current = handlers;
      return () => {
        if (traceHandlers.current === handlers) traceHandlers.current = null;
      };
    },
    []
  );
  const requestFinish = useCallback(() => traceHandlers.current?.onFinish(), []);
  const requestCancel = useCallback(() => traceHandlers.current?.onCancel(), []);

  const skipInvernada = useCallback((id: string) => {
    setSkipped((current) => (current.includes(id) ? current : [...current, id]));
  }, []);
  const dismissGuide = useCallback(() => setGuideDismissed(true), []);

  const value = useMemo<MapFlowValue>(
    () => ({
      mapRef,
      searchInputRef,
      focusSearch,
      searchedPlace,
      goToPlace,
      draft,
      isDrawing: draft !== null,
      startDraw,
      addVertex,
      undoVertex,
      setDraft,
      clearDraft,
      registerTraceHandlers,
      requestFinish,
      requestCancel,
      selectedId,
      setSelectedId,
      skipped,
      skipInvernada,
      guideDismissed,
      dismissGuide,
    }),
    [
      addVertex,
      clearDraft,
      dismissGuide,
      draft,
      focusSearch,
      goToPlace,
      guideDismissed,
      registerTraceHandlers,
      requestCancel,
      requestFinish,
      searchedPlace,
      selectedId,
      setDraft,
      skipInvernada,
      skipped,
      startDraw,
      undoVertex,
    ]
  );

  return <MapFlowContext.Provider value={value}>{children}</MapFlowContext.Provider>;
}

export function useMapFlow(): MapFlowValue {
  const value = useContext(MapFlowContext);
  if (!value) {
    throw new Error("useMapFlow must be used inside the map layout");
  }
  return value;
}
