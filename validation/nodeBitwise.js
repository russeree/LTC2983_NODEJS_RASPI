// A Bitwase Mask Generator
function maskGen(lsbBitPosition, data){
  var buf = new Buffer(4);
  buf.writeUInt32BE((((data) << lsbBitPosition) & (0xFFFFFFFF)),0,true);
  return(buf.readUInt32BE(0));
}

for (i = 0; i < 32; i++)
  console.log(maskGen(i,0x00000001).toString(2));
