export type Route =
  | { kind: "landing" }
  | { kind: "login" }
  | { kind: "register" }
  | { kind: "dashboard" }
  | { kind: "editor" }
  | { kind: "project"; projectId: string }
  | { kind: "notFound"; path: string };

export interface NavigationOptions {
  replace?: boolean;
}
