import { appendFile, readFile } from 'node:fs/promises';
import { matchesGlob } from 'node:path';

const COUNT_MODES = new Set(['additions-and-deletions', 'additions-only']);

export function parsePatterns(value) {
  return value.split(/\r?\n/).map((pattern) => pattern.trim()).filter(Boolean);
}

export function isIgnored(filename, patterns) {
  return patterns.some((pattern) => matchesGlob(filename, pattern));
}

export function calculateSize(files, { patterns = [], count = 'additions-and-deletions' } = {}) {
  if (!COUNT_MODES.has(count)) {
    throw new Error(`Invalid count mode \"${count}\". Use additions-and-deletions or additions-only.`);
  }

  return files.reduce((result, file) => {
    if (isIgnored(file.filename, patterns)) {
      result.skippedFiles += 1;
      return result;
    }

    result.countedLines += file.additions + (count === 'additions-and-deletions' ? file.deletions : 0);
    result.countedFiles += 1;
    return result;
  }, { countedLines: 0, countedFiles: 0, skippedFiles: 0 });
}

export function hasBypassLabel(labels, bypassLabel) {
  if (!bypassLabel) return false;
  return labels.some((label) => label.name.toLowerCase() === bypassLabel.toLowerCase());
}

export function getInput(name, environment = process.env) {
  // GitHub replaces spaces in input IDs, but deliberately preserves hyphens.
  return environment[`INPUT_${name.toUpperCase().replaceAll(' ', '_')}`] ?? '';
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  return appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function getPullRequestEvent() {
  if (!process.env.GITHUB_EVENT_PATH) {
    throw new Error('GITHUB_EVENT_PATH is required. Run this action from a pull_request workflow.');
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (!event.pull_request?.number) {
    throw new Error('This action must run in response to a pull_request or pull_request_target event.');
  }
  return event;
}

async function listPullRequestFiles({ apiUrl, repository, pullNumber, token }) {
  const files = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${apiUrl}/repos/${repository}/pulls/${pullNumber}/files?per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status} while reading changed files: ${await response.text()}`);
    }
    const pageFiles = await response.json();
    files.push(...pageFiles);
    if (pageFiles.length < 100) return files;
  }
}

export async function run(environment = process.env) {
  const maxLines = Number(getInput('max-lines', environment));
  if (!Number.isInteger(maxLines) || maxLines < 0) {
    throw new Error('max-lines must be a non-negative integer.');
  }

  const token = getInput('github-token', environment);
  if (!token) throw new Error('github-token is required.');

  const event = await getPullRequestEvent();
  const bypassLabel = getInput('bypass-label', environment).trim();
  const bypassed = hasBypassLabel(event.pull_request.labels ?? [], bypassLabel);
  const files = await listPullRequestFiles({
    apiUrl: environment.GITHUB_API_URL ?? 'https://api.github.com',
    repository: environment.GITHUB_REPOSITORY,
    pullNumber: event.pull_request.number,
    token
  });
  const result = calculateSize(files, {
    patterns: parsePatterns(getInput('ignored-paths', environment)),
    count: getInput('count', environment)
  });

  await Promise.all([
    setOutput('counted-lines', result.countedLines),
    setOutput('skipped-files', result.skippedFiles),
    setOutput('bypassed', bypassed)
  ]);
  process.stdout.write(`PR size: ${result.countedLines} counted lines across ${result.countedFiles} files; ${result.skippedFiles} files ignored.\n`);

  if (bypassed) {
    process.stdout.write(`Bypassed because the PR has the \"${bypassLabel}\" label.\n`);
    return;
  }
  if (result.countedLines > maxLines && getInput('fail-on-exceed', environment).toLowerCase() !== 'false') {
    const extraMessage = getInput('message', environment).trim();
    throw new Error(`PR size is ${result.countedLines} lines, exceeding the ${maxLines}-line limit.${extraMessage ? ` ${extraMessage}` : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    process.stderr.write(`::error::${error.message}\n`);
    process.exitCode = 1;
  });
}
