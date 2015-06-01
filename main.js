"use strict";

// A record here is a fully qualified physiobank pathname of the form
// database/record such as mghdb/mgh001
var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var WFDB = require('./wfdb.js');
var bson = require("bson");
var BSON = bson.BSONPure.BSON;

// A Locator can be any object with a locate(record, callback) method.
// The callback takes a single argument which is an EventEmitter that emits
// either 'error' or 'data' as an error occurs or records are located.
// The builtin CachedLocator retrieves data from Physiobank; using the local
// file system for caching.
var locator = new WFDB.CachedLocator('data/', 'http://physionet.org/physiobank/database/');


var wfdb = new WFDB(locator);

// var alldata = [];

// var MongoClient = require('mongodb').MongoClient;

// MongoClient.connect('mongodb://localhost:27017/wfdb', function(err, db) {
    // if(err) { throw err; }
    // var foo = db.collection('foo');
    wfdb.readData(record, function(res) {
        res.on('info', function(info) {
            console.log(info);
        }).on('data', function(sequence, data) {
            console.log(sequence+"\t"+data.join("\t"));
        }).on('error', function(err) {
            console.log(err);
        }).on('end', function() {
            // foo.update({"_id":record}, alldata, {upsert:true}, function(err, doc) {
            //     if(err) {
            //         console.log(err);
            //     }
            //     db.close();
            // });
            // console.log("There are " + alldata.length + " samples across " + alldata[0].length + " signals");
            // var bs = BSON.serialize({"alldata":alldata}, false, true, false);
            // console.log("All the data as BSON:"+bs.length);
            // All Done
        });
    }); 
// });



