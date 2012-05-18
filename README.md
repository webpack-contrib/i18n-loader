# i18n loader for webpack

## Usage

### ./colors.json

``` javascript
{
	"red": "red",
	"green": "green",
	"blue": "blue"
}
```

### ./de-de.colors.json

``` javascript
{
	"red": "rot",
	"green": "grün"
}
```

### call it

``` javascript
// assuming our locale is "de-de-berlin"
var locale = require("i18n!./colors.json");

// wait for ready, this is only required once for all locales in a web app
// because all locales of the same language are merged into one chuck
locale(function() {
	console.log(locale.red); // prints rot
	console.log(locale.blue); // prints blue
});
```

### alternative calls

``` javascript
require("i18n/choose!./file.js"); // chooses the correct file by locale,
					// but it do not merge the objects
require("i18n/concat!./file.js"); // concatinate all fitting locales
require("i18n/merge!./file.js"); // merges the resulting objects
					// ./file.js is excuted while compiling
require("i18n!./file.json") == require("i18n/merge!json!./file.json")
```

Don't forget to polyfill `require` if you want to use it in node.
See `webpack` documentation.

## License

MIT (http://www.opensource.org/licenses/mit-license.php)