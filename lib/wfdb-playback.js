"use strict";

var EventEmitter = require('events').EventEmitter;

function Playback(wfdb) {
    this.wfdb = wfdb;
}



function playdata(record, header, dataSource, options, response) {
    var active = [];
    var interval;
        
    // This will be the time at sample index 0
    var zeroTime = Date.now();
    zeroTime += 1000 - (zeroTime % 1000);
    var lastTime = zeroTime;

    // push the zero point back so we are really starting at startTime
    zeroTime -= options.startTime;

    var timeIntervalMS = 1/header.sampling_frequency*1000;
    timeIntervalMS = timeIntervalMS > 1000 ? timeIntervalMS : 1000;

    // TODO This is not great
    var currentIndex = (options.startTime)/1000*header.sampling_frequency;    

    var intervalFunction = function() {

        // publish all the samples since the previous so first convert to index space
        var currentTime = Date.now();
        var lastIndex = ((currentTime - zeroTime) * header.sampling_frequency / 1000) | 0;
        var firstIndex = ((lastTime - zeroTime) * header.sampling_frequency / 1000) | 0;

        if(firstIndex < 0 || lastIndex < 0) {
            return;
        }

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

        if(EventEmitter.listenerCount(response, 'sample')>0 ||
           EventEmitter.listenerCount(response, 'samples')>0 ||
           EventEmitter.listenerCount(response, 'delete')>0 ) {

            dataSource.range(firstIndex, lastIndex, function(data) {
                var sample_number = currentIndex++;
                var tm = Math.floor(zeroTime + 1000 * sample_number / header.sampling_frequency);
                active.push(tm);
                for(var s = 0; s < header.signals.length; s++) {
                    var descriptor = record+'/'+header.signals[s].description;
                    var sample = {"tm":tm, val:data[s]};  
                    response.emit('sample', descriptor, sample);               
                }
                while(active.length>0&&(currentTime-active[0])>=options.activeWindowMs) {
                    var tm = active.shift();
                    for(var s = 0; s < header.signals.length; s++) {
                        var descriptor = record+'/'+header.signals[s].description;
                        response.emit('delete', descriptor, tm);                
                    }
                }
            });
        } else {
            //console.log("no listeners, nothing to do");
        }
        lastTime = currentTime;
    };
    intervalFunction();
    interval = setInterval(intervalFunction, timeIntervalMS);
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
        var dataSource = {
            range: function(firstIndex, lastIndex, callback) {
                for(var i = firstIndex; i < lastIndex; i++) {
                    callback(alldata.samples[i]);
                }
            }
        };
        playdata(record, alldata['header'], dataSource, options, response);
    })
    .on('data', function(data) {
        alldata.samples.push(data);
    });
};

Playback.prototype.playFromFile = function(record, options, callback) {
    var response = new EventEmitter();

    callback(response);

    options.activeWindowMs = options.activeWindowMs || 10000;
    options.loop = options.loop || false;
    options.startTime = options.startTime || 0;
    var self = this;
    var header;
    var dataSource = {
        range: function(firstIndex, lastIndex, callback) {
            self.wfdb.readFrames(header, firstIndex, lastIndex)
            .on('error', function(err) { console.error(err); })
            .once('end', function() {
            })
            .on('data', function(data) {
                callback(data);
            });
        }
    };
    this.wfdb.readHeader(record)
    .on('error', function(err) { response.emit('error', err); })
    .on('end', function() { 
        playdata(record, header, dataSource, options, response); })
    .on('data', function(h) { 
        header = h;
        response.emit('header', h);
    });
};

module.exports = exports = Playback;

