"use strict";

var fs = require('fs');
var assert = require('assert');

var WFDB = require('../wfdb.js');

var locator = new WFDB.FileLocator('test/data/');

var wfdb = new WFDB(locator);

module.exports = exports = function(name, record) {

    describe(name+" readHeaderAndData", function() {
        var results = {rows: []};
        var expected = JSON.parse(fs.readFileSync('test/'+record+'.json', 'utf8'));
        it('decode '+name+' records correctly with readHeaderAndData', function(done) {
            wfdb.readHeaderAndData(record, function(res) {
                res.on('header', function(header) {
                    results['header'] = header;
                }).on('data', function(sample_number, data) {
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

    describe(name+" readFrames", function() {
        var results = {rows: []};
        var expected = JSON.parse(fs.readFileSync('test/'+record+'.json', 'utf8'));
        it('decode '+name+' records correctly with readFrames', function(done) {
            wfdb.readHeader(record, function(res) {
                res.on('data', function(header) {
                    results['header'] = header;
                    wfdb.readFrames(header, 0, 10, function(res1) {
                        res1.on('data', function(sample_number, data) {
                            results.rows.push(data);
                        }).on('error', function(err) { done(err); })
                        .on('end', function() {
                            // parse/stringify eliminates undefined properties that wouldn't have made it into the JSON
                            assert.deepEqual(JSON.parse(JSON.stringify(results)), expected);
                            done();
                        });
                    });
                }).on('error', function(err) { done(err); });
            });
        });
    }); 

};
