/* App entry point. For now it proves one thing end to end: sign in, create the
   app's own Sheet (ADR 0004), and read it back. The roll-call screens come next. */
import { GoogleTokenProvider } from '../infra/googleAuth';
import { GoogleSheet } from '../infra/googleSheet';
import { SheetsApi } from '../infra/sheetsApi';

const statusLine = document.querySelector('#status');
const connectButton = document.querySelector('#connect');

function show(message: string): void {
  if (statusLine) statusLine.textContent = message;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!clientId) {
  show('No Google client ID. Run scripts/setup-google-cloud.sh, then restart the dev server.');
} else {
  const sheet = new GoogleSheet(new SheetsApi(new GoogleTokenProvider(clientId)));

  connectButton?.addEventListener('click', () => {
    show('Waiting for Google sign-in…');
    void sheet
      .ensureTabs()
      .then(() => sheet.listStudents())
      .then((students) => {
        show(`Connected. The Sheet holds ${students.length} student(s).`);
      })
      .catch((error: unknown) => {
        show(error instanceof Error ? error.message : 'Something went wrong.');
      });
  });
}
