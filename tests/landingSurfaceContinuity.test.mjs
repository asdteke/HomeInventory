import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const landingSource = readFileSync(
  new URL('../client/src/components/LandingPage.tsx', import.meta.url),
  'utf8'
);
const landingStyles = readFileSync(
  new URL('../client/src/auth-landing-v25.css', import.meta.url),
  'utf8'
);

test('landing page paints one continuous background surface', () => {
  assert.match(landingSource, /className="landing-v25 landing-page-shell[^\"]*"\s*style=\{\{ background: pageContinuumBackground \}\}/s);
  assert.doesNotMatch(landingSource, /<main className="pt-24" style=\{\{ background: pageContinuumBackground \}\}>/);

  const gradient = landingSource.match(/'radial-gradient\(ellipse 120% 70% at 50% 48%,rgba\(17,35,58[^']+'/)?.[0] || '';
  assert.ok(gradient, 'expected the dark landing continuum gradient');
  assert.doesNotMatch(gradient, /linear-gradient|34%|66%/, 'the page surface must not contain visible intermediate bands');
});

test('hero does not start a separate color layer below the top bar', () => {
  assert.doesNotMatch(landingSource, /heroAtmosphereBackground|landing-hero-atmosphere-v25/);
  assert.match(landingStyles, /\.landing-hero-grid-layer-v25\s*\{[^}]*mask-image:\s*linear-gradient\(180deg,\s*transparent 0%/s);
});

test('landing CTA and technical notes use restrained dedicated surfaces', () => {
  assert.match(landingSource, /landing-cta-button-stack-v25/);
  assert.match(landingSource, /landing-technical-card-v25/);
  assert.doesNotMatch(landingSource, /landing-cta-orbit-v25/);
  assert.doesNotMatch(landingSource, /landing-cta-glow-v25/);
  assert.match(landingStyles, /\.landing-cta-button-stack-v25\s*\{/);
  assert.match(landingStyles, /\.landing-technical-card-v25\s*\{/);
});

test('all landing primary setup actions share the main dark-green button treatment', () => {
  const primaryButtonUses = landingSource.match(/\bbtn-primary\b/g) || [];
  assert.ok(primaryButtonUses.length >= 3, 'expected hero, top bar, and final setup actions to use btn-primary');
  assert.doesNotMatch(landingSource, /bg-\[#6f9978\]|hover:bg-\[#7aa484\]/);
});
