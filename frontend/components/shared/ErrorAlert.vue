<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <p role="alert" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
    {{ message }}
  </p>
</template>
