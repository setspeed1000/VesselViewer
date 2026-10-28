import { App } from './app.js';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');

const app = new App(root);
// Handy for debugging and for experimenting with plugins from the console.
(window as unknown as { vesselViewer: App }).vesselViewer = app;
