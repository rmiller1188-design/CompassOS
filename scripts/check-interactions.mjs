import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src");
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

for (const file of await walk(root)) {
  const source = await readFile(file, "utf8");
  const relative = path.relative(process.cwd(), file);

  for (const match of source.matchAll(/<button\b[\s\S]*?>/g)) {
    const tag = match[0];
    const index = match.index || 0;
    if (/\sdisabled(?:\s|>)/.test(tag) || /disabled=\{true\}/.test(tag)) {
      failures.push(`${relative}:${lineNumber(source, index)} permanently disabled button`);
    }
    if (/tabIndex=\{-1\}/.test(tag)) {
      failures.push(`${relative}:${lineNumber(source, index)} button removed from keyboard navigation`);
    }
  }

  for (const match of source.matchAll(/<a\b[\s\S]*?>/g)) {
    const tag = match[0];
    const index = match.index || 0;
    if (/href=(?:""|'')/.test(tag) || /href=(?:"#"|'#')/.test(tag)) {
      failures.push(`${relative}:${lineNumber(source, index)} placeholder anchor destination`);
    }
  }
}

if (failures.length) {
  console.error("Interaction audit failed:\n" + failures.map(item => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Interaction audit passed: no permanently disabled buttons, keyboard-hidden buttons, or placeholder anchors.");
