import { generateBenchmarkProject } from "./generator.js";
import { serializeProject } from "../persistence/serialize.js";
import { parseProjectFile } from "../persistence/parse.js";
import { check } from "@repo/checker";
import { listConnections } from "../lib/connections.js";
import { computeLayout } from "../lib/layout.js";
import { MAX_FILE_BYTES } from "../persistence/types.js";

interface TimingResult {
  min: number;
  median: number;
}

function computeStats(times: number[]): TimingResult {
  const sorted = [...times].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return { min, median };
}

function measureOperation(fn: () => void, runs: number = 5): TimingResult {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }
  return computeStats(times);
}

export async function runMeasurements() {
  console.log("=== LUMIO SCALE BENCHMARK MEASUREMENTS ===");
  console.log("Machine Caveat: Measured on single Windows dev box; UNVERIFIED as general performance.\n");

  const counts = [300, 1000, 3000];
  const results = [];
  const encoder = new TextEncoder();

  for (const count of counts) {
    console.log(`Running benchmarks for ${count} nodes (5 runs each)...`);

    // 1. Generation time
    let project = generateBenchmarkProject({ seed: 42, nodeCount: count });
    const genStats = measureOperation(() => {
      project = generateBenchmarkProject({ seed: 42, nodeCount: count });
    });

    // 2. Serialization and size
    const exportedAt = "2026-10-06T12:00:00.000Z";
    let serialized = serializeProject(project, exportedAt);
    const serializeStats = measureOperation(() => {
      serialized = serializeProject(project, exportedAt);
    });

    const sizeBytes = encoder.encode(serialized).length;
    const sizeKb = (sizeBytes / 1024).toFixed(2);
    const headroomBytes = MAX_FILE_BYTES - sizeBytes;
    const headroomKb = (headroomBytes / 1024).toFixed(2);

    if (sizeBytes > MAX_FILE_BYTES) {
      console.error(
        `CRITICAL: Serialized size for ${count} nodes (${sizeBytes} bytes) exceeds MAX_FILE_BYTES (${MAX_FILE_BYTES})!`,
      );
      process.exit(1);
    }

    // Extrapolate max nodes under 5 MB limit
    const bytesPerNode = sizeBytes / count;
    const estimatedMaxNodes = Math.floor(MAX_FILE_BYTES / bytesPerNode);

    // 3. Parse round trip
    const parseStats = measureOperation(() => {
      const parsed = parseProjectFile(serialized);
      if (!parsed.ok) {
        throw new Error("Parse failed in benchmark");
      }
    });

    // 4. Checker
    const checkStats = measureOperation(() => {
      check(project);
    });

    // 5. listConnections (whole graph: test across start node)
    const testNodeId = project.nodes[0]?.id ?? "node_start";
    const listConnStats = measureOperation(() => {
      listConnections(project, testNodeId);
    });

    // 6. computeLayout (whole graph)
    const layoutStats = measureOperation(() => {
      computeLayout(project);
    });

    results.push({
      count,
      sizeBytes,
      sizeKb,
      headroomKb,
      estimatedMaxNodes,
      gen: genStats,
      serialize: serializeStats,
      parse: parseStats,
      check: checkStats,
      listConn: listConnStats,
      layout: layoutStats,
    });
  }

  console.log("\n### Summary Table (Times in ms: min / median)\n");
  console.log(
    "| Node Count | Serialized Size | Headroom (5MB) | Gen Time | Parse Round-trip | check() | listConnections | computeLayout |",
  );
  console.log(
    "|---|---|---|---|---|---|---|---|",
  );

  for (const r of results) {
    const sizeStr = `${r.sizeKb} KB`;
    const headStr = `${r.headroomKb} KB (${Math.round((r.sizeBytes / MAX_FILE_BYTES) * 100)}%)`;
    const genStr = `${r.gen.min.toFixed(2)} / ${r.gen.median.toFixed(2)} ms`;
    const parseStr = `${r.parse.min.toFixed(2)} / ${r.parse.median.toFixed(2)} ms`;
    const checkStr = `${r.check.min.toFixed(2)} / ${r.check.median.toFixed(2)} ms`;
    const connStr = `${r.listConn.min.toFixed(2)} / ${r.listConn.median.toFixed(2)} ms`;
    const layoutStr = `${r.layout.min.toFixed(2)} / ${r.layout.median.toFixed(2)} ms`;

    console.log(
      `| **${r.count}** | ${sizeStr} | ${headStr} | ${genStr} | ${parseStr} | ${checkStr} | ${connStr} | ${layoutStr} |`,
    );
  }

  console.log("\n### Headroom & Capacity Estimates\n");
  for (const r of results) {
    console.log(
      `- At ${r.count} nodes (${r.sizeKb} KB, ~${(r.sizeBytes / r.count).toFixed(0)} B/node), estimated capacity before 5 MB limit is ~${r.estimatedMaxNodes.toLocaleString()} nodes (UNVERIFIED linear extrapolation).`,
    );
  }
}

runMeasurements().catch((err) => {
  console.error(err);
  process.exit(1);
});
