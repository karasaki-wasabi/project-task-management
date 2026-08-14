#!/usr/bin/env node
// Enforces .kiro/steering/ui-design.md's claude design gate before
// kiro-spec-design / kiro-spec-tasks / kiro-impl can run for a spec.
const fs = require("fs");
const path = require("path");

const GATED_SKILLS = new Set(["kiro-spec-design", "kiro-spec-tasks", "kiro-impl"]);
const GATE_MARKERS = [
  "ビジュアルデザイン確定",
  "claude design ゲート: 適用対象外",
  "claude design ゲートをスキップ",
];

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const skill = payload && payload.tool_input && payload.tool_input.skill;
  if (!GATED_SKILLS.has(skill)) process.exit(0);

  const rawArgs = (payload.tool_input.args || "").toString().trim();
  const feature = rawArgs.split(/\s+/)[0];
  if (!feature || feature.includes("/") || feature.includes("..")) process.exit(0);

  const specDir = path.join(process.cwd(), ".kiro", "specs", feature);
  if (!fs.existsSync(specDir)) process.exit(0);

  const researchFile = path.join(specDir, "research.md");
  let satisfied = false;
  if (fs.existsSync(researchFile)) {
    const content = fs.readFileSync(researchFile, "utf8");
    satisfied = GATE_MARKERS.some((marker) => content.includes(marker));
  }
  if (satisfied) process.exit(0);

  const reason =
    `claude design ゲート未充足: .kiro/specs/${feature}/research.md に「ビジュアルデザイン確定」または明示的な` +
    `スキップ理由の記録がありません。.kiro/steering/ui-design.md に従い、先に claude design でモックを確定するか、` +
    `スキップ理由を research.md に記録してください。`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
});
