#!/usr/bin/env node
/**
 * One-shot Claude Design MCP client for agents.
 * Uses Design OAuth tokens from claude-design-mcp (no Cursor MCP, no browser OAuth loop).
 *
 * Usage:
 *   node design-mcp.mjs status
 *   node design-mcp.mjs projects
 *   node design-mcp.mjs files <project-id-or-url> [path]
 *   node design-mcp.mjs read <project-id-or-url> <path> [--offset N] [--limit N]
 *   node design-mcp.mjs fetch <project-id-or-url> [file ...]
 *   node design-mcp.mjs call <toolName> [json-args]
 */

import { spawnSync } from "node:child_process";

function htmlUnescape(text) {
  return String(text)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

const MCP_URL = "https://api.anthropic.com/v1/design/mcp";
const INSTALL_SPEC =
  process.env.CLAUDE_DESIGN_MCP_INSTALL_SPEC || "github:erdnj/claude-design-mcp";

function usage(code = 1) {
  console.error(`Usage:
  design-mcp.mjs status
  design-mcp.mjs projects
  design-mcp.mjs files <project-id-or-url> [path]
  design-mcp.mjs read <project-id-or-url> <path> [--offset N] [--limit N]
  design-mcp.mjs fetch <project-id-or-url> [file ...]
  design-mcp.mjs call <toolName> '{"arg":"value"}'

Auth: relies on \`npx -y ${INSTALL_SPEC} token\`
Login once: npx -y ${INSTALL_SPEC} login`);
  process.exit(code);
}

function parseProjectRef(ref) {
  if (!ref) return null;
  const m = String(ref).match(
    /(?:claude\.ai\/design\/p\/|claude\.com\/design\/p\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m ? m[1].toLowerCase() : null;
}

function npxEnv() {
  return {
    ...process.env,
    npm_config_update_notifier: "false",
    npm_config_loglevel: "error",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
  };
}

function getToken() {
  const r = spawnSync(
    "npx",
    ["-y", INSTALL_SPEC, "token"],
    { encoding: "utf8", timeout: 120_000, env: npxEnv() },
  );
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(
      err ||
        `Failed to get Design token. Run: npx -y ${INSTALL_SPEC} login`,
    );
  }
  // token is a single line; ignore any npm noise that leaked to stdout
  const lines = (r.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("npm "));
  const token = lines.at(-1) || "";
  if (!token) {
    throw new Error(`Empty token. Run: npx -y ${INSTALL_SPEC} login`);
  }
  return token;
}

function status() {
  const r = spawnSync("npx", ["-y", INSTALL_SPEC, "status"], {
    encoding: "utf8",
    timeout: 120_000,
    env: npxEnv(),
  });
  process.stdout.write(r.stdout || "");
  if (r.status) process.stderr.write(r.stderr || "");
  process.exit(r.status ?? 1);
}

async function mcpCall(token, name, args = {}) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON MCP response (${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (data.error) {
    throw new Error(
      `MCP error ${data.error.code ?? ""}: ${data.error.message || JSON.stringify(data.error)}`,
    );
  }
  return data.result;
}

function extractText(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return JSON.stringify(result, null, 2);
  return content
    .map((c) => (c?.type === "text" ? c.text : JSON.stringify(c)))
    .join("\n");
}

function decodeDesignFileBody(wrapped) {
  const match = wrapped.match(
    /<untrusted-project-content\b[^>]*>([\s\S]*?)<\/untrusted-project-content>/,
  );
  const body = match ? match[1] : wrapped;
  return htmlUnescape(body);
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function cmdProjects(token) {
  const result = await mcpCall(token, "list_projects", {});
  const raw = extractText(result);
  const data = parseJsonPayload(raw);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function cmdFiles(token, projectRef, path = "") {
  const projectId = parseProjectRef(projectRef);
  if (!projectId) throw new Error(`Invalid project ref: ${projectRef}`);
  const result = await mcpCall(token, "list_files", {
    project_id: projectId,
    path,
    depth: -1,
  });
  const data = parseJsonPayload(extractText(result));
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function cmdRead(token, projectRef, path, opts = {}) {
  const projectId = parseProjectRef(projectRef);
  if (!projectId) throw new Error(`Invalid project ref: ${projectRef}`);
  if (!path) throw new Error("path is required");
  const args = { project_id: projectId, path };
  if (opts.offset != null) args.offset = opts.offset;
  if (opts.limit != null) args.limit = opts.limit;
  const result = await mcpCall(token, "read_file", args);
  const wrapped = extractText(result);
  const decoded = decodeDesignFileBody(wrapped);
  process.stdout.write(decoded);
  if (!decoded.endsWith("\n")) process.stdout.write("\n");
}

async function cmdFetch(token, projectRef, files) {
  const projectId = parseProjectRef(projectRef);
  if (!projectId) throw new Error(`Invalid project ref: ${projectRef}`);

  const meta = parseJsonPayload(
    extractText(await mcpCall(token, "get_project", { project_id: projectId })),
  );
  const listing = parseJsonPayload(
    extractText(
      await mcpCall(token, "list_files", {
        project_id: projectId,
        path: "",
        depth: -1,
      }),
    ),
  );
  const allFiles = Array.isArray(listing)
    ? listing.filter((e) => e.type === "file").map((e) => e.path)
    : [];

  let targets = files.filter(Boolean);
  if (!targets.length) {
    targets = allFiles.filter((p) => p.endsWith(".dc.html"));
    if (!targets.length) targets = allFiles.filter((p) => !p.startsWith("."));
  }

  const out = {
    project: meta,
    files: allFiles,
    contents: {},
  };

  for (const path of targets) {
    const wrapped = extractText(
      await mcpCall(token, "read_file", { project_id: projectId, path }),
    );
    out.contents[path] = decodeDesignFileBody(wrapped);
  }

  console.log(JSON.stringify(out, null, 2));
}

async function cmdCall(token, toolName, argsJson) {
  let args = {};
  if (argsJson) {
    args = JSON.parse(argsJson);
  }
  const result = await mcpCall(token, toolName, args);
  const text = extractText(result);
  const data = parseJsonPayload(text);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

function takeFlag(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();
  if (!cmd || cmd === "-h" || cmd === "--help") usage(cmd ? 0 : 1);

  if (cmd === "status") {
    status();
    return;
  }

  const token = getToken();

  if (cmd === "projects") {
    await cmdProjects(token);
    return;
  }
  if (cmd === "files") {
    await cmdFiles(token, argv[0], argv[1] || "");
    return;
  }
  if (cmd === "read") {
    const offset = takeFlag(argv, "--offset");
    const limit = takeFlag(argv, "--limit");
    await cmdRead(token, argv[0], argv[1], {
      offset: offset != null ? Number(offset) : undefined,
      limit: limit != null ? Number(limit) : undefined,
    });
    return;
  }
  if (cmd === "fetch") {
    const ref = argv.shift();
    await cmdFetch(token, ref, argv);
    return;
  }
  if (cmd === "call") {
    await cmdCall(token, argv[0], argv[1]);
    return;
  }
  usage(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  if (String(err?.message || err).includes("login") || String(err).includes("Not logged")) {
    console.error(`\nRun once: npx -y ${INSTALL_SPEC} login`);
  }
  process.exit(1);
});
