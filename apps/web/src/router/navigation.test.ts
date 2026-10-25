import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { Link } from "./Link.js";
import { NAVIGATE_EVENT } from "./router.js";

function getAnchorProps(element: unknown): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  if (!React.isValidElement(element)) {
    throw new Error("Expected valid React element");
  }
  return element.props as React.AnchorHTMLAttributes<HTMLAnchorElement>;
}

describe("router React integration", () => {
  let listeners: Record<string, EventListenerOrEventListenerObject[]> = {};

  beforeEach(() => {
    listeners = {};
    (globalThis as unknown as { window: unknown }).window = {
      location: { pathname: "/" },
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      dispatchEvent: vi.fn((event: Event) => {
        const list = listeners[event.type] ?? [];
        for (const l of list) {
          if (typeof l === "function") l(event);
          else l.handleEvent(event);
        }
        return true;
      }),
      addEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) => {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(listener);
        },
      ),
      removeEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) => {
          if (listeners[type]) {
            listeners[type] = listeners[type].filter((l) => l !== listener);
          }
        },
      ),
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  describe("Link component click behavior", () => {
    it("intercepts standard left click and calls navigate", () => {
      let defaultPrevented = false;
      const element = Link({
        href: "/dashboard",
        children: "Dashboard",
      });
      const props = getAnchorProps(element);

      const fakeEvent = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        defaultPrevented: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      props.onClick?.(fakeEvent);

      expect(defaultPrevented).toBe(true);
      expect(
        (
          globalThis as unknown as {
            window: { history: { pushState: ReturnType<typeof vi.fn> } };
          }
        ).window.history.pushState,
      ).toHaveBeenCalledWith(null, "", "/dashboard");
    });

    it("does not prevent default on modifier clicks (e.g. Cmd/Ctrl+Click to open in new tab)", () => {
      let defaultPrevented = false;
      const element = Link({
        href: "/dashboard",
        children: "Dashboard",
      });
      const props = getAnchorProps(element);

      const metaClickEvent = {
        button: 0,
        metaKey: true,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        defaultPrevented: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      props.onClick?.(metaClickEvent);

      expect(defaultPrevented).toBe(false);
      expect(
        (
          globalThis as unknown as {
            window: { history: { pushState: ReturnType<typeof vi.fn> } };
          }
        ).window.history.pushState,
      ).not.toHaveBeenCalled();
    });

    it("does not prevent default on middle click (button !== 0)", () => {
      let defaultPrevented = false;
      const element = Link({
        href: "/dashboard",
        children: "Dashboard",
      });
      const props = getAnchorProps(element);

      const middleClickEvent = {
        button: 1,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        defaultPrevented: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      props.onClick?.(middleClickEvent);

      expect(defaultPrevented).toBe(false);
      expect(
        (
          globalThis as unknown as {
            window: { history: { pushState: ReturnType<typeof vi.fn> } };
          }
        ).window.history.pushState,
      ).not.toHaveBeenCalled();
    });

    it("does not prevent default for external URLs", () => {
      let defaultPrevented = false;
      const element = Link({
        href: "https://example.com",
        children: "External",
      });
      const props = getAnchorProps(element);

      const clickEvent = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        defaultPrevented: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      props.onClick?.(clickEvent);

      expect(defaultPrevented).toBe(false);
      expect(
        (
          globalThis as unknown as {
            window: { history: { pushState: ReturnType<typeof vi.fn> } };
          }
        ).window.history.pushState,
      ).not.toHaveBeenCalled();
    });

    it("does not prevent default when target is _blank", () => {
      let defaultPrevented = false;
      const element = Link({
        href: "/dashboard",
        target: "_blank",
        children: "New Tab",
      });
      const props = getAnchorProps(element);

      const clickEvent = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        defaultPrevented: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      props.onClick?.(clickEvent);

      expect(defaultPrevented).toBe(false);
      expect(
        (
          globalThis as unknown as {
            window: { history: { pushState: ReturnType<typeof vi.fn> } };
          }
        ).window.history.pushState,
      ).not.toHaveBeenCalled();
    });

    it("calls custom onClick handler if provided", () => {
      const customOnClick = vi.fn();
      const element = Link({
        href: "/dashboard",
        onClick: customOnClick,
        children: "Dashboard",
      });
      const props = getAnchorProps(element);

      const clickEvent = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        defaultPrevented: false,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      props.onClick?.(clickEvent);

      expect(customOnClick).toHaveBeenCalledWith(clickEvent);
    });
  });

  describe("useRouter event subscription and cleanup", () => {
    it("registers popstate and NAVIGATE_EVENT listeners and cleans them up", () => {
      const popListenersBefore = listeners["popstate"]?.length ?? 0;
      const navListenersBefore = listeners[NAVIGATE_EVENT]?.length ?? 0;

      let cleanupFn: (() => void) | undefined;
      function runHookEffect() {
        const handleLocationChange = vi.fn();
        window.addEventListener("popstate", handleLocationChange);
        window.addEventListener(NAVIGATE_EVENT, handleLocationChange);

        cleanupFn = () => {
          window.removeEventListener("popstate", handleLocationChange);
          window.removeEventListener(NAVIGATE_EVENT, handleLocationChange);
        };
      }

      runHookEffect();

      expect(listeners["popstate"]?.length).toBe(popListenersBefore + 1);
      expect(listeners[NAVIGATE_EVENT]?.length).toBe(navListenersBefore + 1);

      cleanupFn?.();

      expect(listeners["popstate"]?.length).toBe(popListenersBefore);
      expect(listeners[NAVIGATE_EVENT]?.length).toBe(navListenersBefore);
    });
  });
});
