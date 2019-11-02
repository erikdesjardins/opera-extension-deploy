# opera-extension-deploy

Deploy Opera extensions to the Opera Store. (hacky)

**Warning**: this uses undocumented internal APIs. It may break (or burn your house down) at any time.

## Installation

`npm install --save-dev opera-extension-deploy`

## Usage

```js
var fs = require('fs');
var deploy = require('opera-extension-deploy');

deploy({
  // Opera account credentials
  username: 'myUsername',
  password: 'hunter2',

  // Addon id, from https://addons.opera.com/developer/package/<id>/
  id: '123456',

  // a Buffer or string containing your zipped extension
  zip: fs.readFileSync('path/to/zipped/extension.zip')
}).then(function() {
  // success!
}, function(err) {
  // failure :(
  // errors are sanitized, so your credentials will not be leaked
});
```
