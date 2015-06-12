"use strict";
var EventEmitter = require('events').EventEmitter;

function processFrames(elapsed_ms, header, data, length, response) {
    var time_interval = 1000.0 / header.sampling_frequency;
    // console.log("processFrames", elapsed_ms, data.length);
    // Go through the data frame by frame
    //console.log("TTL:"+total_bytes_per_frame);
    
    var batchdata = [];

    for(var i = 0; i < length; i+=header.total_bytes_per_frame) {
        // console.log("NEW FRAME");
        var rows = [];
        // Each frame will contain 
        var signalBase = i;
        for(var j = 0; j < header.signals.length; j++) {
            for(var k = 0; k < header.signals[j].samples_per_frame; k++) {
                var adc;
                // This skew handling is primitive
                var skewedSignalBase = signalBase + header.signals[j].skew * header.total_bytes_per_frame;
                switch(header.signals[j].format) {
                    case 212:
                        if(skewedSignalBase>=length) {
                            adc = Math.NaN;
                        } else {
                            // integer 
                            if((skewedSignalBase | 0) === skewedSignalBase) {
                                adc = ((data.readUInt8(skewedSignalBase+1)&0x0F)<<8) + data.readUInt8(skewedSignalBase);
                            } else {
                                adc = ((data.readUInt8(skewedSignalBase|0)&0xF0)<<4) + data.readUInt8((skewedSignalBase|0)+1);
                            }
                            var sign = 0 != (0x800&adc) ? -1 : 1;
                            if(sign < 0) {
                                adc = ~adc + 1;
                            }
                            // Is there a case where this is necessary?
                            // adc &= signals[j].mask;

                            adc &= 0x7FF;
                            adc *= sign;                                            
                        }

                        signalBase += 1.5;
                        break;
                    case 16:
                        if(skewedSignalBase>=length) {
                            adc = Math.NaN;
                        } else {
                            adc = data.readInt16LE(skewedSignalBase);
                        }
                        signalBase += 2;
                        break;
                    default:
                        console.log("Unknown format " + header.signals[j].format);
                        break;
                }
                var value = (adc - header.signals[j].baseline) / header.signals[j].adc_gain;
                // Repeat the value (upsample) 
                var upsample_rate = header.highest_samples_per_frame / header.signals[j].samples_per_frame;
                //console.log(signals[j].description + " upsample at " + upsample_rate + " highest " + highest_samples_per_frame + " this " + signals[j].samples_per_frame);
                for(var l = 0; l < upsample_rate; l++) {
                    var row_num = k * upsample_rate + l;
                    while(row_num>=rows.length) {
                        rows.push([]);
                    }
                    rows[row_num].push(value);
                }

            }
            // frame.push(Math.round(value*1000)/1000); 
            // frame.push(adc);                 
            
        }

        for(var t = 0; t < rows.length; t++) {
            // var e = elapsed_ms + time_interval / header.highest_samples_per_frame;
            // var time =  Math.floor(e/3600000)+":"+
            //             Math.floor(e%3600000/60000)+":"+
            //             Math.floor(e%60000/1000)+"."+
            //             Math.floor(e%1000);
            // console.log("EMIT DATA SAMPLE");
            response.emit('data', elapsed_ms, rows[t]);
            batchdata.push({'elapsed_ms': elapsed_ms, 'data': rows[t]});
                //(i/header.total_bytes_per_frame*header.highest_samples_per_frame+t),rows[t]);
        }

        elapsed_ms += time_interval;

    }
    response.emit('batch', batchdata);
    return elapsed_ms;
}


exports.readFrames = function(wfdb, header, start, end, callback) {
    var response = new EventEmitter();
    callback(response);
    if(header.signals.length == 0) {
        response.emit('end');
        return;
    }
    var data = new Buffer(header.total_bytes_per_frame*(end-start));
    var elapsed_ms = start / header.sampling_frequency * 1000;

    wfdb.locator.locateRange(header.record+'.dat', data, 0, data.length, start*header.total_bytes_per_frame, function(res) {
        res.once('error', function(err) { response.emit('error', err); })
       .on('data', function(bytesRead, data) {
            // console.log("See data, calling processFrames");
            elapsed_ms = processFrames(elapsed_ms, header, data, bytesRead, response);
            response.emit('end');
        });
    });
};

exports.readEntireRecord = function(wfdb, header, callback) {
    var response = new EventEmitter();
    callback(response);
    if(header.signals.length == 0) {
        response.emit('end');
        return;
    }
    wfdb.locator.locate(header.record+'.dat', function(res) {
        res.once('error', function(err) { response.emit('error', err); })
       .on('data', function(data) {
            processFrames(0, header, data, data.length, response);
            response.emit('end');
        });
    });
};
