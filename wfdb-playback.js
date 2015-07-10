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

        // console.log(zeroTime, lastTime, firstIndex, lastIndex, alldata.samples.length);

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

        if(EventEmitter.listenerCount(response, 'sample')>0 ||
           EventEmitter.listenerCount(response, 'delete')>0 ) {
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
        } else {
            //console.log("no listeners, nothing to do");
        }
        lastTime = currentTime;
    }, 1000);
}

Playback.prototype.playFromMemory = function(record, options, callback) {
    var response = new EventEmitter();

    callback(response);

    options.activeWindowMs = options.activeWindowMs || 10000;
    options.loop = options.loop || false;
    options.startTime = options.startTime || 0;

    var alldata = {samples: []};

    this.wfdb.readHeaderAndData(record)
    .on('header', function(header) { 
        alldata['header'] = header;
        response.emit('header', header);
    })
    .on('error', function(err) { 
        response.emit('error', err);
    })
    .on('end', function() { 
        playdata(record, alldata, options, response);
    })
    .on('data', function(data) {
        alldata.samples.push(data);
    });
};

function playdataFromFile(record, header, wfdb, options, response) {
    var emitters = {};
    var emittersByOrdinal = [];

    for(var i = 0; i < header.signals.length; i++) {
        var ee = new EventEmitter();
        emitters[record+'/'+header.signals[i].description] = ee;
        emittersByOrdinal.push(ee);
        ee.active = [];
    }
        
        // // This will be the time at sample 0
    var zeroTime = Date.now()-60000;
    zeroTime += 1000 - (zeroTime % 1000);
    var lastTime = zeroTime;
    // push the zero point back so we are really starting at startTime
    zeroTime -= options.startTime;

    var timeIntervalMS = 1/header.sampling_frequency*1000;
    timeIntervalMS = timeIntervalMS > 1000 ? timeIntervalMS : 1000;

    // TODO This is not great
    var currentIndex = (options.startTime+60000)/1000*header.sampling_frequency;

    var intervalFunction = function() {
        // console.log("INTERVaL");
        // publish all the samples since the previous so first convert to index space
        var currentTime = Date.now();
        var lastIndex = ((currentTime - zeroTime) * header.sampling_frequency / 1000) | 0;
        var firstIndex = ((lastTime - zeroTime) * header.sampling_frequency / 1000) | 0;

        // console.log(zeroTime, lastTime, firstIndex, lastIndex, alldata.samples.length);

        // awkward
        // console.log(header);
        // TODO THIS WILL FAIL WHERE SAMPLES PER FRAME IS NOT 1
        if(lastIndex>=header.number_of_samples_per_signal) {

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

        // console.log("CurrentTime"+currentTime);

        // console.log("emit ", currentTime, firstIndex, lastIndex);
        if((EventEmitter.listenerCount(response, 'samples')>0 ||
           EventEmitter.listenerCount(response, 'sample')>0) && 
           lastIndex>firstIndex) {

            var listener = function(data) {
                var sample_number = currentIndex++;

                var tm = zeroTime + 1000 * sample_number / header.sampling_frequency;
                // console.log(sample_number, tm, new Date(tm));

                for(var s = 0; s < header.signals.length; s++) {
                    var descriptor = record+'/'+header.signals[s].description
                    var ee = emittersByOrdinal[s];
                    if(typeof data[s] != 'undefined' && data[s] != null) {
                        ee.active.push(tm);
                        var sample = {"tm":tm, val:data[s]};
                        // console.log(descriptor, sample);
                        response.emit('sample', descriptor, sample);
                    }   
                    while(ee.active.length>0&&(currentTime-ee.active[0])>=options.activeWindowMs) {
                        // console.log(currentTime, ee.active[0]);
                        var tm = ee.active.shift();
                        response.emit('delete', descriptor, tm);
                    }
                }
            };      
            wfdb.readFrames(header, firstIndex, lastIndex)
            .on('error', function(err) { console.error(err); })
            .once('end', function() {
            })
            .on('data', listener)

        } else {
            //console.log("No listeners");
        }

        lastTime = currentTime;
    };

    intervalFunction();
    setInterval(intervalFunction, timeIntervalMS);
}

Playback.prototype.playFromFile = function(record, options, callback) {
    var response = new EventEmitter();

    callback(response);

    options.activeWindowMs = options.activeWindowMs || 10000;
    options.loop = options.loop || false;
    options.startTime = options.startTime || 0;
    var self = this;
    var header;
    this.wfdb.readHeader(record)
    .on('error', function(err) { response.emit('error', err); })
    .on('end', function() { playdataFromFile(record, header, self.wfdb, options, response); })
    .on('data', function(h) { 
        header = h;
        response.emit('header', h);
    });
};

module.exports = exports = Playback;

