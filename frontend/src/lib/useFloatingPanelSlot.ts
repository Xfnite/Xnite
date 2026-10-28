import { useEffect, useRef, useState } from "react";

// Coordinates the bottom-right floating panels (Quest Log, DJ Booth) so they
// sit side by side instead of on top of each other: whichever was opened first
// keeps the right-hand slot next to its FAB, and a later one takes the slot to
// its left. Each panel broadcasts when it opened (or null when closed) and
// listens for the others; no shared store needed.

const CHANGE_EVENT = "floating_panel_change";
const SYNC_EVENT = "floating_panel_sync";

type PanelChange = { id: string; openedAt: number | null };

export function useFloatingPanelSlot(id: string, isOpen: boolean): { isLeft: boolean } {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [others, setOthers] = useState<Record<string, number | null>>({});
  const openedAtRef = useRef<number | null>(null);

  // Stamp the moment this panel opens; keep the stamp while it stays open.
  useEffect(() => {
    setOpenedAt((prev) => (isOpen ? prev ?? Date.now() : null));
  }, [isOpen]);

  useEffect(() => {
    openedAtRef.current = openedAt;
    window.dispatchEvent(new CustomEvent<PanelChange>(CHANGE_EVENT, { detail: { id, openedAt } }));
  }, [id, openedAt]);

  useEffect(() => {
    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent<PanelChange>).detail;
      if (!detail || detail.id === id) return;
      setOthers((prev) => ({ ...prev, [detail.id]: detail.openedAt }));
    };
    // A panel that mounts later asks the others to re-announce their state.
    const handleSync = () => {
      window.dispatchEvent(
        new CustomEvent<PanelChange>(CHANGE_EVENT, { detail: { id, openedAt: openedAtRef.current } })
      );
    };
    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener(SYNC_EVENT, handleSync);
    window.dispatchEvent(new Event(SYNC_EVENT));
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener(SYNC_EVENT, handleSync);
    };
  }, [id]);

  // Left when another open panel got there first (ties broken by id).
  const isLeft =
    openedAt !== null &&
    Object.entries(others).some(
      ([otherId, t]) => t !== null && (t < openedAt || (t === openedAt && otherId < id))
    );

  return { isLeft };
}
