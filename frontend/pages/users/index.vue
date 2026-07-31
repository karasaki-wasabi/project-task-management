<!--
  User registration/list (task 11.6, design.md "Frontend/users",
  Requirements 7.1, 7.3). No auth: selection-only from a pre-registered
  list, matching UsersService's own scope.
-->
<script setup lang="ts">
const api = useApiClient();
const users = ref<User[]>([]);
const newUserName = ref("");
const error = ref<string | null>(null);

async function loadUsers() {
  users.value = await api.listUsers();
}

async function createUser() {
  error.value = null;
  try {
    await api.createUser(newUserName.value);
    newUserName.value = "";
    await loadUsers();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function deleteUser(id: string) {
  await api.deleteUser(id);
  await loadUsers();
}

onMounted(loadUsers);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">ユーザー管理</h1>

    <form
      class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
      @submit.prevent="createUser"
    >
      <input
        v-model="newUserName"
        placeholder="ユーザー名"
        required
        class="min-w-40 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        登録
      </button>
    </form>
    <ErrorAlert v-if="error" :message="error" />

    <div class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th class="px-3 py-2 font-medium">名前</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-b border-slate-100 last:border-0">
            <td class="px-3 py-2 font-medium text-slate-900">{{ user.name }}</td>
            <td class="px-3 py-2">
              <button
                type="button"
                class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                @click="deleteUser(user.id)"
              >
                削除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
