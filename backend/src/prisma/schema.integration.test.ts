// Integration / schema tests for domain Prisma models.
// Task 1.1 (recurrence-holidays-ux): case-relative-only RecurringTaskTemplate + Task.sourceAnchor
// and active-row uniqueness expressed as Unsupported generated column (SQL hand-edit in task 1.2).
// Run inside the backend container so DATABASE_URL resolves to the mysql
// service: `docker compose run --rm backend npx vitest run src/prisma/schema.integration.test.ts`.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CaseRelativeAnchor,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import * as PrismaClientModule from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("recurrence schema shape (task 1.1)", () => {
  it("exposes CaseRelativeAnchor and case-relative-only template/task fields", () => {
    expect(CaseRelativeAnchor).toEqual({
      case_start: "case_start",
      case_end: "case_end",
      period_month_start: "period_month_start",
      period_month_end: "period_month_end",
    });

    const templateFields = Prisma.RecurringTaskTemplateScalarFieldEnum;
    expect(templateFields).toMatchObject({
      caseAnchor: "caseAnchor",
      caseOffsetDays: "caseOffsetDays",
    });
    expect(templateFields).not.toHaveProperty("kind");
    expect(templateFields).not.toHaveProperty("intervalUnit");
    expect(templateFields).not.toHaveProperty("intervalValue");
    expect(templateFields).not.toHaveProperty("boundCaseId");

    const taskFields = Prisma.TaskScalarFieldEnum;
    expect(taskFields).toMatchObject({
      sourceAnchor: "sourceAnchor",
    });

    // fixed_interval / interval enums must be gone from the generated client
    expect(PrismaClientModule).not.toHaveProperty("RecurrenceKind");
    expect(PrismaClientModule).not.toHaveProperty("IntervalUnit");
    expect(PrismaClientModule).toHaveProperty("CaseRelativeAnchor");

    // Unsupported generated columns are omitted from ScalarFieldEnum (same as
    // NonBusinessDay.dateActiveKey). Assert they remain in the Prisma schema text.
    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/templateCaseDateActiveKey\s+Unsupported\(/);
    expect(schema).toMatch(/@map\("template_case_date_active_key"\)/);
    expect(schema).not.toMatch(/@@unique\(\[sourceTemplateId,\s*scheduledDate\]\)/);
    expect(schema).not.toMatch(/enum RecurrenceKind/);
    expect(schema).not.toMatch(/enum IntervalUnit/);
  });
});

describe("physical schema (task 1.2)", () => {
  async function createOwnedWorkspace(suffix: string) {
    const user = await prisma.user.create({
      data: {
        email: `owned-${suffix}@example.test`,
        name: `owned-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: `owned-ws-${suffix}`,
        createdByUserId: user.id,
      },
    });
    return { user, workspace };
  }

  it("provides email and password_hash columns and enforces unique email", async () => {
    const columns = await prisma.$queryRaw<Array<{ Field: string }>>`SHOW COLUMNS FROM users`;
    const columnNames = columns.map((column) => column.Field);

    expect(columnNames).toEqual(expect.arrayContaining(["email", "password_hash"]));

    const userId = randomUUID();
    const email = `unique-${userId}@example.test`;
    const user = await prisma.user.create({
      data: { email, name: `unique-${userId}`, passwordHash: "test-password-hash" },
    });

    await expect(
      prisma.user.create({
        data: { email, name: `duplicate-${userId}`, passwordHash: "test-password-hash" },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: user.id } });
  });

  it("round-trips user, case, template, task, and non_business_day", async () => {
    const suffix = randomUUID();
    const { user, workspace } = await createOwnedWorkspace(suffix);
    const caseEntity = await prisma.case.create({
      data: {
        name: `case-${randomUUID()}`,
        endDate: new Date("2026-08-01"),
        workspaceId: workspace.id,
      },
    });
    const template = await prisma.recurringTaskTemplate.create({
      data: {
        title: `tpl-${randomUUID()}`,
        priority: "medium",
        caseAnchor: CaseRelativeAnchor.case_start,
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
        workspaceId: workspace.id,
      },
    });
    const task = await prisma.task.create({
      data: {
        title: `task-${randomUUID()}`,
        priority: "medium",
        caseId: caseEntity.id,
        sourceTemplateId: template.id,
        sourceAnchor: CaseRelativeAnchor.case_start,
        scheduledDate: new Date("2026-08-10"),
        workspaceId: workspace.id,
      },
    });
    const holiday = await prisma.nonBusinessDay.create({
      data: {
        date: new Date("2030-01-01"),
        label: "test-holiday",
        source: "manual",
        workspaceId: workspace.id,
      },
    });

    expect(user.id).toBeTruthy();
    expect(caseEntity.id).toBeTruthy();
    expect(caseEntity.workspaceId).toBe(workspace.id);
    expect(template.caseAnchor).toBe(CaseRelativeAnchor.case_start);
    expect(task.sourceAnchor).toBe(CaseRelativeAnchor.case_start);
    expect(holiday.source).toBe("manual");

    await prisma.task.delete({ where: { id: task.id } });
    await prisma.nonBusinessDay.delete({ where: { id: holiday.id } });
    await prisma.recurringTaskTemplate.delete({ where: { id: template.id } });
    await prisma.case.delete({ where: { id: caseEntity.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("enforces created_at/updated_at/deleted_at on every table", async () => {
    const userId = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `audit-${userId}@example.test`,
        name: `audit-${userId}`,
        passwordHash: "test-password-hash",
      },
    });
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    expect(user.deletedAt).toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("rejects two active non_business_days on the same date via date_active_key, but allows re-registration after soft delete", async () => {
    const suffix = randomUUID();
    const { user, workspace } = await createOwnedWorkspace(`nbd-${suffix}`);
    const date = new Date("2031-05-05");

    const first = await prisma.nonBusinessDay.create({
      data: { date, label: "first", source: "manual", workspaceId: workspace.id },
    });

    await expect(
      prisma.nonBusinessDay.create({
        data: { date, label: "duplicate", source: "manual", workspaceId: workspace.id },
      }),
    ).rejects.toThrow();

    await prisma.$executeRaw`UPDATE non_business_days SET deleted_at = NOW() WHERE id = ${first.id}`;

    const second = await prisma.nonBusinessDay.create({
      data: { date, label: "second", source: "manual", workspaceId: workspace.id },
    });

    expect(second.id).not.toBe(first.id);

    await prisma.$executeRaw`DELETE FROM non_business_days WHERE id IN (${first.id}, ${second.id})`;
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("rejects two active template tasks on the same (template, case, scheduledDate), but allows recreate after soft delete", async () => {
    const suffix = randomUUID();
    const { user, workspace } = await createOwnedWorkspace(`tpl-${suffix}`);
    const caseEntity = await prisma.case.create({
      data: {
        name: `case-uniq-${randomUUID()}`,
        endDate: new Date("2026-09-01"),
        workspaceId: workspace.id,
      },
    });
    const template = await prisma.recurringTaskTemplate.create({
      data: {
        title: `tpl-uniq-${randomUUID()}`,
        priority: "high",
        caseAnchor: CaseRelativeAnchor.case_end,
        caseOffsetDays: 1,
        nonBusinessDayPolicy: "skip",
        workspaceId: workspace.id,
      },
    });
    const scheduledDate = new Date("2026-09-15");
    const baseTask = {
      title: "generated",
      priority: "high" as const,
      caseId: caseEntity.id,
      sourceTemplateId: template.id,
      sourceAnchor: CaseRelativeAnchor.case_end,
      scheduledDate,
      workspaceId: workspace.id,
    };

    const first = await prisma.task.create({ data: baseTask });

    await expect(prisma.task.create({ data: { ...baseTask, title: "duplicate" } })).rejects.toThrow();

    await prisma.$executeRaw`UPDATE tasks SET deleted_at = NOW() WHERE id = ${first.id}`;

    const second = await prisma.task.create({ data: { ...baseTask, title: "recreated" } });
    expect(second.id).not.toBe(first.id);

    await prisma.$executeRaw`DELETE FROM tasks WHERE id IN (${first.id}, ${second.id})`;
    await prisma.recurringTaskTemplate.delete({ where: { id: template.id } });
    await prisma.case.delete({ where: { id: caseEntity.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("round-trips a development stage linked from a task", async () => {
    const suffix = randomUUID();
    const { user, workspace } = await createOwnedWorkspace(`stage-${suffix}`);
    const stage = await prisma.developmentStage.create({
      data: { name: `stage-${randomUUID()}`, order: 0, workspaceId: workspace.id },
    });
    const task = await prisma.task.create({
      data: {
        title: `stage-task-${randomUUID()}`,
        priority: "low",
        developmentStageId: stage.id,
        workspaceId: workspace.id,
      },
    });

    expect(stage.id).toBeTruthy();
    expect(task.developmentStageId).toBe(stage.id);
    expect(stage.createdAt).toBeInstanceOf(Date);
    expect(stage.updatedAt).toBeInstanceOf(Date);
    expect(stage.deletedAt).toBeNull();

    await prisma.task.delete({ where: { id: task.id } });
    await prisma.developmentStage.delete({ where: { id: stage.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe("workspace membership schema (task 1.1)", () => {
  it("exposes Workspace and WorkspaceMember models with expected scalar fields", () => {
    expect(Prisma).toHaveProperty("WorkspaceScalarFieldEnum");
    expect(Prisma).toHaveProperty("WorkspaceMemberScalarFieldEnum");

    expect(Prisma.WorkspaceScalarFieldEnum).toMatchObject({
      id: "id",
      name: "name",
      color: "color",
      createdByUserId: "createdByUserId",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      deletedAt: "deletedAt",
    });

    expect(Prisma.WorkspaceMemberScalarFieldEnum).toMatchObject({
      id: "id",
      workspaceId: "workspaceId",
      userId: "userId",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      deletedAt: "deletedAt",
    });

    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/createdWorkspaces\s+Workspace\[\]\s+@relation\("WorkspaceCreator"\)/);
    expect(schema).toMatch(/workspaceMemberships\s+WorkspaceMember\[\]/);
    expect(schema).toMatch(/@@unique\(\[workspaceId,\s*userId\]\)/);
    expect(schema).toMatch(/@@map\("workspaces"\)/);
    expect(schema).toMatch(/@@map\("workspace_members"\)/);
  });

  it("provides workspaces and workspace_members tables with audit columns", async () => {
    const workspaceColumns = await prisma.$queryRaw<Array<{ Field: string }>>`
      SHOW COLUMNS FROM workspaces
    `;
    const memberColumns = await prisma.$queryRaw<Array<{ Field: string }>>`
      SHOW COLUMNS FROM workspace_members
    `;

    expect(workspaceColumns.map((column) => column.Field)).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "color",
        "created_by_user_id",
        "created_at",
        "updated_at",
        "deleted_at",
      ]),
    );
    expect(memberColumns.map((column) => column.Field)).toEqual(
      expect.arrayContaining([
        "id",
        "workspace_id",
        "user_id",
        "created_at",
        "updated_at",
        "deleted_at",
      ]),
    );
  });

  it("round-trips Workspace with creator and WorkspaceMember relations", async () => {
    const suffix = randomUUID();
    const creator = await prisma.user.create({
      data: {
        email: `ws-creator-${suffix}@example.test`,
        name: `ws-creator-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });
    const memberUser = await prisma.user.create({
      data: {
        email: `ws-member-${suffix}@example.test`,
        name: `ws-member-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: `workspace-${suffix}`,
        color: "#2563eb",
        createdByUserId: creator.id,
      },
    });
    const membership = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: memberUser.id,
      },
    });

    expect(workspace.id).toBeTruthy();
    expect(workspace.createdByUserId).toBe(creator.id);
    expect(workspace.deletedAt).toBeNull();
    expect(membership.workspaceId).toBe(workspace.id);
    expect(membership.userId).toBe(memberUser.id);

    const creatorWithRelations = await prisma.user.findUniqueOrThrow({
      where: { id: creator.id },
      include: { createdWorkspaces: true, workspaceMemberships: true },
    });
    expect(creatorWithRelations.createdWorkspaces.map((ws) => ws.id)).toContain(workspace.id);

    const memberWithRelations = await prisma.user.findUniqueOrThrow({
      where: { id: memberUser.id },
      include: { workspaceMemberships: true },
    });
    expect(memberWithRelations.workspaceMemberships.map((m) => m.id)).toContain(membership.id);

    await prisma.workspaceMember.delete({ where: { id: membership.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: memberUser.id } });
    await prisma.user.delete({ where: { id: creator.id } });
  });

  it("rejects duplicate (workspace_id, user_id) membership via unique constraint", async () => {
    const suffix = randomUUID();
    const creator = await prisma.user.create({
      data: {
        email: `ws-uniq-creator-${suffix}@example.test`,
        name: `ws-uniq-creator-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });
    const memberUser = await prisma.user.create({
      data: {
        email: `ws-uniq-member-${suffix}@example.test`,
        name: `ws-uniq-member-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: `workspace-uniq-${suffix}`,
        createdByUserId: creator.id,
      },
    });

    const first = await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: memberUser.id },
    });

    await expect(
      prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: memberUser.id },
      }),
    ).rejects.toThrow();

    await prisma.workspaceMember.delete({ where: { id: first.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: memberUser.id } });
    await prisma.user.delete({ where: { id: creator.id } });
  });
});

describe("workspace resource scope schema (task 1.5)", () => {
  async function createWorkspaceFixture(suffix: string) {
    const creator = await prisma.user.create({
      data: {
        email: `scope-creator-${suffix}@example.test`,
        name: `scope-creator-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: `scope-ws-${suffix}`,
        createdByUserId: creator.id,
      },
    });
    return { creator, workspace };
  }

  it("exposes required workspaceId on Case/Task/RecurringTaskTemplate/NonBusinessDay/DevelopmentStage", () => {
    expect(Prisma.CaseScalarFieldEnum).toMatchObject({ workspaceId: "workspaceId" });
    expect(Prisma.TaskScalarFieldEnum).toMatchObject({ workspaceId: "workspaceId" });
    expect(Prisma.RecurringTaskTemplateScalarFieldEnum).toMatchObject({
      workspaceId: "workspaceId",
    });
    expect(Prisma.NonBusinessDayScalarFieldEnum).toMatchObject({
      workspaceId: "workspaceId",
    });
    expect(Prisma.DevelopmentStageScalarFieldEnum).toMatchObject({
      workspaceId: "workspaceId",
    });

    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/model Workspace \{[\s\S]*cases\s+Case\[\]/);
    expect(schema).toMatch(/model Workspace \{[\s\S]*tasks\s+Task\[\]/);
    expect(schema).toMatch(/model Workspace \{[\s\S]*recurringTaskTemplates\s+RecurringTaskTemplate\[\]/);
    expect(schema).toMatch(/model Workspace \{[\s\S]*nonBusinessDays\s+NonBusinessDay\[\]/);
    expect(schema).toMatch(/model Workspace \{[\s\S]*developmentStages\s+DevelopmentStage\[\]/);
  });

  it("provides workspace_id NOT NULL columns and workspace-scoped holiday unique index", async () => {
    for (const table of [
      "cases",
      "tasks",
      "recurring_task_templates",
      "non_business_days",
      "development_stages",
    ]) {
      const columns = await prisma.$queryRawUnsafe<
        Array<{ Field: string; Null: string }>
      >(`SHOW COLUMNS FROM ${table} LIKE 'workspace_id'`);
      expect(columns).toHaveLength(1);
      expect(columns[0]?.Null).toBe("NO");
    }

    const indexes = await prisma.$queryRaw<
      Array<{ Key_name: string; Column_name: string }>
    >`SHOW INDEX FROM non_business_days`;
    const keyNames = new Set(indexes.map((row) => row.Key_name));
    expect(keyNames.has("non_business_days_date_active_key_key")).toBe(false);
    expect(keyNames.has("non_business_days_workspace_id_date_active_key_key")).toBe(true);

    const scopedUniqueCols = indexes
      .filter((row) => row.Key_name === "non_business_days_workspace_id_date_active_key_key")
      .map((row) => row.Column_name);
    expect(scopedUniqueCols).toEqual(["workspace_id", "date_active_key"]);
  });

  it("rejects creating scoped resources without a workspace_id at the database", async () => {
    const suffix = randomUUID();
    await expect(
      prisma.$executeRaw`
        INSERT INTO cases (id, name, is_completed, created_at, updated_at)
        VALUES (${`case-no-ws-${suffix}`}, ${`case-no-ws-${suffix}`}, false, NOW(3), NOW(3))
      `,
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw`
        INSERT INTO tasks (id, title, status, priority, is_required_for_case, created_at, updated_at)
        VALUES (
          ${`task-no-ws-${suffix}`},
          ${`task-no-ws-${suffix}`},
          'not_started',
          'medium',
          false,
          NOW(3),
          NOW(3)
        )
      `,
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw`
        INSERT INTO recurring_task_templates (
          id, title, priority, case_anchor, case_offset_days,
          non_business_day_policy, is_active, created_at, updated_at
        ) VALUES (
          ${`tpl-no-ws-${suffix}`},
          ${`tpl-no-ws-${suffix}`},
          'medium',
          'case_start',
          0,
          'as_is',
          true,
          NOW(3),
          NOW(3)
        )
      `,
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw`
        INSERT INTO non_business_days (id, date, label, source, created_at, updated_at)
        VALUES (
          ${`nbd-no-ws-${suffix}`},
          '2032-01-01',
          'no-ws',
          'manual',
          NOW(3),
          NOW(3)
        )
      `,
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw`
        INSERT INTO development_stages (id, name, \`order\`, created_at, updated_at)
        VALUES (${`stage-no-ws-${suffix}`}, ${`stage-no-ws-${suffix}`}, 0, NOW(3), NOW(3))
      `,
    ).rejects.toThrow();
  });

  it("allows the same non_business_day date across workspaces, but not within one", async () => {
    const suffix = randomUUID();
    const a = await createWorkspaceFixture(`a-${suffix}`);
    const b = await createWorkspaceFixture(`b-${suffix}`);
    const date = new Date("2032-06-06");

    const holidayA = await prisma.nonBusinessDay.create({
      data: {
        date,
        label: "ws-a",
        source: "manual",
        workspaceId: a.workspace.id,
      },
    });
    const holidayB = await prisma.nonBusinessDay.create({
      data: {
        date,
        label: "ws-b",
        source: "manual",
        workspaceId: b.workspace.id,
      },
    });

    expect(holidayA.workspaceId).toBe(a.workspace.id);
    expect(holidayB.workspaceId).toBe(b.workspace.id);

    await expect(
      prisma.nonBusinessDay.create({
        data: {
          date,
          label: "ws-a-dup",
          source: "manual",
          workspaceId: a.workspace.id,
        },
      }),
    ).rejects.toThrow();

    await prisma.$executeRaw`
      DELETE FROM non_business_days WHERE id IN (${holidayA.id}, ${holidayB.id})
    `;
    await prisma.workspace.delete({ where: { id: a.workspace.id } });
    await prisma.workspace.delete({ where: { id: b.workspace.id } });
    await prisma.user.delete({ where: { id: a.creator.id } });
    await prisma.user.delete({ where: { id: b.creator.id } });
  });
});
