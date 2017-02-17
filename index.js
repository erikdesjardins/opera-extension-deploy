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
				.head('https://auth.opera.com/account/login')
				.then(function(response) {
					var csrfToken = response.headers['x-opera-csrf-token'];
					if (!csrfToken) {
						throw new Error('No CSRF token found.');
					}
					return csrfToken;
				}, function(err) {
					throw new Error('Failed to fetch login page: ' + err.response.status);
				});
		})
		// submit login for auth cookies
		.then(function(csrfToken) {
			return request
				.post('https://auth.opera.com/account/login?service=auth')
				.field('email', username)
				.field('password', password)
				.field('csrf_token', csrfToken)
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
			return request
				.post('https://addons.opera.com/api/file-upload/')
				.set('Accept', 'application/json; version=1.0')
				.set('X-Csrftoken', (request.jar.getCookie('csrftoken', { path: '/' }) || {}).value)
				.set('Referer', 'https://addons.opera.com/developer/package/' + id + '/?tab=versions')
				.field('flowChunkNumber', 1)
				.field('flowChunkSize', zip.length + 1)
				.field('flowCurrentChunkSize', zip.length)
				.field('flowTotalSize', zip.length)
				.field('flowIdentifier', '__opera-ext-depl__')
				.field('flowFilename', 'package.zip')
				.field('flowRelativePath', 'package.zip')
				.field('flowTotalChunks', 1)
				.attach('file', zip, 'package.zip')
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
