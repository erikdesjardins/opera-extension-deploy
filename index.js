/**
 * @author Erik Desjardins
 * See LICENSE file in root directory for full license.
 */

'use strict';

var request = require('superagent');

var REQUIRED_FIELDS = [];

module.exports = function deploy(options) {
	return Promise.resolve()
		// options validation
		.then(function() {
			REQUIRED_FIELDS.forEach(function(field) {
				if (!options[field]) {
					throw new Error('Missing required field: ' + field);
				}
			});
		});
};
