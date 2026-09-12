/**
 * 桌宠窗口的位置校正。
 *
 * 问题：位置是持久化的。如果你把凤凰拖到副屏，之后拔掉外接显示器，
 * 下次启动它会恢复到不存在的坐标上——你看不见它，也拖不回来。
 *
 * 规则：只要还有一小块落在某个屏幕的工作区内就认；否则挪回主屏右上角。
 */

const MIN_VISIBLE_X = 80; // 至少要露出这么宽，才抓得住
const MIN_VISIBLE_Y = 40;
const DEFAULT_SIZE = { width: 220, height: 252 };

export function clampToWorkAreas(bounds, workAreas, size = DEFAULT_SIZE) {
  const areas = Array.isArray(workAreas) ? workAreas.filter(Boolean) : [];
  const fallback = areas[0] ?? { x: 0, y: 0, width: 1280, height: 720 };
  if (!bounds) return null;

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const width = Number(size?.width) || DEFAULT_SIZE.width;
  const height = Number(size?.height) || DEFAULT_SIZE.height;

  // 判据是"与屏幕的重叠面积够不够大"，而不是"左上角在不在屏幕内"——
  // 后者会把几乎完全滑出屏幕的窗口误判成可见。
  const visible = areas.some((area) => {
    const overlapX = Math.min(x + width, area.x + area.width) - Math.max(x, area.x);
    const overlapY = Math.min(y + height, area.y + area.height) - Math.max(y, area.y);
    return overlapX >= MIN_VISIBLE_X && overlapY >= MIN_VISIBLE_Y;
  });
  if (visible) return { x, y };

  return {
    x: Math.round(fallback.x + fallback.width - 240),
    y: Math.round(fallback.y + 60),
  };
}
