/**
 * Formats an ISO date string to a localized human-readable date and time.
 * Falls back to the raw input string if the date is invalid or formatting throws.
 */
export function formatProjectDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return isoString;
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return isoString;
  }
}
