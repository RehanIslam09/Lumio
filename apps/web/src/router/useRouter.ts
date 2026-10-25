import { useEffect, useState, useCallback } from "react";
import { matchPath, navigate as rawNavigate, NAVIGATE_EVENT } from "./router.js";
import type { NavigationOptions, Route } from "./types.js";

export interface UseRouterResult {
  route: Route;
  navigate: (to: string | Route, options?: NavigationOptions) => void;
}

function getCurrentRoute(): Route {
  if (typeof window === "undefined") {
    return { kind: "landing" };
  }
  return matchPath(window.location.pathname);
}

export function useRouter(): UseRouterResult {
  const [route, setRoute] = useState<Route>(getCurrentRoute);

  useEffect(() => {
    function handleLocationChange() {
      setRoute(getCurrentRoute());
    }

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener(NAVIGATE_EVENT, handleLocationChange);

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener(NAVIGATE_EVENT, handleLocationChange);
    };
  }, []);

  const navigateCallback = useCallback(
    (to: string | Route, options?: NavigationOptions) => {
      rawNavigate(to, options);
    },
    [],
  );

  return {
    route,
    navigate: navigateCallback,
  };
}
