import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const loginSource = readFileSync(
  new URL('../client/src/components/Login.tsx', import.meta.url),
  'utf8'
);
const registerSource = readFileSync(
  new URL('../client/src/components/Register.tsx', import.meta.url),
  'utf8'
);
const landingStyles = readFileSync(
  new URL('../client/src/auth-landing-v25.css', import.meta.url),
  'utf8'
);

test('login chrome stays compact without a redundant page label', () => {
  assert.match(loginSource, /auth-top-tools-v25 auth-top-tools-compact-v25/);
  assert.doesNotMatch(loginSource, /auth-top-label-v25/);
  assert.match(registerSource, /auth-top-tools-v25 auth-top-tools-compact-v25/);
  assert.doesNotMatch(registerSource, /auth-top-label-v25|registerShellLabel/);
  assert.match(landingStyles, /\.auth-top-tools-compact-v25\s*\{[^}]*width:\s*fit-content;/s);
});

test('household mode remains both draggable and directly clickable', () => {
  assert.match(registerSource, /onPointerDown=\{handleModePointerDown\}/);
  assert.match(registerSource, /onPointerMove=\{handleModePointerMove\}/);
  assert.match(registerSource, /onClick=\{\(\) => \{\s*setMode\(option\.value\);/s);
  assert.match(registerSource, /const clickProgress = trackBounds/);
  assert.match(registerSource, /const finalProgress = suppressModeClickRef\.current \? drag\.currentProgress : clickProgress/);
  assert.match(registerSource, /role="tab"/);
});
