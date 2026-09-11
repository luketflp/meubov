/** Request schemas for the user-defined herd categories of a farm. */

import { t } from "elysia";

import {
  CategoryModel,
} from "@/lib/api/schemas/shared.schema";

/** Body of POST /categories (custom herd category). */
export const NewCustomCategoryBody = t.Object({
  name: t.String({ minLength: 1 }),
  baseCategory: CategoryModel,
});
