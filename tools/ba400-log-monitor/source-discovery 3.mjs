import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SKIP_DIRECTORY_NAMES = new Set([
  '$recycle.bin',
  'system volume information',
  'windows',
  'program files',
  'program files (x86)',
  'package cache',
]);

function toRegExp(pattern) {
  if (pattern instanceof RegExp) {
    return pattern;
  }

  return new RegExp(pattern);
}

async function inspectCandidateDirectory(directoryPath, filePatterns, preferredDirNamePattern) {
  let dirents;

  try {
    dirents = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) {
      return null;
    }
    throw error;
  }

  const matchedFiles = [];

  for (const entry of dirents) {
    if (!entry.isFile()) {
      continue;
    }

    if (!filePatterns.some((pattern) => pattern.test(entry.name))) {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);
    let stats;

    try {
      stats = await fs.stat(fullPath);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    matchedFiles.push({
      fullPath,
      basename: entry.name,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    });
  }

  if (!matchedFiles.length) {
    return null;
  }

  matchedFiles.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) {
      return right.mtimeMs - left.mtimeMs;
    }
    return right.size - left.size;
  });

  const directoryName = path.basename(directoryPath);
  const preferredMatch = preferredDirNamePattern
    ? toRegExp(preferredDirNamePattern).test(directoryName)
    : false;

  return {
    directoryPath,
    directoryName,
    latestFilePath: matchedFiles[0].fullPath,
    latestFileBasename: matchedFiles[0].basename,
    latestFileMtimeMs: matchedFiles[0].mtimeMs,
    latestFileSize: matchedFiles[0].size,
    totalMatchingFiles: matchedFiles.length,
    preferredMatch,
    matchingFiles: matchedFiles,
  };
}

function rankCandidates(candidates) {
  return [...candidates].sort((left, right) => {
    if (right.latestFileMtimeMs !== left.latestFileMtimeMs) {
      return right.latestFileMtimeMs - left.latestFileMtimeMs;
    }
    if (right.totalMatchingFiles !== left.totalMatchingFiles) {
      return right.totalMatchingFiles - left.totalMatchingFiles;
    }
    if (Number(right.preferredMatch) !== Number(left.preferredMatch)) {
      return Number(right.preferredMatch) - Number(left.preferredMatch);
    }
    return left.directoryPath.length - right.directoryPath.length;
  });
}

function normalizeDirectoryList(values) {
  return Array.from(
    new Set(
      (values || [])
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => path.resolve(value)),
    ),
  );
}

async function collectDirectoriesRecursively(rootPath, options) {
  const results = [];
  const queue = [{ directoryPath: rootPath, depth: 0 }];
  const maxDepth = Number(options.maxDepth || 5);
  const maxDirectories = Number(options.maxDirectories || 500);
  const skipDirectoryNames = new Set(
    (options.skipDirectoryNames || []).map((value) => String(value).toLowerCase()),
  );

  while (queue.length && results.length < maxDirectories) {
    const current = queue.shift();
    results.push(current.directoryPath);

    if (current.depth >= maxDepth) {
      continue;
    }

    let dirents;

    try {
      dirents = await fs.readdir(current.directoryPath, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) {
        continue;
      }
      throw error;
    }

    for (const entry of dirents) {
      if (!entry.isDirectory()) {
        continue;
      }

      const normalizedName = entry.name.toLowerCase();
      if (DEFAULT_SKIP_DIRECTORY_NAMES.has(normalizedName) || skipDirectoryNames.has(normalizedName)) {
        continue;
      }

      queue.push({
        directoryPath: path.join(current.directoryPath, entry.name),
        depth: current.depth + 1,
      });
    }
  }

  return results;
}

export async function discoverMatchingDirectories(options) {
  const filePatterns = (options.filePatterns || []).map((pattern) => toRegExp(pattern));
  if (!filePatterns.length) {
    throw new Error('discoverMatchingDirectories requiere al menos un filePattern.');
  }

  const preferredPaths = normalizeDirectoryList(options.preferredPaths);
  const roots = normalizeDirectoryList(options.roots);
  const inspectedPaths = new Set();
  const candidates = [];

  for (const directoryPath of preferredPaths) {
    if (inspectedPaths.has(directoryPath)) {
      continue;
    }
    inspectedPaths.add(directoryPath);
    const candidate = await inspectCandidateDirectory(
      directoryPath,
      filePatterns,
      options.preferredDirNamePattern,
    );
    if (candidate) {
      candidates.push(candidate);
    }
  }

  for (const rootPath of roots) {
    const directories = await collectDirectoriesRecursively(rootPath, options);

    for (const directoryPath of directories) {
      if (inspectedPaths.has(directoryPath)) {
        continue;
      }
      inspectedPaths.add(directoryPath);
      const candidate = await inspectCandidateDirectory(
        directoryPath,
        filePatterns,
        options.preferredDirNamePattern,
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return rankCandidates(candidates);
}

export async function discoverBestMatchingDirectory(options) {
  const candidates = await discoverMatchingDirectories(options);
  return candidates[0] || null;
}
