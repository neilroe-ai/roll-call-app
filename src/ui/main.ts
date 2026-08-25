/* App entry point: builds the gateway from configuration and starts the screens. */
import './styles.css';
import { GoogleTokenProvider } from '../infra/googleAuth';
import { GoogleSheet } from '../infra/googleSheet';
import { SheetsApi } from '../infra/sheetsApi';
import { App } from './app';

const root = document.querySelector<HTMLElement>('#app');
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (root) {
  if (!clientId) {
    root.textContent =
      'No Google client ID. Run scripts/setup-google-cloud.sh, then restart the dev server.';
  } else {
    const sheet = new GoogleSheet(new SheetsApi(new GoogleTokenProvider(clientId)));
    const app = new App(root, sheet);
    // Google's sign-in popup must come from a tap, not from page load.
    const connect = document.querySelector('#connect');
    connect?.addEventListener('click', () => {
      connect.remove();
      void app.start();
    });
  }
}
