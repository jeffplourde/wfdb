"use strict";

var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var WFDB = require('./wfdb.js');

var fs = require('fs');
var http = require('http');

var wfdb = new WFDB(WFDB.cachedLocator(fs, 'data/', http, 'http://physionet.org/physiobank/database/'));
// var wfdb = new WFDB(WFDB.fileLocator(fs));
// var wfdb = new WFDB(WFDB.httpLocator(http, 'http://physionet.org/physiobank/database/mghdb/'));

wfdb.readData(record, function(header) {
	//console.log(header);
}, function(sequence, data) {
	//console.log(sequence+"\t"+data.join("\t"));
});

