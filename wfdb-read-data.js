"use strict";
var EventEmitter = require('events').EventEmitter;

function processFrames(base_sample_number, header, data, length, signal_count, response) {
    //var time_interval = 1000.0 / header.sampling_frequency;
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
                    case 80:
                        // console.log(skewedSignalBase);
                        if(skewedSignalBase>=length) {
                            adc = Math.NaN;
                        } else {
                            adc = data.readUInt8(skewedSignalBase);
                        }
                        adc -= 128;
                        signalBase += 1;
                        break;
                    case 16:
                        if(skewedSignalBase>=length) {
                            adc = Math.NaN;
                        } else {
                            adc = data.readInt16LE(skewedSignalBase);
                        }

                        if(adc == -1 << 15) {
                            // WFDB calls this value VFILL
                            adc = null;
                        }
                        signalBase += 2;
                        break;
                    default:
                        console.log("Unknown format " + header.signals[j].format);
                        break;
                }
                var value = null == adc ? null : ((adc - header.signals[j].baseline) / header.signals[j].adc_gain);
                // Repeat the value (upsample) 
                var upsample_rate = header.highest_samples_per_frame / header.signals[j].samples_per_frame;
                //console.log(signals[j].description + " upsample at " + upsample_rate + " highest " + highest_samples_per_frame + " this " + signals[j].samples_per_frame);
                for(var l = 0; l < upsample_rate; l++) {
                    var row_num = k * upsample_rate + l;
                    while(row_num>=rows.length) {
                        var arr = [];
                        arr.length = signal_count;
                        rows.push(arr);
                    }
                    rows[row_num][header.signals[j].index] = value;
                }

            }
            // frame.push(Math.round(value*1000)/1000); 
            // frame.push(adc);                 
            
        }

        for(var t = 0; t < rows.length; t++) {
            // var time =  Math.floor(e/3600000)+":"+
            //             Math.floor(e%3600000/60000)+":"+
            //             Math.floor(e%60000/1000)+"."+
            //             Math.floor(e%1000);
            // console.log("EMIT DATA SAMPLE");
            var sample_number = base_sample_number + i / header.total_bytes_per_frame;
            response.emit('data', sample_number, rows[t]);
            batchdata.push({'sample_number': sample_number, 'data': rows[t]});
                //(i/header.total_bytes_per_frame*header.highest_samples_per_frame+t),rows[t]);
        }
    }
    response.emit('batch', batchdata);
}


exports.readFrames = function(wfdb, header, start, end, callback) {
    var response = new EventEmitter();
    callback(response);

    if(header.number_of_segments) {

        // THIS PART ISN'T DONE
       

        var index = 0;
        var segments = [];
        for(var i = 0; i < header.segments.length; i++) {
            // Is there any data at all in this segment
            if(header.segments[i].name != '~' && header.segments[i].number_of_samples_per_signal>0) {
                // Is any of the data in this segment that is in the overall range?
                header.segments[i].header.start = index;
                header.segments[i].header.end = index + header.segments[i].number_of_samples_per_signal;
                segments.push(header.segments[i]);
            }
            index += header.segments[i].number_of_samples_per_signal;
        }
        var readSegment = function() {
            if(segments.length==0) {
                response.emit('end');
            } else {
                var header = segments.shift().header;
                // Does this segment overlap the requested range?
                if(header.end > start || header.start < end) {
                    var realStart = start;
                    var realEnd = end;
                    // If this segment starts before the requested range
                    if(header.start < realStart) {
                        // data.splice(0, (realStart - header.start));
                    // If this segment starts AFTER the requested range then promote the range start
                    } else if(header.start > realStart) {
                        realStart = header.start;
                    }
                    if(header.end > realEnd) {
                        //data.splice(data.length-(header.end-realEnd), (header.end-realEnd));
                    } else if(header.end < realEnd) {
                        realEnd = header.end;
                    }
                    // TODO this check should be "above" here to eliminate segments not relevant to the requested range
                    if(realEnd>realStart) {
                        var data = new Buffer(header.total_bytes_per_frame*(realEnd-realStart));

                        wfdb.locator.locateRange(header.record+'.dat', data, 0, data.length, (realStart-header.start)*header.total_bytes_per_frame,  function(res) {
                            res.once('error', function(err) { response.emit('error', err); })
                           .on('data', function(bytesRead, data) {
                                processFrames(realStart, header, data, bytesRead, header.signals.length, response);
                                readSegment();
                            });
                        });
                    } else {
                        // Chain past this irrelevant segment in case, again this should have already been filtered at this point
                        readSegment();
                    }
                }
            }
        };
        readSegment();
    } else {
        if(header.signals.length == 0) {
            response.emit('end');
            return;
        }
        var data = new Buffer(header.total_bytes_per_frame*(end-start));

        wfdb.locator.locateRange(header.record+'.dat', data, 0, data.length, start*header.total_bytes_per_frame, function(res) {
            res.once('error', function(err) { response.emit('error', err); })
           .on('data', function(bytesRead, data) {
                processFrames(start, header, data, bytesRead, header.signals.length, response);
                response.emit('end');
            });
        });
    }
};

exports.readEntireRecord = function(wfdb, header, callback) {
    var response = new EventEmitter();
    callback(response);

    if(header.number_of_segments) {
        var index = 0;
        var segments = [];
        for(var i = 0; i < header.segments.length; i++) {
            
            if(header.segments[i].name != '~' && header.segments[i].number_of_samples_per_signal>0) {
                header.segments[i].header.start = index;
                segments.push(header.segments[i]);
            }
            index += header.segments[i].number_of_samples_per_signal;
        }
        var readSegment = function() {
            if(segments.length==0) {
                response.emit('end');
            } else {
                var header = segments.shift().header;
                wfdb.locator.locate(header.record+'.dat', function(res) {
                    res.once('error', function(err) { response.emit('error', err); })
                   .on('data', function(data) {
                        processFrames(header.start, header, data, data.length, header.signals.length, response);
                        readSegment();
                    });
                });
            }
        };
        readSegment();
    } else {
        if(header.signals.length == 0) {
            response.emit('end');
            return;
        }        
        wfdb.locator.locate(header.record+'.dat', function(res) {
            res.once('error', function(err) { response.emit('error', err); })
           .on('data', function(data) {
                processFrames(0, header, data, data.length, header.signals.length, response);
                response.emit('end');
            });
        });
    }
};
