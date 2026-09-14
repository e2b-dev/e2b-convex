import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceMap = JSON.parse(
  await readFile(resolve(root, "node_modules/e2b/dist/index.mjs.map"), "utf8"),
);
const e2bPackage = JSON.parse(
  await readFile(resolve(root, "node_modules/e2b/package.json"), "utf8"),
);

function descriptor(sourceName) {
  const index = sourceMap.sources.indexOf(sourceName);
  if (index < 0) throw new Error(`Missing E2B protocol source: ${sourceName}`);
  const source = sourceMap.sourcesContent[index];
  const match = source.match(/fileDesc\(\s*['"]([^'"]+)['"]/s);
  if (!match) throw new Error(`Missing protobuf descriptor: ${sourceName}`);
  return match[1];
}

const processDescriptor = descriptor("../src/envd/process/process_pb.ts");
const filesystemDescriptor = descriptor(
  "../src/envd/filesystem/filesystem_pb.ts",
);

const output = `// Generated from the public envd protobuf descriptors in e2b@${e2bPackage.version}.
// Only the two services used by this component are retained.
import { fileDesc, serviceDesc } from "@bufbuild/protobuf/codegenv2";
import { file_google_protobuf_timestamp } from "@bufbuild/protobuf/wkt";

const processFile = fileDesc(
  "${processDescriptor}",
);
const filesystemFile = fileDesc(
  "${filesystemDescriptor}",
  [file_google_protobuf_timestamp],
);

export const ProcessService = serviceDesc(processFile, 0);
export const FilesystemService = serviceDesc(filesystemFile, 0);
`;

await writeFile(resolve(root, "src/component/e2b/protocol.ts"), output, "utf8");
