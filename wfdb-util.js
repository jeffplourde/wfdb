"use strict";
var EventEmitter = require('events').EventEmitter;

exports.dblist = function(wfdb, callback) {
    var response = new EventEmitter();
    callback(response);
    wfdb.locator.locate('DBS', function(res) {
        res.once('error', function(err) { response.emit('error', err); })
        .on('data', function(data) {
            var lines = data.toString('ascii').split("\n");
            var re = /^(.+)\t+(.+)\w*$/;
            var dbs = {};
            for(var i = 0; i < lines.length; i++) {
                var m = lines[i].match(re);
                if(m) {
                    dbs[m[0]] = m[1];
                }
            }
            response.emit('dblist', dbs);
        });
    });
};

exports.rlist = function(wfdb, database, callback) {
    var response = new EventEmitter();
    callback(response);
    wfdb.locator.locate(database+'/RECORDS', function(res) {
        res.once('error', function(err) { response.emit('error', err); })
        .on('data', function(data) {
            var lines = data.toString('ascii').split("\n");
            var re = /^(.+)\w*$/;
            var recs = [];
            for(var i = 0; i < lines.length; i++) {
                var m = lines[i].match(re);
                if(m) {
                    recs.push(m[0]);
                }
            }
            response.emit('rlist', recs);
        });
    });
};