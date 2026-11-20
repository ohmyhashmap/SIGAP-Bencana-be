import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';

describe('Root Endpoint', () => {
	it('creates app instance successfully', () => {
		const app = createApp();
		assert.ok(app);
	});
});
