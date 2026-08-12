<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useApiClient, type Comment } from "../../composables/useApiClient";

const props = defineProps<{
  taskId: string;
  mode: "create" | "edit";
  commentId?: string;
  initialBody?: string;
}>();

const emit = defineEmits<{
  success: [comment: Comment];
}>();

const api = useApiClient();
const body = ref(props.mode === "edit" ? (props.initialBody ?? "") : "");
const submitting = ref(false);
const error = ref<string | null>(null);
const isEmpty = computed(() => body.value.trim().length === 0);

watch(
  () => [props.mode, props.commentId, props.initialBody] as const,
  ([mode, , initialBody]) => {
    body.value = mode === "edit" ? (initialBody ?? "") : "";
    error.value = null;
  },
);

async function submit() {
  error.value = null;

  if (isEmpty.value) {
    error.value = "コメントを入力してください";
    return;
  }

  submitting.value = true;
  try {
    let comment: Comment;
    if (props.mode === "edit") {
      if (!props.commentId) {
        error.value = "編集するコメントを指定してください";
        return;
      }
      comment = await api.updateComment(props.taskId, props.commentId, body.value);
      body.value = comment.body;
    } else {
      comment = await api.createComment(props.taskId, body.value);
      body.value = "";
    }
    emit("success", comment);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="space-y-2" @submit.prevent="submit">
    <label :for="`comment-body-${mode}`" class="block text-sm font-medium text-slate-700">
      {{ mode === "create" ? "コメント" : "コメントを編集" }}
    </label>
    <textarea
      :id="`comment-body-${mode}`"
      v-model="body"
      rows="4"
      :placeholder="mode === 'create' ? 'コメントを入力' : 'コメントを編集'"
      class="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
      :disabled="submitting"
    />

    <p
      v-if="error"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <div class="flex justify-end">
      <button
        type="submit"
        :disabled="submitting || isEmpty"
        class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ submitting ? "送信中..." : mode === "create" ? "投稿" : "保存" }}
      </button>
    </div>
  </form>
</template>
