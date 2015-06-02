"use strict";

var EventEmitter = require('events').EventEmitter;

module.exports = exports = function(wfdb, record, callback) {
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
            var re = /^(\S+)(?:\/(\d+))?\s+(\d+)\s+([0-9e\-.]+)?(?:\/([0-9e\-.]+))?(?:\(([\d-.]+)\))?(?:\s+(\d+))?(?:\s+(\S+))?(?:\s+(\S+))?/;

            var header = re.exec(lines[0]);
            if(!header) {
                response.emit('error', "Cannot parse header descriptor: " + lines[0]);
                return;
            }
            var info = {
            	"record": record,
                name: header[1],
                number_of_segments: header[2],
                number_of_signals: header[3] || 0,
                sampling_frequency: header[4] || 250,
                counter_frequency: header[5] || 0,
                base_counter_value: header[6] || 0,
                number_of_samples_per_signal: header[7],
                base_time: header[8] || '0:0:0',
                base_date: header[9],
                signals: [],
                total_bits_per_frame: 0,
                highest_adc_resolution: 0,
                highest_samples_per_frame: 0
            };
            
            for(var i = 0; i < info.number_of_signals; i++) {
                var fmt = /^(\S+)\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?(?:[Ee]\d+)?)(?:x([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\:([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\(([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?)\))?(?:\/(\S+))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+(.+))?\r?$/g;

                var arr = fmt.exec(lines[i+1]);
                if(!arr) {
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
                        description: arr[14] || ""
                    };

                signal.mask = 0;
                for(var j = 0; j < signal.adc_resolution; j++) {
                    signal.mask |= 1 << j;
                }
                info.signals.push(signal);

                
                if(!wfdb.accepted_formats[signal.format]) {
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
        });
	});
};