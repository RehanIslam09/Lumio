import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBenchmarkProject } from "./generator.js";
import { serializeProject } from "../persistence/serialize.js";
import { MAX_FILE_BYTES } from "../persistence/types.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRootDir = path.resolve(currentDir, "../../../..");
const encoder = new TextEncoder();

function writeBenchmarkFile(nodeCount: number, outputDir: string) {
  const project = generateBenchmarkProject({
    seed: 42,
    nodeCount,
  });

  const serialized = serializeProject(project, new Date().toISOString());
  const sizeBytes = encoder.encode(serialized).length;

  if (sizeBytes > MAX_FILE_BYTES) {
    throw new Error(
      `Serialized project size for ${nodeCount} nodes (${sizeBytes} bytes) exceeds MAX_FILE_BYTES (${MAX_FILE_BYTES})!`,
    );
  }

  const filename = `benchmark-${nodeCount}.json`;
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, serialized, "utf8");

  const sizeKb = (sizeBytes / 1024).toFixed(2);
  console.log(`Generated ${filename}: ${sizeBytes} bytes (${sizeKb} KB) -> ${filePath}`);
}

export function main() {
  const outputDir = path.join(repoRootDir, "benchmark-output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Generating benchmark files in ${outputDir}...`);
  writeBenchmarkFile(300, outputDir);
  writeBenchmarkFile(3000, outputDir);
  console.log("Done.");
}

main();
