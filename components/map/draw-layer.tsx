"use client";

/**
 * The outline being traced: the vertices tapped so far, the live shape, and the
 * map bindings that add, undo and close them.
 *
 * The draft is component state in domain order ([lng, lat]) and NEVER touches
 * the store. Walking a fence is minutes of someone's day — an unrelated store
 * update must not be able to rebuild it, and nothing is persisted until the
 * farmer confirms.
 */
import { useEffect } from "react";
import { CircleMarker, Polygon, Polyline, useMap, useMapEvents } from "react-leaflet";
import {
  isUsableRing,
  normalizeRing,
  toLatLngRing,
  type Ring,
} from "@/lib/domain/geo";

/**
 * Draft tone — the `attention` token. Deliberately not one of the stocking
 * colours, so an unsaved trace can never be mistaken for a stored invernada.
 */
const DRAFT_COLOR = "#8a5a12";
const VERTEX_RADIUS = 6;
/** The vertex that closes the ring is the tap target, so it is bigger. */
const FIRST_VERTEX_RADIUS = 10;

export function DrawLayer({
  draft,
  onAddVertex,
  onUndoVertex,
  onFinish,
  onCancel,
}: {
  draft: Ring;
  onAddVertex: (point: [number, number]) => void;
  onUndoVertex: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const map = useMap();
  const normalized = normalizeRing(draft);
  const canClose = isUsableRing(normalized);

  useMapEvents({
    // Leaflet reports [lat, lng]; the domain stores [lng, lat].
    click: (event) => onAddVertex([event.latlng.lng, event.latlng.lat]),
    /*
     * A double tap finishes. The two clicks underneath it land on the same
     * coordinate, and `normalizeRing` collapses consecutive duplicates, so the
     * extra vertex costs nothing.
     */
    dblclick: () => {
      if (canClose) onFinish();
    },
  });

  /*
   * Double-click must close the outline, not zoom. Restored on unmount so the
   * map behaves normally again the moment drawing ends.
   */
  useEffect(() => {
    map.doubleClickZoom.disable();
    return () => {
      map.doubleClickZoom.enable();
    };
  }, [map]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        // Otherwise the browser treats Backspace as "go back".
        event.preventDefault();
        onUndoVertex();
      } else if (event.key === "Enter" && canClose) {
        event.preventDefault();
        onFinish();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canClose, onCancel, onFinish, onUndoVertex]);

  const positions = toLatLngRing(draft);
  const shapeOptions = {
    color: DRAFT_COLOR,
    weight: 2,
    dashArray: "6 4",
    fillColor: DRAFT_COLOR,
    fillOpacity: 0.2,
  };

  return (
    <>
      {canClose ? (
        <Polygon positions={positions} pathOptions={shapeOptions} interactive={false} />
      ) : positions.length > 1 ? (
        <Polyline positions={positions} pathOptions={shapeOptions} interactive={false} />
      ) : null}

      {positions.map((position, index) => {
        const isFirst = index === 0;
        return (
          <CircleMarker
            key={`${position[0]},${position[1]},${index}`}
            center={position}
            radius={isFirst ? FIRST_VERTEX_RADIUS : VERTEX_RADIUS}
            bubblingMouseEvents={false}
            pathOptions={{
              color: DRAFT_COLOR,
              weight: 2,
              fillColor: isFirst && canClose ? DRAFT_COLOR : "#ffffff",
              fillOpacity: 1,
            }}
            // Tapping the first vertex is the other way to close the outline.
            eventHandlers={isFirst && canClose ? { click: () => onFinish() } : {}}
          />
        );
      })}
    </>
  );
}
