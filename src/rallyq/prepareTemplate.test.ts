import { describe, expect, it } from 'vitest';
import { prepareTemplate } from './PrototypeScreen';

describe('prepareTemplate', () => {
  it('turns handler attributes into data attributes so the browser never treats them as inline scripts', () => {
    const html = prepareTemplate('<button class="mode" onClick="{{flipMode}}" oninput=\'{{x}}\'>Day</button><sc-if value="{{a}}"><p>one=1</p></sc-if>');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const button = doc.querySelector('button')!;
    expect(Array.from(button.attributes).map(a => a.name)).toEqual(['class', 'data-sc-onclick', 'data-sc-oninput']);
    expect(button.getAttribute('data-sc-onclick')).toBe('{{flipMode}}');
    expect(doc.querySelector('template[data-sc-kind="if"]')).not.toBeNull();
    expect(html).toContain('<p>one=1</p>');
  });
});
