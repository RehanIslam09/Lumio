/**
 * Generates a sanitized file name for a project name.
 * - Lowercase.
 * - Spaces and any characters outside [a-z0-9] become a single "-".
 * - No leading/trailing "-".
 * - Max 60 characters before the ".lumio.json" extension.
 * - An empty slug becomes "project".
 * - Non-ASCII characters are dropped.
 */
export function fileNameFor(projectName: string): string {
  const lower = projectName.toLowerCase();
  let slug = lower.replace(/[^a-z0-9]+/g, "-");
  slug = slug.replace(/^-+|-+$/g, "");

  if (slug.length > 60) {
    slug = slug.slice(0, 60).replace(/-+$/g, "");
  }

  if (slug === "") {
    slug = "project";
  }

  return `${slug}.lumio.json`;
}
