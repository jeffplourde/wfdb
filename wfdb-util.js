"use strict";
var EventEmitter = require('events').EventEmitter;
var stream = require('stream');
var util = require('util');

function LineTransform(opts) {
    if (!(this instanceof LineTransform)) {
        return new LineTransform(opts);
    }
    opts = opts || {};

    if(opts.delimiter && opts.delimiter.length() != 1) {
        throw new Error("Delimiters must have length 1: "+opts.delimiter);
    }

    this.delimiter = opts.delimiter || "\n";
    this.delimiterCode = this.delimiter.charCodeAt(0);
    stream.Transform.call(this, opts);
}
util.inherits(LineTransform, stream.Transform);

LineTransform.prototype.processLines = function(data) {
    var lines = data.split(this.delimiter);

    for(var i = 0; i < lines.length; i++) {
        this.push(lines[i]);
    }
};

LineTransform.prototype._transform = function(chunk, enc, next) {
    if(this.residual) {
        chunk = Buffer.concat([this.residual, chunk]);
        delete this.residual;
    }
    var i;
    for(i = chunk.length - 1; i >= 0; i--) {
        if(this.delimiterCode == chunk.readUInt8(i)) {
            // If there are data after the final newline, store them for next time
            if(i < (chunk.length-1)) {
                this.residual = chunk.slice(i+1, chunk.length);
            }
            break;
        }
    }
    if(i >= 0) {
        this.processLines(chunk.toString('ascii', 0, i));
    } else {
        this.residual = chunk;
    }
    next();
};

LineTransform.prototype._flush = function(next) {
    if(this.residual) {
        this.processLines(this.residual.toString('ascii'));
    }
    next();
};
exports.LineTransform = LineTransform;

function DBListTransform(opts) {
    // allow use without new
    if (!(this instanceof DBListTransform)) {
        return new DBListTransform(opts);
    }
    opts = opts || {};
    opts.readableObjectMode = true;
    stream.Transform.call(this, opts);

};
util.inherits(DBListTransform, stream.Transform);

var db_re = /^([^\t]+)\t+([^\t]+)\w*$/;
DBListTransform.prototype._transform = function(chunk, enc, next) {
    var m = chunk.toString('ascii').match(db_re);
    if(m) {
        this.push({name:m[1], description:m[2]});
    }
    next();
};

DBListTransform.prototype._flush = function(next) {
    next();
};

// Use this in your own pipelines with your own Readable
exports.DBListTransform = DBListTransform;

// use this to assemble a pipeline from a locator
exports.dblist = function(wfdb) {
    return wfdb.locator.locate('DBS').pipe(LineTransform()).pipe(DBListTransform());
};

function RListTransform(opts) {
    if (!(this instanceof RListTransform)) {
        return new RListTransform(opts);
    }
    opts = opts || {};
    opts.readableObjectMode = true;
    stream.Transform.call(this, opts);
}
util.inherits(RListTransform, stream.Transform);

var re = /^(.+)$/;
RListTransform.prototype._transform = function(chunk, enc, next) {
    var m = chunk.toString('ascii').match(re);
    if(m) {
        this.push(m[1]);
    } else {
        console.log("no m", chunk.toString('ascii'));
    }
    next();
};

RListTransform.prototype._flush = function(next) {
    next();
};

// Use this in your own pipelines with your own Readable
exports.RListTransform = RListTransform;

// use this to assemble a pipeline from a locator
exports.rlist = function(wfdb, database) {
    database = database + (database.charAt(database.length-1)!='/'?'/':'') + 'RECORDS';
    return wfdb.locator.locate(database).pipe(LineTransform()).pipe(RListTransform());
};