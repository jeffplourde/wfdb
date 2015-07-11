"use strict";

var fs = require('fs');
var assert = require('assert');

var WFDB = require('../index.js');

var locator = new WFDB.FileLocator('test/data/');

var wfdb = new WFDB(locator);

module.exports = exports = function(name, record) {

    describe(name+" readHeader", function() {
        var expected = JSON.parse(fs.readFileSync('test/'+record+'.json', 'utf8'));
        var results;

        it('decode '+name+' records correctly with readHeader', function(done) {
            wfdb.readHeader(record).on('error', function(err) {
                done(err); // is that correct?
            }).on('end', function() {
                // parse/stringify eliminates undefined properties that wouldn't have made it into the JSON
                assert.deepEqual(JSON.parse(JSON.stringify(results)), expected.header);
                done();
            }).on('data', function(header) {
                results = header;
            });
        });
    });     

    describe(name+" readHeaderAndData", function() {
        var results = {rows: []};
        var expected = JSON.parse(fs.readFileSync('test/'+record+'.json', 'utf8'));
        it('decode '+name+' records correctly with readHeaderAndData', function(done) {
            wfdb.readHeaderAndData(record)
            .on('header', function(header) {
                results['header'] = header;
            })
            .on('error', function(err) {
                done(err);
            }).on('end', function() {
                // parse/stringify eliminates undefined properties that wouldn't have made it into the JSON
                assert.deepEqual(JSON.parse(JSON.stringify(results)), expected);
                done();
            })
            .on('data', function(data) {
                results.rows.push(data);
            });
        });
    }); 

    describe(name+" readFrames", function() {
        var results = {rows: []};
        var expected = JSON.parse(fs.readFileSync('test/'+record+'.json', 'utf8'));
        it('decode '+name+' records correctly with readFrames', function(done) {
            wfdb.readHeaderAndFrames(record, 0, 10)
            .on('header', function(header) {
                results['header'] = header;
            })
            .on('error', function(err) { done(err); })
            .on('end', function() {
                // parse/stringify eliminates undefined properties that wouldn't have made it into the JSON
                assert.deepEqual(JSON.parse(JSON.stringify(results)), expected);
                done();
            })
            .on('data', function(data) {
                results.rows.push(data);
            });
        });
    }); 

};
