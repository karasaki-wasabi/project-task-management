<script setup lang="ts">
const modelValue = defineModel<string>({ default: "" });

const api = useApiClient();
const users = ref<User[]>([]);

onMounted(async () => {
  users.value = await api.listUsers();
});
</script>

<template>
  <label class="flex items-center gap-2 text-sm text-slate-700">
    担当者で絞り込み
    <select
      v-model="modelValue"
      class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">すべて</option>
      <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
    </select>
  </label>
</template>
