var fs = require("fs");
var path = require("path");

function regExpText(text) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

function findFilesCommon(folder, filePostfix, callback, readdir, stat) {
	var regExp = new RegExp("^(?:(.+)\\.)"+regExpText(filePostfix)+"$")
	readdir(folder, function(err, files) {
		if(err) return callback(err);
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
					callback("cannot find files: " + errors.join("\n"));
				else
					callback(null, result);
			}
		}
	});
}

function findFiles(folder, filePostfix, callback) {
	findFilesCommon(folder, filePostfix, callback, fs.readdir, fs.stat);
}

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

module.exports = function(rootLoader, localeLoader, requireAsync, chuckPrefix) {
	chuckPrefix = chuckPrefix || "i18n";
	return function(content) {
		var loaderSign = this.request.indexOf("!");
		var remReq = this.request.substr(loaderSign);
		var fileMatch = /^(.*!)([^!]+?)$/.exec(remReq);
		remReq = fileMatch[1];
		var file = fileMatch[2];
		var filedir = path.dirname(file);
		var filebase = path.basename(file)
		var cb = this.async();
		var configuredLocales = this.options && this.options.i18n && this.options.i18n.locales;
		var dontBundleTogether = this.options && this.options.i18n && (this.options.i18n.bundleTogether === false);
		var sync = !cb;
		cb = cb || this.callback;
		(sync ? findFilesSync : findFiles)
		  (filedir, filebase, function(err, files) {
			if(err) return cb(err);
			var buf = [];
			buf.push("var cbs = [];\n");
			if(requireAsync) {
				buf.push("exports = module.exports = function(cb) {\n");
				buf.push("  if(cbs) cbs.push(cb);\n");
				buf.push("  else cb();\n");
				buf.push("}\n");
				buf.push("\n");
			}
			buf.push("var map = {\n");
			function addLocale(locale, file) {
				buf.push(JSON.stringify(locale));
				buf.push(": function() {\n");
				requireAsync && buf.push("  require.ensure([], function(require) {\n");
				buf.push("    use(require(");
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
			buf.push("function use(locale) {\n");
			if(requireAsync) {
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
				buf.push("  module.exports = locale;\n");
			}
			buf.push("}\n");
			cb(null, buf.join(""));
		});
	}
}