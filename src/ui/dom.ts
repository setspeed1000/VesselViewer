/**
 * Tiny DOM builder. Text is always set via textContent, never innerHTML,
 * because vessel names and destinations come from untrusted radio data.
 */
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | number | boolean | EventListener>> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'className') {
      node.className = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export function formatLatLon(lat: number, lon: number): string {
  const f = (v: number, pos: string, neg: string) => {
    // Round to thousandths of a minute first so 59.9996′ becomes the next degree.
    const totalMinutes = Math.round(Math.abs(v) * 60 * 1000) / 1000;
    const d = Math.floor(totalMinutes / 60);
    const m = totalMinutes - d * 60;
    return `${d}°${m.toFixed(3).padStart(6, '0')}′ ${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, 'N', 'S')}  ${f(lon, 'E', 'W')}`;
}
