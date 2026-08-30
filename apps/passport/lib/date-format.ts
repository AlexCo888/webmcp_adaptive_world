const passportDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const passportDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatPassportDate(value: string | Date): string {
  return passportDateFormatter.format(new Date(value));
}

export function formatPassportDateTime(value: string | Date): string {
  return passportDateTimeFormatter.format(new Date(value));
}
