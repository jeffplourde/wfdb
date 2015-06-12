"use strict";

// A record here is a fully qualified physiobank pathname of the form
// database/record such as mghdb/mgh001
var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var WFDB = require('./wfdb.js');

// A Locator can be any object with a locate(record, callback) method.
// The callback takes a single argument which is an EventEmitter that emits
// either 'error' or 'data' as an error occurs or records are located.
// The builtin CachedLocator retrieves data from Physiobank; using the local
// file system for caching.
var locator = new WFDB.CachedLocator('data/', 'http://physionet.org/physiobank/database/');


var wfdb = new WFDB(locator);

var playback = new WFDB.Playback(wfdb);

playback.playFromFile(record, {activeWindowMs: 10000, loop:true,
	startTime: 3800000}, function(res) {
	res.on('samples', function(samples) {
		for(var d in samples) {
			for(var i = 0; i < samples[d].length; i++) {
				console.log("Sample", d, samples[d][i]);
			}
		}
	}).on('deletes', function(signal, todeletes) {
		for(var d in todeletes) {
			for(var i = 0; i < todeletes[d].length; i++) {
				console.log("Delete", d, todeletes[d][i]);
			}
		}
	})
});


// wfdb.readHeaderAndData(record, function(res) {
//     res.on('header', function(header) {
//     	console.log(header);
//     }).on('data', function(sequence, data) {
//         console.log(sequence+"\t"+data.join("\t"));	
//     }).on('error', function(err) {
// 		console.log(err);
// 	}).on('end', function() {
// 		// All done
// 	});
// });




