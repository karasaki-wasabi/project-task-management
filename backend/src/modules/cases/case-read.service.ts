import { db } from "../../shared/db.js";
import { notFound } from "../../shared/http-errors.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { caseRepository } from "./case.repository.js";
import type { Case } from "./case.types.js";

export const caseReadService = {
  findInWorkspace(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    client: DbClient = db,
  ): Promise<Case | null> {
    return caseRepository.findById(id, workspaceId, client);
  },

  async requireById(id: string, client: DbClient = db): Promise<Case> {
    const caseEntity = await client.case.findUnique({ where: { id } });
    if (!caseEntity) {
      throw notFound(`Case not found: ${id}`);
    }
    return caseEntity;
  },
};
