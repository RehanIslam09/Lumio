import React from "react";
import { formatPath, navigate } from "./router.js";
import type { Route } from "./types.js";

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string | Route;
  replace?: boolean;
  children: React.ReactNode;
}

export const Link: React.FC<LinkProps> = ({
  href,
  replace = false,
  children,
  onClick,
  target,
  ...rest
}) => {
  const destPath = typeof href === "string" ? href : formatPath(href);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Preserve custom onClick handlers if they prevent default
    if (onClick) {
      onClick(e);
    }

    if (e.defaultPrevented) {
      return;
    }

    // Preserve standard browser behaviors for non-primary clicks or modifier keys
    const isLeftClick = e.button === 0;
    const isModifierKey = e.metaKey || e.altKey || e.ctrlKey || e.shiftKey;
    const isExternal =
      destPath.startsWith("http://") ||
      destPath.startsWith("https://") ||
      destPath.startsWith("//") ||
      destPath.startsWith("mailto:");
    const hasExternalTarget = Boolean(target && target !== "_self");

    if (!isLeftClick || isModifierKey || isExternal || hasExternalTarget) {
      return;
    }

    e.preventDefault();
    navigate(destPath, { replace });
  };

  return (
    <a href={destPath} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
