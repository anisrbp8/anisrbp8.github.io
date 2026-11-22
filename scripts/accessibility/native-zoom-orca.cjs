// Run inside a private X11/D-Bus session. No form is submitted.
const { chromium } = require('playwright');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-output', 'native-access');
const base = process.env.BASE_URL || 'http://127.0.0.1:8884';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (cmd, ...args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 15000 }).trim();
const key = sequence => run('xdotool', 'key', '--clearmodifiers', sequence);
const files = ['', 'en/'].flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(file => file.endsWith('.html')).sort().map(file => dir + file));
const report = { date: new Date().toISOString(), zoom: [], speech: [], errors: [] };
let context, server, orca, recorder;

async function waitFor(test, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await test();
    if (value) return value;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(description);
}

function focusBrowserWindow() {
  // A window manager is not required under Xvfb; focus the actual X11 window.
  const ids = run('xdotool', 'search', '--onlyvisible', '--name', 'Anis Rojbi').split('\n');
  run('xdotool', 'windowfocus', '--sync', ids.at(-1));
}

async function checkZoom(page) {
  await page.goto(`${base}/index.html`);
  focusBrowserWindow();
  key('ctrl+0');
  const baseline = await page.evaluate(() => ({ dpr: devicePixelRatio, viewport: innerWidth }));
  report.baseline = baseline;
  for (const factor of [2, 4]) {
    for (let step = 0; step < 10; step++) {
      const actual = await page.evaluate(() => devicePixelRatio);
      if (Math.abs(actual / baseline.dpr - factor) < .015) break;
      key('ctrl+equal');
      await delay(220);
    }
    for (const file of files) {
      await page.goto(`${base}/${file}`, { waitUntil: 'load' });
      const measured = await page.evaluate(() => ({
        dpr: devicePixelRatio, viewport: innerWidth, height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        contentWidth: document.documentElement.clientWidth,
        h1: document.querySelector('h1')?.innerText.trim()
      }));
      const nativeFactor = measured.dpr / baseline.dpr;
      const passed = Math.abs(nativeFactor - factor) < .015 &&
        Math.abs(measured.viewport * nativeFactor - baseline.viewport) <= 5 &&
        measured.documentWidth <= measured.contentWidth + 1 && Boolean(measured.h1);
      report.zoom.push({ file, factor, actual: nativeFactor, ...measured, passed });
      if (!passed) report.errors.push(`${file}: native zoom ${factor}×, ${JSON.stringify(measured)}`);
    }
  }
  key('ctrl+0');
  await waitFor(async () => Math.abs((await page.evaluate(() => devicePixelRatio)) - baseline.dpr) < .01, 'Browser zoom was not reset');
}

function readLog(log) { return fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''; }
function speechLines(text) { return text.split('\n').filter(line => line.includes('SPEECH OUTPUT:')); }
function utterance(line) { return line.split('SPEECH OUTPUT:')[1].split(' {')[0].trim(); }

async function checkOrca(page, temporary) {
  const log = path.join(temporary, 'orca.log');
  // Retain only the actual speech utterances and the test result in the artifact.
  // The full application debug log is transient in this isolated session.
  let peak = 0, voicedSamples = 0;
  recorder = spawn('parec', ['--raw', '--format=s16le', '--channels=1', '--rate=16000', '--device=review_output.monitor']);
  recorder.stdout.on('data', bytes => {
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const amplitude = Math.abs(bytes.readInt16LE(i));
      if (amplitude > 100) voicedSamples++;
      if (amplitude > peak) peak = amplitude;
    }
  });
  report.screenReader = run('orca', '--version');
  // A pseudo-terminal makes Orca's own debug transcript line-buffered, as it is
  // in a desktop debugging session. No speech or accessibility code is replaced.
  orca = spawn('script', ['--quiet', '--flush', '--return', '--command',
    'exec orca --replace --enable=speech --disable=braille --debug --debug-file=/dev/tty', log],
    { env: { ...process.env, PYTHONUNBUFFERED: '1' }, stdio: ['pipe', 'ignore', 'ignore'] });
  const stopped = new Promise(resolve => orca.once('exit', resolve));
  const journeys = [];
  try {
    await waitFor(() => /Using speech server factory.*speechdispatcher/i.test(readLog(log)), 'Orca did not initialise its Speech Dispatcher backend', 25000);
    for (const file of ['contact.html', 'en/contact.html']) {
      await page.goto(`${base}/${file}`, { waitUntil: 'networkidle' });
      await page.bringToFront();
      focusBrowserWindow();
      const form = page.locator('form[data-contact-form]');
      const name = form.locator('input[name="name"]');
      const email = form.locator('input[name="email"]');
      const labelText = field => field.evaluate(el => el.labels[0].innerText.replace(/\s+/g, ' ').trim());
      try {
        const nameText = await labelText(name), emailText = await labelText(email);
        // The click positions the browser's keyboard focus. Screen readers may
        // choose not to speak a mouse click, especially in browse mode. Use
        // physical key events to visit both labels, forwards and backwards.
        await delay(1700);
        await name.click();
        await waitFor(() => name.evaluate(el => document.activeElement === el), `${file}: name did not receive input focus`);
        for (const [stroke, field] of [['Tab', email], ['shift+Tab', name], ['Tab', email]]) {
          await delay(1000);
          key(stroke);
          await waitFor(() => field.evaluate(el => document.activeElement === el), `${file}: ${stroke} did not reach the expected input`);
        }
        await delay(1300);
        journeys.push({ file, nameText, emailText });
      } catch (error) { report.errors.push(`Orca: ${error.message}`); }
    }
    await waitFor(() => voicedSamples > 1000, 'No synthesised speech signal was recorded at the monitor');
  } finally {
    orca.kill('SIGTERM');
    await Promise.race([stopped, delay(3500)]);
    const logText = readLog(log);
    const lines = speechLines(logText);
    const norm = text => text.toLowerCase().replace(/\s+/g, ' ').trim();
    const hasLabel = (line, label) => norm(utterance(line)).includes(norm(label));
    for (const { file, nameText, emailText } of journeys) {
      const first = lines.findIndex(line => hasLabel(line, nameText));
      const second = lines.findIndex((line, i) => i > first && hasLabel(line, emailText));
      const passed = first >= 0 && second > first;
      report.speech.push({ file, action: 'Physical Tab to email, Shift+Tab to name, Tab back to email',
        nameUtterance: first >= 0 ? utterance(lines[first]) : null,
        emailUtterance: second >= 0 ? utterance(lines[second]) : null, passed });
      if (!passed) report.errors.push(`Orca: ${file} did not speak both field labels in order`);
    }
    report.audio = { source: 'isolated PulseAudio sink monitor', sampleRateHz: 16000, peak, samplesOver100: voicedSamples };
    fs.writeFileSync(path.join(output, 'orca-speech.txt'), lines.slice(-160).join('\n') + '\n');
    report.speechBackend = logText.split('\n').find(line => /Using speech server factory/i.test(line))?.trim() || null;
    recorder?.kill();
  }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'academic-native-access-'));
  try {
    if (!process.env.BASE_URL) server = spawn('python3', ['-m', 'http.server', '8884', '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
    await waitFor(async () => { try { return (await fetch(`${base}/index.html`)).ok; } catch { return false; } }, 'Test site unavailable');
    // A translation offer from the browser can take over Orca's presentation of a French page.
    // Configure only this disposable test profile so it presents the original language.
    const profile = path.join(temporary, 'profile');
    fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ translate: { enabled: false } }));
    context = await chromium.launchPersistentContext(profile, {
      headless: false, viewport: null, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ['--window-size=1280,920', '--window-position=0,0', '--force-renderer-accessibility=complete']
    });
    const page = context.pages()[0];
    await page.route('https://formspree.io/**', route => route.abort());
    report.browser = context.browser()?.version() || await page.evaluate(() => navigator.userAgent);
    for (const [part, test] of [['zoom', () => checkZoom(page)], ['screen reader', () => checkOrca(page, temporary)]]) {
      try { await test(); } catch (error) { report.errors.push(`${part}: ${error.message}`); }
    }
  } catch (error) { report.errors.push(error.stack); }
  finally {
    await context?.close(); server?.kill(); orca?.kill(); recorder?.kill();
    fs.rmSync(temporary, { recursive: true, force: true });
    report.passed = report.zoom.length === files.length * 2 && report.speech.length === 2 && !report.errors.length;
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ zoomChecks: report.zoom.filter(x => x.passed).length, orcaChecks: report.speech.filter(x => x.passed).length, audio: report.audio, errors: report.errors }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
})();
