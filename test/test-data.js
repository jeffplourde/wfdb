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
            wfdb.readData(record, function(res) {
                res.on('info', function(info) {
                    results['info'] = info;
                }).on('data', function(sequence, data) {
                    results.rows.push(data);
                }).on('error', function(err) {
                    done(err);
                }).on('end', function() {
                    assert.deepEqual(JSON.parse(JSON.stringify(results)), expected);
                    done();
                });
            });
        });
    }); 

};
