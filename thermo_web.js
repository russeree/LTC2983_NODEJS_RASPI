/**
 * @Auth: Reese Russell
 * @desc: A LTC2983 Service
 **/

/** WEBSERVER AND DAEMON PROCESS **/
var childProcess = require('child_process');
var express      = require('express');
var app          = express();
var http         = require('http').Server(app);
var io           = require('socket.io')(http);
/** MONGODB INTERGRATION **/
var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://localhost:27017/thermo";
var currentChannels = initChannels();

app.use(express.static('views/public'));

//Create a ThermoBoard Daemon to record to mongo
var n = childProcess.fork(__dirname + '/thermo_pi.js');
//Kill the daemon on EXIT
process.on('exit', function () {
    console.log("Killed The Background Daemon Nicely");
    n.kill();
});

/*** Web Server Construction and Exection ***/
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/views/public/index.html');
})

http.listen(80, function () {
 console.log('ThermoPi interface listening on port 80!');
})

async function initChannels(){
  var channels = await getDbChannels();
  console.log("Found the following channels " + channels);
  return channels;
}

function getDbChannels(collection = "temp"){
  var res = [];
  return new Promise ((resolve, reject) => {
    MongoClient.connect(url, function(err, db) {
      if (err){
        reject(err)
      }
      else{
        db.collection(collection).find().forEach(function(doc){
          for (var key in doc.data){
              if(res.indexOf(key) < 0){
                 res.push(key)
              }
          }
        }, function(err){
          db.close()
          resolve(res)
        });
      }
    });
  });
}

/*** Emit a list of channels to the clients ***/
function emitChannelList (){
  currentChannels.then((channels) => {
    io.emit('channelList', {'channels': channels})
  });
}

/*** SOCKETS HANDLER ***/
io.sockets.on('connection', function (socket) {
    emitChannelList();
    console.log("Socket Connected from "  + socket.handshake.address);
    socket.on('message', function(msg){
      console.log('User Input: ' + msg);
      getTempData(msg);
    });
    socket.on('getChannels', () => {
      emitChannelList();
    });
    socket.on('disconnect', function(data) {
        console.log("Client Left");
    });
});

/** Gets data from the mongoDB database **/
function getTempData(points){
  io.emit('resData', "Now Searching Database...");
  limPts = points;
  MongoClient.connect(url, function(err, db) {
    if (err) throw err;
    db.collection("temp").find().sort({_id:-1}).limit(parseInt(limPts)).toArray(function(err, docs){
      for (i = 0; i < docs.length; ++i){
        io.emit('resData', "Temp Reccord Recorded on: " + new Date(docs[i].time));
        for (index = 0; index < docs[i].data.length; ++index){
          io.emit('resData',"Temp = " + docs[i].data[index][0].toString() + " on channel " + docs[i].data[index][1].toString());
          }
      }
      console.log("DB PARSE COMPLETE WITH " + points + " ITEMS");
      db.close();
    });
  });
}
