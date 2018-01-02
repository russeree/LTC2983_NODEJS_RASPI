/**
 * @Auth: Reese Russell
 * @desc: A LTC2983 Service
 **/

var LTC2983 = require('./ltc2983');
var thermoBoard = new LTC2983(spiChnl = 0, debug = false, intPin = 35);
var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://localhost:27017/thermo";

/*** SETUP THE LTC2983 ***/
thermoBoard.setGlobalConfig();
for (var j = 0, len = thermoBoard.rfpgaDiodes.length; j < len; j++){
  thermoBoard.setupChannel(chnl        = thermoBoard.rfpgaDiodes[j],
                          cjChnl       = 0,
                          type         = thermoBoard.TYPE_DIODE,
                          singledEnded = thermoBoard.SNGL,
                          reading2to3  = thermoBoard.CONV_3,
                          averaging    = thermoBoard.D_AVG_ON,
                          current      = thermoBoard.D_10UA,
                          ocCurrent    = 0,
                          idealityF    = this.d_ideality_f,
                          custom       = 0,
                          ocCheck      = false
                        );
}
for (var j = 0, len = thermoBoard.rfpgaTcK.length; j < len; j++){
  thermoBoard.setupChannel(chnl        = thermoBoard.rfpgaTcK[j],
                          cjChnl       = thermoBoard.rfpgaDiodes[j],
                          type         = thermoBoard.TYPE_K,
                          singledEnded = thermoBoard.SNGL,
                          reading2to3  = thermoBoard.CONV_2,
                          averaging    = thermoBoard.D_AVG_OFF,
                          current      = thermoBoard.D_20UA,
                          ocCurrent    = thermoBoard.TC_100UA,
                          idealityF    = this.d_ideality_f,
                          custom       = 0,
                          ocCheck      = true
                        );
}
thermoBoard.writeCcMap();

/*** NOW RUN A LOOP FOREVER ***/
tempDaemon();

/**
 * @desc: Foreverloop to get temperatures
 **/
function tempDaemon() {
  setInterval(function(){
    writeCcTemp2DB("temp");
  }, 300);
};

/**
 * @desc: Writes the tempdata to the mongo database
 **/
function writeCcTemp2DB(collection){
  MongoClient.connect(url, function(err, db) {
    if (err) throw err;
    var data = thermoBoard.cc2dict();
    db.collection(collection).insert(data);
    db.close();
  });
}

/**
 * @desc: Gets Time in YDMHMS
 * @return: A string with time
 **/
function getDateTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;
}
