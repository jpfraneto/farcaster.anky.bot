/**
 * Checks if the application is running in production mode
 * @returns {boolean} True if in production, false otherwise
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === "production";
};
