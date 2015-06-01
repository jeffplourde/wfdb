WFDB for node.js
------------

I have a particular interest in bringing realtime physiological data visualization and analysis to the world of HTML5 and node.  I wrote this code to facilitate experiments in that area.  It is __NOT__ intended for production use.

NOTE: This is an __experimental__ package for reading *some* wfdb formatted files from node.js.  I have only experimented with a few data sets so far.  __DO NOT__ trust this library to correctly interpret WFDB data until it has had more vetting.

NOTE: Only raw data signals are currently read (no annotations or other data) with severe limitations on supporting all the various options of the WFDB format.

I've tested with databases available from [Physiobank](http://physionet.org/physiobank/) using the powerful [Physiobank ATM](http://physionet.org/cgi-bin/atm/ATM) tool.  Specifically...
* mghdb
* drivedb
* apnea-ecg

In its default configuration the "main" program will download data files from "http://physionet.org/physiobank/database/" into a subdirectory called "data/" in the local file system.  It will first show the header information decoded and then each signal tab-delimited with each sequential sample on a new line.

Get Started
=========

``` bash
npm install
node main.js mghdb/mgh001


