<!--
  Development stage master management, relocated out of `/kanban` into its
  own screen (task 3, design.md "stages.vue + DevelopmentStageManager"
  component detail block, Requirement 7.1/7.3).

  This is a straight relocation of the `stages`/`newStageName` state and the
  `loadStages`/`createStage`/`renameStage`/`moveStage`/`deleteStage`
  functions that used to live inline in `frontend/pages/kanban/index.vue`
  (task 17.2) — behavior is unchanged, only the reorder array-swap decision
  was extracted into the pure helper `swapStageOrder`
  (./DevelopmentStageManager.helpers.ts) so it can be unit-tested. The
  `.stage-list` class name is preserved as an E2E test hook (see
  frontend/e2e/kanban.spec.ts, to be updated in a later task to navigate
  here).
-->
<script setup lang="ts">
import { swapStageOrder } from "./DevelopmentStageManager.helpers";

const api = useApiClient();
const stages = ref<DevelopmentStage[]>([]);
const newStageName = ref("");

async function loadStages() {
  stages.value = await api.listDevelopmentStages();
}

async function createStage() {
  await api.createDevelopmentStage(newStageName.value);
  newStageName.value = "";
  await loadStages();
}

async function renameStage(stage: DevelopmentStage) {
  const name = window.prompt("新しい名称", stage.name);
  if (!name) return;
  await api.renameDevelopmentStage(stage.id, name);
  await loadStages();
}

async function moveStage(index: number, direction: -1 | 1) {
  const orderedIds = swapStageOrder(
    stages.value.map((s) => s.id),
    index,
    direction,
  );
  if (!orderedIds) return;
  await api.reorderDevelopmentStages(orderedIds);
  await loadStages();
}

async function deleteStage(id: string) {
  await api.deleteDevelopmentStage(id);
  await loadStages();
}

onMounted(async () => {
  await loadStages();
});
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-semibold tracking-tight">開発段階マスタ</h1>

    <form
      class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
      @submit.prevent="createStage"
    >
      <input
        v-model="newStageName"
        placeholder="段階名(例: 仕様未確定)"
        required
        class="min-w-56 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        登録
      </button>
    </form>

    <ol class="stage-list list-none space-y-1">
      <li
        v-for="(stage, index) in stages"
        :key="stage.id"
        class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"
      >
        <span class="flex-1 text-sm font-medium text-slate-900">{{ stage.name }}</span>
        <button
          type="button"
          :disabled="index === 0"
          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          @click="moveStage(index, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          :disabled="index === stages.length - 1"
          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          @click="moveStage(index, 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          @click="renameStage(stage)"
        >
          名称変更
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          @click="deleteStage(stage.id)"
        >
          削除
        </button>
      </li>
    </ol>
  </section>
</template>
