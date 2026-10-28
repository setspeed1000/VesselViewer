import { App } from './app.js';
import './styles.css';

function showFatal(message: string): void {
  const box = document.createElement('div');
  box.className = 'vv-fatal';
  const title = document.createElement('h1');
  title.textContent = 'VesselViewer could not start';
  const text = document.createElement('p');
  text.textContent = message;
  box.append(title, text);
  document.body.replaceChildren(box);
}

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');
root.replaceChildren(); // remove the static "loading" fallback

try {
  const app = new App(root);
  // Handy for debugging and for experimenting with plugins from the console.
  (window as unknown as { vesselViewer: App }).vesselViewer = app;
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  const webgl = /webgl/i.test(detail);
  showFatal(
    webgl
      ? `Your browser could not create a WebGL2 context, which the map needs. Try another browser or enable hardware acceleration. (${detail})`
      : detail,
  );
  console.error(err);
}
