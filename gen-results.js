"use strict";

/**
 * Generate JSON encoded results from test samples to be used for unit testing
 */
var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var WFDB = require('./wfdb.js');

var locator = new WFDB.FileLocator('test/data/');

var wfdb = new WFDB(locator);

var results = {rows: []};
wfdb.readData(record, function(res) {
    res.on('info', function(info) {
        results['info'] = info;
    }).on('data', function(sequence, data) {
        results.rows.push(data);
    }).on('error', function(err) {
        console.log(err);
    }).on('end', function() {
        console.log(JSON.stringify(results));
    });
}); 




