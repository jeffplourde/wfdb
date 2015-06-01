"use strict";

// A record here is a fully qualified physiobank pathname of the form
// database/record such as mghdb/mgh001
var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var WFDB = require('./wfdb.js');

// A Locator can be any object with a locate(record, callback) method.
// The callback takes a single argument which is an EventEmitter that emits
// either 'error' or 'data' as an error occurs or records are located.
// The builtin CachedLocator retrieves data from Physiobank; using the local
// file system for caching.
var locator = new WFDB.CachedLocator('data/', 'http://physionet.org/physiobank/database/');


var wfdb = new WFDB(locator);


wfdb.readData(record, function(res) {
    res.on('info', function(info) {
        console.log(info);
    }).on('data', function(sequence, data) {
        console.log(sequence+"\t"+data.join("\t"));
    }).on('error', function(err) {
        console.log(err);
    }).on('end', function() {
        // All Done
    });
});

