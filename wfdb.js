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

					var adc = ((data.readUInt8(i+1)&0x0F)<<8) + data.readUInt8(i);

					var sign = 0 != (0x800&adc) ? -1 : 1;
					if(sign < 0) {
						adc = ~adc + 1;
					}

					adc &= 0x7FF;
					adc *= sign;

					var value = (adc - signals[0].baseline) / signals[0].adc_gain;
					var time = Math.floor(elapsed_ms/3600000)+":"+
					           Math.floor(elapsed_ms%3600000/60000)+":"+
					           Math.floor(elapsed_ms%60000/1000)+"."+
					           Math.floor(elapsed_ms%1000);
					if( (i/12) >= 28800) {
						console.log((i/12)+"\t"+time+"\t"+(sign>0?"POSITIVE":"NEGATIVE")+"\t"+adc+"\t"+(Math.round(value*1000)/1000));	
					}					           
					

					elapsed_ms += time_interval;

				}
			}
		});
	}
});