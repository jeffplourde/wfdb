"use strict";

var EventEmitter = require('events').EventEmitter;

function readHeader(wfdb, record, callback) {
    var response = new EventEmitter();
    callback(response);

    wfdb.locator.locate(record+'.hea', function(res) {
        res.on('error', function(err) {
            response.emit('error', err);
        }).on('data', function(data) {
            data = data.toString('ascii');

            // Comment lines
            data = data.replace(/\s*#.*/g, "");

            // Blank lines
            data = data.replace(/^\s*$/gm, "");

            var lines = data.split("\n");
            // console.log("A HEADER STARTS WITH " + lines[0]);
            var re = /^(\w+)(?:\/(\d+))?\s+(\d+)\s+([0-9e\-.]+)?(?:\/([0-9e\-.]+))?(?:\(([\d-.]+)\))?(?:\s+(\d+))?(?:\s+(\S+))?(?:\s+(\S+))?/;

            var layout_re = /^.+_layout$/;

            var header = re.exec(lines[0]);
            if(!header) {
                response.emit('error', "Cannot parse header descriptor: " + lines[0]);
                return;
            }
            var info = {
            	"record": record,
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
            

            if(info.number_of_segments) {
                var base = record.split("/");
                base.pop();
                base = base.join("/");

                var segments_to_read = 0;
                for(var i = 0; i < info.number_of_segments; i++) {
                    var fmt = /^(\S+)\s+(\d+)/;
                    var arr = fmt.exec(lines[i+1]);
                    if(!arr) {
                        response.emit('error', 'Cannot parse segment descriptor: ' + lines[i+1]);
                        return;
                    }
                    var segment = 
                        {
                            name: arr[1],
                            number_of_samples_per_signal: +arr[2]
                        };
                    if(segment.name != '~') {
                        segments_to_read++;
                        readHeader(wfdb, base+'/'+segment.name, function(res1) {
                            var s = segment;
                            res1.on('error', function(err) { response.emit('error', err); })
                            .on('data', function(data) {
                                s.header = data;
                                segments_to_read--;

                                // TODO this is a little hacky for now importing layout signals to the top level
                                if(s.name.match(layout_re)) {
                                    info.signals = s.header.signals;
                                    info.signalIndex = {};
                                    for(var i = 0; i < info.signals.length; i++) {
                                        info.signalIndex[info.signals[i].description] = i;
                                    }
                                } else {                                
                                    // This is also hacky to allow signals to occupy the same position in data arrays regardless of their position in the segment
                                    // Further we are assuming that the "layout" file is the first segment to be processed
                                    for(var i = 0; i < s.header.signals.length; i++) {
                                        s.header.signals[i].index = info.signalIndex[s.header.signals[i].description];
                                    }
                                }


                                if(!segments_to_read) {
                                    response.emit('data', info);
                                }
                            });
                        });                        
                    }
                    if(!segment.name.match(layout_re)) {
                        info.segments.push(segment);
                    }
                }
            } else {
                // console.log(info.record, info.number_of_signals);
                for(var i = 0; i < info.number_of_signals; i++) {
                    var fmt = /^(\S+)\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?(?:[Ee]\d+)?)(?:x([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\:([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\(([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?)\))?(?:\/(\S+))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+(.+))?\r?$/g;

                    var arr = fmt.exec(lines[i+1]);
                    if(!arr) {
                        console.log("Cannot parse signal descriptor: " + lines[i+1]);
                        response.emit('error', "Cannot parse signal descriptor: " + lines[i+1]);
                        return;
                    }
                    var signal = 
                        {
                            file_name: arr[1],  
                            format: arr[2] | 0,
                            samples_per_frame: (arr[3] | 0) || 1,
                            skew: arr[4] || 0,
                            byte_offset: arr[5] || 0,
                            adc_gain: parseFloat(arr[6]) || wfdb.DEFGAIN,
                            baseline: parseFloat(arr[7]) || parseFloat(arr[10]) || 0,
                            units: arr[8] || "",
                            adc_resolution: (arr[9] | 0) || 12, // covers only amplitude formats
                            adc_zero: parseFloat(arr[10]) || 0,
                            initial_value: arr[11] || arr[6] || 200,
                            checksum: arr[12] || 0,
                            block_size: arr[13] || 0,
                            description: arr[14] || "",
                            index: i
                        };

                    signal.mask = 0;
                    for(var j = 0; j < signal.adc_resolution; j++) {
                        signal.mask |= 1 << j;
                    }
                    info.signals.push(signal);
                    
                    if(undefined===wfdb.accepted_formats[signal.format]) {
                        var discarded = info.signals.pop();
                        console.log("Cannot decode format " + discarded.format + " for " + discarded.description);
                    } else {
                        signal.bits_per_frame = wfdb.accepted_formats[signal.format] * signal.samples_per_frame;
                        info.total_bits_per_frame += signal.bits_per_frame;
                        if(signal.adc_resolution>info.highest_adc_resolution) {
                            info.highest_adc_resolution = signal.adc_resolution;
                        }
                        if(signal.samples_per_frame>info.highest_samples_per_frame) {
                            info.highest_samples_per_frame = signal.samples_per_frame;
                        }
                    }
                }
                info.total_bytes_per_frame = info.total_bits_per_frame / 8;
                response.emit('data', info);
            }
        });
	});
};

module.exports = exports = readHeader;
