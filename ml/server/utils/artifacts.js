const fs = require('fs/promises');
const path = require('path');

// Lists timestamped run directories inside the artifacts folder.
async function listRunDirectories(artifactsDir) {
  try {
    const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function resolveRunDir(artifactsDir, runId) {
  return path.resolve(artifactsDir, runId);
}

async function ensureRunExists(artifactsDir, runId) {
  const candidate = resolveRunDir(artifactsDir, runId);
  try {
    const stats = await fs.stat(candidate);
    if (stats.isDirectory()) {
      return candidate;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  return null;
}

async function getLatestRunDir(artifactsDir) {
  const runs = await listRunDirectories(artifactsDir);
  if (!runs.length) {
    return null;
  }
  return resolveRunDir(artifactsDir, runs[0]);
}

async function readMetadata(runDir) {
  const filePath = path.join(runDir, 'metadata.json');
  const contents = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(contents);
}

module.exports = {
  listRunDirectories,
  getLatestRunDir,
  resolveRunDir,
  ensureRunExists,
  readMetadata,
};
