// The static pages are also the source of the panels. Fetch their content on
// demand and keep the current document, scene and controls mounted.
const files = { home: 'index.html', about: 'about-this-site.html', work: 'my-work.html' };
const headSelectors = 'link[rel="canonical"], meta[name="description"], meta[property^="og:"]';
const readMetadata = root => [...root.querySelectorAll(headSelectors)].map(node => node.cloneNode(true));

let nextEntry = Date.now();
function trackEntry() {
  const state = history.state;
  if (state?.site01Entry !== undefined) return state.site01Entry;
  const entry = ++nextEntry;
  history.replaceState({ ...state, site01Entry: entry }, '');
  return entry;
}

let main = document.getElementById('content');
let page = main.dataset.page;
let shownEntry = trackEntry();
let navigation = 0;
let restoreFrame = 0;
const positions = new Map();
const views = new Map([[page, Promise.resolve({
  main, title: document.title, path: location.pathname, metadata: readMetadata(document.head)
})]]);
let aboutStyles;

function loadAboutStyles() {
  if (document.querySelector('link[rel="stylesheet"][href="about.css"]') && !aboutStyles) {
    return Promise.resolve();
  }
  aboutStyles ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'about.css';
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      link.remove();
      aboutStyles = undefined;
      reject(new Error('About stylesheet could not load'));
    }, { once: true });
    document.head.append(link);
  });
  return aboutStyles;
}

async function fetchView(name) {
  const [response] = await Promise.all([
    fetch(files[name]),
    name === 'about' ? loadAboutStyles() : undefined
  ]);
  const url = new URL(response.url);
  if (!response.ok || url.origin !== location.origin) throw new Error('Page could not load');

  // Template contents are inert. The fetched document's scene, scripts and
  // controls are never inserted or started.
  const template = document.createElement('template');
  template.innerHTML = await response.text();
  const content = template.content;
  const main = content.querySelector('main#content');
  const title = content.querySelector('title')?.textContent;
  if (main?.dataset.page !== name || !title) throw new Error('Unexpected page');
  return { main, title, path: url.pathname, metadata: readMetadata(content) };
}

function loadView(name) {
  if (!views.has(name)) {
    views.set(name, fetchView(name).catch(error => {
      views.delete(name);
      throw error;
    }));
  }
  return views.get(name);
}

function startAboutDiagrams() {
  import('./about-page.js').then(({ installAboutDiagrams }) => {
    if (!window.AboutDiagrams && page === 'about') window.AboutDiagrams = installAboutDiagrams();
  }).catch(() => {
    const button = document.getElementById('about-anim');
    if (button) button.textContent = 'Diagrams unavailable';
  });
}
if (page === 'about') startAboutDiagrams();

const scroller = () => main.querySelector('#about-story, .work-content') ?? document.scrollingElement;

// Record panel scrolling while its history entry is current. A browser may
// move the scroller itself in the middle of a history traversal.
document.addEventListener('scroll', event => {
  if (!restoreFrame && history.state?.site01Entry === shownEntry && event.target === scroller()) {
    positions.set(shownEntry, event.target.scrollTop);
  }
}, { capture: true, passive: true });

function fragmentTarget(hash) {
  if (!hash) return null;
  try {
    return main.querySelector('#' + CSS.escape(decodeURIComponent(hash.slice(1))));
  } catch {
    return null;
  }
}

// Browsers can reset a nested scroll area on reload even with a fragment.
const initialURL = location.href;
if (location.hash) {
  addEventListener('load', () => requestAnimationFrame(() => {
    if (navigation || location.href !== initialURL || scroller().scrollTop) return;
    const target = fragmentTarget(location.hash);
    if (target && target !== main) target.scrollIntoView({ block: 'start' });
  }), { once: true });
}

function restorePosition(target, saved) {
  if (saved === undefined && target && target !== main) {
    target.scrollIntoView({ block: 'start' });
  } else {
    scroller().scrollTop = saved ?? 0;
  }
}

function display(view, restoreScroll) {
  const previousPage = page;
  const previousFocus = document.activeElement;
  positions.set(shownEntry, scroller().scrollTop);
  shownEntry = trackEntry();
  main.replaceWith(view.main);
  main = view.main;
  page = main.dataset.page;
  document.title = view.title;
  document.head.querySelectorAll(headSelectors).forEach(node => node.remove());
  for (const node of view.metadata) document.head.append(node.cloneNode(true));
  if (page === 'about') startAboutDiagrams();

  const target = fragmentTarget(location.hash);
  const saved = restoreScroll ? positions.get(shownEntry) : undefined;
  restorePosition(target, saved);

  if (previousFocus?.closest('.scene-toolbar, .settings-panel')) return;
  const homeLink = page === 'home' ? main.querySelector('[data-page-link="' + previousPage + '"]') : null;
  const focus = target ?? homeLink ?? main.querySelector('h1');
  if (focus) {
    if (!focus.matches('a[href]')) focus.tabIndex = -1;
    focus.focus({ preventScroll: true });
  }
}

const error = document.createElement('p');
error.className = 'page-load-error';
error.setAttribute('role', 'alert');
error.append('This page couldn’t open over the scene. ');
const directLink = document.createElement('a');
directLink.textContent = 'Open the page directly';
error.append(directLink);

async function navigate(name, url, fromHistory = false) {
  const request = ++navigation;
  error.remove();
  cancelAnimationFrame(restoreFrame);
  restoreFrame = 0;
  if (page === name) {
    const previous = shownEntry;
    const knownEntry = history.state?.site01Entry;
    shownEntry = trackEntry();
    if (knownEntry === undefined || shownEntry === previous) return;

    // Let native history restoration finish before restoring a mounted panel.
    restoreFrame = requestAnimationFrame(() => {
      restorePosition(fragmentTarget(url.hash), positions.get(shownEntry));
      restoreFrame = 0;
    });
    return;
  }

  try {
    const view = await loadView(name);
    if (request !== navigation) return;
    if (!fromHistory) {
      url.pathname = view.path;
      history.pushState({ site01Entry: ++nextEntry }, '', url);
    }
    display(view, fromHistory);
  } catch {
    if (request !== navigation) return;
    directLink.href = url.href;
    document.body.append(error);
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest?.('a[data-page-link]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin) return;

  event.preventDefault();
  url.search = location.search;
  void navigate(link.dataset.pageLink, url);
});

addEventListener('popstate', () => {
  const url = new URL(location.href);
  const slug = url.pathname.replace(/\/$/, '').split('/').pop();
  const file = slug ? slug.replace(/\.html$/, '') + '.html' : files.home;
  const name = Object.keys(files).find(key => files[key] === file);
  if (name) void navigate(name, url, true);
});
