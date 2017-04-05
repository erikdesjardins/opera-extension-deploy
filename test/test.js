import test from 'ava';
import superagent from 'superagent';
import superagentMock from 'superagent-mock';

import deploy from '../index.js';

class ResponseError extends Error {
	constructor(body, status) {
		super('Request failed.');
		this.response = { body, status };
	}
}

test.beforeEach(t => {
	t.context.requests = [];
	const popRequest = (match, params, headers) => {
		t.context.requests.push({ match: match.slice(1), params, headers });
		const resp = t.context.responses.shift();
		if (resp instanceof Error) throw resp;
		else return resp;
	};
	const wrapData = (match, data) => ({ body: data });
	const wrapHeaders = (match, data) => ({ headers: data });
	t.context.mock = superagentMock(superagent, [{
		pattern: '^https://auth.opera.com(/account/login)$',
		fixtures: popRequest,
		head: wrapHeaders,
	}, {
		pattern: '^https://auth.opera.com(/account/login\\?service=auth)$',
		fixtures: popRequest,
		post: wrapHeaders,
	}, {
		pattern: '^https://addons.opera.com(/developer/)$',
		fixtures: popRequest,
		head: wrapHeaders,
	}, {
		pattern: '^https://addons.opera.com(/api/.+)$',
		fixtures: popRequest,
		get: wrapData,
		post: wrapData,
	}, {
		pattern: '.*',
		fixtures(match) {
			throw new Error('No mocked endpoint for: ' + match);
		}
	}]);
});

test.afterEach(t => {
	t.context.mock.unset();
});

test.serial('missing fields', async t => {
	await t.throws(
		deploy({ password: 'q', id: 'q', zip: Buffer.from([]) }),
		'Missing required field: username'
	);

	await t.throws(
		deploy({ username: 'q', id: 'q', zip: Buffer.from([]) }),
		'Missing required field: password'
	);

	await t.throws(
		deploy({ username: 'q', password: 'q', zip: Buffer.from([]) }),
		'Missing required field: id'
	);

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q' }),
		'Missing required field: zip'
	);
});

test.serial('failing login initial load', async t => {
	t.context.responses = [new ResponseError({}, 503)];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([]) }),
		'Failed to fetch login page: 503'
	);

	t.is(t.context.requests.length, 1);
});

test.serial('failing login csrf token', async t => {
	t.context.responses = [{}];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([]) }),
		'No CSRF token found.'
	);

	t.is(t.context.requests.length, 1);
});

test.serial('failing login', async t => {
	t.context.responses = [
		{ 'x-opera-csrf-token': 'foo' },
		new ResponseError({}, 403)
	];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([]) }),
		'Failed to login: 403'
	);

	t.is(t.context.requests.length, 2);
});

test.serial('failing versions page fetch', async t => {
	t.context.responses = [
		{ 'x-opera-csrf-token': 'foo' },
		{},
		new ResponseError({}, 403)
	];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([]) }),
		'Failed to fetch versions page: 403'
	);

	t.is(t.context.requests.length, 3);
});

test.serial('failing upload', async t => {
	t.context.responses = [
		{ 'x-opera-csrf-token': 'foo' },
		{},
		{},
		new ResponseError({ detail: 'errorCode' })
	];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([1]) }),
		'Failed to upload package: errorCode'
	);

	t.is(t.context.requests.length, 4);
});

test.serial('failing addon info', async t => {
	t.context.responses = [
		{ 'x-opera-csrf-token': 'foo' },
		{},
		{},
		{},
		new ResponseError({ detail: 'errorCode' })
	];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([1]) }),
		'Failed to fetch addon info: errorCode'
	);

	t.is(t.context.requests.length, 5);
});

test.serial('failing version creation', async t => {
	t.context.responses = [
		{ 'x-opera-csrf-token': 'foo' },
		{},
		{},
		{},
		{ versions: [{}] },
		new ResponseError({ detail: 'errorCode' })
	];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([1]) }),
		'Failed to create new version: errorCode'
	);

	t.is(t.context.requests.length, 6);
});

test.serial('failing to submit for moderation', async t => {
	t.context.responses = [
		{ 'x-opera-csrf-token': 'foo' },
		{},
		{},
		{},
		{ versions: [{}] },
		{},
		new ResponseError({ detail: 'errorCode' })
	];

	await t.throws(
		deploy({ username: 'q', password: 'q', id: 'q', zip: Buffer.from([1]) }),
		'Failed to submit for moderation: errorCode'
	);

	t.is(t.context.requests.length, 7);
});

test.serial('full submit', async t => {
	t.context.responses = [
		{ 'x-opera-csrf-token': 'foo' },
		{},
		{},
		{},
		{ versions: [{ version: '1.2.3' }] },
		{ version: '1.2.4' },
		{},
	];

	await deploy({ username: 'user', password: 'pass', id: '42', zip: Buffer.from([1, 2, 3, 4]) });

	const r = t.context.requests;

	t.deepEqual(r[0].match, ['/account/login']);

	t.deepEqual(r[1].match, ['/account/login?service=auth']);

	t.deepEqual(r[2].match, ['/developer/']);

	t.deepEqual(r[3].match, ['/api/file-upload/']);
	t.is(r[3].headers['Accept'], 'application/json; version=1.0');
	t.is(r[3].headers['Referer'], 'https://addons.opera.com/developer/package/42/?tab=versions');
	t.true('X-Csrftoken' in r[3].headers);

	t.deepEqual(r[4].match, ['/api/developer/packages/42']);
	t.is(r[4].headers['Accept'], 'application/json; version=1.0');
	t.is(r[4].headers['Referer'], 'https://addons.opera.com/developer/package/42/?tab=versions');
	t.true('X-Csrftoken' in r[4].headers);

	t.deepEqual(r[5].match, ['/api/developer/package-versions/?package_id=42']);
	t.is(r[5].headers['Accept'], 'application/json; version=1.0');
	t.is(r[5].headers['Referer'], 'https://addons.opera.com/developer/package/42/?tab=versions');
	t.true('X-Csrftoken' in r[5].headers);
	t.deepEqual(r[5].params, {
		file_id: '__opera-ext-depl__',
		file_name: 'package.zip',
		metadata_from: '1.2.3',
	});

	t.deepEqual(r[6].match, ['/api/developer/package-versions/42-1.2.4/submit_for_moderation/']);
	t.is(r[6].headers['Accept'], 'application/json; version=1.0');
	t.is(r[6].headers['Referer'], 'https://addons.opera.com/developer/package/42/version/1.2.4');
	t.true('X-Csrftoken' in r[6].headers);
	t.deepEqual(r[6].params, {});

	t.is(t.context.requests.length, 7);
});
