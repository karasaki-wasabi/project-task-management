<!-- Development stage badge (task-status-model 4.2). -->
<script setup lang="ts">
import {
  STAGE_BADGE_BASE_CLASSES,
  STAGE_BADGE_VARIANT_CLASSES,
  stageBadgeNameLabel,
  stageBadgePrefix,
  stageBadgeVariant,
  type StageBadgePrefixMode,
} from "./StageBadge.helpers";

const props = withDefaults(
  defineProps<{
    kind?: DevelopmentStageKind | null;
    name?: string | null;
    prefixMode?: StageBadgePrefixMode;
  }>(),
  {
    kind: null,
    name: null,
    prefixMode: "list",
  },
);

const variant = computed(() => stageBadgeVariant(props.kind));
const prefix = computed(() => stageBadgePrefix(props.prefixMode));
const nameLabel = computed(() => stageBadgeNameLabel(props.kind, props.name));
const shellClasses = computed(
  () => `${STAGE_BADGE_BASE_CLASSES} ${STAGE_BADGE_VARIANT_CLASSES[variant.value]}`,
);
const strikeName = computed(() => variant.value === "cancelled");
</script>

<template>
  <span :class="shellClasses"
    ><span data-testid="stage-badge-prefix">{{ prefix }}</span
    ><span data-testid="stage-badge-name" :class="{ 'line-through': strikeName }">{{ nameLabel }}</span></span
  >
</template>
