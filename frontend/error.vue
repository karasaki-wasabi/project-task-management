<script setup lang="ts">
import { computed } from "vue";
import { getErrorPageContent } from "./composables/useErrorPageContent";

const props = defineProps<{
  error: { statusCode?: number };
}>();

const route = useRoute();
const content = computed(() => getErrorPageContent(props.error.statusCode));

const iconSvgClass = "h-9 w-9 max-sm:h-7 max-sm:w-7";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-md bg-primary-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 max-sm:w-full";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 max-sm:w-full";

function goHome(): void {
  clearError({ redirect: "/" });
}

function goLogin(): void {
  clearError({ redirect: "/login?redirect=" + encodeURIComponent(route.fullPath) });
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-12 font-sans max-sm:px-4">
    <div
      class="flex w-full max-w-[480px] flex-col items-center gap-4 rounded-md border border-slate-200 bg-white px-7 py-9 text-center shadow-sm max-sm:gap-3.5 max-sm:px-4 max-sm:py-8"
    >
      <div class="relative h-[72px] w-[72px] max-sm:h-14 max-sm:w-14">
        <span
          class="inline-flex h-full w-full items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <svg
            v-if="content.icon === 'notFound'"
            :class="iconSvgClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" />
          </svg>
          <svg
            v-else-if="content.icon === 'forbidden'"
            :class="iconSvgClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            <path d="M12 14v2" />
          </svg>
          <svg
            v-else-if="content.icon === 'unauthorized'"
            :class="iconSvgClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 12H3" />
            <path d="M11 8l4 4-4 4" />
            <path d="M9 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" />
          </svg>
          <svg
            v-else-if="content.icon === 'serverError'"
            :class="iconSvgClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4L2.5 20h19L12 4z" />
            <path d="M12 10v4" />
            <path d="M12 17h.01" />
          </svg>
          <svg
            v-else-if="content.icon === 'clientErrorGeneric'"
            :class="iconSvgClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M9.6 9.4a2.5 2.5 0 1 1 2.9 3c-.5.1-.5.7-.5 1.3" />
            <path d="M12 17h.01" />
          </svg>
          <svg
            v-else
            :class="iconSvgClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="7" rx="2" />
            <rect x="3" y="13" width="18" height="7" rx="2" />
            <path d="M7 7.5h.01" />
            <path d="M7 16.5h.01" />
          </svg>
        </span>
        <span
          data-error-code
          class="absolute bottom-[-6px] right-[-34px] inline-flex items-center rounded-full border-2 border-white bg-slate-700 px-3 py-[3px] text-sm font-semibold leading-[1.4] tracking-wide text-white"
        >
          {{ content.code }}
        </span>
      </div>

      <h1 class="text-xl font-semibold tracking-tight text-slate-900 max-sm:text-lg">
        {{ content.title }}
      </h1>
      <p class="text-sm leading-7 text-slate-600">
        {{ content.message }}
      </p>

      <div
        class="mt-2 flex flex-wrap justify-center gap-2.5 max-sm:w-full max-sm:flex-col-reverse max-sm:gap-2"
      >
        <button
          type="button"
          :class="content.showLoginAction ? secondaryButtonClass : primaryButtonClass"
          @click="goHome"
        >
          ホームへ戻る
        </button>
        <button
          v-if="content.showLoginAction"
          type="button"
          :class="primaryButtonClass"
          @click="goLogin"
        >
          ログイン画面へ
        </button>
      </div>
    </div>
  </div>
</template>
