"use strict";


var fs = require('fs');
/**
 * Generate JSON encoded results from test samples to be used for unit testing
 */
var record = process.argv[2];

var WFDB = require('./wfdb.js');

var locator = new WFDB.FileLocator('test/data/');

var wfdb = new WFDB(locator);

if(record) {
    var results = {rows: []};
    wfdb.readHeaderAndData(record, function(res) {
        res.on('header', function(header) {
            results['header'] = header;
        }).on('data', function(sequence, data) {
            results.rows.push(data);
        }).on('error', function(err) {
            console.log(err);
        }).on('end', function() {
            console.log(JSON.stringify(results, null, 4));
        });
    }); 
} else {
    var test_records = JSON.parse(fs.readFileSync('test_records.json', 'utf8')).test_records;
    for(var i = 0; i < test_records.length; i++) {
        record = test_records[i];
        
        wfdb.readHeaderAndData(record, function(res) {
            var results = {rows: []};
            var record_ = record;
            res.on('header', function(header) {
                results['header'] = header;
            }).on('data', function(sequence, data) {
                results.rows.push(data);
            }).on('error', function(err) {
                console.log(err);
            }).on('end', function() {
                var filename = 'test/'+record_+'.json';
                fs.writeFileSync(filename, JSON.stringify(results, null, 4));
                console.log(filename);
            });
        }); 
    }
}