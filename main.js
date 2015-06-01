"use strict";

var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var WFDB = require('./wfdb.js');

var fs = require('fs');
var http = require('http');

//var MongoClient = require('mongodb').MongoClient;

//var url = 'mongodb://localhost:27017';

var wfdb = new WFDB(new WFDB.CachedLocator(fs, 'data/', http, 'http://physionet.org/physiobank/database/'));


wfdb.readData(record, function(res) {
	res.on('info', function(info) {
		console.log(info);
	}).on('data', function(sequence, data) {
		console.log(sequence+"\t"+data.join("\t"));
	}).on('error', function(err) {
		console.log(err);
	}).on('end', function() {
		// All Done
	});
});

// MongoClient.connect(url, function(err, db) {
// 	if(err) {
// 		console.log(err);
// 	} else {
// 		var _info;
// 		wfdb.readData(record)
//  		.once('info', function(info) {
// 			_info = info;
//   		}).on('data', function(sequence, data) {
// 			console.log(sequence+"\t"+data.join("\t"));
// 			for(var i = 0; i < data.length; i++) {
// 				db.collection('wfdb').update({
// 					_id: {
// 						"record": record,
// 						"signal_id": i,
// 						"sequence": sequence
// 					}
// 				}, {value: data[i]}, {upsert: true});
// 			}
//   		}).on('error', function(err) {
//   			console.log(err);
//   			db.close();
//   		}).on('end', function() {
//   			db.close();
//   		});
// 	}	
// });

//var wfdb = new WFDB(WFDB.cachedLocator(fs, 'data/', http, 'http://physionet.org/physiobank/database/'));

// var wfdb = new WFDB(WFDB.fileLocator(fs));
// var wfdb = new WFDB(WFDB.httpLocator(http, 'http://physionet.org/physiobank/database/mghdb/'));



// 