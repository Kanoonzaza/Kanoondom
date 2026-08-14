// The offline shell, and the one way it can quietly break.
//
// sw-precache.js is generated and committed. If somebody adds a module and
// forgets `npm run precache`, nothing fails locally — the dev server serves the
// file happily — and the breakage only appears for an installed player with no
// signal, as an app that will not start.
//
// This project has forgotten to update a hard-coded list four separate times
// (docs/lessons.md, entry 6). So the list is not trusted: the tree is walked
// again here and compared. A red test is a far better way to find out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAssets, hashOf, render } from '../tools/build-precache.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(ROOT, name), 'utf8');

test('the precache list matches what is actually on disk', () => {
  const assets = collectAssets();
  const expected = render(assets, hashOf(assets)).replace(/\r\n/g, '\n');
  const committed = read('sw-precache.js').replace(/\r\n/g, '\n');

  assert.equal(
    committed, expected,
    'sw-precache.js is stale — run `npm run precache` and commit the result'
  );
});

test('every precached asset exists', () => {
  for (const asset of collectAssets()) {
    if (asset === './') continue;
    assert.ok(
      existsSync(join(ROOT, asset.slice(2))),
      `${asset} is in the precache list but not on disk`
    );
  }
});

test('every module the app loads is precached', () => {
  // The app is unbundled: a module missing from the list is a module an offline
  // player simply cannot load, and the failure is a blank screen.
  const listed = new Set(collectAssets());
  const walk = (dir) => readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
  const modules = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));

  for (const file of modules) {
    const url = `./${relative(ROOT, file).split(sep).join('/')}`;
    assert.ok(listed.has(url), `${url} is not precached`);
  }
  assert.ok(modules.length > 30, 'the walk found suspiciously few modules');
});

test('nothing in the precache list is an absolute path', () => {
  // The game is served from a subpath on GitHub Pages (/kingdom-sim/). A leading
  // slash would send the worker looking at the domain root, and every fetch
  // would 404 — on the deployed site only, which is the worst place to find out.
  for (const asset of collectAssets()) {
    assert.ok(asset.startsWith('./'), `${asset} must be relative to the app's scope`);
  }
});

test('the manifest is valid, installable, and entirely relative', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));

  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name);
  assert.ok(manifest.background_color && manifest.theme_color);

  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192'), 'Android wants a 192');
  assert.ok(sizes.includes('512x512'), 'and a 512');
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === 'maskable'),
    'without a maskable icon Android crops the artwork to whatever it likes'
  );

  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('./'), `${icon.src} must be relative`);
    assert.ok(existsSync(join(ROOT, icon.src.slice(2))), `${icon.src} is missing`);
  }
  for (const shortcut of manifest.shortcuts ?? []) {
    assert.ok(shortcut.url.startsWith('./'), `${shortcut.url} must be relative`);
  }
});

test('index.html links the manifest and the iOS icon relatively', () => {
  const html = read('index.html');

  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.doesNotMatch(
    html, /href="\/[a-z]/,
    'an absolute path breaks the game under a GitHub Pages subpath'
  );
  assert.doesNotMatch(
    html, /maximum-scale/,
    'the viewport must not block zooming'
  );
});

test('the service worker cleans up after itself and waits to be told', () => {
  const sw = read('sw.js');

  assert.match(sw, /importScripts\('\.\/sw-precache\.js'\)/);
  assert.match(sw, /caches\.delete/, 'old caches must go, or storage grows forever');
  assert.match(sw, /SKIP_WAITING/, 'updates apply only when the player accepts');
  assert.doesNotMatch(
    sw, /self\.skipWaiting\(\);\s*\n\s*}\);\s*\n\s*self\.addEventListener\('install'/,
    'skipWaiting must not run unconditionally at install'
  );
});

test('the server can serve a manifest with the right type', () => {
  assert.match(
    read('server.js'), /'\.webmanifest': 'application\/manifest\+json'/,
    'served as anything else, the browser ignores it and the app is not installable'
  );
});
