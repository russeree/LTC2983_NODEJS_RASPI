/**
 * @ desc: Reese Russell LTC2983 NODE DRIVER 7/31/17
 **/
module.exports = LTC2983;      //Export the primary driver
var rpio = require('rpio');    //RASPI GPIO

/**
 * @desc: Generates a mask for given input data !!!UNSIGNED 32bit!!!
 * @param: [lsbBitPosition] the least sugnificant bit postion to of data.
 * @param: [data] the data to be shifted.
 **/
LTC2983.prototype.maskGen32 = function(lsbBitPosition, data){ //Generates a Mask
  var buf = new Buffer(4);
  buf.writeUInt32BE((((data) << lsbBitPosition) & (0xFFFFFFFF)),0,true);
  return(buf.readUInt32BE(0));
}

/**
 * @desc: Channel assignments (index = 1, max = 20)
 * @param: [chnl] the channel number being setup INDEX IS 1!!!
 * @return: An array of bytes representing the channel configuration
 **/
LTC2983.prototype.setupChannel = function(chnl = 0, cjChnl = 0, type = 0, singledEnded = 0, reading2to3 = true, averaging = true, current = 0, ocCurrent = 0, idealityF = 0, custom = 0, ocCheck = false){
  var tmp = 0x00000000; //This is the uint32 that will be converted into a buffer object.
  var configBuf = new Buffer(4); //Holds the actual configuration data.
  var txBuf = new Buffer(4); //The SPI output TX buffer.
  var rxBuf = new Buffer(4); //This SPI input RX buffer.
  var failedCfg = false;
  /* Channel Configuration CASE */
  if(!chnl){ //If channel is 0 assume failure.
    if(this.debug)
      console.log("Channel configuration failed with no channel selected");
  }
  else{
    tmp += this.maskGen32(27,type); //Add the channel to the mask: I will be adding more types in the future, right now will support K-Type and Diode.
    if (type == this.UNASSIGNED){ //No channel type, Zero out the channel config and write it.
      console.log("Unassigned data found and written to " + chnl);
      tmp = 0;
    }
    else if (type == this.TYPE_DIODE){ //Using a diode
      if(this.debug)
        console.log("Now Configuring a Diode on channel " + chnl + ".");
      tmp += this.maskGen32(26, singledEnded)
          + this.maskGen32(25, reading2to3)
          + this.maskGen32(24, averaging) //configure the channel.
          + this.maskGen32(22, current)
          + idealityF;
    }
    else if (type == this.TYPE_K){ //Using a diode
      if(this.debug)
        console.log("Now Configuring a K Type Thermocouple on channel " + chnl + ".");
      tmp += this.maskGen32(22, cjChnl)
          + this.maskGen32(21, singledEnded)
          + this.maskGen32(20, ocCheck) //configure the channel.
          + this.maskGen32(18, ocCurrent);
    }
    else{
      if(this.debug)
        console.log("Channel Data was invalid: NO DATA WRITTEN TO DEVICE" + type);
      failedCfg = true;
    }
    /* Now write the the SPIBus and configure the channel */
    if(!failedCfg){
      configBuf.writeUInt32BE(tmp,0,true);
      for(i = 0; i < 4; i++){
        x = 0x00000000;
        x += this.maskGen32(8,(this.CHANNEL_1_A_BA + (chnl - 1) * 4 + i )) + this.maskGen32(24,this.WRITE) + configBuf[i];
        txBuf.writeUInt32BE(x,0,true);
        if(this.debug){
          process.stdout.write("Now Writing to SPI Bus with CA Data ");
          console.log(txBuf);
        }
        rpio.spiTransfer(txBuf, rxBuf, txBuf.length);
      }
    }
  }
}

/**
 * @desc: Sets up the Consecutive Conversion map based on the Class CCMAP
 **/
LTC2983.prototype.writeCcMap = function(){
  var txBuf = new Buffer(4);
  var rxBuf = new Buffer(4);
  var configBuf = new Buffer(4);
  var map = 0;
  for (var i = 0, len = this.ccMap.length; i < len; i++){
    map |= this.maskGen32(this.ccMap[i] - 1, 0b1);
  }
  configBuf.writeUInt32BE(map,0,true);
  for(i = 0; i < 4; i++){
    x = 0x00000000;
    x += this.maskGen32(8,(this.CCMAP_BA + i)) + this.maskGen32(24,this.WRITE) + configBuf[i];
    txBuf.writeUInt32BE(x,0,true);
    if(this.debug){
      process.stdout.write("Now Writing to SPI Bus with CC Data ");
      console.log(txBuf);
      }
      rpio.spiTransfer(txBuf, rxBuf, txBuf.length);
    }
}
/**
 * @desc: Writes to the Global Configuration Register
 * @param: [fahrenheit] Use fahrenheit as unit, if false will use celcuis
 @
 **/
 LTC2983.prototype.setGlobalConfig = function(fahrenheit = this.fahrenheit, rejectionMode = this.rejectionMode){
   this.fahrenheit = fahrenheit;
   var tmp = this.maskGen32(24,this.WRITE) +
            this.maskGen32(8,0x0F0) +
            this.maskGen32(2,this.fahrenheit) +
            this.rejectionMode;
   this.txBuf.writeUInt32BE(tmp,0,true);
   if(this.debug){
     process.stdout.write("Now Writing to SPI Bus with GC Data ");
     console.log(this.txBuf);
     }
   rpio.spiTransfer(this.txBuf, this.rxBuf, this.txBuf.length);
 }

/**
 * @desc: Converts a LTC2983 Temperature result into an integer !!THIS FUNCTION IS BLACK MAGIC!!
 * @return: Returns a string representing the result of the conversion
 **/
LTC2983.prototype.rawTempParser = function(rawData = 0x00000000){
  var result = '';
  if((!((rawData & 0x01000000) >>> 24)) || ((rawData & 0xFF000000) >>> 25)){
    result = 'Failed Conversion: [';
    var ec = rawData >>> 24;
    if (ec & 0b00000010){
      result += " ADC OUT OF RANGE.";
    }
    if (ec & 0b00000100){
      result += " SENSOR UNDER RANGE.";
    }
    if (ec & 0b00001000){
      result += " SENSOR OVER RANGE.";
    }
    if (ec & 0b00010000){
      result += " CJ SOFT FAULT.";
    }
    if (ec & 0b00100000){
      result += " CJ HARD FAULT.";
    }
    if (ec & 0b01000000){
      result += " ADC HARD FAULT.";
    }
    if (ec & 0b10000000){
      result += " SENSOR HARD FAULT.";
    }
    else{
      result += " FAILURE UNKNOWN.";
    }
    result += "]"
  }
  else{
    x = rawData & 0x00FFFFFF;
    if((rawData & 0x00800000) == 0x00800000){
      x |= 0xFF00000000;
    }
    result = parseFloat(x)/1024;
  }
  return result;
}

/**
 * @desc: Perfroms a CC and creates a JSON like reccord
 **/
 LTC2983.prototype.cc2dict = function (){
   this.ccInitiate();
   var x = {};
   var y = this.readCcMap();
   for (var i = 0, len = y.length; i < len; i++){
     x[y[i][1].toString()] = y[i][0];
   }
   return x = [{"time": + new Date(),"data": x}];
 }

/**
 * @desc: Reads Results from the CC Map
 **/
LTC2983.prototype.readCcMap = function(){
  var txBuf = new Buffer(4);
  var rxBuf = new Buffer(4);
  var resBuf = new Buffer(4);
  var out = []; //Where the results will be stored.
  //For Each Element in the Map request a read
  for (var i = 0, len = this.ccMap.length; i < len; i++){
    for(j = 0; j < 4; j++){
      x = 0x00000000;
      x += this.maskGen32(8,(this.RESULTS_BA + ((this.ccMap[i] - 1) * 4) + j)) + this.maskGen32(24,this.READ) + 0x00; //Gen the read Request
      txBuf.writeUInt32BE(x,0,true);
      if(this.debug){
        process.stdout.write("Now Reading to SPI Bus with CC Data ");
         console.log(rxBuf);
      }
    rpio.spiTransfer(txBuf, rxBuf, txBuf.length);
    resBuf[j] = rxBuf[3];
    }
    var res = this.rawTempParser(resBuf.readUInt32BE(0));
    out.push([res,this.ccMap[i]]);
    if(this.debugCcOut){
      if (isNaN(res)) {
          console.log(res);
      }
      else{
        console.log(res.toPrecision(9) + " Degrees F " + "on Channel " + this.ccMap[i]);
      }
    }
  }
  return(out);
}

/**
 * @desc: Check the return value of a write to 0x00 on the LTC2983
 * @param: [callback] A callback to be called when the function completed (Defeats the ASYNC principal I KNOW!!!)
 **/
LTC2983.prototype.validateLTC2983 = function (callback){
  var txbuf = new Buffer([0x3, 0x0, 0x00, 0x00]);
  var rxbuf = new Buffer(txbuf.length);
  rpio.spiTransfer(txbuf, rxbuf, txbuf.length);
  if(rxbuf[3] == [0x40]){
    return true;
  }
  else{
    return false;
  }
  if(callback){
    callback();
  }
}

/**
 * @desc: Enable the LTC2983 SPI Interface
 * @param: [callback] The callback functions to call upon completion.
 * @param: [csNumber] Integer value for the SPI Chip select to use (leave alone unless using multiple boards)
 **/
LTC2983.prototype.spiEnLTC2983 = function (callback, csNumber = 1){
  rpio.spiBegin();
  rpio.spiChipSelect(1);                  /* Use CE01 */
  rpio.spiSetCSPolarity(0, rpio.LOW);     /* LTC2983 chip select is active-LOW */
  rpio.spiSetClockDivider(2048);          /* LTC2983 max is 2MHz, 128 == 1.95MHz */
  rpio.spiSetDataMode(0);
  if(callback){
    callback();
  }
}

/**
 * @desc: Initiate A Concecutive Conversion.
 * @return: Will Return True once complete.
 **/
LTC2983.prototype.ccInitiate = function (){
  var txBuf = new Buffer([this.WRITE,0x00,0x00,0x80]); //Write 0x80 to begin a Concecutive conversion
  var rxBuf = new Buffer(4);
  rpio.spiTransfer(txBuf, rxBuf, txBuf.length);
  while(!rpio.read(this.intPin)){
    if(this.debug){
      console.log("Concecutive Conversion Active @ time " +  (new Date).getTime());
      rpio.msleep(10);
    }
  }
  rpio.msleep(1);
  return(true);
}

/**
 * @desc: Controls the state of the of resetPin
 * @param: [callback] The callback functions to call upon completion.
 * @param: [dir] Standard boolean logic for PIN state True = High
 * @param: [rstPin] Integer value of the RSTPIN for the Thermocouple Hat it is 37
 **/
LTC2983.prototype.ctrlRST = function(callback, dir = true, rstPin = 37){
  var strDir = ["",""];
  rpio.open(rstPin, rpio.OUTPUT, rpio.PULLDOWN);
  if(dir){
    strDir = ["Disabled","active"]
    rpio.write(rstPin, rpio.HIGH);
  }
  else{
    strDir = ["Enabled","inactive"]
    rpio.write(rstPin, rpio.LOW);
  }
  if(callback){
    callback(strDir);
  }
}

/**
* @desc: A LTC2983 Object: NO PARAMS THIS OBJECT CONTAINS "CONSTANTS" of the inter device register map.
**/
function LTC2983(spiChnl = 0, debug = true, intPin = 35){
  rpio.init({gpiomem: false});            // The RasPI IO mode
  this.intPin = intPin;                   // Interupt PIN #
  this.ccMapStr = "this.ccMap = [this.CHANNEL_3,this.CHANNEL_7,this.CHANNEL_11,this.CHANNEL_15]" //A Very bad way to prototype a varible.
  this.spiChnl = spiChnl;                 // The SPI Channel this device Uses (Needs work, When switching devices SPI must be reconfigured)
  this.debug = debug;                     // Debug Mode Enabled (LOTS OF LOGGING)
  this.d_ideality_f = 0x00101042;         // Diode ideality factor of ~ 1.04
  this.txBuf = new Buffer(4);             // A Generic TX-Buffer to use;
  this.rxBuf = new Buffer(4);             // A Generic RX-Buffer to use;
  this.fahrenheit = true;                 // Boolan for the Temperature unit of F/C
  this.rejectionMode = 0b00;              // Defaults to 50/60 HZ rejection
  this.debugCcOut = false;

  /* SETUP THE THERMOCOUPLE HAT */
  this.spiEnLTC2983();
  this.ctrlRST(function(strDir){if(this.debug) console.log("Reset is " + strDir[0] + ": LTC2983 is now " + strDir[1] + ".")});
  rpio.msleep(1000); //Sleep for 200 to allow for the LTC2983 to INIT from reset.
  /* Validate the LTC2983 */
  if(this.validateLTC2983() & debug){
    console.log("LTC2983 VALIATION PASSED AND ACTIVE.");
  }
  // REGISTER DEFINITIONS
  // WRITE AND READ COMMANDS
  this.NOP        = 0x01;
  this.WRITE      = 0x02;
  this.READ       = 0x03;
  // BASE ADDRESS MAP
  this.CNV_RSLTS  = 0x0010;                 // START: 0x010 -> END: 0x05F [Word]
  this.CHNL_MAP   = 0x0200;                 // START: 0x200 -> END: 0x24F [Word]
  // TC SE/DIFF VALS
  this.SNGL       = true;
  this.DIFF       = false;
  //Base Addresses
  this.CHANNEL_1_A_BA = 0x200;
  this.CCMAP_BA       = 0x0F4;
  this.RESULTS_BA     = 0x010;
  // Sensor Channel Selection *INCOMPLETE*
  // This is the sesnor type selection for the channel
  // This list is incomplete and designed to acomidate thermocouples and diodes for CJ compensation
  // LTC2983 contains many more sensortpyes, please add these in if you have time or have a design requirement
  this.UNASSIGNED = 0b00000;
  this.TYPE_J     = 0b00001;
  this.TYPE_K     = 0b00010;
  this.TYPE_E     = 0b00011;
  this.TYPE_N     = 0b00100;
  this.TYPE_R     = 0b00101;
  this.TYPE_S     = 0b00110;
  this.TYPE_T     = 0b01000;
  this.TYPE_CUST  = 0b01001;
  this.TYPE_DIODE = 0b11100;
  // Channel Number to Array Bindings
  this.CHANNEL_1  = 1;
  this.CHANNEL_2  = 2;
  this.CHANNEL_3  = 3;
  this.CHANNEL_4  = 4;
  this.CHANNEL_5  = 5;
  this.CHANNEL_6  = 6;
  this.CHANNEL_7  = 7;
  this.CHANNEL_8  = 8;
  this.CHANNEL_9  = 9;
  this.CHANNEL_10 = 10;
  this.CHANNEL_11 = 11;
  this.CHANNEL_12 = 12;
  this.CHANNEL_13 = 13;
  this.CHANNEL_14 = 14;
  this.CHANNEL_15 = 15;
  this.CHANNEL_16 = 16;
  this.CHANNEL_17 = 17;
  this.CHANNEL_18 = 18;
  this.CHANNEL_19 = 19;
  this.CHANNEL_20 = 20;
  // Input Channel Mapping *COMPLETE*
  // This is the input channels represented in binary form
  // Includes MULTI CHANNEL and SLEEP addesses
  this.MULTI_CHNL = 0b10000000;
  this.CHNL_1     = 0b10000001;
  this.CHNL_2     = 0b10000010;
  this.CHNL_3     = 0b10000011;
  this.CHNL_4     = 0b10000100;
  this.CHNL_5     = 0b10000101;
  this.CHNL_6     = 0b10000110;
  this.CHNL_7     = 0b10000111;
  this.CHNL_8     = 0b10001000;
  this.CHNL_9     = 0b10001001;
  this.CHNL_10    = 0b10001010;
  this.CHNL_11    = 0b10001011;
  this.CHNL_12    = 0b10001100;
  this.CHNL_13    = 0b10001101;
  this.CHNL_14    = 0b10001110;
  this.CHNL_15    = 0b10001111;
  this.CHNL_16    = 0b10010000;
  this.CHNL_17    = 0b10010001;
  this.CHNL_18    = 0b10010010;
  this.CHNL_19    = 0b10010011;
  this.CHNL_20    = 0b10010100;
  this.CHNL_SLP   = 0b10010111;
  /* Thermocouple Definitions */
  // TC Cold Junction Mapping *COMPLETE*
  // This is the cold junction channels represented in binary form
  // Cold Junction Pointers
  this.NO_CJ      = 0b00000;
  this.CJ_CHNL_1  = 0b00001;
  this.CJ_CHNL_2  = 0b00010;
  this.CJ_CHNL_3  = 0b00011;
  this.CJ_CHNL_4  = 0b00100;
  this.CJ_CHNL_5  = 0b00101;
  this.CJ_CHNL_6  = 0b00110;
  this.CJ_CHNL_7  = 0b00111;
  this.CJ_CHNL_8  = 0b01000;
  this.CJ_CHNL_9  = 0b01001;
  this.CJ_CHNL_10 = 0b01010;
  this.CJ_CHNL_11 = 0b01011;
  this.CJ_CHNL_12 = 0b01100;
  this.CJ_CHNL_13 = 0b01101;
  this.CJ_CHNL_14 = 0b01110;
  this.CJ_CHNL_15 = 0b01111;
  this.CJ_CHNL_16 = 0b10000;
  this.CJ_CHNL_17 = 0b10001;
  this.CJ_CHNL_18 = 0b10010;
  this.CJ_CHNL_19 = 0b10011;
  this.CJ_CHNL_20 = 0b10100;
  // TC Excitation Current ex. EXT, This is the excitation current provided by the LTC2983: Datasheet has more info
  // This is measured in microamps of excitation current [UA APPENDED]
  // EXT is the external excitation source will be used
  this.TC_EXT_C   = 0b00;
  this.TC_10UA    = 0b00;
  this.TC_100UA   = 0b01;
  this.TC_500UA   = 0b10;
  this.TC_1000UA  = 0b11;
  // TC SE/DIFF VALS
  this.SNGL       = true;
  this.DIFF       = false;
  // Over current protection
  this.OC_CHK_ON  = true;
  this.OC_CHK_OFF = false;
  /* DIODE CONFIGURATION */
  // 2 or 3 readigs, Diode Readings at 2 or 3 different current levels
  this.CONV_3     = true;
  this.CONV_2     = false;
  // Averaging mode enabled *Use this only if diode is stable
  this.D_AVG_ON   = true;
  this.D_AVG_OFF  = false;
  // Excitation Current Settins
  this.D_10UA     = 0b00;
  this.D_20UA     = 0b01;
  this.D_40UA     = 0b10;
  this.D_80UA     = 0b11;
  // Rejection Modes
  this.FIFTY_SIXTY = 0b00;
  this.SIXTY       = 0b01;
  this.FIFTY       = 0b10;
  //CC MAP ASSIGNMENT
  eval(this.ccMapStr); //???DANGER ZONE???
  //BOARD SPECIFIC SETUP TO RFPGA
  this.rfpgaDiodes = [this.CHANNEL_1,this.CHANNEL_5,this.CHANNEL_9,this.CHANNEL_13,this.CHANNEL_17];
  this.rfpgaTcK    = [this.CHANNEL_3,this.CHANNEL_7,this.CHANNEL_11,this.CHANNEL_15,this.CHANNEL_19];
}
