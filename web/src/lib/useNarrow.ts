"use client";

import { useEffect, useState } from "react";

/** True below `px` wide (phones in portrait). Used to simplify chart axes. */
export function useNarrow(px = 640) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${px - 1}px)`);
    const update = () => setNarrow(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [px]);
  return narrow;
}
