<script setup lang="ts">
import { ref } from "vue";
import { useApiClient } from "../composables/useApiClient";
import { useAuth } from "../composables/useAuth";

const api = useApiClient();
const { user } = useAuth();
const route = useRoute();
const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const isSubmitting = ref(false);
const isPasswordVisible = ref(false);

function errorMessage(cause: unknown): string {
  if (
    typeof cause === "object"
    && cause !== null
    && "data" in cause
    && typeof cause.data === "object"
    && cause.data !== null
    && "message" in cause.data
    && typeof cause.data.message === "string"
  ) {
    return cause.data.message;
  }

  return cause instanceof Error ? cause.message : "ログインに失敗しました。";
}

function redirectPath(): string {
  return typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
    ? route.query.redirect
    : "/";
}

async function submit(): Promise<void> {
  error.value = null;
  isSubmitting.value = true;

  try {
    user.value = await api.login({ email: email.value, password: password.value });
    await navigateTo(redirectPath());
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-screen grid-cols-[38%_1fr] max-[899px]:block">
    <aside class="flex items-center justify-center bg-slate-900 p-8 max-[899px]:min-h-14 max-[899px]:justify-start max-[899px]:px-6 max-[899px]:py-0">
      <p class="text-lg font-semibold tracking-tight text-white">Task Delivery Management</p>
    </aside>
    <main class="flex items-center justify-center p-8 max-[899px]:min-h-[calc(100vh-56px)] max-[899px]:px-6">
      <div class="w-full max-w-[360px]">
        <p class="text-sm font-medium text-slate-500">おかえりなさい</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">ログイン</h1>
        <p class="mt-2 text-sm leading-6 text-slate-600">アカウントにログインして作業を続けます。</p>

        <form class="mt-8 space-y-5" @submit.prevent="submit">
          <ErrorAlert v-if="error" :message="error" />

          <label class="block">
            <span class="text-sm font-medium text-slate-700">メールアドレス</span>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              class="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-slate-700">パスワード</span>
            <span class="relative mt-2 block">
              <input
                id="password"
                v-model="password"
                :type="isPasswordVisible ? 'text' : 'password'"
                autocomplete="current-password"
                required
                class="block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 pr-12 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
              />
              <button
                type="button"
                :aria-label="isPasswordVisible ? 'パスワードを非表示' : 'パスワードを表示'"
                class="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]"
                @click="isPasswordVisible = !isPasswordVisible"
              >
                {{ isPasswordVisible ? "隠す" : "表示" }}
              </button>
            </span>
          </label>

          <button
            type="submit"
            class="w-full rounded-md bg-primary-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-65"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? "ログイン中..." : "ログイン" }}
          </button>
        </form>

        <p class="mt-7 text-center text-sm text-slate-600">
          アカウントをお持ちでない方は
          <NuxtLink to="/register" class="font-medium text-primary-600 hover:text-primary-700 hover:underline">登録</NuxtLink>
        </p>
      </div>
    </main>
  </div>
</template>
