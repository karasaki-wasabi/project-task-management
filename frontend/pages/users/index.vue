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
  <section>
    <h1>ユーザー管理</h1>

    <form @submit.prevent="createUser">
      <input v-model="newUserName" placeholder="ユーザー名" required />
      <button type="submit">登録</button>
    </form>
    <p v-if="error" role="alert" style="color: red">{{ error }}</p>

    <table>
      <thead>
        <tr>
          <th>名前</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td>{{ user.name }}</td>
          <td><button @click="deleteUser(user.id)">削除</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
