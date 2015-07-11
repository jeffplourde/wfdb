"use strict";

var stream     = require('stream');

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

WFDB.prototype.readData = function(header) {
    return readData.readData(this, header);
};

WFDB.prototype.readFrames = function(header, start, end) {
    return readData.readFrames(this, header, start, end);
};

WFDB.prototype.readHeaderAndData = function(record) {
    var pipe = new stream.PassThrough({
        readableObjectMode: true,
        writableObjectMode: true,
        objectMode: true // for backward compatibility
    });

    var self = this;

    var header;

    this.readHeader(record)
    .on('error', function(err) { pipe.emit('error', err); })
    .on('end', function() { self.readData(header).on('error', function(err) {
        pipe.emit('error', err);
    }).pipe(pipe); })
    .on('data', function(h) {
        header = h;
        // This is awkward but should be possible
        pipe.emit('header', header);
    });

    return pipe;
};

WFDB.prototype.readHeaderAndFrames = function(record, start, end) {
    var pipe = new stream.PassThrough({
        readableObjectMode: true,
        writableObjectMode: true,
        objectMode: true // for backward compatibility
    });

    var self = this;

    var header;

    this.readHeader(record)
    .on('error', function(err) { pipe.emit('error', err); })
    .on('end', function() { self.readFrames(header, start, end).on('error', function(err) {
        pipe.emit('error', err);
    }).pipe(pipe); })
    .on('data', function(h) {
        header = h;
        pipe.emit('header', header);
    });
    return pipe;
};

WFDB.prototype.dblist = function() {
    return util.dblist(this);
};

WFDB.prototype.rlist = function(database) {
    return util.rlist(this, database);
};

module.exports = exports = WFDB;
