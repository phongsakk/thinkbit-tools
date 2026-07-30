import dayjs, { type ConfigType, type Dayjs } from "dayjs"
import buddhistEra from "dayjs/plugin/buddhistEra"
import customParseFormat from "dayjs/plugin/customParseFormat"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(buddhistEra)
dayjs.extend(customParseFormat)

/** App timezone: UTC+7 */
export const APP_TIMEZONE = "Asia/Bangkok"

/** 24-hour display, Thai Buddhist year (matches th-TH style) */
export const DATETIME_DISPLAY_FORMAT = "D/M/BBBB HH:mm:ss"

/** Value format for `<input type="datetime-local">` */
export const DATETIME_LOCAL_FORMAT = "YYYY-MM-DDTHH:mm"

dayjs.tz.setDefault(APP_TIMEZONE)

export type AppDayjs = Dayjs

export function appNow(): Dayjs {
  return dayjs().tz(APP_TIMEZONE)
}

export function appDayjs(input?: ConfigType): Dayjs {
  if (input == null || input === "") return dayjs.invalid()
  return dayjs(input).tz(APP_TIMEZONE)
}

export function isValidAppTime(input?: ConfigType): boolean {
  if (input == null || input === "") return false
  return appDayjs(input).isValid()
}

/** Format any date/time in Asia/Bangkok, 24-hour clock. */
export function formatDateTime(
  input?: ConfigType,
  fallback = "—"
): string {
  const d = appDayjs(input)
  if (!d.isValid()) return fallback
  return d.format(DATETIME_DISPLAY_FORMAT)
}

/**
 * Format Cosmos/upload unix timestamp (seconds or milliseconds) in +7.
 */
export function formatUnixTimestamp(
  timestamp: string | number,
  fallback = "—"
): string {
  const raw = String(timestamp).trim()
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  const ms = raw.length >= 13 ? n : n * 1000
  return formatDateTime(ms, fallback)
}

/** Convert ISO/date string → `datetime-local` input value in +7. */
export function toDateTimeLocalValue(input?: ConfigType | null): string {
  if (input == null || input === "") return ""
  const d = appDayjs(input)
  if (!d.isValid()) return ""
  return d.format(DATETIME_LOCAL_FORMAT)
}

/**
 * Parse `datetime-local` value as Asia/Bangkok wall time → ISO UTC string.
 */
export function dateTimeLocalToIso(value?: string | null): string {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) return ""
  const d = dayjs.tz(trimmed, DATETIME_LOCAL_FORMAT, APP_TIMEZONE)
  if (!d.isValid()) return ""
  return d.toISOString()
}

export { dayjs }
