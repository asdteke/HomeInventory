import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cookieStyles = [
  '../client/src/admin-overlays-v25.css',
  '../client/src/performance-v25.css'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('cookie notice uses an opaque theme surface', () => {
  const frameRules = cookieStyles.flatMap((styles) =>
    [...styles.matchAll(/\.cookie-banner-v25-frame\s*\{([^}]*)\}/gs)].map((match) => match[1])
  );

  assert.ok(frameRules.length >= 4, 'expected base and accessibility/fallback cookie rules');
  assert.ok(frameRules.some((rule) => /background:\s*var\(--hi-bg-strong\)\s*;/.test(rule)));

  for (const rule of frameRules) {
    assert.doesNotMatch(
      rule,
      /background:[^;]*(?:transparent|--hi-panel|rgba\([^)]*,\s*(?:0|\.\d+)\s*\))/
    );
  }

  assert.ok(frameRules.some((rule) => /backdrop-filter:\s*none\s*;/.test(rule)));
});
