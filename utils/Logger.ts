import { format, createLogger, transports } from "winston";

const { printf, combine, timestamp, colorize } = format;
const colorizer = colorize();

colorizer.addColors({
  http: "cyan",
  error: "red",
});
export const Logger = createLogger({
  level: "http",
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
  },
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    printf(({ message, level, timestamp }) => {
      const date = new Date(timestamp as string);
      const utcTime = date.toLocaleString("en-US", {
        timeZone: "UTC",
        hour12: false,
      });
      const chileTime = date.toLocaleString("en-US", {
        timeZone: "America/Santiago",
        hour12: false,
      });
      return colorizer.colorize(
        level,
        `[UTC: ${utcTime} | Chile: ${chileTime}]: ${message}`
      );
    })
  ),
  transports: new transports.Console(),
});
