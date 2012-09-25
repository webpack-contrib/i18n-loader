var fs = require("fs");
var path = require("path");

/**
 * Convert a string to a regexp string
 */
function regExpText(text) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * Find files for locals.
 *
 * @param folder the path to the folder
 * @param filePostfix the filename of the root locale
 * @param readdir fs.readDir or a equivalent function
 * @param stat fs.stat or a equivalent function
 */
function findFilesCommon(folder, filePostfix, callback, readdir, stat) {
	// build a RegExp from the filePostfix
	var regExp = new RegExp("^(?:(.+)\\.)"+regExpText(filePostfix)+"$")
	// get files in directory
	readdir(folder, function(err, files) {
		if(err) return callback(err);

		// check each file async if it is a file and matches the RegExp
		// then call the callback with a array of found files.
		var result = [];
		var errors = [];
		var count = files.length;
		files.forEach(function(file) {
			stat(path.join(folder, file), function(err, stat) {
				if(err || !stat) return endOne(err);
				if(stat.isDirectory()) {
					endOne();
				} else {
					if(regExp.test(file)) {
						var match = regExp.exec(file);
						var name = match[1];
						result.push(name);
					}
					endOne();
				}
			});
		});
		function endOne(err) {
			if(err) errors.push(err);
			count--;
			if(count == 0) {
				if(errors.length > 0)
					callback(new Error("cannot find files: " + errors.join("\n")));
				else
					callback(null, result);
			}
		}
	});
}

// async version
function findFiles(folder, filePostfix, callback) {
	findFilesCommon(folder, filePostfix, callback, fs.readdir, fs.stat);
}

// sync version
function findFilesSync(folder, filePostfix, callback) {
	findFilesCommon(folder, filePostfix, callback, function(folder, cb) {
		try {
			cb(null, fs.readdirSync(folder));
		} catch(e) { cb(e); }
	}, function(path, cb) {
		try {
			cb(null, fs.statSync(path));
		} catch(e) { cb(e); }
	});
}

/**
 * the factory function for i18n loaders
 *
 * @param rootLoader the loader to load the root locale
 * @param localeLoader the loader to load the other locales
 * @param requireAsync put the locales in a chunk
 * @param chuckPrefix prefix of the chunk name (default to "i18n")
 */
module.exports = function(rootLoader, localeLoader, requireAsync, chuckPrefix) {
	chuckPrefix = chuckPrefix || "i18n";
	var loader = function(content) {
		// split the request into i18n-loader, locale loader, directory and filename
		var loaderSign = this.request.indexOf("!");
		var remReq = this.request.substr(loaderSign);
		var fileMatch = /^(.*!)([^!]+?)$/.exec(remReq);
		remReq = fileMatch[1];
		var file = fileMatch[2];
		var filedir = path.dirname(file);
		var filebase = path.basename(file);
		var cb = this.async();
		// read locale names from config if availible
		var configuredLocales = this.options && this.options.i18n && this.options.i18n.locales;
		// read "bundleTogether" from config
		var dontBundleTogether = this.options && this.options.i18n && (this.options.i18n.bundleTogether === false);
		var sync = !cb;
		cb = cb || this.callback;
		(sync ? findFilesSync : findFiles) // choose the fitting findFiles function
		  (filedir, filebase, function(err, files) {
			if(err) return cb(err);
			var buf = [];
			// export a promise if async
			if(requireAsync) {
				buf.push("var cbs = [];\n");
				buf.push("exports = module.exports = function(cb) {\n");
				buf.push("  if(cbs) cbs.push(cb);\n");
				buf.push("  else cb(exports);\n");
				buf.push("}\n");
				buf.push("\n");
			}
			// create mapping for locales
			buf.push("var map = {\n");
			function addLocale(locale, file) {
				buf.push(JSON.stringify(locale));
				buf.push(": function() {\n");
				requireAsync && buf.push("  require.ensure([], function(require) {\n");
				buf.push("    use(require(");
				// the locale is required with the specified locale loader
				if(file)
					buf.push(JSON.stringify(localeLoader + remReq + filedir + "/" + file + "." + filebase));
				else
					buf.push(JSON.stringify(rootLoader + remReq + filedir + "/" + filebase));
				buf.push("));\n");
				if(requireAsync) {
					buf.push("  }");
					if(!dontBundleTogether) {
						buf.push(", ");
						buf.push(JSON.stringify(chuckPrefix + (locale ? "-" + locale : "")));
					}
					buf.push(");\n");
				}
				buf.push("},\n");
			}
			addLocale("", "");
			var locales = files.slice(0);
			if(configuredLocales) configuredLocales.forEach(function(locale) {
				if(locales.indexOf(locale) == -1)
					locales.push(locale);
			});
			locales.forEach(function(locale) {
				file = locale;
				if(files.indexOf(file) == -1) {
					file = file.split("-");
					for(var i = file.length; i >= 0; i--)
						if(files.indexOf(file.join("-")) != -1) {
							file = file.join("-");
							break;
						}
					if(i == -1) file = "";
				}
				addLocale(locale, file);
			});
			buf.push("};\n");
			buf.push("\n");
			// determine the locale from the browser
			// and execute the corresponding function in the mapping
			buf.push("var nav = window.navigator, lang = nav.userLanguage || nav.language;\n");
			buf.push("lang = lang && lang.split('-') || [];\n");
			buf.push("(function() {\n");
			buf.push("  for(var i = lang.length; i >= 0; i--) {\n");
			buf.push("    var l = lang.slice(0, i).join('-');\n");
			buf.push("    if(map[l]) return map[l]();\n");
			buf.push("  }\n");
			buf.push("  map['']();\n");
			buf.push("}())\n");
			buf.push("\n");
			// use function is called with the locale
			buf.push("function use(locale) {\n");
			if(requireAsync) {
				// async: copy stuff exported by the locale to the promise function
				// if a function is exported, we create "call" and "apply" functions on the promise
				buf.push("  if(typeof locale === 'function') {\n");
				buf.push("    exports.call = function() {\n");
				buf.push("      return locale.call.apply(locale, arguments);\n");
				buf.push("    }\n");
				buf.push("    exports.apply = function() {\n");
				buf.push("      return locale.apply.apply(locale, arguments);\n");
				buf.push("    }\n");
				buf.push("  }\n");
				buf.push("  for(var p in locale) exports[p] = locale[p];\n");
				buf.push("  var c = cbs; cbs = null;\n");
				buf.push("  for(var i = 0; i < c.length; i++) c[i](exports);\n");
			} else {
				// sync: simple exporting of the locale
				buf.push("  module.exports = locale;\n");
			}
			buf.push("}\n");
			cb(null, buf.join(""));
		});
	}
	loader.seperable = true;
	return loader;
}