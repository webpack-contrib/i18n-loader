var path = require("path");
module.exports = require("../")("json", path.join(__dirname, "../locale/merge") + "!json", false)