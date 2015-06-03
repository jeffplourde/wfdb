"use strict";

var EventEmitter = require('events').EventEmitter;

function Playback(wfdb) {
    this.wfdb = wfdb;
}

function playdata(record, alldata, options, response) {
    var emitters = {};
    var emittersByOrdinal = [];

    for(var i = 0; i < alldata.header.signals.length; i++) {
        var ee = new EventEmitter();
        emitters[record+'/'+alldata.header.signals[i].description] = ee;
        emittersByOrdinal.push(ee);
        ee.active = [];
    }
        
        // // This will be the time at sample 0
    var zeroTime = Date.now();
    zeroTime += 1000 - (zeroTime % 1000);
    var lastTime = zeroTime;
    // push the zero point back so we are really starting at startTime
    zeroTime -= options.startTime;
    

    var interval = setInterval(function() {

        // publish all the samples since the previous so first convert to index space
        var currentTime = Date.now();
        var lastIndex = ((currentTime - zeroTime) * alldata.header.sampling_frequency / 1000) | 0;
        var firstIndex = ((lastTime - zeroTime) * alldata.header.sampling_frequency / 1000) | 0;

        console.log(zeroTime, lastTime, firstIndex, lastIndex, alldata.samples.length);

        // awkward
        if(lastIndex>=alldata.samples.length) {

            if(options.loop) { 
                zeroTime = Date.now();
                zeroTime += 1000 - (zeroTime % 1000);
                lastTime = zeroTime;
                zeroTime -= options.startTime;
                return;
            } else {
                clearInterval(interval);
                return;
            }
            return;
        }

        // console.log("emit " + firstIndex + " to " + lastIndex);
        for(var s = 0; s < alldata.header.signals.length; s++) {
            var ee = emittersByOrdinal[s];
            for(var i = firstIndex; i < lastIndex; i++) {
                // console.log(i + "   " + alldata.samples[i]);
                var tm = Math.floor(zeroTime+1000/alldata.header.sampling_frequency*i);
                // console.log("add tm="+tm+" zeroTime="+zeroTime+" sf="+alldata.header.sampling_frequency+" i="+i);
                ee.active.push(tm);
                response.emit('sample', record+'/'+alldata.header.signals[s].description, {"tm":tm, val:alldata.samples[i][s]});
            }
            while(ee.active.length>0&&(currentTime-ee.active[0])>=options.activeWindowMs) {
                var tm = ee.active.shift();
                response.emit('delete', record+'/'+alldata.header.signals[s].description, tm);
            }
        }

        lastTime = currentTime;
    }, 1000);
}

Playback.prototype.play = function(record, options, callback) {
    var response = new EventEmitter();

    callback(response);

    options.activeWindowMs = options.activeWindowMs || 10000;
    options.loop = options.loop || false;
    options.startTime = options.startTime || 0;

    var alldata = {samples: []};

    this.wfdb.readHeaderAndData(record, function(res) {
        res.on('header', function(header) {
            alldata['header'] = header;
        }).on('data', function(sequence, data) {
            alldata.samples.push(data);
        }).on('error', function(err) {
            response.emit('error', err);
        }).on('end', function() {
            playdata(record, alldata, options, response);
        });
    });     
};

module.exports = exports = Playback;

