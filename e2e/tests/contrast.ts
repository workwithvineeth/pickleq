import { expect, type Locator } from '@playwright/test';

/** WCAG contrast on actual computed colors. Composite translucent glass over
 * every ancestor gradient stop; use the worst resulting ratio, not a token-only check.
 * Scope is the app frame (no photographs behind its text). */
export async function assertContrast(locator: Locator, kind: 'text' | 'border' | 'outline' | 'signal' = 'text') {
  await locator.first().waitFor({ state: 'attached' });
  // Read one DOM snapshot so responsive menus cannot shift positional locators mid-check.
  const reports = await locator.evaluateAll((elements, mode) => elements.map(element => {
    type Color = [number, number, number, number];
    const parse = (value: string): Color => {
      if (value === 'transparent') return [0, 0, 0, 0];
      if (value.startsWith('color(srgb')) {
        const parts = value.replace('color(srgb', '').replace(')', '').trim().split(/[\s/]+/).map(Number);
        return [parts[0] * 255, parts[1] * 255, parts[2] * 255, parts[3] ?? 1];
      }
      const parts = value.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3) throw Error('Unsupported computed color: ' + value);
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    };
    const blend = (f: Color, b: Color): Color => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
    const backgrounds = (node: Element | null): Color[] => {
      if (!node) return [[255, 255, 255, 1]];
      const style = getComputedStyle(node);
      const fill = parse(style.backgroundColor);
      // An opaque chip hides photographs behind it; those pixels cannot affect its contrast.
      if (fill[3] === 1 && style.backgroundImage === 'none') return [fill];
      let colors = backgrounds(node.parentElement).map(bg => blend(fill, bg));
      if (style.backgroundImage !== 'none') {
        const stops = style.backgroundImage.match(/rgba?\([^)]+\)|color\(srgb[^)]+\)/g);
        if (!stops) throw Error('Unsupported frame background: ' + style.backgroundImage);
        colors = colors.flatMap(bg => stops.map(stop => blend(parse(stop), bg)));
      }
      return colors;
    };
    const lum = (c: Color) => {
      const linear = c.slice(0, 3).map(n => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const style = getComputedStyle(element);
    const fg = parse(mode === 'text' ? style.color : mode === 'border' ? style.borderTopColor : mode === 'outline' ? style.outlineColor : style.backgroundColor);
    const bgs = backgrounds(mode === 'text' ? element : element.parentElement);
    const ratios = bgs.map(bg => { const a = lum(blend(fg, bg)), b = lum(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); });
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    return { ratio: Math.min(...ratios), required: mode === 'text' ? large ? 3 : 4.5 : 3, label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 65), foreground: style.color };
  }), kind);
  expect(reports.length, 'At least one contrast target').toBeGreaterThan(0);
  for (const report of reports) expect(report.ratio, JSON.stringify({ kind, ...report })).toBeGreaterThanOrEqual(report.required);
}
