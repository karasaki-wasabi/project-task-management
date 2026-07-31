<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <header class="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <strong class="text-sm font-semibold tracking-tight text-slate-900">Task Delivery Management</strong>
        <nav class="flex flex-wrap gap-x-1 gap-y-1 text-sm">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="rounded-md px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            active-class="bg-blue-50 text-blue-700 hover:bg-blue-50"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const navLinks = [
  { to: "/", label: "ダッシュボード" },
  { to: "/tasks", label: "タスク" },
  { to: "/kanban", label: "カンバン" },
  { to: "/deliveries", label: "納品" },
  { to: "/events", label: "タイムライン" },
  { to: "/recurrence", label: "繰り返し設定" },
  { to: "/throughput", label: "消化数" },
  { to: "/users", label: "ユーザー" },
];
</script>
