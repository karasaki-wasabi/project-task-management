<template>
  <div>
    <header class="app-header">
      <strong>Task Delivery Management</strong>
      <nav class="app-nav">
        <NuxtLink to="/">ダッシュボード</NuxtLink>
        <NuxtLink to="/tasks">タスク</NuxtLink>
        <NuxtLink to="/kanban">カンバン</NuxtLink>
        <NuxtLink to="/deliveries">納品</NuxtLink>
        <NuxtLink to="/events">タイムライン</NuxtLink>
        <NuxtLink to="/recurrence">繰り返し設定</NuxtLink>
        <NuxtLink to="/throughput">消化数</NuxtLink>
        <NuxtLink to="/users">ユーザー</NuxtLink>
      </nav>
    </header>
    <main class="app-main">
      <NuxtPage />
    </main>
  </div>
</template>

<style>
body {
  font-family: system-ui, sans-serif;
  margin: 0;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #ddd;
}
.app-nav {
  display: flex;
  gap: 1rem;
}
.app-nav a.router-link-active {
  font-weight: bold;
}
.app-main {
  padding: 1.5rem;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th, td {
  border: 1px solid #ddd;
  padding: 0.4rem 0.6rem;
  text-align: left;
}
</style>
