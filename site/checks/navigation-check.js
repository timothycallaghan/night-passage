import './navigation-browser-tests.js';

const street = document.getElementById('street');
const continuity = document.getElementById('continuity');
const chapters = document.getElementById('chapters');
const status = document.getElementById('status');
const results = document.getElementById('results');
let ready = false;

const deadline = setTimeout(() => {
  if (!ready) status.textContent = 'FAIL. The WebGL scene did not finish starting.';
}, 30000);

street.addEventListener('load', () => {
  const host = street.contentWindow;
  const wait = setInterval(() => {
    if (host.g2?.state === 'fallback') {
      clearInterval(wait);
      clearTimeout(deadline);
      status.textContent = 'FAIL. The WebGL scene could not start.';
      results.textContent = JSON.stringify(host.g2.failures, null, 2);
    } else if (host.NP?.ready) {
      clearInterval(wait);
      clearTimeout(deadline);
      ready = true;
      continuity.disabled = false;
      chapters.disabled = false;
      status.textContent = 'Street ready.';
    }
  }, 100);
  setTimeout(() => clearInterval(wait), 30000);
}, { once: true });
street.src = '../index.html?preset=low';

async function run(start) {
  continuity.disabled = true;
  chapters.disabled = true;
  status.textContent = 'Running…';
  const host = street.contentWindow;
  try {
    const result = await start(host);
    status.textContent = result.status === 'PASS' ? 'PASS. All checkpoints passed.' : 'FAIL. See the check results.';
    results.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    status.textContent = 'FAIL. ' + error.message;
  } finally {
    host.NPAudio?.stop(true);
  }
}

continuity.addEventListener('click', () => void run(host => {
  const check = window.preparePanelCheck(host);
  host.document.getElementById('sound-mute').click();
  return check();
}));
chapters.addEventListener('click', () => void run(host => window.runChapterHistoryCheck(host)));
