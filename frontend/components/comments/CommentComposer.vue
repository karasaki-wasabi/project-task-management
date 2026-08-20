<script setup lang="ts">
const props = defineProps<{
  taskId: string;
  mode: "create" | "edit";
  commentId?: string;
  initialBody?: string;
}>();

const emit = defineEmits<{
  success: [comment: TaskComment];
  cancel: [];
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
  if (submitting.value) return;
  error.value = null;

  if (isEmpty.value) {
    error.value = "コメントを入力してください";
    return;
  }

  submitting.value = true;
  try {
    let comment: TaskComment;
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

function onCommentKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  void submit();
}

function cancel() {
  if (submitting.value) return;
  emit("cancel");
}
</script>

<template>
  <form
    :data-testid="`comment-composer-${mode}`"
    class="flex flex-col gap-2"
    @submit.prevent="submit"
  >
    <label :for="`comment-body-${mode}`" class="sr-only">
      {{ mode === "create" ? "コメント" : "コメントを編集" }}
    </label>
    <textarea
      :id="`comment-body-${mode}`"
      v-model="body"
      :rows="mode === 'create' ? 4 : 3"
      :placeholder="mode === 'create' ? 'コメントを入力…' : 'コメントを編集'"
      :autofocus="mode === 'edit'"
      class="w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm leading-7 text-slate-700 placeholder:text-slate-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/35 disabled:cursor-not-allowed disabled:bg-slate-100"
      :disabled="submitting"
      @keydown="onCommentKeydown"
    />

    <p
      v-if="error"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <div v-if="mode === 'create'" class="flex items-center gap-2">
      <span class="text-xs text-slate-400">Ctrl + Enter で投稿</span>
      <button
        type="submit"
        :disabled="submitting || isEmpty"
        class="ml-auto rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ submitting ? "送信中..." : "投稿" }}
      </button>
    </div>
    <div v-else class="flex justify-end gap-2">
      <button
        type="button"
        :disabled="submitting"
        class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        @click="cancel"
      >
        キャンセル
      </button>
      <button
        type="submit"
        :disabled="submitting || isEmpty"
        class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ submitting ? "送信中..." : "更新" }}
      </button>
    </div>
  </form>
</template>
