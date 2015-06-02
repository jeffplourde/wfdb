"use strict";

var fs = require('fs');
var assert = require('assert');

var WFDB = require('../wfdb.js');

var locator = new WFDB.FileLocator('test/data/');

var wfdb = new WFDB(locator);

module.exports = exports = function(name, record) {

    describe(name, function() {
        var results = {rows: []};
        var expected = JSON.parse(fs.readFileSync('test/'+record+'.json', 'utf8'));
        it('decode '+name+' records correctly', function(done) {
            wfdb.readHeaderAndData(record, function(res) {
                res.on('header', function(header) {
                    results['header'] = header;
                }).on('data', function(sequence, data) {
                    results.rows.push(data);
                }).on('error', function(err) {
                    done(err);
                }).on('end', function() {
                    // parse/stringify eliminates undefined properties that wouldn't have made it into the JSON
                    assert.deepEqual(JSON.parse(JSON.stringify(results)), expected);
                    done();
                });
            });
        });
    }); 

};
