"use strict";

var LineTransform = require('./wfdb-util').LineTransform;

var stream = require('stream');

var util = require('util');

var path = require('path');


function HeaderTransform(opts) {
    // allow use without new
    if (!(this instanceof HeaderTransform)) {
        return new HeaderTransform(opts);
    }
    opts = opts || {};
    opts.readableObjectMode = true;
    opts.objectMode = true; // for backward compatibility

    stream.Transform.call(this, opts);
    this.record = opts.record;
    this.wfdb   = opts.wfdb;
    this.segmentIndex = 0;
};
util.inherits(HeaderTransform, stream.Transform);

var COMMENTS = /^\s*#.*\s*$/;
var BLANK    = /^\s*$/;
var HEADER   = /^(\S+)(?:\/(\d+))?\s+(\d+)\s+([0-9e\-.]+)?(?:\/([0-9e\-.]+))?(?:\(([\d-.]+)\))?(?:\s+(\d+))?(?:\s+(\S+))?(?:\s+(\S+))?/;
var LAYOUT   = /^.+_layout$/;
var SIGNAL   = /^(\S+)\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?(?:[Ee]\d+)?)(?:x([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\:([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\(([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?)\))?(?:\/(\S+))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+(.+))?\r?$/;
var SEGMENT  = /^(\S+)\s+(\d+)/;

HeaderTransform.prototype.readHeader = function(data) {
    var header = HEADER.exec(data);
    if(!header) {
        return new Error("Cannot parse header descriptor: " + data);
    } else {

        this.header = {
            "record": this.record,
            name: header[1],
            number_of_segments: header[2]?+header[2]:header[2],
            number_of_signals: +header[3] || 0,
            sampling_frequency: +header[4] || 250,
            counter_frequency: +header[5] || 0,
            base_counter_value: +header[6] || 0,
            number_of_samples_per_signal: +header[7],
            base_time: header[8] || '0:0:0',
            base_date: header[9],
            signals: [],
            segments: [],
            total_bits_per_frame: 0,
            highest_adc_resolution: 0,
            highest_samples_per_frame: 0
        };
    } 
};

HeaderTransform.prototype.readSignal = function(data) {
    var arr = SIGNAL.exec(data);
    if(!arr) {
        console.log("Cannot parse signal descriptor: " + data);
        return new Error("Cannot parse signal descriptor: " + data);
    } else {
        var signal = 
            {
                file_name: arr[1],  
                format: arr[2] | 0,
                samples_per_frame: (arr[3] | 0) || 1,
                skew: arr[4] || 0,
                byte_offset: arr[5] || 0,
                adc_gain: parseFloat(arr[6]) || this.wfdb.DEFGAIN,
                baseline: parseFloat(arr[7]) || parseFloat(arr[10]) || 0,
                units: arr[8] || "",
                adc_resolution: (arr[9] | 0) || 12, // covers only amplitude formats
                adc_zero: parseFloat(arr[10]) || 0,
                initial_value: arr[11] || arr[6] || 200,
                checksum: arr[12] || 0,
                block_size: arr[13] || 0,
                description: arr[14] || "",
                index: this.header.signals.length
            };

        signal.mask = 0;
        for(var j = 0; j < signal.adc_resolution; j++) {
            signal.mask |= 1 << j;
        }
        this.header.signals.push(signal);
        if(signal.skew) {
            this.header.max_skew = Math.max(this.header.max_skew || 0, signal.skew);
        }

        if(undefined===this.wfdb.accepted_formats[signal.format]) {
            var discarded = this.header.signals.pop();
            console.log("Cannot decode format " + discarded.format + " for " + discarded.description);
        } else {
            signal.bits_per_frame = this.wfdb.accepted_formats[signal.format] * signal.samples_per_frame;
            this.header.total_bits_per_frame += signal.bits_per_frame;
            if(signal.adc_resolution>this.header.highest_adc_resolution) {
                this.header.highest_adc_resolution = signal.adc_resolution;
            }
            if(signal.samples_per_frame>this.header.highest_samples_per_frame) {
                this.header.highest_samples_per_frame = signal.samples_per_frame;
            }
        }
    }
};

HeaderTransform.prototype.readSegment = function(data, next) {
    var base = this.header.record.split("/");
    base.pop();
    base = base.join("/");

    var arr = SEGMENT.exec(data);
    if(!arr) {
        next(new Error('Cannot parse segment descriptor: ' + data));
    } else {
        var segment = 
            {
                name: arr[1],
                number_of_samples_per_signal: +arr[2]
            };
        var self = this;

        if(!segment.name.match(LAYOUT)) {
            this.header.segments.push(segment);
        }
        if(segment.name != '~') {
            readHeader(this.wfdb, base+'/'+segment.name)
            .on('error', 
                function(err) { console.error(err, segment.name); next(err); })
            .on('end',
                function() { self.segmentIndex += segment.number_of_samples_per_signal; next(); })
            .on('data', function(header) {
                segment.header = header;

                if(segment.header.number_of_samples_per_signal>0) {
                    segment.header.start = self.segmentIndex;
                    segment.header.end = self.segmentIndex + segment.number_of_samples_per_signal;
                }
                // TODO this is a little hacky for now importing layout signals to the top level
                if(segment.name.match(LAYOUT)) {
                    self.header.signals = segment.header.signals;
                    self.header.signalIndex = {};
                    for(var i = 0; i < self.header.signals.length; i++) {
                        self.header.signalIndex[self.header.signals[i].description] = i;
                    }
                } else {                                
                    // This is also hacky to allow signals to occupy the same position in data arrays regardless of their position in the segment
                    // Further we are assuming that the "layout" file is the first segment to be processed
                    for(var i = 0; i < segment.header.signals.length; i++) {
                        segment.header.signals[i].index = self.header.signalIndex[segment.header.signals[i].description];
                    }
                }
            });                        
        } else {
            self.segmentIndex += segment.number_of_samples_per_signal;
            next();
        }

    }
};

HeaderTransform.prototype._transform = function(chunk, enc, next) {
    var data = chunk.toString('ascii');

    // Comment lines
    if(data.match(COMMENTS)) {
        next();
    // Blank lines
    } else if(data.match(BLANK)) {
        next();
    } else if(!this.header) {
        next(this.readHeader(data));
    } else if(this.header.number_of_segments) {
        this.readSegment(data, next);
    } else {
        next(this.readSignal(data));
    }
};

HeaderTransform.prototype._flush = function(next) {
    if(!this.header.number_of_segments) {
        // If not segments then calculate total_bytes_per_frame at the top level
        this.header.total_bytes_per_frame = this.header.total_bits_per_frame / 8;

        var file_name = null;

        for(var i = 0; i < this.header.signals.length; i++) {
            if(null == file_name) {
                file_name = this.header.signals[i].file_name;
            } else {
                if(file_name != this.header.signals[i].file_name) {
                    this.emit('error', "cannot support mixed data file names");
                }
            }
        }
        this.header.file_name = path.dirname(this.header.record) + '/' + file_name;
    }
    this.push(this.header);
    this.header = null;
    next();
};

// Use this in your own pipelines with your own Readable
exports.HeaderTransform = HeaderTransform;

function readHeader(wfdb, record) {
    var pipe = 
        wfdb.locator.locate(record+'.hea',{highWaterMark:wfdb.highWaterMark}).on('error', function(err) { pipe.emit('error', err); })
        .pipe(LineTransform()).on('error', function(err) { pipe.emit('error', err); })
        .pipe(HeaderTransform({'wfdb': wfdb, 'record':record}));
    return pipe;
}

// use this to assemble a pipeline from a locator
module.exports = exports = readHeader;
