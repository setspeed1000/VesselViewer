import { decryptApiKey, encryptApiKey, MIN_PASSPHRASE_LENGTH } from '../core/keyCrypto.js';
import { BUILD_ENCRYPTED_KEY, normalizeRelayUrl, type Settings, type SourceKind } from '../core/settings.js';
import { el } from './dom.js';

const API_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** Data source picker, passphrase unlock, and the encrypted-key generator. */
export class SettingsDialog {
  readonly element: HTMLDialogElement;
  private readonly radios = new Map<SourceKind, HTMLInputElement>();
  private readonly passphrase: HTMLInputElement | undefined;
  private readonly apiKey: HTMLInputElement;
  private readonly rememberKey: HTMLInputElement;
  private readonly relayUrl: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly submit: HTMLButtonElement;

  constructor(
    private readonly getSettings: () => Settings,
    onSave: (patch: Partial<Settings>) => void,
  ) {
    const secret = (id: string, placeholder: string) =>
      el('input', { type: 'password', id, autocomplete: 'off', spellcheck: 'false', placeholder });

    this.apiKey = secret('vv-api-key', 'Paste your aisstream.io API key');
    this.passphrase = BUILD_ENCRYPTED_KEY ? secret('vv-passphrase', 'Passphrase') : undefined;
    this.rememberKey = el('input', { type: 'checkbox', id: 'vv-remember-key' });
    this.relayUrl = el('input', {
      type: 'url',
      id: 'vv-relay-url',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'wss://your-relay.example.com/ws',
    });
    this.error = el('p', { className: 'vv-form-error', role: 'alert' });
    this.submit = el('button', { type: 'submit', className: 'vv-btn vv-btn-primary', text: 'Connect' });

    const option = (kind: SourceKind, title: string, description: string, extra?: HTMLElement) => {
      const radio = el('input', { type: 'radio', name: 'vv-source', value: kind });
      radio.addEventListener('change', () => this.syncEnabled());
      this.radios.set(kind, radio);
      return el('label', { className: 'vv-source-option' }, [
        radio,
        el('span', { className: 'vv-source-text' }, [el('strong', { text: title }), el('span', { text: description }), extra]),
      ]);
    };

    const showKey = el('input', { type: 'checkbox' });
    showKey.addEventListener('change', () => {
      this.apiKey.type = showKey.checked ? 'text' : 'password';
    });

    const directFields = el('span', { className: 'vv-field' }, [
      this.passphrase &&
        el('span', { className: 'vv-field' }, [
          el('span', { className: 'vv-field-label', text: 'This site has an encrypted key built in. Enter its passphrase:' }),
          this.passphrase,
          el('span', { className: 'vv-field-label', text: 'Or use your own key:' }),
        ]),
      this.apiKey,
      el('label', { className: 'vv-toggle' }, [showKey, el('span', { text: 'Show key' })]),
      el('label', { className: 'vv-toggle' }, [this.rememberKey, el('span', { text: 'Remember on this device' })]),
    ]);

    const form = el('form', { className: 'vv-settings' }, [
      el('h2', { text: 'Data source' }),
      option('simulator', 'Simulator', 'Synthetic ships for demos and development. Not real vessels.'),
      option(
        'direct',
        'aisstream.io (direct)',
        'Your browser connects straight to aisstream.io. The key stays in this browser and is sent only to aisstream.io.',
        directFields,
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
        this.submit,
      ]),
    ]);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleSubmit(onSave);
    });

    this.element = el('dialog', { className: 'vv-dialog', 'aria-label': 'Data source settings' }, [
      form,
      encryptTool(),
    ]);
  }

  open(): void {
    const s = this.getSettings();
    this.radios.get(s.source)!.checked = true;
    this.apiKey.value = s.apiKey;
    this.rememberKey.checked = s.rememberKey;
    if (this.passphrase) this.passphrase.value = '';
    this.relayUrl.value = s.relayUrl;
    this.error.textContent = '';
    this.syncEnabled();
    this.element.showModal();
    if (this.passphrase && this.radios.get('direct')!.checked && !s.apiKey) this.passphrase.focus();
  }

  /** Open with the direct source preselected, ready for the passphrase. */
  openUnlock(): void {
    this.open();
    this.radios.get('direct')!.checked = true;
    this.syncEnabled();
    this.passphrase?.focus();
  }

  private async handleSubmit(onSave: (patch: Partial<Settings>) => void): Promise<void> {
    this.error.textContent = '';
    const source = [...this.radios].find(([, r]) => r.checked)?.[0] ?? 'simulator';
    const patch: Partial<Settings> = { source };

    if (source === 'direct') {
      const passphrase = this.passphrase?.value ?? '';
      let key = this.apiKey.value.trim();
      if (passphrase) {
        this.submit.disabled = true;
        this.submit.textContent = 'Unlocking…';
        try {
          key = await decryptApiKey(BUILD_ENCRYPTED_KEY, passphrase);
        } catch (err) {
          this.error.textContent = (err as Error).message;
          return;
        } finally {
          this.submit.disabled = false;
          this.submit.textContent = 'Connect';
        }
      }
      if (!API_KEY_RE.test(key)) {
        this.error.textContent = this.passphrase
          ? 'Enter the passphrase or a valid aisstream.io API key.'
          : 'Enter a valid aisstream.io API key.';
        return;
      }
      patch.apiKey = key;
      patch.rememberKey = this.rememberKey.checked;
    }

    if (source === 'relay') {
      const url = normalizeRelayUrl(this.relayUrl.value);
      if (!url) {
        this.error.textContent = 'Enter a ws:// or wss:// relay URL.';
        return;
      }
      if (location.protocol === 'https:' && url.startsWith('ws://')) {
        this.error.textContent = 'This page is served over HTTPS, so the relay must use wss://.';
        return;
      }
      patch.relayUrl = url;
    }

    onSave(patch);
    this.element.close();
  }

  private syncEnabled(): void {
    const direct = this.radios.get('direct')!.checked;
    this.apiKey.disabled = !direct;
    this.rememberKey.disabled = !direct;
    if (this.passphrase) this.passphrase.disabled = !direct;
    this.relayUrl.disabled = !this.radios.get('relay')!.checked;
  }
}

/**
 * Encrypts a key in the browser for publishing as the VITE_ENCRYPTED_API_KEY
 * repository variable. Nothing here is sent anywhere.
 */
function encryptTool(): HTMLElement {
  const secret = (placeholder: string) =>
    el('input', { type: 'password', autocomplete: 'new-password', spellcheck: 'false', placeholder });
  const key = secret('aisstream.io API key');
  const pass = secret(`New passphrase (${MIN_PASSPHRASE_LENGTH}+ characters)`);
  const confirm = secret('Repeat passphrase');
  const output = el('textarea', { readonly: true, rows: 3, className: 'vv-output', 'aria-label': 'Encrypted key' });
  const message = el('p', { className: 'vv-form-error', role: 'alert' });
  const copy = el('button', { type: 'button', className: 'vv-btn', text: 'Copy', disabled: true });
  const run = el('button', { type: 'button', className: 'vv-btn vv-btn-primary', text: 'Encrypt' });

  run.addEventListener('click', async () => {
    message.textContent = '';
    output.value = '';
    copy.disabled = true;
    if (!API_KEY_RE.test(key.value.trim())) {
      message.textContent = 'Enter a valid aisstream.io API key.';
      return;
    }
    if (pass.value.length < MIN_PASSPHRASE_LENGTH) {
      message.textContent = `Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`;
      return;
    }
    if (pass.value !== confirm.value) {
      message.textContent = 'Passphrases do not match.';
      return;
    }
    run.disabled = true;
    try {
      output.value = await encryptApiKey(key.value.trim(), pass.value);
      copy.disabled = false;
    } catch (err) {
      message.textContent = (err as Error).message;
    } finally {
      run.disabled = false;
    }
  });

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      copy.textContent = 'Copied';
    } catch {
      output.select();
      copy.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 2000);
  });

  return el('details', { className: 'vv-encrypt' }, [
    el('summary', { text: 'Build an encrypted key into this site' }),
    el('div', { className: 'vv-encrypt-body' }, [
      el('p', {
        text:
          'Encrypts your key with a passphrase, right here in your browser. Save the result as a GitHub ' +
          'repository variable named VITE_ENCRYPTED_API_KEY (Settings → Secrets and variables → Actions → ' +
          'Variables), then redeploy. Visitors then need only the passphrase. Anyone who unlocks it can ' +
          'see the key, so share the passphrase only with people you trust.',
      }),
      key,
      pass,
      confirm,
      el('div', { className: 'vv-dialog-actions' }, [run]),
      output,
      el('div', { className: 'vv-dialog-actions' }, [copy]),
      message,
    ]),
  ]);
}
