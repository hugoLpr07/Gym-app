// Carte du corps agrandie (Progrès → « Agrandir la carte ») : boutons des muscles et légende (0.40.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBarlog, makeApp, emptyData, HTML_PATH } from './harness.mjs';

const NOW = new Date(2026, 10, 2, 12, 0).getTime(), D = NOW - 2 * 86400000;
const open = (extra = {}) => makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', unit: 'kg', now: NOW, bmBig: true, history: {
  'Bench Press': [{ date: D, sets: [{ w: 60, r: 10, wu: true }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }],
  'Lat Pulldown': [{ date: D, sets: [{ w: 50, r: 10 }, { w: 50, r: 10 }] }] }, ...extra });

test('grande carte : un bouton par muscle, du plus travaillé au moins travaillé, muscles à 0 en gris à la fin', () => {
  const v = open().renderVals();
  assert.deepEqual(v.bmMapChips.slice(0, 5).map(c => c.label + ' ' + c.val), ['Pectoraux 3', 'Dorsaux 2', 'Deltoïdes avant 1.5', 'Triceps 1.5', 'Biceps 1']);
  const zero = v.bmMapChips.slice(5);
  assert.ok(zero.length > 0 && zero.every(c => c.val === '0' && c.color === '#9C9CA8'), 'muscles pas travaillés à la fin, en gris');
  assert.equal(v.bmMapChips[0].color, '#FFFFFF');
});

test('grande carte : toucher un bouton choisit le muscle (carte tournée du bon côté), le retoucher le retire', () => {
  const app = open({ bmSide: 'front' });
  app.renderVals().bmMapChips.find(c => c.label === 'Dorsaux').onClick();
  assert.equal(app.state.bmSel, 'lats'); assert.equal(app.state.bmSide, 'back', 'dorsaux → dos');
  const v = app.renderVals();
  assert.equal(v.bmSelName, 'Dorsaux'); assert.equal(v.bmExList[0].name, 'Lat Pulldown', 'l’exercice fait en premier');
  assert.equal(v.bmMapChips.find(c => c.label === 'Dorsaux').color, '#0A0A0C', 'bouton choisi en surbrillance');
  v.bmMapChips.find(c => c.label === 'Dorsaux').onClick();
  assert.equal(app.state.bmSel, null);
});

test('grande carte : muscle touché sur le corps → son bouton est surligné et la rangée défile jusqu’à lui (0.40.5)', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const had = 'document' in globalThis, prev = globalThis.document; const asked = [], scrolled = [];
  globalThis.document = { querySelector: sel => { asked.push(sel); return { scrollIntoView: o => scrolled.push(o) }; } };
  t.after(() => { if (had) globalThis.document = prev; else delete globalThis.document; });
  const app = open({ bmSide: 'back' });
  const walk = n => !n || typeof n !== 'object' ? null : n.props && n.props.onClick ? n : n.children && n.children.flat(Infinity).map(walk).find(Boolean) || null;
  walk(app.renderVals().bmBigFig).props.onClick();
  const k = app.state.bmSel; assert.ok(k, 'muscle choisi');
  const chip = app.renderVals().bmMapChips.find(c => c.key === k);
  assert.equal(chip.color, '#0A0A0C', 'bouton surligné'); assert.notEqual(chip.bg, '#16161A');
  t.mock.timers.tick(50);
  assert.deepEqual(asked, ['[data-bmc="' + k + '"]']); assert.deepEqual(scrolled, [{ inline: 'center', block: 'nearest', behavior: 'smooth' }]);
  const html = readFileSync(HTML_PATH, 'utf8'); assert.match(html, /<button data-bmc="\{\{ c\.key \}\}"/);
});

test('grande carte : ses boutons ne sont plus ceux du graphique Corps (Poids, Masse grasse…), qui gardent les leurs', () => {
  const html = readFileSync(HTML_PATH, 'utf8'); const big = html.slice(html.indexOf('<sc-if value="{{ bmBig }}"'), html.indexOf('<sc-if value="{{ cmOn }}"'));
  assert.match(big, /list="\{\{ bmMapChips \}\}"/); assert.match(big, /list="\{\{ bmLegend \}\}"/, 'légende des couleurs');
  const app = open({ body: [{ date: D, w: 80, fat: 18 }] });
  const v = app.renderVals();
  assert.ok(!v.bmMapChips.some(c => /Poids|Masse/.test(c.label)));
  assert.deepEqual(v.bmChips.map(c => c.label), ['Poids', 'Masse grasse']);
  v.bmChips[1].onClick(); assert.equal(app.state.bodyMetric, 'fat');
  assert.equal(v.bmLegend.length, 4);
});
