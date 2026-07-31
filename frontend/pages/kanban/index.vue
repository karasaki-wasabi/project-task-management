<!--
  Development stage master management (task 17.2, design.md
  "Frontend/kanban", Requirement 12.1). The kanban board itself (task 17.3,
  Requirements 12.2-12.4, 12.6-12.8) is added to this same page afterward.
-->
<script setup lang="ts">
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
  const target = index + direction;
  if (target < 0 || target >= stages.value.length) return;
  const orderedIds = stages.value.map((s) => s.id);
  [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
  await api.reorderDevelopmentStages(orderedIds);
  await loadStages();
}

async function deleteStage(id: string) {
  await api.deleteDevelopmentStage(id);
  await loadStages();
}

onMounted(loadStages);
</script>

<template>
  <section>
    <h1>開発段階マスタ</h1>

    <form @submit.prevent="createStage">
      <input v-model="newStageName" placeholder="段階名(例: 仕様未確定)" required />
      <button type="submit">登録</button>
    </form>

    <ol class="stage-list">
      <li v-for="(stage, index) in stages" :key="stage.id">
        <span>{{ stage.name }}</span>
        <button type="button" :disabled="index === 0" @click="moveStage(index, -1)">↑</button>
        <button type="button" :disabled="index === stages.length - 1" @click="moveStage(index, 1)">↓</button>
        <button type="button" @click="renameStage(stage)">名称変更</button>
        <button type="button" @click="deleteStage(stage.id)">削除</button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.stage-list {
  padding-left: 1.5rem;
}
.stage-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
}
</style>
