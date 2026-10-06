declare module "node:fs" {
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare const process: {
  cwd(): string;
  exit(code?: number): never;
};
