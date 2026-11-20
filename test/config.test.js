import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { config } from '../src/config.js';

describe('Config', () => {
	it('loads default configurations properly', () => {
		assert.ok(config.port > 0);
		assert.ok(typeof config.databaseUrl === 'string');
		assert.ok(typeof config.corsOrigin === 'string');
		assert.ok(typeof config.firmsSource === 'string');
	});
});
