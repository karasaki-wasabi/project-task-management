<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <header class="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <strong class="text-sm font-semibold tracking-tight text-slate-900">Task Delivery Management</strong>
        <nav class="flex flex-wrap gap-x-1 gap-y-1 text-sm">
          <!-- Impeccable critique ("gray-on-color" hit): `class` +
               `active-class` both apply to the active link at once, so
               `text-slate-600` (base) and `text-blue-700` (active) were
               fighting in the same class list — Tailwind's generated CSS
               order let slate-600 quietly win, so the active nav item
               rendered gray text on the blue chip despite DESIGN.md's
               "選択中は `bg-blue-50 text-blue-700`". `custom`+`v-slot`
               makes the two states mutually exclusive in the actual class
               list rather than layering one over the other. -->
          <NuxtLink v-for="link in navLinks" :key="link.to" :to="link.to" custom v-slot="{ href, navigate, isActive }">
            <a
              :href="href ?? undefined"
              class="rounded-md px-2.5 py-1.5 font-medium"
              :class="isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'"
              @click="navigate"
            >
              {{ link.label }}
            </a>
          </NuxtLink>
        </nav>
      </div>
    </header>
    <!-- User feedback: the kanban board previously broke itself out of this
         `max-w-6xl` cap with a `w-screen` viewport-width hack scoped to
         just the board div. Two problems with that: (1) `100vw` counts the
         scrollbar's own width in most browsers, so any time the page also
         has a vertical scrollbar (a short window, a tall board), the
         "full-width" board became wider than the actual visible viewport
         and produced a faint horizontal scrollbar — the classic `100vw`
         gotcha; (2) it only widened the board itself, leaving the title/
         workload-summary/dialogs above it still capped at max-w-6xl, an
         inconsistent width the user also flagged. Route-level
         `page.meta.fullWidth` now lets a page opt out of the cap on `main`
         itself instead — no viewport units anywhere, and every element on
         an opted-in page (not just one hand-picked div) shares one width. -->
    <main class="px-4 py-6 sm:px-6" :class="{ 'mx-auto max-w-6xl': !route.meta.fullWidth }">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const navLinks = [
  { to: "/", label: "ダッシュボード" },
  { to: "/tasks", label: "タスク" },
  { to: "/kanban", label: "カンバン" },
  { to: "/cases", label: "案件" },
  { to: "/calendar", label: "カレンダー" },
  { to: "/recurrence", label: "繰り返し設定" },
  { to: "/throughput", label: "消化数" },
  { to: "/users", label: "ユーザー" },
];
</script>
