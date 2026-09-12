import { describe, it, expect } from 'vitest';
import { clampToWorkAreas } from '../src/placement.mjs';

const MAIN = { x: 0, y: 0, width: 1920, height: 1040 };
const SECOND = { x: 1920, y: 0, width: 1920, height: 1040 };

describe('clampToWorkAreas', () => {
  it('没有记录过位置时返回 null，交给系统默认', () => {
    expect(clampToWorkAreas(null, [MAIN])).toBeNull();
    expect(clampToWorkAreas(undefined, [MAIN])).toBeNull();
  });

  it('位置在主屏内原样保留', () => {
    expect(clampToWorkAreas({ x: 300, y: 200 }, [MAIN])).toEqual({ x: 300, y: 200 });
  });

  it('位置在副屏内也保留（外接显示器还在）', () => {
    expect(clampToWorkAreas({ x: 2200, y: 300 }, [MAIN, SECOND])).toEqual({ x: 2200, y: 300 });
  });

  it('副屏拔掉后，落在屏幕外的位置被挪回主屏', () => {
    const fixed = clampToWorkAreas({ x: 2200, y: 300 }, [MAIN]);
    expect(fixed).toEqual({ x: 1920 - 240, y: 60 });
    expect(fixed.x).toBeLessThan(MAIN.width);
  });

  it('负坐标（屏幕左侧）也被判为不可见', () => {
    expect(clampToWorkAreas({ x: -500, y: 200 }, [MAIN])).toEqual({ x: 1680, y: 60 });
  });

  it('只露出一小条也算可见——能抓住就不动它', () => {
    // x 刚好处在屏幕右边缘外 1px 之内，仍露出足够宽度
    const fixed = clampToWorkAreas({ x: 1920 - 100, y: 10 }, [MAIN]);
    expect(fixed).toEqual({ x: 1820, y: 10 });
  });

  it('几乎完全滑出右边缘时算不可见', () => {
    const fixed = clampToWorkAreas({ x: 1915, y: 10 }, [MAIN]);
    expect(fixed).toEqual({ x: 1680, y: 60 });
  });

  it('坐标不是数字时返回 null', () => {
    expect(clampToWorkAreas({ x: 'a', y: 1 }, [MAIN])).toBeNull();
    expect(clampToWorkAreas({ x: NaN, y: 1 }, [MAIN])).toBeNull();
  });

  it('工作区列表为空时落到兜底区域，不抛异常', () => {
    expect(() => clampToWorkAreas({ x: 5000, y: 5000 }, [])).not.toThrow();
    expect(clampToWorkAreas({ x: 5000, y: 5000 }, [])).toEqual({ x: 1280 - 240, y: 60 });
  });

  it('返回值是整数坐标', () => {
    const fixed = clampToWorkAreas({ x: 9999.7, y: 9999.2 }, [MAIN]);
    expect(Number.isInteger(fixed.x)).toBe(true);
    expect(Number.isInteger(fixed.y)).toBe(true);
  });

  it('不改动入参', () => {
    const bounds = { x: 300, y: 200 };
    const snap = JSON.stringify(bounds);
    clampToWorkAreas(bounds, [MAIN]);
    expect(JSON.stringify(bounds)).toBe(snap);
  });
});
