/**
 * @author Erik Desjardins
 * See LICENSE file in root directory for full license.
 */

'use strict';

var superagent = require('superagent');

var REQUIRED_FIELDS = ['username', 'password', 'id', 'zip'];

module.exports = function deploy(options) {
	var username = options.username;
	var password = options.password;
	var id = options.id;
	var zip = options.zip;

	var request = superagent.agent(); // preserve cookies

	return Promise.resolve()
		// options validation
		.then(function() {
			REQUIRED_FIELDS.forEach(function(field) {
				if (!options[field]) {
					throw new Error('Missing required field: ' + field);
				}
			});
		})
		// fetch login page for csrf token and auth session cookie
		.then(function() {
			return request
				.get('https://auth.opera.com/account/login')
				.then(function(response) {
					// I really don't want to include an HTML parser...this is all a hack anyways, what's one more?
					var csrfToken = (/name="csrfmiddlewaretoken" value="(\w+)"/).exec(response.text);
					if (!csrfToken) {
						throw new Error('No CSRF token found.');
					}
					return csrfToken[1];
				}, function(err) {
					throw new Error('Failed to fetch login page: ' + err.response.status);
				});
		})
		// submit login for auth cookies
		.then(function(csrfToken) {
			return request
				.post('https://auth.opera.com/account/login')
				.set('Referer', 'https://auth.opera.com/account/login')
				.field('email', username)
				.field('password', password)
				.field('csrfmiddlewaretoken', csrfToken)
				.then(function(response) {
					// success
					// even when login fails, this still responds with 200...
				}, function(err) {
					throw new Error('Failed to login: ' + err.response.status);
				});
		})
		// fetch developer page for new csrf token
		.then(function() {
			return request
				.head('https://addons.opera.com/developer/')
				.then(function(response) {
					// success
				}, function(err) {
					throw new Error('Failed to fetch versions page: ' + err.response.status);
				});
		})
		// upload addon
		.then(function() {
			// 1 MB chunk size (conservative)
			// I've seen [1048576, 1819438] chunks (yes, in that order, which is odd)
			var CHUNK_SIZE = 1024 * 1024;

			var requests = [];

			var maxChunk = Math.ceil(zip.length / CHUNK_SIZE);
			for (var i = 1; i <= maxChunk; ++i) {
				var currentSlice = zip.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE);

				requests.push(request
					.post('https://addons.opera.com/api/file-upload/')
					.set('Accept', 'application/json; version=1.0')
					.set('X-Csrftoken', (request.jar.getCookie('csrftoken', { path: '/' }) || {}).value)
					.set('Referer', 'https://addons.opera.com/developer/package/' + id + '/?tab=versions')
					.field('flowChunkNumber', i)
					.field('flowChunkSize', CHUNK_SIZE)
					.field('flowCurrentChunkSize', currentSlice.length)
					.field('flowTotalSize', zip.length)
					.field('flowIdentifier', '__opera-ext-depl__')
					.field('flowFilename', 'package.zip')
					.field('flowRelativePath', 'package.zip')
					.field('flowTotalChunks', maxChunk)
					.attach('file', currentSlice, 'package.zip'));
			}

			return Promise.all(requests)
				.then(function(response) {
					// success
				}, function(err) {
					throw new Error('Failed to upload package: ' + (err.response.body.detail || err.response.status));
				});
		})
		// get addon info
		.then(function() {
			return request
				.get('https://addons.opera.com/api/developer/packages/' + id)
				.set('Accept', 'application/json; version=1.0')
				.set('X-Csrftoken', (request.jar.getCookie('csrftoken', { path: '/' }) || {}).value)
				.set('Referer', 'https://addons.opera.com/developer/package/' + id + '/?tab=versions')
				.then(function(response) {
					return response.body;
				}, function(err) {
					throw new Error('Failed to fetch addon info: ' + (err.response.body.detail || err.response.status));
				});
		})
		// create new version
		.then(function(addonInfo) {
			return request
				.post('https://addons.opera.com/api/developer/package-versions/?package_id=' + id)
				.set('Accept', 'application/json; version=1.0')
				.set('X-Csrftoken', (request.jar.getCookie('csrftoken', { path: '/' }) || {}).value)
				.set('Referer', 'https://addons.opera.com/developer/package/' + id + '/?tab=versions')
				.send({
					file_id: '__opera-ext-depl__',
					file_name: 'package.zip',
					metadata_from: addonInfo.versions[0].version
				})
				.then(function(response) {
					return response.body;
				}, function(err) {
					throw new Error('Failed to create new version: ' + (err.response.body.detail || err.response.status));
				});
		})
		// submit version for moderation
		.then(function(submissionInfo) {
			return request
				.post('https://addons.opera.com/api/developer/package-versions/' + id + '-' + submissionInfo.version + '/submit_for_moderation/')
				.set('Accept', 'application/json; version=1.0')
				.set('X-Csrftoken', (request.jar.getCookie('csrftoken', { path: '/' }) || {}).value)
				.set('Referer', 'https://addons.opera.com/developer/package/' + id + '/version/' + submissionInfo.version)
				.send({})
				.then(function(response) {
					// success
				}, function(err) {
					throw new Error('Failed to submit for moderation: ' + (err.response.body.detail || err.response.status));
				});
		});
};
