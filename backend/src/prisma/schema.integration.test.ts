import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CaseRelativeAnchor,
  DevelopmentStageKind,
  Prisma,
  PrismaClient,
  TaskStatus,
} from "@prisma/client";
import * as PrismaClientModule from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("recurrence schema shape (task 1.1)", () => {
  it("CaseRelativeAnchor と case-relative-only の template/task フィールドを公開する", () => {
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
      detail: "detail",
      scheduledEndDate: "scheduledEndDate",
      storyPoints: "storyPoints",
    });
    expect(taskFields).not.toHaveProperty("memo");
    expect(taskFields).not.toHaveProperty("scheduledDate");
    expect(taskFields).not.toHaveProperty("scheduledStartDate");

    expect(templateFields).toMatchObject({
      defaultDetail: "defaultDetail",
    });
    expect(templateFields).not.toHaveProperty("defaultMemo");

    expect(PrismaClientModule).not.toHaveProperty("RecurrenceKind");
    expect(PrismaClientModule).not.toHaveProperty("IntervalUnit");
    expect(PrismaClientModule).toHaveProperty("CaseRelativeAnchor");

    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/templateCaseDateActiveKey\s+Unsupported\(/);
    expect(schema).toMatch(/@map\("template_case_date_active_key"\)/);
    expect(schema).toMatch(/scheduledEndDate\s+DateTime\?\s+@map\("scheduled_end_date"\)/);
    expect(schema).toMatch(/storyPoints\s+Int\?\s+@map\("story_points"\)/);
    expect(schema).toMatch(/defaultDetail\s+String\?\s+@db\.Text\s+@map\("default_detail"\)/);
    expect(schema).toMatch(/scheduled_end_date/);
    expect(schema).not.toMatch(/@map\("scheduled_date"\)/);
    expect(schema).not.toMatch(/@map\("default_memo"\)/);
    expect(schema).not.toMatch(/scheduledStartDate|scheduled_start_date/);
    expect(schema).not.toMatch(/@@unique\(\[sourceTemplateId,\s*scheduled(Date|EndDate)\]\)/);
    expect(schema).not.toMatch(/enum RecurrenceKind/);
    expect(schema).not.toMatch(/enum IntervalUnit/);
  });
});

describe("task-detail persistence schema (task 1)", () => {
  it("Comment と append-only ActivityLog models を公開する", () => {
    expect(Prisma).toHaveProperty("CommentScalarFieldEnum");
    expect(Prisma).toHaveProperty("ActivityLogScalarFieldEnum");

    expect(Prisma.CommentScalarFieldEnum).toMatchObject({
      id: "id",
      taskId: "taskId",
      authorUserId: "authorUserId",
      body: "body",
      editedAt: "editedAt",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      deletedAt: "deletedAt",
    });
    expect(Prisma.ActivityLogScalarFieldEnum).toMatchObject({
      id: "id",
      taskId: "taskId",
      actorUserId: "actorUserId",
      actorSourceLabel: "actorSourceLabel",
      operationType: "operationType",
      fieldName: "fieldName",
      beforeValue: "beforeValue",
      afterValue: "afterValue",
      occurredAt: "occurredAt",
    });
    expect(Prisma.ActivityLogScalarFieldEnum).not.toHaveProperty("updatedAt");
    expect(Prisma.ActivityLogScalarFieldEnum).not.toHaveProperty("deletedAt");

    expect(PrismaClientModule.OperationType).toEqual({
      task_created: "task_created",
      task_deleted: "task_deleted",
      field_changed: "field_changed",
      comment_created: "comment_created",
      comment_edited: "comment_edited",
      comment_deleted: "comment_deleted",
    });
    expect(PrismaClientModule.FieldName).toEqual({
      title: "title",
      status: "status",
      priority: "priority",
      detail: "detail",
      assignee: "assignee",
      case: "case",
      isRequiredForCase: "isRequiredForCase",
      developmentStage: "developmentStage",
      parentTask: "parentTask",
      scheduledEndDate: "scheduledEndDate",
      storyPoints: "storyPoints",
    });
  });

  it("comments と activity_logs を作成する", async () => {
    const commentColumns = await prisma.$queryRaw<Array<{ Field: string }>>`
      SHOW COLUMNS FROM comments
    `;
    const activityLogColumns = await prisma.$queryRaw<Array<{ Field: string }>>`
      SHOW COLUMNS FROM activity_logs
    `;

    expect(commentColumns.map((column) => column.Field)).toEqual(
      expect.arrayContaining([
        "id",
        "task_id",
        "author_user_id",
        "body",
        "edited_at",
        "created_at",
        "updated_at",
        "deleted_at",
      ]),
    );
    expect(activityLogColumns.map((column) => column.Field)).toEqual([
      "id",
      "task_id",
      "actor_user_id",
      "actor_source_label",
      "operation_type",
      "field_name",
      "before_value",
      "after_value",
      "occurred_at",
    ]);

    const commentIndexes = await prisma.$queryRaw<
      Array<{ Key_name: string; Column_name: string }>
    >`SHOW INDEX FROM comments`;
    const activityLogIndexes = await prisma.$queryRaw<
      Array<{ Key_name: string; Column_name: string }>
    >`SHOW INDEX FROM activity_logs`;

    expect(
      commentIndexes
        .filter((row) => row.Key_name === "comments_task_id_created_at_idx")
        .map((row) => row.Column_name),
    ).toEqual(["task_id", "created_at"]);
    expect(
      activityLogIndexes
        .filter((row) => row.Key_name === "activity_logs_task_id_occurred_at_idx")
        .map((row) => row.Column_name),
    ).toEqual(["task_id", "occurred_at"]);
  });

  it("soft-deleted されたタスクの comments と activity logs を保持する", async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `task-detail-${suffix}@example.test`,
        name: `task-detail-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: `task-detail-${suffix}`,
        createdByUserId: user.id,
      },
    });
    const task = await prisma.task.create({
      data: {
        title: `task-detail-${suffix}`,
        priority: "medium",
        workspaceId: workspace.id,
      },
    });
    const comment = await prisma.comment.create({
      data: {
        taskId: task.id,
        authorUserId: user.id,
        body: "persistent comment",
      },
    });
    const activityLog = await prisma.activityLog.create({
      data: {
        taskId: task.id,
        actorUserId: user.id,
        operationType: "comment_created",
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });

    expect(await prisma.comment.findUnique({ where: { id: comment.id } })).not.toBeNull();
    expect(
      await prisma.activityLog.findUnique({ where: { id: activityLog.id } }),
    ).not.toBeNull();

    await prisma.activityLog.delete({ where: { id: activityLog.id } });
    await prisma.comment.delete({ where: { id: comment.id } });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe("物理スキーマ (task 1.2)", () => {
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

  it("email と password_hash フィールドを提供し、ユニークな email を強制する", async () => {
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

  it("user、case、template、task、non_business_day を round-trip する", async () => {
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
        scheduledEndDate: new Date("2026-08-10"),
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

  it("すべてのテーブルに created_at/updated_at/deleted_at を強制する", async () => {
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

  it("date_active_key で同じ日に2つの active non_business_days を拒否するが、論理削除後に再登録を許可する", async () => {
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

  it("同じ (template, case, scheduledEndDate) で2つの active template tasks を拒否するが、論理削除後に再作成を許可する", async () => {
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
    const scheduledEndDate = new Date("2026-09-15");
    const baseTask = {
      title: "generated",
      priority: "high" as const,
      caseId: caseEntity.id,
      sourceTemplateId: template.id,
      sourceAnchor: CaseRelativeAnchor.case_end,
      scheduledEndDate,
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

  it("task からリンクされた development stage を round-trip する", async () => {
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
  it("Workspace と WorkspaceMember models を公開し、期待されるスカラーフィールドを持つ", () => {
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

  it("workspaces と workspace_members テーブルを提供し、audit カラムを持つ", async () => {
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

  it("Workspace を creator と WorkspaceMember の関係を持つものと round-trip する", async () => {
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

  it("unique 制約で (workspace_id, user_id) の重複メンバーシップを拒否する", async () => {
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

describe("workspace リソーススコープスキーマ (task 1.5)", () => {
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

  it("Case/Task/RecurringTaskTemplate/NonBusinessDay/DevelopmentStage に必要な workspaceId を公開する", () => {
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

  it("workspace_id NOT NULL カラムと workspace-scoped holiday unique index を提供する", async () => {
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

  it("データベースで workspace_id がないスコープリソースの作成を拒否する", async () => {
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

describe("task-status-model スキーマ (task 1.1)", () => {
  async function createWorkspaceFixture(suffix: string) {
    const creator = await prisma.user.create({
      data: {
        email: `tsm-creator-${suffix}@example.test`,
        name: `tsm-creator-${suffix}`,
        passwordHash: "test-password-hash",
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: `tsm-ws-${suffix}`,
        createdByUserId: creator.id,
      },
    });
    return { creator, workspace };
  }

  it("DevelopmentStageKind を公開し、TaskStatus.done を ready_for_handoff にリネームする", () => {
    expect(DevelopmentStageKind).toEqual({
      normal: "normal",
      completed: "completed",
      cancelled: "cancelled",
    });
    expect(TaskStatus).toEqual({
      not_started: "not_started",
      in_progress: "in_progress",
      ready_for_handoff: "ready_for_handoff",
      on_hold: "on_hold",
    });
    expect(TaskStatus).not.toHaveProperty("done");

    expect(Prisma.DevelopmentStageScalarFieldEnum).toMatchObject({
      kind: "kind",
    });
    expect(Prisma.TaskScalarFieldEnum).not.toHaveProperty("cancelledAt");

    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/enum DevelopmentStageKind \{[\s\S]*normal[\s\S]*completed[\s\S]*cancelled/);
    expect(schema).toMatch(/kind\s+DevelopmentStageKind\s+@default\(normal\)/);
    expect(schema).toMatch(/ready_for_handoff/);
    expect(schema).not.toMatch(/^\s*done\s*$/m);
    expect(schema).not.toMatch(/cancelledAt|cancelled_at/);
  });

  it("development_stages.kind を提供し、tasks の cancelled-at を省略する", async () => {
    const stageColumns = await prisma.$queryRaw<
      Array<{ Field: string; Type: string; Default: string | null }>
    >`SHOW COLUMNS FROM development_stages LIKE 'kind'`;
    expect(stageColumns).toHaveLength(1);
    expect(stageColumns[0]?.Type).toMatch(/enum/i);
    expect(stageColumns[0]?.Default).toBe("normal");

    const cancelledColumns = await prisma.$queryRaw<Array<{ Field: string }>>`
      SHOW COLUMNS FROM tasks LIKE 'cancelled_at'
    `;
    expect(cancelledColumns).toHaveLength(0);

    const statusColumn = await prisma.$queryRaw<Array<{ Type: string }>>`
      SHOW COLUMNS FROM tasks LIKE 'status'
    `;
    expect(statusColumn[0]?.Type).toContain("ready_for_handoff");
    expect(statusColumn[0]?.Type).not.toContain("'done'");
  });

  it("single init SQL で generate-column hand-edit と migrate-dev の警告を保持する", () => {
    const migrationPath = resolve(
      __dirname,
      "migrations/20260805030211_init_domain_schema/migration.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/prisma migrate dev/);
    expect(sql).toMatch(/STORED GENERATED COLUMN|生成列/);
    expect(sql).toMatch(/prisma-migrations\.md|migrate reset/);
    expect(sql).toMatch(/`kind` ENUM\('normal', 'completed', 'cancelled'\)/);
  });

  it("各ワークスペースに1つの completed と1つの cancelled の stage を持つことを確認する。completedAt tasks は completed に配置される", async () => {
    const suffix = randomUUID();
    const a = await createWorkspaceFixture(`a-${suffix}`);
    const b = await createWorkspaceFixture(`b-${suffix}`);

    const completedA = await prisma.developmentStage.create({
      data: {
        name: "完了",
        order: 10,
        workspaceId: a.workspace.id,
        kind: "completed",
      },
    });
    const cancelledA = await prisma.developmentStage.create({
      data: {
        name: "中止",
        order: 11,
        workspaceId: a.workspace.id,
        kind: "cancelled",
      },
    });
    await prisma.developmentStage.create({
      data: {
        name: "未着手",
        order: 0,
        workspaceId: a.workspace.id,
        kind: "normal",
      },
    });

    const completedB = await prisma.developmentStage.create({
      data: {
        name: "完了",
        order: 10,
        workspaceId: b.workspace.id,
        kind: "completed",
      },
    });
    await prisma.developmentStage.create({
      data: {
        name: "中止",
        order: 11,
        workspaceId: b.workspace.id,
        kind: "cancelled",
      },
    });

    const completedAt = new Date("2033-01-15T00:00:00.000Z");
    const taskA = await prisma.task.create({
      data: {
        title: `tsm-done-a-${suffix}`,
        priority: "medium",
        status: "not_started",
        workspaceId: a.workspace.id,
        developmentStageId: completedA.id,
        completedAt,
      },
    });
    const taskB = await prisma.task.create({
      data: {
        title: `tsm-done-b-${suffix}`,
        priority: "medium",
        status: "not_started",
        workspaceId: b.workspace.id,
        developmentStageId: completedB.id,
        completedAt,
      },
    });

    try {
      for (const workspaceId of [a.workspace.id, b.workspace.id]) {
        const kinds = await prisma.developmentStage.groupBy({
          by: ["kind"],
          where: { workspaceId, deletedAt: null },
          _count: { _all: true },
        });
        const countByKind = Object.fromEntries(
          kinds.map((row) => [row.kind, row._count._all]),
        );
        expect(countByKind.completed).toBe(1);
        expect(countByKind.cancelled).toBe(1);
      }

      expect(completedA.id).not.toBe(completedB.id);
      expect(cancelledA.id).not.toBe(completedA.id);

      const completedAtTasks = await prisma.task.findMany({
        where: {
          id: { in: [taskA.id, taskB.id] },
          completedAt: { not: null },
        },
        include: { developmentStage: true },
      });
      expect(completedAtTasks).toHaveLength(2);
      for (const task of completedAtTasks) {
        expect(task.developmentStage?.kind).toBe("completed");
        expect(task.developmentStage?.workspaceId).toBe(task.workspaceId);
        expect(task.status).toBe("not_started");
        expect(task.completedAt).toEqual(completedAt);
      }
    } finally {
      await prisma.$executeRaw`DELETE FROM tasks WHERE id IN (${taskA.id}, ${taskB.id})`;
      await prisma.$executeRaw`
        DELETE FROM development_stages
        WHERE workspace_id IN (${a.workspace.id}, ${b.workspace.id})
      `;
      await prisma.workspace.delete({ where: { id: a.workspace.id } });
      await prisma.workspace.delete({ where: { id: b.workspace.id } });
      await prisma.user.delete({ where: { id: a.creator.id } });
      await prisma.user.delete({ where: { id: b.creator.id } });
    }
  });

});

describe("task-field-rename スキーマ (task 1.1)", () => {
  it("リネームされた Prisma フィールドを detail / scheduled_end_date / default_detail にマッピングする", () => {
    expect(Prisma.TaskScalarFieldEnum).toMatchObject({
      detail: "detail",
      scheduledEndDate: "scheduledEndDate",
    });
    expect(Prisma.TaskScalarFieldEnum).not.toHaveProperty("memo");
    expect(Prisma.TaskScalarFieldEnum).not.toHaveProperty("scheduledDate");
    expect(Prisma.TaskScalarFieldEnum).not.toHaveProperty("scheduledStartDate");

    expect(Prisma.RecurringTaskTemplateScalarFieldEnum).toMatchObject({
      defaultDetail: "defaultDetail",
    });
    expect(Prisma.RecurringTaskTemplateScalarFieldEnum).not.toHaveProperty("defaultMemo");

    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/\bdetail\s+String\?\s+@db\.Text/);
    expect(schema).toMatch(/scheduledEndDate\s+DateTime\?\s+@map\("scheduled_end_date"\)/);
    expect(schema).toMatch(/defaultDetail\s+String\?\s+@db\.Text\s+@map\("default_detail"\)/);
    expect(schema).not.toMatch(/scheduledStartDate|scheduled_start_date/);
  });

  it("single init SQL でリネームされたカラムと scheduled_end_date の generated key を保持する", () => {
    const migrationPath = resolve(
      __dirname,
      "migrations/20260805030211_init_domain_schema/migration.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/prisma migrate dev/);
    expect(sql).toMatch(/STORED GENERATED COLUMN/);
    expect(sql).toMatch(/`detail` TEXT NULL/);
    expect(sql).toMatch(/`scheduled_end_date` DATE NULL/);
    expect(sql).toMatch(/`story_points`/);
    expect(sql).toMatch(/`default_detail` TEXT NULL/);
    expect(sql).toMatch(/DATE_FORMAT\(`scheduled_end_date`/);
    expect(sql).toMatch(
      /`field_name` ENUM\([^)]*'storyPoints'[^)]*\)/,
    );
    expect(sql).not.toMatch(/`memo` TEXT/);
    expect(sql).not.toMatch(/`scheduled_date`/);
    expect(sql).not.toMatch(/`default_memo`/);
    expect(sql).not.toMatch(/RENAME COLUMN/);
  });

  it("リネームされた物理カラムと scheduled_end_date の generated key を提供する", async () => {
    const taskColumns = await prisma.$queryRaw<Array<{ Field: string }>>`SHOW COLUMNS FROM tasks`;
    const taskColumnNames = taskColumns.map((column) => column.Field);
    expect(taskColumnNames).toEqual(
      expect.arrayContaining([
        "detail",
        "scheduled_end_date",
        "story_points",
        "template_case_date_active_key",
      ]),
    );
    expect(taskColumnNames).not.toContain("memo");
    expect(taskColumnNames).not.toContain("scheduled_date");
    expect(taskColumnNames).not.toContain("scheduled_start_date");

    const templateColumns = await prisma.$queryRaw<Array<{ Field: string }>>`
      SHOW COLUMNS FROM recurring_task_templates
    `;
    const templateColumnNames = templateColumns.map((column) => column.Field);
    expect(templateColumnNames).toContain("default_detail");
    expect(templateColumnNames).not.toContain("default_memo");

    const createRows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
      "SHOW CREATE TABLE tasks",
    );
    const createSql =
      createRows[0]?.["Create Table"] ??
      Object.values(createRows[0] ?? {}).find(
        (value) => typeof value === "string" && value.includes("CREATE TABLE"),
      ) ??
      "";
    expect(createSql).toMatch(/`scheduled_end_date`/);
    expect(createSql).toMatch(/`story_points`/);
    expect(createSql).toMatch(/date_format\(`scheduled_end_date`/i);
    expect(createSql).toMatch(/GENERATED ALWAYS AS/i);
    expect(createSql).toMatch(/template_case_date_active_key/);
    expect(createSql).not.toMatch(/date_format\(`scheduled_date`/i);
  });
});
