"use strict";
var stream = require('stream');

var util = require('util');

function DataTransform(opts) {
    // allow use without new
    if (!(this instanceof DataTransform)) {
        return new DataTransform(opts);
    }
    opts = opts || {};
    opts.readableObjectMode = true;
    opts.objectMode = true; // for backward compatibility

    stream.Transform.call(this, opts);
    this.header = opts.header;
    this.wfdb   = opts.wfdb;
    this.signal_count = opts.signal_count;
    this.rows = [];
    this.residual = null;
};
util.inherits(DataTransform, stream.Transform);

DataTransform.prototype._transform = function(chunk, enc, next) {
    // If there is residual then combine it with this chunk
    if(this.residual) {
        chunk = Buffer.concat([this.residual, chunk]);
        delete this.residual;
    }

    var length = chunk.length;
    length -= length % this.header.total_bytes_per_frame;
    length -= this.header.max_skew ? (this.header.max_skew * this.header.total_bytes_per_frame) : 0;

    if(length > 0) {
        if(length < chunk.length) {
            // Store the residual bytes from this chunk
            this.residual = new Buffer(chunk.length - length);
            chunk.copy(this.residual, 0, length, chunk.length);
            // Reference the chunk containing a whole number of frames
            //chunk = chunk.slice(0, length);
        }

        this.processFrames(0, this.header, chunk, length);

    } else {
        this.residual = chunk;
    }
    next();
};

DataTransform.prototype._flush = function(next) {
    if(this.residual) {
        if(this.residual.length > 0) {
            this.processFrames(0, this.header, this.residual, this.residual.length);
        }
        delete this.residual;
    }
    next();
};

// Use this in your own pipelines with your own Readable
exports.DataTransform = DataTransform;

DataTransform.prototype.processFrames = function(base_sample_number, header, data, length) {
    //var time_interval = 1000.0 / header.sampling_frequency;
    // Go through the data frame by frame
    //console.log("TTL:"+total_bytes_per_frame);
    
    // var batchdata = [];
    // batchdata.length = 0;
    // console.log("processFrames", length, data.length);

    if(length < header.total_bytes_per_frame) {
        console.warn("Incomplete frame expected %d and got %d bytes", header.total_bytes_per_frame, length);
        return;
    }

    for(var i = 0; i < length; i+=header.total_bytes_per_frame) {
        // console.log("NEW FRAME");
        this.rows.length = 0;
        // var rows = [];
        // Each frame will contain 
        var signalBase = i;
        for(var j = 0; j < header.signals.length; j++) {
            for(var k = 0; k < header.signals[j].samples_per_frame; k++) {
                var adc;
                // This skew handling is primitive
                var skewedSignalBase = signalBase + header.signals[j].skew * header.total_bytes_per_frame;
                switch(header.signals[j].format) {
                    case 212:
                        // Using this byte and part of the next (or vice versa)
                        // so we need an extra byte
                        if(skewedSignalBase>=(data.length-1)) {
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
                        if(skewedSignalBase>=data.length) {
                            adc = Math.NaN;
                        } else {
                            adc = data.readUInt8(skewedSignalBase);
                        }
                        adc -= 128;
                        signalBase += 1;
                        break;
                    case 16:
                        if(skewedSignalBase>=(data.length-1)) {
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
                    while(row_num>=this.rows.length) {
                        var arr = [];
                        arr.length = this.signal_count;
                        this.rows.push(arr);
                    }
                    if(header.signals[j].index >= this.rows[row_num].length) {
                        console.error("Invalid Signal index", header.signals[j].index, this.rows[row_num].length);
                        // console.error(header);
                    }
                    this.rows[row_num][header.signals[j].index] = value;
                }

            }
            // frame.push(Math.round(value*1000)/1000); 
            // frame.push(adc);                 
            
        }

        for(var t = 0; t < this.rows.length; t++) {
            // var time =  Math.floor(e/3600000)+":"+
            //             Math.floor(e%3600000/60000)+":"+
            //             Math.floor(e%60000/1000)+"."+
            //             Math.floor(e%1000);
            // console.log("EMIT DATA SAMPLE");
            // var sample_number = base_sample_number + i / header.total_bytes_per_frame;
            // console.log("push", this.rows[t]);
            this.push(this.rows[t]);
            // response.emit('data', sample_number, rows[t]);
            // batchdata.push({'sample_number': sample_number, 'data': rows[t]});
                //(i/header.total_bytes_per_frame*header.highest_samples_per_frame+t),rows[t]);
        }
    }
    // response.emit('batch', batchdata);
}

function readData(wfdb, header) {
    if(header.number_of_segments) {
        // A pipe through which we will send results from the many segment files
        var pipe = new stream.PassThrough({
            readableObjectMode: true,
            writableObjectMode: true,
            objectMode: true // for backward compatibility
        });

        var segments = [];
        for(var i = 0; i < header.segments.length; i++) {
            
            if(header.segments[i].name != '~' && header.segments[i].number_of_samples_per_signal>0) {
                segments.push(header.segments[i]);
            }
        }
        var readSegment = function() {
            if(segments.length==0) {
                pipe.end();
            } else {
                var seg_header = segments.shift().header;
                wfdb.locator.locate(seg_header.record+'.dat', {highWaterMark:wfdb.highWaterMark})
                .on('error', function(err) { pipe.emit('error', err); })
                .pipe(DataTransform({'wfdb': wfdb, 'header': seg_header, signal_count: header.signals.length}))
                .on('end', function() {
                    readSegment();
                })
                .pipe(pipe, {end: false});
            }
        };
        readSegment();

        return pipe;
    } else {
        var pipe = DataTransform({'wfdb': wfdb, 'header': header, signal_count: header.signals.length});

        if(!header.signals || !header.signals.length) {
            pipe.emit('error', "NO SIGNALS");
            return pipe;
        }        
        // TODO highWaterMark might be set to a multiple of the frame size
        return wfdb.locator.locate(header.file_name, {highWaterMark:wfdb.highWaterMark})
        .on('error', function(err) { pipe.emit('error', err); })
        .pipe(pipe);
        return pipe;
    }
}

function readFrames(wfdb, header, start, end) {
    if(header.number_of_segments) {
        // A pipe through which we will send results from the many segment files
        var pipe = new stream.PassThrough({
            readableObjectMode: true,
            writableObjectMode: true,
            objectMode: true // for backward compatibility
        });

        var segments = [];
        for(var i = 0; i < header.segments.length; i++) {
            // Is there any data at all in this segment
            if(header.segments[i].name != '~' && header.segments[i].number_of_samples_per_signal>0) {
                // Is any of the data in this segment that is in the overall range?
                segments.push(header.segments[i]);
            }
        }
        var readSegment = function() {
            if(segments.length==0) {
                pipe.end();
            } else {
                var seg_header = segments.shift().header;
                // Does this segment overlap the requested range?
                if(seg_header.end > start || seg_header.start < end) {
                    var realStart = start;
                    var realEnd = end;
                    // If this segment starts before the requested range
                    if(seg_header.start < realStart) {
                        // data.splice(0, (realStart - header.start));
                    // If this segment starts AFTER the requested range then promote the range start
                    } else if(seg_header.start > realStart) {
                        realStart = seg_header.start;
                    }
                    if(seg_header.end > realEnd) {
                        //data.splice(data.length-(header.end-realEnd), (header.end-realEnd));
                    } else if(seg_header.end < realEnd) {
                        realEnd = seg_header.end;
                    }
                    // TODO this check should be "above" here to eliminate segments not relevant to the requested range
                    if(realEnd>realStart) {
                        var startBytes = (realStart-seg_header.start)*seg_header.total_bytes_per_frame;
                        var endBytes = startBytes + seg_header.total_bytes_per_frame*(realEnd-realStart);

                        wfdb.locator.locateRange(seg_header.record+'.dat', 
                            startBytes, 
                            endBytes-1, // we are exclusive but locateRange is inclusive
                            {highWaterMark:wfdb.highWaterMark})
                        .on('error', function(err) { pipe.emit('error', err); })
                        .pipe(DataTransform({'wfdb': wfdb, 'header': seg_header, signal_count: header.signals.length}))
                        .on('end', function() {
                            readSegment();
                        })
                        .pipe(pipe, {end: false});

                    } else {
                        // Chain past this irrelevant segment in case, again this should have already been filtered at this point
                        readSegment();
                    }
                }
            }
        };
        readSegment();
        return pipe;
    } else {

        // I don't know what to do with this right now .. should emit error through the pipeline
        if(!header.signals || !header.signals.length) {
            console.log(header, "NO SIGNALS");
            return null;
        }        


        var startBytes = start*header.total_bytes_per_frame;
        var endBytes = startBytes + header.total_bytes_per_frame*(end-start);

        return wfdb.locator.locateRange(header.record+'.dat', 
            startBytes,
            endBytes-1, // we are exclusive but locateRange is inclusive
            {highWaterMark:wfdb.highWaterMark})
        .on('error', function(err) { pipe.emit('error', err); })
        .pipe(DataTransform({'wfdb': wfdb, 'header': header, signal_count: header.signals.length}));
    }
};


// use this to assemble a pipeline from a locator
exports.readData = readData;
exports.readFrames = readFrames;

