"use strict";

var util = require('util');

// A record here is a fully qualified physiobank pathname of the form
// database/record such as mghdb/mgh001
var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var WFDB = require('../index.js');

// A Locator can be any object with a locate(record) method that returns a readable stream.
// The builtin CachedLocator retrieves data from Physiobank; using the local
// file system for caching.
var locator = new WFDB.CachedLocator('data/', 'http://physionet.org/physiobank/database/');

var wfdb = new WFDB(locator);

var player = new WFDB.Playback(wfdb);

player.playFromFile(record, {}, function(res) {
	res.on('sample', function(descriptor, data) {
		console.log('sample', new Date(data.tm), descriptor, data);
	}).on('delete', function(descriptor, tm) {
		console.log('delete', new Date(tm), descriptor, tm);
	});
});

