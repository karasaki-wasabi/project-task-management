<!--
  Assignee filter select, reused by Tasks/Events lists (task 11.6, design.md
  "Frontend/users", Requirement 7.2). Emits the selected userId (or empty
  string for "all") so the parent page re-queries its own list endpoint with
  `assigneeUserId`.
-->
<script setup lang="ts">
const modelValue = defineModel<string>({ default: "" });

const api = useApiClient();
const users = ref<User[]>([]);

onMounted(async () => {
  users.value = await api.listUsers();
});
</script>

<template>
  <label>
    担当者で絞り込み
    <select v-model="modelValue">
      <option value="">すべて</option>
      <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
    </select>
  </label>
</template>
