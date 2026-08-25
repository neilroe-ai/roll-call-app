/* App entry point. Wires the roll-call UI to the domain and the Sheet gateway.
   Built incrementally in later steps. */
const statusLine = document.querySelector('#status');
if (statusLine) statusLine.textContent = 'Ready.';
