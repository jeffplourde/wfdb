"use strict";

var EventEmitter = require('events').EventEmitter;
var util = require("util");
var fs = require('fs');
var http = require('http');

var DEFGAIN = 200;

var accepted_formats = {212: 12, 16: 16};



function WFDB(locator) {
    this.locator = locator;
}

function FileLocator(basePath) {
    this.basePath = basePath || "";
}

FileLocator.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);
    fs.readFile(this.basePath+record, function(err, data) {
        if(err) {
            response.emit('error', err);
        } else {
            response.emit('data', data);
        }
    });     
};

WFDB.FileLocator = FileLocator;

function HTTPLocator(baseURI) {
    this.baseURI = baseURI;
}

HTTPLocator.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);
    var data;
    http.get(this.baseURI+record, function(res) {
        res.on('data', function(chunk) {
            if(!data) {
                data = chunk;
            } else {
                data = Buffer.concat([data, chunk]);
            }
        }).on('end', function() {
            response.emit('data', data);
        }).on('error', function(e) {
            response.emit('error', e);
        });
    });
};

WFDB.HTTPLocator = HTTPLocator;


function Cache(basePath, baseURI) {
    this.basePath = basePath;
    this.baseURI = baseURI;
}

Cache.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);

    var fullPath = this.basePath + record;

    if(!fs.existsSync(fullPath)) {
        // console.log("file doesn't exist");
        var parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
        // TODO there are numerous packages that supply mkdir -p functionality
        if(!fs.existsSync(parent)) { 
            var parentPathParts = parent.split("/");
            var parentPath = parentPathParts[0];
            if(!fs.existsSync(parentPath)) {
                fs.mkdirSync(parentPath); 
            }
            for(var i = 1; i < parentPathParts.length; i++) {
                parentPath = parentPath + "/" + parentPathParts[i];
                if(!fs.existsSync(parentPath)) {
                    fs.mkdirSync(parentPath); 
                }
            }
        }
        var self = this;
        http.get(this.baseURI+record, function(res) {
            res.once('end', function() {
                response.emit('end');
            });
            res.pipe(fs.createWriteStream(fullPath));
        });
    } else {
        response.emit('end');
    }
}

function CachedLocator(basePath, baseURI) {
    this.fileLocator = new WFDB.FileLocator(basePath);
    this.cache = new Cache(basePath, baseURI);
}

CachedLocator.prototype.locate = function(record, callback) {
    var response = new EventEmitter();
    callback(response);
    // console.log("checking cache");
    var self = this;
    this.cache.locate(record, function(res) {
        res.on('error', function(e) {
            // console.log("error in cache");
            response.emit('error', e);
        }).on('end', function() {
            // console.log("delegating to file locator");
            self.fileLocator.locate(record, callback);
        });
    });
};

WFDB.CachedLocator = CachedLocator;

WFDB.prototype.readData = function(record, callback) {
    var locator = this.locator;
    var response = new EventEmitter();
    callback(response);
    // console.log(record);
    locator.locate(record+'.hea', function(res) {
        res.on('error', function(err) {
            console.log(err);
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
            var info = {
                name: header[1],
                number_of_segments: header[2],
                number_of_signals: header[3] || 0,
                sampling_frequency: header[4] || 250,
                counter_frequency: header[5] || 0,
                base_counter_value: header[6] || 0,
                number_of_samples_per_signal: header[7],
                base_time: header[8] || '0:0:0',
                base_date: header[9]
            };
            
            var signals = [];
            var total_bits_per_frame = 0;
            var highest_adc_resolution = 0;
            var highest_samples_per_frame = 0;
            for(var i = 0; i < info.number_of_signals; i++) {
                var fmt = /^(\S+)\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?(?:[Ee]\d+)?)(?:x([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\:([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\(([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?)\))?(?:\/(\S+))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+(.+))?\r?$/g;

                var arr = fmt.exec(lines[i+1]);
                var signal = 
                    {
                        file_name: arr[1],  
                        format: arr[2] | 0,
                        samples_per_frame: (arr[3] | 0) || 1,
                        skew: arr[4] || 0,
                        byte_offset: arr[5] || 0,
                        adc_gain: arr[6] | 0 || DEFGAIN,
                        baseline: arr[7] || arr[10] || 0,
                        units: arr[8] || "",
                        adc_resolution: (arr[9] | 0) || 12, // covers only amplitude formats
                        adc_zero: arr[10] || 0,
                        initial_value: arr[11] || arr[6] || 200,
                        checksum: arr[12] || 0,
                        block_size: arr[13] || 0,
                        description: arr[14] || ""
                    };

                signal.mask = 0;
                for(var j = 0; j < signal.adc_resolution; j++) {
                    signal.mask |= 1 << j;
                }
                signals.push(signal);

                
                if(!accepted_formats[signal.format]) {
                    var discarded = signals.pop();
                    console.log("Cannot decode format " + discarded.format + " for " + discarded.description);
                } else {
                    signal.bits_per_frame = accepted_formats[signal.format] * signal.samples_per_frame;
                    total_bits_per_frame += signal.bits_per_frame;
                    if(signal.adc_resolution>highest_adc_resolution) {
                        highest_adc_resolution = signal.adc_resolution;
                    }
                    if(signal.samples_per_frame>highest_samples_per_frame) {
                        highest_samples_per_frame = signal.samples_per_frame;
                    }
                }
            }
            info.signals = signals;
            response.emit('info', info);
            
            if(signals.length == 0) {
                return;
            }
            
            var total_bytes_per_frame = total_bits_per_frame / 8;

            // console.log("total_bytes_per_frame:"+total_bytes_per_frame);


            // var  top_line = ['sequence','elapsed'];
            // signals.forEach(function(value, index, array) {
                // top_line.push(value.description);
            // });
            // console.log(top_line.join("\t"));



            locator.locate(record+'.dat', function(res) {
                res.once('error', function(err) { response.emit('error', err); })
                .on('data', function(data) {
                    var time_interval = 1000.0 / info.sampling_frequency;

                    var elapsed_ms = 0;

                    // Go through the data frame by frame
                    for(var i = 0; i < data.length; i+=total_bytes_per_frame) {
                        var rows = [];
                        // Each frame will contain 
                        var signalBase = i;
                        for(var j = 0; j < signals.length; j++) {
                            for(var k = 0; k < signals[j].samples_per_frame; k++) {
                                var adc;
                                switch(signals[j].format) {
                                    case 212:
                                        if(0 == (j%2)) {
                                            adc = ((data.readUInt8(i+j/2*3+1)&0x0F)<<8) + data.readUInt8(i+j/2*3);
                                        } else {
                                            adc = ((data.readUInt8(i+(j-1)/2*3+1)&0xF0)<<4) + data.readUInt8(i+(j-1)/2*3+2);
                                        }
                                        var sign = 0 != (0x800&adc) ? -1 : 1;
                                        if(sign < 0) {
                                            adc = ~adc + 1;
                                        }
                                        // Is there a case where this is necessary?
                                        // adc &= signals[j].mask;

                                        adc &= 0x7FF;
                                        adc *= sign;

                                        break;
                                    case 16:
                                        adc = data.readInt16LE(signalBase);
                                        signalBase += 2;
                                        break;
                                    default:
                                        console.log("Unknown format " + signals[j].format);
                                        break;
                                }
                                var value = (adc - signals[j].baseline) / signals[j].adc_gain;
                                // Repeat the value (upsample) 
                                var upsample_rate = highest_samples_per_frame / signals[j].samples_per_frame;
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
                            var e = elapsed_ms + time_interval / highest_samples_per_frame;
                            var time =  Math.floor(e/3600000)+":"+
                                        Math.floor(e%3600000/60000)+":"+
                                        Math.floor(e%60000/1000)+"."+
                                        Math.floor(e%1000);
                            response.emit('data', (i/total_bytes_per_frame*highest_samples_per_frame+t),rows[t]);
                        }

                        elapsed_ms += time_interval;

                    }
                    response.emit('end');
                });
            });
        }); // closes the on
    }); // ends the locate call
};

module.exports = exports = WFDB;
