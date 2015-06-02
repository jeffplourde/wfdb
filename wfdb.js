"use strict";

var EventEmitter = require('events').EventEmitter;

var readHeader = require('./wfdb-read-header.js');
var readData = require('./wfdb-read-data.js');
var Locator = require('./wfdb-locator.js');

function WFDB(locator) {
    this.locator = locator;
    this.accepted_formats = {212: 12, 16: 16};
    this.DEFGAIN = 200;
}

WFDB.FileLocator = Locator.FileLocator;

WFDB.HTTPLocator = Locator.HTTPLocator;

WFDB.CachedLocator = Locator.CachedLocator;

WFDB.prototype.readHeader = function(record, callback) {
    readHeader(this, record, callback);
};

WFDB.prototype.readData = function(header, callback) {
    readData(this, header, callback);
};

WFDB.prototype.readHeaderAndData = function(record, callback) {
    var response = new EventEmitter();
    callback(response);
    var self = this;

    this.readHeader(record, function(res) {
        res.on('error', function(err) { response.emit('error', err); })
        .on('data', function(header) {
            response.emit('header', header);
            self.readData(header, function(res) {
                res.on('error', function(err) { response.emit('error', err); })
                .on('data', function(sequence, data) {
                    response.emit('data', sequence, data);
                })
                .on('end', function() {
                    response.emit('end');
                });
            });
        });
    });
};

module.exports = exports = WFDB;
