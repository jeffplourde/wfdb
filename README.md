WFDB for node.js
================

Getting Started
--------------

* Make sure you've installed [node.js](https://nodejs.org/download/) and [npm](https://docs.npmjs.com/getting-started/installing-node)

* Clone this repo
```bash
git clone https://github.com/jeffplourde/wfdb.git
cd wfdb
```

* Install dependencies
```bash
npm install
```

* Run unit tests
```bash
npm test
```

* Retrieve and decode Physiobank records
```bash
node examples/main.js mghdb/mgh001
```

Rationale
---------
Realtime physiological data visualization and analysis will inevitably come to the world of HTML5 and node.js.  I wrote this code to facilitate experiments in that area by providing large datasets to test the large and modern data pipes of the world wide web.  Ten years ago these datasets were only manageable for research but in the IoT era of both "big" and "fast" data such datasets will become the life's blood of our healthcare and public health systems.

Unit Testing
------------
Unit tests use tranches of data from real-world data sets; typically 10 samples per signal.  Testing is 

Caveats
-------
* This is __NOT__ intended for production use.  This project is a personal experiment of my and is in no way endorsed by anyone.

* This is an __experimental__ package for reading *some* wfdb formatted files from node.js.  I have only experimented with a few data sets so far.  __DO NOT__ trust this library to correctly interpret WFDB data until it has had more vetting.

* Only raw data signals are currently read (no annotations or other data) with limitations on supporting all the various options of the WFDB format.

References
----------
My primary reference in developing this has been 
* http://www.physionet.org/physiotools/wag/header-5.htm
* http://www.physionet.org/physiotools/wag/signal-5.htm 

I made an abortive effort to utilize the [standard WFDB library](http://www.physionet.org/physiotools/wfdb.shtml) by adapting the existing [SWIG](http://www.physionet.org/physiotools/wfdb.shtml#wfdb-swig) work to JavaScript.  If anyone else has had greater success with this approach please let me know.

Currently supported are signal formats 16, 80, and 212.

I've tested with databases available from [Physiobank](http://physionet.org/physiobank/) using the powerful [Physiobank ATM](http://physionet.org/cgi-bin/atm/ATM) tool.  Specifically...
* aami-ec13
* ahadb
* apnea-ecg
* chfdb
* drivedb
* mghdb
* mimic2wdb
* mimicdb
* mitdb

In its default configuration the "main" program will cache data files from "http://physionet.org/physiobank/database/" into a subdirectory called "data/" in the local file system.  Subsequent reads of the same record will derive data from the local cache to ease the load on the physiobank servers.  For information on Physionet public domain licensing please visit their [home page](http://physionet.org).  main.js will first show the header information decoded and then each signal tab-delimited with each sequential sample set on a new line.

