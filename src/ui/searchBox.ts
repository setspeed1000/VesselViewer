import { categoryOf, CATEGORY_LABELS, type Vessel } from '../../shared/vessel.js';
import { CATEGORY_COLORS, cssColor } from '../render/style.js';
import { clear, el } from './dom.js';

export class SearchBox {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLUListElement;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  constructor(
    private readonly search: (query: string) => Promise<Vessel[]>,
    private readonly onPick: (vessel: Vessel) => void,
  ) {
    this.input = el('input', {
      type: 'search',
      className: 'vv-search-input',
      placeholder: 'Search name, MMSI, IMO or call sign',
      'aria-label': 'Search vessels',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    this.results = el('ul', { className: 'vv-search-results', role: 'listbox', hidden: true });
    this.element = el('div', { className: 'vv-search' }, [this.input, this.results]);

    this.input.addEventListener('input', () => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.run(), 200);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') {
        const first = this.results.querySelector('button');
        first?.click();
      }
    });
    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target as Node)) this.close();
    });
  }

  private close(): void {
    this.results.hidden = true;
  }

  private async run(): Promise<void> {
    const query = this.input.value.trim();
    const seq = ++this.seq;
    if (query.length < 2) {
      this.close();
      return;
    }
    const vessels = await this.search(query);
    if (seq !== this.seq) return; // a newer search superseded this one
    clear(this.results);
    if (vessels.length === 0) {
      this.results.append(el('li', { className: 'vv-search-empty', text: 'No vessels found' }));
    }
    for (const v of vessels) {
      const category = categoryOf(v.shipType);
      const swatch = el('span', { className: 'vv-swatch' });
      swatch.style.background = cssColor(CATEGORY_COLORS[category]);
      this.results.append(
        el('li', { role: 'option' }, [
          el(
            'button',
            {
              type: 'button',
              onclick: () => {
                this.close();
                this.input.value = v.name ?? String(v.mmsi);
                this.onPick(v);
              },
            },
            [
              swatch,
              el('span', { className: 'vv-search-name', text: v.name ?? `MMSI ${v.mmsi}` }),
              el('span', { className: 'vv-search-meta', text: `${CATEGORY_LABELS[category]} · ${v.mmsi}` }),
            ],
          ),
        ]),
      );
    }
    this.results.hidden = false;
  }
}
