/**
 * Health protocols — the farm's reusable sanitary templates (a vaccine, its
 * interval and its withdrawal period), optionally scheduled onto the whole
 * active herd the moment they are registered.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddProtocolUseCase } from "./useCases/Add.useCase";
import { DeleteProtocolUseCase } from "./useCases/Delete.useCase";
import { NewProtocolBody } from "./schemas/protocol.schema";

export const protocolsController = new Elysia({ prefix: "/protocols" })
  .use(farmPlugin)
  .post(
    "/",
    ({ farmId, body }) =>
      new AddProtocolUseCase().run({
        farmId,
        protocol: body.protocol,
        generateSchedule: body.generateSchedule,
      }),
    { farm: true, body: NewProtocolBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params }) => {
      await new DeleteProtocolUseCase().run({ farmId, id: params.id });
      return { id: params.id };
    },
    { farm: true }
  );
