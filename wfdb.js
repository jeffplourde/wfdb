"use strict";

var EventEmitter = require('events').EventEmitter;

var readHeader = require('./wfdb-read-header.js');
var readData   = require('./wfdb-read-data.js');
var util       = require('./wfdb-util.js');
var Locator    = require('./wfdb-locator.js');
var Playback   = require('./wfdb-playback.js');


function WFDB(locator) {
    this.locator = locator;
    // format 0 is used in layout files
    this.accepted_formats = {212: 12, 16: 16, 80: 8, 0:0};
    this.DEFGAIN = 200;
}

WFDB.FileLocator = Locator.FileLocator;

WFDB.HTTPLocator = Locator.HTTPLocator;

WFDB.CachedLocator = Locator.CachedLocator;

WFDB.Playback = Playback;

WFDB.prototype.readHeader = function(record) {
    return readHeader(this, record);
};

WFDB.prototype.readData = function(header, callback) {
    readData.readEntireRecord(this, header, callback);
};

WFDB.prototype.readFrames = function(header, start, end, callback) {
    readData.readFrames(this, header, start, end, callback);
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
                .on('batch', function(batchdata) {
                    response.emit('batch', batchdata);
                })
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

WFDB.prototype.readHeaderAndFrames = function(record, start, end, callback) {
    var response = new EventEmitter();
    callback(response);
    var self = this;

    this.readHeader(record, function(res) {
        res.on('error', function(err) { response.emit('error', err); })
        .on('data', function(header) {
            response.emit('header', header);
            self.readFrames(header, start, end, function(res) {
                res.on('error', function(err) { response.emit('error', err); })
                .on('batch', function(batchdata) {
                    response.emit('batch', batchdata);
                })
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

WFDB.prototype.dblist = function() {
    return util.dblist(this);
};

WFDB.prototype.rlist = function(database) {
    return util.rlist(this, database);
};

module.exports = exports = WFDB;
