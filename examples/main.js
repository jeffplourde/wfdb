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

var h = null;
var sequence = 0;

wfdb.readHeaderAndData(record)
.on('error', function(err) { console.error(err); })
.on('header', function(header) { 
    h = header; 
    var headings = ["Sequence"];
    header.signals.forEach(function(element) {
        headings.push(element.description);
    });
    console.log(headings.join("\t"));
})
.on('end', function() { console.log("End"); })
.on('data', function(data) {
    console.log("%d\t%s", sequence++, data.join("\t"));
});
