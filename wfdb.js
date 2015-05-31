"use strict";

var accepted_formats = {212: 12, 16: 16};


function WFDB(locator) {
	this.locator = locator;
}

WFDB.fileLocator = function(fs) {
	return {
		locateText: function (record, callback) {
			fs.readFile(record, {encoding: 'ascii'}, function(err, data) {
				callback(err, data);
			});
		},
		locateBuffer: function(record, callback) {
			fs.readFile(record, function(err, data) {
				callback(err, data);
			});			
		}
	};
};

WFDB.httpLocator = function(http, baseURI) {
	return {
		locateText: function (record, callback) {
			var data;
			http.get(baseURI+record, function(res) {
				res.on('data', function(chunk) {
					if(!data) { 
						data = chunk.toString('ascii');
					} else {
						data += chunk.toString('ascii');
					}
				}).on('end', function() {
					callback(null, data);
				}).on('error', function(e) {
					callback(e, null);
				});
			});
		},
		locateBuffer: function(record, callback) {
			var data;
			http.get(baseURI+record, function(res) {
				res.on('data', function(chunk) {
					if(!data) {
						data = chunk;
					} else {
						data = Buffer.concat([data, chunk]);
					}
				}).on('end', function() {
					callback(null, data);
				}).on('error', function(e) {
					callback(e, null);
				});
			});
		}
	};
};

WFDB.prototype.readData = function(record, cb_headers, cb_data) {
	var locator = this.locator;
	locator.locateText(record+'.hea', function(err, data) {
		if(err) {
			console.log(err);
			process.exit(-1);
		} else {
			// Comment lines
			data = data.replace(/\s*#.*/g, "");

			// Blank lines
			data = data.replace(/^\s*$/gm, "");

			var lines = data.split("\n");
			console.log("A HEADER STARTS WITH " + lines[0]);
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
						adc_gain: arr[6] || 200,
						baseline: arr[7] || 0,
						units: arr[8] || "",
						adc_resolution: (arr[9] | 0) || 12, // covers only amplitude formats
						adc_zero: arr[10] || 0,
						initial_value: arr[11] || arr[6] || 200,
						checksum: arr[12] || 0,
						block_size: arr[13] || 0,
						description: arr[14] || ""
					};
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
			cb_headers && cb_headers(info);
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



			locator.locateBuffer(record+'.dat', function(err, data) {
				if(err) {
					console.log(err);
					process.exit(-1);
				} else {
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
							cb_data((i/total_bytes_per_frame*highest_samples_per_frame+t),rows[t]);							
						}

						elapsed_ms += time_interval;

					}
				}
			});
		}
	});
};

module.exports = exports = WFDB;