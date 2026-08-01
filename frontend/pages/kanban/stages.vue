<!--
  Development stage master management screen, split out of `/kanban` (task
  3, design.md File Structure Plan "新規: 開発段階マスタ管理画面
  (Requirement 7)", Requirement 7.1/7.3). All state and behavior live in
  `DevelopmentStageManager` (frontend/components/kanban/DevelopmentStageManager.vue);
  this page is just the route entry point.

  A link back from `/kanban` (Requirement 7.2) and removal of the old
  inline UI on `/kanban` (Requirement 7.4's board-refresh-on-change is
  already covered by that page's existing `loadStages()` on mount) are the
  responsibility of a later task — this page does not modify
  `frontend/pages/kanban/index.vue`.
-->
<template>
  <DevelopmentStageManager />
</template>
