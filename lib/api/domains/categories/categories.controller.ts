/**
 * Custom herd categories — farm-defined names mapped onto a canonical base
 * category, so a farm can speak its own vocabulary without the domain losing
 * the five categories every calculation is built on.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddCustomCategoryUseCase } from "./useCases/Add.useCase";
import { DeleteCustomCategoryUseCase } from "./useCases/Delete.useCase";
import { NewCustomCategoryBody } from "./schemas/category.schema";

export const categoriesController = new Elysia({ prefix: "/categories" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const category = await new AddCustomCategoryUseCase().run({
        farmId,
        name: body.name,
        baseCategory: body.baseCategory,
      });
      if (category === null) return status(409, { error: "duplicate_name" });
      return category;
    },
    { farm: true, body: NewCustomCategoryBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteCustomCategoryUseCase().run({
        farmId,
        id: params.id,
      });
      if (!removed) return status(409, { error: "category_in_use" });
      return { id: params.id };
    },
    { farm: true }
  );
