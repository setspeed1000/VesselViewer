import { normalizeRelayUrl, type Settings, type SourceKind } from '../core/settings.js';
import { el } from './dom.js';

/** Data source picker. The API key is stored only in this browser's localStorage. */
export class SettingsDialog {
  readonly element: HTMLDialogElement;
  private readonly radios = new Map<SourceKind, HTMLInputElement>();
  private readonly apiKey: HTMLInputElement;
  private readonly relayUrl: HTMLInputElement;
  private readonly error: HTMLElement;

  constructor(
    private readonly getSettings: () => Settings,
    onSave: (patch: Partial<Settings>) => void,
  ) {
    this.apiKey = el('input', {
      type: 'password',
      id: 'vv-api-key',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Paste your aisstream.io API key',
    });
    this.relayUrl = el('input', {
      type: 'url',
      id: 'vv-relay-url',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'wss://your-relay.example.com/ws',
    });
    this.error = el('p', { className: 'vv-form-error', role: 'alert' });

    const option = (kind: SourceKind, title: string, description: string, extra?: HTMLElement) => {
      const radio = el('input', { type: 'radio', name: 'vv-source', value: kind });
      radio.addEventListener('change', () => this.syncEnabled());
      this.radios.set(kind, radio);
      return el('label', { className: 'vv-source-option' }, [
        radio,
        el('span', { className: 'vv-source-text' }, [
          el('strong', { text: title }),
          el('span', { text: description }),
          extra,
        ]),
      ]);
    };

    const showKey = el('input', { type: 'checkbox' });
    showKey.addEventListener('change', () => {
      this.apiKey.type = showKey.checked ? 'text' : 'password';
    });

    const form = el('form', { method: 'dialog', className: 'vv-settings' }, [
      el('h2', { text: 'Data source' }),
      option('simulator', 'Simulator', 'Synthetic ships for demos and development. Not real vessels.'),
      option(
        'direct',
        'aisstream.io (direct)',
        'Your browser connects straight to aisstream.io. The key is saved only in this browser and sent only to aisstream.io.',
        el('span', { className: 'vv-field' }, [
          this.apiKey,
          el('label', { className: 'vv-toggle' }, [showKey, el('span', { text: 'Show key' })]),
        ]),
      ),
      option(
        'relay',
        'VesselViewer relay',
        'A relay server you run keeps the key private and sends only what is on screen. Use this if direct mode is refused.',
        el('span', { className: 'vv-field' }, [this.relayUrl]),
      ),
      this.error,
      el('div', { className: 'vv-dialog-actions' }, [
        el('button', { type: 'button', className: 'vv-btn', text: 'Cancel', onclick: () => this.element.close() }),
        el('button', { type: 'submit', className: 'vv-btn vv-btn-primary', text: 'Connect' }),
      ]),
    ]);

    form.addEventListener('submit', (e) => {
      const source = [...this.radios].find(([, r]) => r.checked)?.[0] ?? 'simulator';
      const patch: Partial<Settings> = { source };
      if (source === 'direct') {
        const key = this.apiKey.value.trim();
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
          e.preventDefault();
          this.error.textContent = 'Enter a valid aisstream.io API key.';
          return;
        }
        patch.apiKey = key;
      }
      if (source === 'relay') {
        const url = normalizeRelayUrl(this.relayUrl.value);
        if (!url) {
          e.preventDefault();
          this.error.textContent = 'Enter a ws:// or wss:// relay URL.';
          return;
        }
        if (location.protocol === 'https:' && url.startsWith('ws://')) {
          e.preventDefault();
          this.error.textContent = 'This page is served over HTTPS, so the relay must use wss://.';
          return;
        }
        patch.relayUrl = url;
      }
      onSave(patch);
    });

    this.element = el('dialog', { className: 'vv-dialog', 'aria-label': 'Data source settings' }, [form]);
  }

  open(): void {
    const s = this.getSettings();
    this.radios.get(s.source)!.checked = true;
    this.apiKey.value = s.apiKey;
    this.relayUrl.value = s.relayUrl;
    this.error.textContent = '';
    this.syncEnabled();
    this.element.showModal();
  }

  private syncEnabled(): void {
    this.apiKey.disabled = !this.radios.get('direct')!.checked;
    this.relayUrl.disabled = !this.radios.get('relay')!.checked;
  }
}
