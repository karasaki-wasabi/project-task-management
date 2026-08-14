// Read-only public surface for Cases (module-boundary-cleanup task 2.1;
// design.md Backend/cases caseReadService). Depends only on caseRepository
// (+ shared DbClient / errors / workspace types). Does not import caseService,
// recurrenceService, or other modules' services.
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

  /** TX 内など、workspace 検証済みの呼び出し向け。無ければ notFound。 */
  async requireById(id: string, client: DbClient = db): Promise<Case> {
    // Visibility matches current recurrence: client.case.findUnique({ where: { id } })
    // (no workspace filter; soft-delete default filter follows the given client).
    const caseEntity = await client.case.findUnique({ where: { id } });
    if (!caseEntity) {
      throw notFound(`Case not found: ${id}`);
    }
    return caseEntity;
  },
};
