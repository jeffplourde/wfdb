"use strict";


var fs = require('fs');
/**
 * Generate JSON encoded results from test samples to be used for unit testing
 */
var record = process.argv[2];

var WFDB = require('./index.js');

var locator = new WFDB.FileLocator('test/data/');

var wfdb = new WFDB(locator);

function genResults(record) {
    var results = {rows: []};
    
    wfdb.readHeaderAndData(record)
    .on('error', function(err) { console.error(err); })
    .on('header', function(header) { results['header'] = header; })
    .on('end', function() {
        var filename = 'test/'+record+'.json';
        fs.writeFileSync(filename, JSON.stringify(results, null, 4));
        console.log(filename);   
    })
    .on('data', function(data) {
        results.rows.push(data);
    });
}


if(record) {
    var results = {rows: []};
    wfdb.readHeaderAndData(record)
    .on('error', function(err) { console.error(err); })
    .on('header', function(header) {
        results['header'] = header;
    })
    .on('end', function() {
        console.log(JSON.stringify(results, null, 4));
    })
    .on('data', function(data) {
        results.rows.push(data);
    }); 
} else {
    var test_records = JSON.parse(fs.readFileSync('test_records.json', 'utf8')).test_records;
    for(var i = 0; i < test_records.length; i++) {
        genResults(test_records[i]);
    }
}