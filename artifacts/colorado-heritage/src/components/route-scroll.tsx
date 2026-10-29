import { useLayoutEffect } from "react";
import { useLocation, useSearch } from "wouter";

/** Do not carry a previous page's scroll offset into a new route. */
export function RouteScroll() {
  const [location] = useLocation();
  const search = useSearch();

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    // Preserve anchor navigation, including homepage section links.
    if (window.location.hash) return;
    window.scrollTo({ left: 0, top: 0, behavior: "instant" });
  }, [location, search]);

  return null;
}
