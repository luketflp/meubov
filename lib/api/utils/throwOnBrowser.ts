/**
 * Guard against a use case reaching the client bundle.
 *
 * Use cases hold the database handle; importing one from a "use client" module
 * would drag Drizzle and the connection pool into the browser. Calling this in
 * every constructor turns that mistake into a loud error at the import site
 * instead of a confusing bundling failure.
 */
export const __throwOnBrowser = (caller: string = "This function"): void => {
  if (typeof window !== "undefined") {
    throw new Error(`${caller} should not be used in the browser`);
  }
};
