<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <header v-if="!isAuthScreen" class="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <strong class="text-sm font-semibold tracking-tight text-slate-900">Task Delivery Management</strong>
        <nav class="flex flex-wrap gap-x-1 gap-y-1 text-sm">
          <!-- Active and inactive nav anchors are separate elements so each
               class list describes only one state. NuxtLink custom+slot keeps
               active styling mutually exclusive instead of layering base and
               active classes on the same node. -->
          <NuxtLink v-for="link in navLinks" :key="link.to" :to="link.to" custom v-slot="{ href, navigate, isActive }">
            <a
              v-if="isActive"
              :href="href ?? undefined"
              class="rounded-md bg-blue-50 px-2.5 py-1.5 font-medium text-blue-700"
              @click="navigate"
            >
              {{ link.label }}
            </a>
            <a
              v-else
              :href="href ?? undefined"
              class="rounded-md px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              @click="navigate"
            >
              {{ link.label }}
            </a>
          </NuxtLink>
        </nav>
        <div class="ml-auto flex items-center gap-3 text-sm">
          <!-- WorkspaceSwitcher sits between nav and display-name/logout (案B). -->
          <WorkspaceSwitcher />
          <span class="max-w-32 truncate text-slate-600 sm:max-w-none">{{ user?.name }}</span>
          <span class="h-5 border-l border-slate-200"></span>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            @click="handleLogout"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
    <!-- User feedback: the kanban board previously broke itself out of this
         max-width cap with a viewport-width hack scoped to just the board
         div. Two problems with that: (1) 100vw counts the scrollbar's own
         width in most browsers, so any time the page also has a vertical
         scrollbar the "full-width" board became wider than the actual
         visible viewport and produced a faint horizontal scrollbar; (2) it
         only widened the board itself, leaving the title / workload summary /
         dialogs above it still capped, an inconsistent width the user also
         flagged. Route-level page.meta.fullWidth now lets a page opt out of
         the cap on main itself instead — no viewport units anywhere, and
         every element on an opted-in page shares one width. -->
    <main
      :class="isAuthScreen
        ? 'p-0'
        : ['px-4 py-6 sm:px-6', { 'mx-auto max-w-6xl': !route.meta.fullWidth }]"
    >
      <ErrorAlert v-if="logoutError" :message="logoutError" />
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { navLinks } from "./app.helpers";

const route = useRoute();
const { user, logout } = useAuth();
const isAuthScreen = computed(() => route.path === "/login" || route.path === "/register");
const logoutError = ref<string | null>(null);

async function handleLogout() {
  logoutError.value = null;

  try {
    await logout();
    await navigateTo("/login");
  } catch (error) {
    logoutError.value = error instanceof Error ? error.message : String(error);
  }
}
</script>
