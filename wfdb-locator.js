"use strict";

var EventEmitter = require('events').EventEmitter;
var util = require("util");
var fs = require('fs');
var http = require('http');
var url = require('url');

function FileLocator(basePath) {
    this.basePath = basePath || "";
}

FileLocator.prototype.locateRange = function(record, buffer, offset, length, position, callback) {
    var response = new EventEmitter();
    callback(response);
    fs.open(this.basePath+record, "r", function(err, fd) {
        if(err) {
            response.emit('error', err);
        } else {
            // console.log("read", buffer, offset, length, position);
            fs.read(fd, buffer, offset, length, position, function(err, bytesRead, buffer) {
                if(err) {
                    response.emit('error', err);
                } else {
                    //console.log("bytesRead", bytesRead, buffer);
                    response.emit('data', bytesRead, buffer);
                    fs.close(fd, function(err) {
                        if(err) {
                            response.emit('error', err);
                        }
                    });
                }
            });

        }
    });
}

FileLocator.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);
    fs.readFile(this.basePath+record, function(err, data) {
        if(err) {
            response.emit('error', err);
        } else {
            response.emit('data', data);
        }
    });     
};

module.exports.FileLocator = FileLocator;

function HTTPLocator(baseURI) {
    this.baseURI = baseURI;
}

HTTPLocator.prototype.locateRange = function(record, buffer, offset, length, position, callback) {

    var response = new EventEmitter();
    callback(response);
    var data;
    var self = this;
    var reqinfo = url.parse(this.baseURI+record);
    var opts = {
        hostname: reqinfo.hostname,
        port: reqinfo.port,
        path: reqinfo.pathname,
        headers: {
            // byte range here is inclusive and zero-indexed
            'Range': 'bytes='+position+'-'+(position+length-1)
        }
    };

    http.get(opts, function(res) {
        // 206 Partial content is the appropriate response for a range request
        if(res.statusCode != 206) {
            response.emit('error', "Status code " + res.statusCode + " GETting " + self.baseURI+record);
        } else {
            res.on('data', function(chunk) {
                if(!data) {
                    data = chunk;
                } else {
                    data = Buffer.concat([data, chunk]);
                }
            }).on('end', function() {
                response.emit('data', data.length, data);
            }).on('error', function(e) {
                response.emit('error', e);
            });
        }
    });

}

HTTPLocator.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);
    var data;
    var self = this;
    http.get(this.baseURI+record, function(res) {
        if(res.statusCode != 200) {
            response.emit('error', "Status code " + res.statusCode + " GETting " + self.baseURI+record);
        } else {
            res.on('data', function(chunk) {
                if(!data) {
                    data = chunk;
                } else {
                    data = Buffer.concat([data, chunk]);
                }
            }).on('end', function() {
                response.emit('data', data);
            }).on('error', function(e) {
                response.emit('error', e);
            });
        }
    });
};


module.exports.HTTPLocator = HTTPLocator;


function Cache(basePath, baseURI) {
    this.basePath = basePath;
    this.baseURI = baseURI;
}

Cache.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);

    var fullPath = this.basePath + record;

    if(!fs.existsSync(fullPath)) {
        // console.log("file doesn't exist");
        var parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
        // TODO there are numerous packages that supply mkdir -p functionality
        if(!fs.existsSync(parent)) { 
            var parentPathParts = parent.split("/");
            var parentPath = parentPathParts[0];
            if(!fs.existsSync(parentPath)) {
                fs.mkdirSync(parentPath); 
            }
            for(var i = 1; i < parentPathParts.length; i++) {
                parentPath = parentPath + "/" + parentPathParts[i];
                if(!fs.existsSync(parentPath)) {
                    fs.mkdirSync(parentPath); 
                }
            }
        }
        var self = this;
        http.get(this.baseURI+record, function(res) {
            if(res.statusCode != 200) {
                response.emit('error', "Failed HTTP GET with status code: " + res.statusCode + " (" + self.baseURI+record+")");
            } else {
                res.once('end', function() {
                    response.emit('end');
                });
                res.pipe(fs.createWriteStream(fullPath));
            }
        });
    } else {
        response.emit('end');
    }
}

function CachedLocator(basePath, baseURI) {
    this.fileLocator = new FileLocator(basePath);
    this.cache = new Cache(basePath, baseURI);
}

CachedLocator.prototype.locateRange = function(record, buffer, offset, length, position, callback) {
    var response = new EventEmitter();
    callback(response);
    // console.log("checking cache");
    var self = this;
    this.cache.locate(record, function(res) {
        res.on('error', function(e) {
            // console.log("error in cache");
            response.emit('error', e);
        }).on('end', function() {
            // console.log("delegating to file locator");
            self.fileLocator.locateRange(record, buffer, offset, length, position, callback);
        });
    });    
};

CachedLocator.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);
    // console.log("checking cache");
    var self = this;
    this.cache.locate(record, function(res) {
        res.on('error', function(e) {
            // console.log("error in cache");
            response.emit('error', e);
        }).on('end', function() {
            // console.log("delegating to file locator");
            self.fileLocator.locate(record, callback);
        });
    });
};

module.exports.CachedLocator = CachedLocator;