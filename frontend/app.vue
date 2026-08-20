<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <header v-if="!isAuthScreen" class="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <strong class="text-sm font-semibold tracking-tight text-slate-900">Task Delivery Management</strong>
        <nav class="flex flex-wrap gap-x-1 gap-y-1 text-sm">
          <NuxtLink v-for="link in navLinks" :key="link.to" :to="link.to" custom v-slot="{ href, navigate, isActive }">
            <a
              v-if="navIsActive(link.to, isActive)"
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
          <WorkspaceSwitcher />
          <div class="flex items-center gap-2">
            <UserAvatar v-if="user" :userId="user.id" :size="28" />
            <span class="max-w-32 truncate text-slate-600 sm:max-w-none">{{ user?.name }}</span>
          </div>
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
import { buildNavLinks } from "./app.helpers";
import { useCurrentWorkspace } from "./composables/useCurrentWorkspace";

const route = useRoute();
const { user, logout } = useAuth();
const { currentId } = useCurrentWorkspace();
const navLinks = computed(() => buildNavLinks(currentId.value));
const isAuthScreen = computed(() => route.path === "/login" || route.path === "/register");
const logoutError = ref<string | null>(null);

function navIsActive(linkTo: string, nuxtActive: boolean): boolean {
  if (linkTo === "/workspaces") {
    return route.path === "/workspaces";
  }
  if (/^\/workspaces\/[^/]+$/.test(linkTo)) {
    return route.path === linkTo;
  }
  return nuxtActive || route.path === linkTo || route.path.startsWith(`${linkTo}/`);
}

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
