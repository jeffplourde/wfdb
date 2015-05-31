var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var fs = require('fs');
var http = require('http');

fs.readFile(record+'.hea', {encoding: 'ascii'}, function(err, data) {
	if(err) {
		console.log(err);
		process.exit(-1);
	} else {
		// Comment lines
		data = data.replace(/\s*#.*/g, "");

		// Blank lines
		data = data.replace(/^\s*$/gm, "");

		var lines = data.split("\n");

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
		console.log(info);
		
		
		var signals = [];
		for(var i = 0; i < info.number_of_signals; i++) {
			var fmt = /^(\S+)\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?(?:[Ee]\d+)?)(?:x([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\:([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\(([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?)\))?(?:\/(\S+))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+([+-]?\d*(?:\.\d+)?(?:[Ee]\d+)?))?(?:\s+(.+))?\r?$/g;

			var arr = fmt.exec(lines[i+1]);
			signals.push(
				{
					file_name: arr[1],	
					format: arr[2],
					samples_per_frame: arr[3] || 1,
					skew: arr[4] || 0,
					byte_offset: arr[5] || 0,
					adc_gain: arr[6] || 200,
					baseline: arr[7] || 0,
					units: arr[8] || "",
					adc_resolution: arr[9] || 12,
					adc_zero: arr[10] || 0,
					initial_value: arr[11] || arr[6] || 200,
					checksum: arr[12] || 0,
					block_size: arr[13] || 0,
					description: arr[14] || ""
				}
			);
			if(signals[signals.length-1].format != 212) {
				var discarded = signals.pop();
				console.log("Cannot decode format " + discarded.format + " for " + discarded.description);
			}
		}

		if(signals.length == 0) {
			return;
		}

		var  top_line = ['sequence','elapsed'];
		signals.forEach(function(value, index, array) {
			top_line.push(value.description);
		});
		console.log(top_line.join("\t"));



		fs.readFile(record+'.dat', function(err, data) {
			if(err) {
				console.log(err);
				process.exit(-1);
			} else {
				var time_interval = 1000.0 / info.sampling_frequency;

				var elapsed_ms = 0;

				for(var i = 0; i < data.length; i+=12) { // TODO not always 12 bytes per frame
					var frame = [];
					for(var j = 0; j < signals.length; j++) {
						var value;
						switch(signals[i].format) {
							case 212:
								var adc;
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

								value = (adc - signals[j].baseline) / signals[j].adc_gain;
								break;
							default:
								break;
						}

						frame.push(Math.round(value*1000)/1000);						

					}

					var time =  Math.floor(elapsed_ms/3600000)+":"+
						        Math.floor(elapsed_ms%3600000/60000)+":"+
						        Math.floor(elapsed_ms%60000/1000)+"."+
						        Math.floor(elapsed_ms%1000);
					console.log((i/12)+"\t"+time+"\t"+frame.join("\t"));	

					elapsed_ms += time_interval;

				}
			}
		});
	}
});