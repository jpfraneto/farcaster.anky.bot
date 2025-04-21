import {
  format,
  createLogger,
  transports,
  config as winstonConfig,
} from "winston";
import fs from "fs";
import path from "path";

// Ensure logs directory exists
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const { printf, combine, timestamp, colorize } = format;

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "cyan",
    verbose: "blue",
    debug: "magenta",
  },
};

const formatter = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

export const Logger = createLogger({
  level: "info",
  levels: customLevels.levels,
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), formatter),
  transports: [
    // Show colors in console
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        formatter
      ),
    }),

    // Save logs to file
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    new transports.File({ filename: path.join(logDir, "combined.log") }),
  ],
});

import winston from "winston";
winston.addColors(customLevels.colors);
