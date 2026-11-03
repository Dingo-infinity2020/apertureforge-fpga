// First receiver policy: Ethernet II / IPv4 IHL=5 / UDP checksum ZERO only.
// Frame begins at destination MAC, FCS stripped by MAC; no VLAN/IP options/fragments.
import {decode,validate} from './packet.mjs';
export function ipChecksum(bytes){
 if(bytes.length%2)throw Error('CHECKSUM_SIZE');let sum=0;
 for(let i=0;i<bytes.length;i+=2)sum+=bytes.readUInt16BE(i);
 while(sum>65535)sum=(sum&65535)+(sum>>>16);return (~sum)&65535;
}
function address(hex,n){if(typeof hex!=='string'||!new RegExp(`^[0-9a-fA-F]{${n*2}}$`).test(hex))throw Error('ADDRESS');return Buffer.from(hex,'hex');}
export function wrapEthernet(app,net){
 if(!Buffer.isBuffer(app)||app.length+28>net.mtu)throw Error('MTU');
 const b=Buffer.alloc(42+app.length);
 address(net.destination_mac,6).copy(b,0);address(net.source_mac,6).copy(b,6);b.writeUInt16BE(0x0800,12);
 b[14]=0x45;b.writeUInt16BE(28+app.length,16);b.writeUInt16BE(0x4000,20);b[22]=64;b[23]=17;
 address(net.source_ip,4).copy(b,26);address(net.destination_ip,4).copy(b,30);
 b.writeUInt16BE(ipChecksum(b.subarray(14,34)),24);
 b.writeUInt16BE(net.source_port,34);b.writeUInt16BE(net.destination_port,36);b.writeUInt16BE(8+app.length,38);
 app.copy(b,42);return b;
}
export function unwrapEthernet(b,net){
 if(!Buffer.isBuffer(b)||b.length<106)throw Error('FRAME_SHORT');
 if(b.length>14+net.mtu)throw Error('MTU');
 if(b.readUInt16BE(12)!==0x0800||b[14]!==0x45||b[23]!==17||(b.readUInt16BE(20)&0xbfff)!==0||b.readUInt16BE(40)!==0)throw Error('UNSUPPORTED');
 if(ipChecksum(b.subarray(14,34))!==0)throw Error('IP_CHECKSUM');
 const ip=b.readUInt16BE(16),udp=b.readUInt16BE(38);
 if(ip<92||udp<72||ip!==udp+20||b.length!==ip+14)throw Error('NETWORK_LENGTH');
 if(!b.subarray(0,6).equals(address(net.destination_mac,6))||!b.subarray(30,34).equals(address(net.destination_ip,4))||b.readUInt16BE(36)!==net.destination_port)throw Error('NETWORK_DESTINATION');
 return Buffer.from(b.subarray(42));
}
export function axisBeats(frame,width=512){
 if(![32,64,512].includes(width)||!frame.length)throw Error('WIDTH');const n=width/8,out=[];
 for(let offset=0;offset<frame.length;offset+=n){const length=Math.min(n,frame.length-offset),data=Buffer.alloc(n);frame.copy(data,0,offset,offset+length);
  out.push({data_hex:data.toString('hex'),keep_hex:((1n<<BigInt(length))-1n).toString(16),last:offset+length===frame.length,error:false});}
 return out;
}
export function frameFromBeats(beats,width=512){
 if(![32,64,512].includes(width)||!beats.length)throw Error('WIDTH');const n=width/8,full=(1n<<BigInt(n))-1n,parts=[];
 for(let i=0;i<beats.length;i++){
  const beat=beats[i],data=Buffer.from(beat.data_hex,'hex'),keep=BigInt('0x'+beat.keep_hex);
  if(data.length!==n||keep===0n||keep>full||(keep&(keep+1n))!==0n||(!beat.last&&keep!==full))throw Error('KEEP');
  if(beat.last!==(i===beats.length-1))throw Error('LAST');
  if(beat.error)throw Error('FRAME_ERROR');
  parts.push(data.subarray(0,keep.toString(2).length));
 }
 return Buffer.concat(parts);
}
export function validateNetworkBeats(beats,width,net,c,s,session){
 return validate(decode(unwrapEthernet(frameFromBeats(beats,width),net)),c,s,session);
}
