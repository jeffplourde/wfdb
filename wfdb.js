var record = process.argv[2] || (console.log("Specify a record") || process.exit(-1));

var fs = require('fs');

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
		
		var header = lines[0].split(/[\s\n]/);

		// console.log("record name:"+header[0]);
		// console.log("number of signals:"+header[1]);

		

		var signals = [];
		for(var i = 0; i < header[1]; i++) {
			// console.log(lines[i+1]);
			var fmt = /^(\S+)\s+(\S+)\s+([\d-.]+)(?:\(([\d-.]+)\))?(?:\/(\S+))?\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/g;
			var arr = fmt.exec(lines[i+1]);
			signals.push(
				{
					name: arr[1],
					adc_gain: arr[3] || 200,
					baseline: arr[4] || 0,
					units: arr[5] || ""
				}
			);
			//console.log("signal "+(i+1)+" "+arr[3]+" "+arr[4]+" "+arr[5]);
			// console.log(signals);
		}

		fs.readFile(record+'.dat', function(err, data) {
			if(err) {
				console.log(err);
				process.exit(-1);
			} else {
				// console.log(data);
				var time_interval = 1000.0 / 360.0;

				var elapsed_ms = 0;

				for(var i = 0; i < data.length; i+=12) {
					var frame = [];
					for(var j = 0; j < signals.length; j++) {
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

						var value = (adc - signals[j].baseline) / signals[j].adc_gain;

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