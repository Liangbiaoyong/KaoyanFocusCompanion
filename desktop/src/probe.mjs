import { spawn as nodeSpawn } from 'node:child_process';

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function asNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

/** 解析探针的一行输出。非法输入返回 null，永不抛异常。 */
export function parseProbeLine(line) {
  const text = String(line ?? '').trim();
  if (text === '') return null;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  return {
    process: asString(obj.process),
    title: asString(obj.title),
    url: typeof obj.url === 'string' && obj.url !== '' ? obj.url : null,
    idleMs: asNumber(obj.idleMs),
    at: asNumber(obj.at),
  };
}

/**
 * 合并两次探针的输出。精确探针只在少数帧带上 url，
 * 因此 url 为 null 时沿用上一次；但进程或标题变了就必须丢弃旧 url。
 */
export function mergeSample(previous, next) {
  const prev = previous ?? null;
  const sameWindow = prev && prev.process === next.process && prev.title === next.title;
  return {
    ...next,
    url: next.url ?? (sameWindow ? prev.url : null),
  };
}

/**
 * 拉起常驻的 PowerShell 探针，逐行解析样本。
 * @returns {{stop: () => void}}
 */
export function createProbe({ scriptPath, intervalMs = 1000, onSample, onError, spawnImpl = nodeSpawn }) {
  let buffer = '';
  let stopped = false;

  const child = spawnImpl(
    'powershell.exe',
    ['-NoProfile', '-File', scriptPath, '-Interval', String(intervalMs)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  child.stdout?.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const sample = parseProbeLine(line);
      if (sample) onSample?.(sample);
      index = buffer.indexOf('\n');
    }
  });

  child.on?.('error', (error) => onError?.(error));
  child.on?.('exit', (code) => {
    if (!stopped) onError?.(new Error(`探针进程退出，code=${code}`));
  });

  return {
    stop() {
      stopped = true;
      try {
        child.kill();
      } catch {
        /* 已经退出 */
      }
    },
  };
}
