"use strict";

var EventEmitter = require('events').EventEmitter;
var util = require("util");
var fs = require('graceful-fs');
var http = require('http');
var url = require('url');
var mkdirp = require('mkdirp');
var stream = require('stream');


var httpAgent = new http.Agent({keepAlive: true, maxSockets: 3, maxFreeSockets: 3});

function FileLocator(basePath) {
    this.basePath = basePath || "";
}

FileLocator.prototype.locateRange = function(record, start, end, opts) {
    var fullRecord = this.basePath+record;
    if(!fs.existsSync(fullRecord) || fs.statSync(fullRecord).size == 0) {
        return null;
    } else {
        opts = opts || {};
        opts.start = start;
        opts.end = end;
        return fs.createReadStream(fullRecord, opts);
    }    
}

FileLocator.prototype.locate = function(record, opts) {
    var fullRecord = this.basePath+record;
    if(!fs.existsSync(fullRecord) || fs.statSync(fullRecord).size == 0) {
        // console.log(record, "not found");
        return null;
    } else {
        return fs.createReadStream(fullRecord, opts);
    }
};

module.exports.FileLocator = FileLocator;

function HTTPLocator(baseURI) {
    this.baseURI = baseURI;
}

HTTPLocator.prototype.locateRange = function(record, start, end, opts) {
    var pipe = new stream.PassThrough();

    var data;
    var self = this;
    var reqinfo = url.parse(this.baseURI+record);
    var opts = {
        hostname: reqinfo.hostname,
        port: reqinfo.port,
        path: reqinfo.pathname,
        headers: {
            // byte range here is inclusive and zero-indexed
            'Range': 'bytes='+start+'-'+end
        },        
        'agent': httpAgent
    };
    http.get(opts, function(res) {
        if(res.statusCode != 206) {
            pipe.emit('error', "Status code " + res.statusCode + " GETting " + self.baseURI+record);
        } else {
            res.pipe(pipe);
        }
    }).on('error', function(err) { pipe.emit('error', err); });
    return pipe;
}

HTTPLocator.prototype.locate = function(record) {
    var pipe = new stream.PassThrough();

    var data;
    var self = this;
    var reqinfo = url.parse(this.baseURI+record);
    var opts = {
        hostname: reqinfo.hostname,
        port: reqinfo.port,
        path: reqinfo.pathname,
        'agent': httpAgent
    };
    http.get(opts, function(res) {
        if(res.statusCode != 200) {
            pipe.emit('error', "Status code " + res.statusCode + " GETting " + self.baseURI+record);
        } else {
            res.pipe(pipe);
        }
    }).on('error', function(err) { pipe.emit('error', err); });
    return pipe;
};


module.exports.HTTPLocator = HTTPLocator;

function CachedLocator(basePath, baseURI) {
    this.fileLocator = new FileLocator(basePath);
    this.httpLocator = new HTTPLocator(baseURI);
}

CachedLocator.prototype.locateRange = function(record, start, end, opts) {
    var filePipe = this.fileLocator.locateRange(record, start, end, opts);
    if(null == filePipe) {
        var httpPipe = this.httpLocator.locate(record);
        var fullPath = this.fileLocator.basePath + record;
        mkdirp.sync(fullPath.substring(0, fullPath.lastIndexOf("/")));
        httpPipe.pipe(fs.createWriteStream(fullPath));
        return this.httpLocator.locateRange(record, start, end, opts);
    } else {
        return filePipe;
    }    
};

CachedLocator.prototype.locate = function(record) {
    var filePipe = this.fileLocator.locate(record);
    if(null == filePipe) {
        var httpPipe = this.httpLocator.locate(record);
        var fullPath = this.fileLocator.basePath + record;
        mkdirp.sync(fullPath.substring(0, fullPath.lastIndexOf("/")));
        httpPipe.on('error', function(err) {
            if(fs.existsSync(fullPath)) {
                console.log("error caching, deleting", fullPath);
                fs.unlinkSync(fullPath);
            }
        }).pipe(fs.createWriteStream(fullPath)).on('end', function() {
            console.log("cached", record, fs.statSync(fullPath).size);
        }).on('error', function(err) {
            if(fs.existsSync(fullPath)) {
                console.log("error caching, deleting", fullPath);
                fs.unlinkSync(fullPath);
            }
        });
        // console.log("caching", record);
        return httpPipe;
    } else {
        return filePipe;
    }
};

module.exports.CachedLocator = CachedLocator;