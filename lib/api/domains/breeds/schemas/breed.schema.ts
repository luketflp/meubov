import { t } from "elysia";

/** Body of POST /breeds. The name is the breed's identity within a farm. */
export const BreedBody = t.Object({ name: t.String({ minLength: 1 }) });
