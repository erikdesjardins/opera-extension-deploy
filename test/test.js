import test from 'ava';
import superagent from 'superagent';
import superagentMock from 'superagent-mock';

import deploy from '../index.js';

test.beforeEach(t => {
	t.context.requests = [];
	t.context.mock = superagentMock(superagent, [{
		pattern: '.*',
		fixtures(match) {
			throw new Error('No mocked endpoint for: ' + match);
		}
	}]);
});

test.afterEach(t => {
	t.context.mock.unset();
});
