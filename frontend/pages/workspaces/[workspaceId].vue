<template>
  <NuxtPage />
</template>

<script setup lang="ts">
definePageMeta({
  middleware: ["workspace-member"],
});
</script>
