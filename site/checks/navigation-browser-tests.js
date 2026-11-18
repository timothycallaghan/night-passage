// The browser harness calls preparePanelCheck() before enabling sound in the street.
window.preparePanelCheck = function (host = window) {
  const page = host.document;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  assert(page.querySelector('main').dataset.page === 'home' && host.NP?.ready, 'Home scene ready');
  assert(host.NPAudio.info().status === 'disabled', 'Fresh Home is silent');
  const coldResources = host.performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname);
  assert(!coldResources.some(path => /about[.-]|my-work/.test(path)), 'Cold Home does not fetch panel assets');

  const contexts = [];
  const contextName = host.AudioContext ? 'AudioContext' : 'webkitAudioContext';
  const AudioContext = host[contextName];
  host[contextName] = class extends AudioContext {
    constructor(...args) {
      super(...args);
      contexts.push(this);
    }
  };
  const home = page.querySelector('main');
  const canvas = page.getElementById('scene');
  const toolbar = page.querySelector('.scene-toolbar');
  const scene = host.NP;
  const composer = scene._dbg.composer;
  const audio = host.NPAudio;
  const initialTimeOrigin = host.performance.timeOrigin;
  const path = () => host.location.pathname;
  const main = () => page.querySelector('main#content');
  const click = selector => page.querySelector(selector).click();
  const open = name => {
    const link = main().querySelector('[data-page-link="' + name + '"]');
    link.focus();
    link.click();
  };
  const waits = [];
  const checkpoints = [];
  const until = async (condition, label) => {
    const start = performance.now();
    while (!condition()) {
      assert(performance.now() - start < 30000, label + ' timed out');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    waits.push(label);
  };
  const loopStarts = () => audio.info().history.filter(event => event.kind === 'start' && event.loop);

  return async function runPanelCheck() {
    await until(() => audio.info().transfer?.verifiedLayers === 7 &&
      loopStarts().length === 4 && contexts[0].currentTime > Math.max(...loopStarts().map(loop => loop.at)),
      'Seven shipped audio files verified and all four beds playing');
    const initial = audio.info();
    const initialStarts = JSON.stringify(loopStarts());
    let lastClock = contexts[0].currentTime;
    let lastFrame = scene.motion().frames;
    function checkpoint(label, moving = true) {
      const info = audio.info();
      const clock = contexts[0].currentTime;
      const frame = scene.motion().frames;
      const context = contexts[0];
      assert(host.performance.timeOrigin === initialTimeOrigin && scene === host.NP &&
        composer === scene._dbg.composer && canvas === page.getElementById('scene') &&
        toolbar === page.querySelector('.scene-toolbar'), label + ' keeps document, canvas, renderer and toolbar');
      assert(contexts.length === 1 && context.state === 'running' && info.owner === initial.owner &&
        info.generation === initial.generation && JSON.stringify(loopStarts()) === initialStarts,
        label + ' keeps the native audio context and all original loop start times');
      assert(clock > lastClock, label + ' advances the audio clock');
      assert(!moving || frame > lastFrame, label + ' advances the scene');
      assert(main().dataset.page === 'home' || !home.isConnected, label + ' removes Home from the document');
      checkpoints.push({ label, path: path(), clock, frame, page: main().dataset.page });
      lastClock = clock;
      lastFrame = frame;
    }
    const isPage = name => main().dataset.page === name;
    const after = async (label, name) => {
      await until(() => isPage(name), label);
      await new Promise(resolve => setTimeout(resolve, 50));
    };

    open('about');
    await after('Home → About', 'about');
    checkpoint('Home → About');
    assert(page.activeElement.id === 'about-title', 'About heading receives focus');
    assert(page.querySelectorAll('#about-story .fig').length === 7, 'All seven diagrams remain');
    assert(page.querySelector('#c1').parentElement.textContent.includes('Neon Rain Blues (Deckard)'), 'Shipped score is credited in the story');
    const credits = page.querySelector('#cr').parentElement.textContent;
    assert(credits.includes('“Neon Rain Blues (Deckard)”, made with Suno') &&
      credits.includes('Generated with ElevenLabs'), 'Shipped music and foley credits remain');
    click('#settings-toggle');
    assert(!page.querySelector('#sound-controls').hidden, 'Settings open on About');
    const music = page.querySelector('#sound-music');
    music.value = 63;
    music.dispatchEvent(new host.Event('input', { bubbles: true }));
    click('#settings-close');
    assert(page.activeElement.id === 'settings-toggle' && audio.info().levels.music === .63, 'Settings close with focus restored and changed level');

    const about = page.querySelector('#about-story');
    host.location.hash = '#c4';
    await until(() => about.scrollTop > 200, 'Chapter fragment scrolls About');
    const scroll = about.scrollTop;
    open('work');
    await after('About → Work', 'work');
    checkpoint('About → Work');
    assert(page.activeElement.id === 'work-title', 'Work heading receives focus');
    const projects = [...main().querySelectorAll('.work-content section a')];
    assert(projects.map(link => link.href).join() === [
      'https://vtct.tclabs.uk/', 'https://arcade.secondsprite.com/',
      'https://peaurelle.com/'
    ].join() && projects.every(link => !link.hasAttribute('data-page-link')), 'All three public project links keep their native destinations');

    click('#settings-toggle');
    assert(Number(page.querySelector('#sound-music').value) === 63, 'Music setting follows to Work');
    click('#motion');
    assert(scene.motion().userPaused, 'Scene pause works on Work');
    click('#settings-close');
    open('home');
    await after('Work → Home', 'home');
    checkpoint('Work → Home', false);
    assert(home === main() && page.activeElement.dataset.pageLink === 'work', 'Return to Home restores the originating link');
    assert(scene.motion().userPaused, 'Scene pause follows to Home');
    click('#settings-toggle');
    click('#motion');
    click('#reset-view');
    click('#settings-close');
    assert(!scene.motion().userPaused, 'Scene can be resumed and centred');

    host.history.back();
    await after('Back → Work', 'work');
    checkpoint('Back → Work');
    host.history.back();
    await after('Back → About chapter', 'about');
    checkpoint('Back → About chapter');
    assert(host.location.hash === '#c4' && Math.abs(about.scrollTop - scroll) < 2, 'Back restores the chapter URL and scroll position');
    host.history.forward();
    await after('Forward → Work', 'work');
    checkpoint('Forward → Work');
    host.history.forward();
    await after('Forward → Home', 'home');
    checkpoint('Forward → Home');

    click('#sound-mute');
    assert(audio.info().muted && audio.info().consent, 'Speaker mutes with consent intact');
    open('about');
    await after('Home → About while muted', 'about');
    checkpoint('Home → About while muted');
    assert(audio.info().muted && audio.info().levels.music === .63, 'Mute and chosen level survive repeated navigation');
    click('#sound-mute');
    assert(!audio.info().muted && audio.info().consent, 'Speaker unmutes in About');
    assert(!host.g2.errors.length && !host.g2.failures.length && !host.g2.violations.length && !scene.errors.length, 'No scene, script or CSP errors');
    assert(Object.keys(audio.info().unavailable).length === 0, 'All seven audio layers decoded');
    return { status: 'PASS', width: host.innerWidth, height: host.innerHeight, waits, checkpoints, loops: loopStarts() };
  };
};

// Open Home or About #c3 directly, then await runChapterHistoryCheck().
window.runChapterHistoryCheck = async function (host = window) {
  const page = host.document;
  const documentStart = host.performance.timeOrigin;
  const canvas = page.getElementById('scene');
  const startPage = page.querySelector('main').dataset.page;
  const results = [];

  async function expect(label, name, hash = '', expectedScroll) {
    const started = performance.now();
    while ((page.querySelector('main').dataset.page !== name || host.location.hash !== hash) &&
        performance.now() - started < 4000) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await new Promise(resolve => host.requestAnimationFrame(() => host.requestAnimationFrame(resolve)));
    const scroller = page.querySelector('#about-story');
    const heading = hash && page.getElementById(hash.slice(1));
    const box = heading && heading.getBoundingClientRect();
    const viewport = scroller?.getBoundingClientRect();
    const visible = box && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1;
    const scroll = scroller?.scrollTop;
    const matchesScroll = expectedScroll === undefined || Math.abs(scroll - expectedScroll) <= 1;
    const passed = host.performance.timeOrigin === documentStart && page.getElementById('scene') === canvas &&
      page.querySelector('main').dataset.page === name && host.location.hash === hash &&
      (!hash || visible) && matchesScroll;
    results.push({ label, hash: host.location.hash, scroll, headingTop: box ? box.top - viewport.top : null,
      visible: Boolean(visible), expectedScroll, passed });
    return scroll;
  }
  function open(name) {
    page.querySelector('main [data-page-link="' + name + '"]').click();
  }
  if (startPage === 'home') {
    open('about');
    await expect('Home → About', 'about');
    host.location.hash = '#c3';
  }
  const c3 = await expect('Chapter 3', 'about', '#c3');
  host.location.hash = '#c5';
  const c5 = await expect('Chapter 5', 'about', '#c5');
  if (startPage === 'home') {
    open('work');
    await expect('About → Work', 'work');
    host.history.back();
    await expect('Back from Work to chapter 5', 'about', '#c5', c5);
  }
  host.history.back();
  await expect('Back to chapter 3', 'about', '#c3', c3);
  if (!results.at(-1).passed && host.location.hash === '#c3') {
    // Keep the Forward observation meaningful when comparing a broken build.
    page.getElementById('about-story').scrollTop = c3;
  }
  host.history.forward();
  await expect('Forward to chapter 5', 'about', '#c5', c5);
  if (startPage === 'home') {
    host.history.forward();
    await expect('Forward to Work', 'work');
    host.history.back();
    await expect('Back from Work again', 'about', '#c5', c5);

    // Keep a small deliberate scroll that changes the saved offset while the
    // heading is still visible. Leaving the panel must preserve that offset.
    const scroller = page.getElementById('about-story');
    scroller.scrollTop = c5 - 95;
    const readingPosition = await expect('Scroll within chapter 5', 'about', '#c5', c5 - 95);
    open('work');
    await expect('Leave the free-scroll position', 'work');
    host.history.back();
    await expect('Restore the free-scroll position', 'about', '#c5', readingPosition);
    host.history.back();
    await expect('Back from free scroll to chapter 3', 'about', '#c3', c3);
    host.history.forward();
    await expect('Forward to the saved free-scroll position', 'about', '#c5', readingPosition);
  }
  return { entry: startPage, status: results.every(result => result.passed) ? 'PASS' : 'FAIL', results };
};
