import test from 'node:test';
import assert from 'node:assert/strict';

import { renderStartupSummary } from '../utils/devConsole.js';

test('startup summary names the run mode', () => {
    const urls = { appName: 'HomeInventory', frontendUrl: 'http://localhost:3001', backendUrl: 'http://localhost:3001' };
    assert.match(renderStartupSummary(urls), /HomeInventory • Development/);
    assert.match(renderStartupSummary({ ...urls, mode: 'Production' }), /HomeInventory • Production/);
});
