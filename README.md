# opera-extension-deploy [![Build Status](https://travis-ci.org/erikdesjardins/opera-extension-deploy.svg?branch=master)](https://travis-ci.org/erikdesjardins/opera-extension-deploy) [![Coverage Status](https://coveralls.io/repos/github/erikdesjardins/opera-extension-deploy/badge.svg?branch=master)](https://coveralls.io/github/erikdesjardins/opera-extension-deploy?branch=master)

Deploy Opera extensions to the Opera Store. (hacky)

**Warning**: this uses an undocumented internal API. It may break (or burn your house down) at any time.

## Installation

`npm install --save-dev opera-extension-deploy`

## Usage

```js
var fs = require('fs');
var deploy = require('opera-extension-deploy');

deploy({

}).then(function() {
  // success!
}, function(err) {
  // failure :(
});
```
