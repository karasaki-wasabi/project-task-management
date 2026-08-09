<script setup lang="ts">
import { ref } from "vue";
import { useApiClient } from "../composables/useApiClient";
import { useAuth } from "../composables/useAuth";

const api = useApiClient();
const { user } = useAuth();
const email = ref("");
const name = ref("");
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

  return cause instanceof Error ? cause.message : "登録に失敗しました。";
}

async function submit(): Promise<void> {
  error.value = null;
  isSubmitting.value = true;

  try {
    user.value = await api.register({
      email: email.value,
      name: name.value,
      password: password.value,
    });
    await navigateTo("/");
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
        <p class="text-sm font-medium text-slate-500">はじめましょう</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">アカウント登録</h1>
        <p class="mt-2 text-sm leading-6 text-slate-600">登録すると、すぐにタスク管理を始められます。</p>

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
            <span class="mt-1.5 block text-xs leading-5 text-slate-500">ログインや通知時に使用するメールアドレスです。</span>
          </label>

          <label class="block">
            <span class="text-sm font-medium text-slate-700">表示名</span>
            <input
              id="name"
              v-model="name"
              type="text"
              autocomplete="name"
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
                autocomplete="new-password"
                minlength="8"
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
            <span class="mt-1.5 block text-xs text-slate-500">8文字以上</span>
          </label>

          <button
            type="submit"
            class="w-full rounded-md bg-primary-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-65"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? "登録中..." : "登録" }}
          </button>
        </form>

        <p class="mt-7 text-center text-sm text-slate-600">
          登録済みの場合は
          <NuxtLink to="/login" class="font-medium text-primary-600 hover:text-primary-700 hover:underline">ログイン</NuxtLink>
        </p>
      </div>
    </main>
  </div>
</template>
