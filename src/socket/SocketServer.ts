// 1 引入模块
const net = require('net');
const readline = require('readline');
interface DataServer {
  method: String, args?: any, kwargs?: Object, call?: Function,
}
export default class SocketServer {
  static io;

  static init() {

    this.io = new net.Socket();
    // 3 链接
    this.io.connect({ port: 8888, host: '101.34.156.23' });

    this.io.setEncoding('utf8');
    this.io.on('ready', async () => {
      setInterval(e => { this.doHeart() }, 5000)
      // this.getUserList(10, 1, '')
      // this.getAvatar('2wR0NEBo')
      // this.setUserTag('2wR0NEBo', true)
      // this.setUserInfo({
      //   uid: '2wR0NEBo', type: 'add', gold: 1, diamond: 0, reason: '测试接口'
      // })
      // this.getUserInfo('2wR0NEBo')
    })
    this.io.on('connect', (chunk) => {
      console.log('connect', chunk)
    })
    this.io.on('data', (chunk) => {
      this.getMsg(chunk)
    })
    this.io.on('error', (e) => {
      console.log('error', e.message);
    })
    this.io.on('drain', e => {
      console.log('drain', e)
    })
    this.io.on('close', (e) => {
      console.log('close', e);
    })
    this.listen();
  }
  static encode(data = {}) {
    let strJson = JSON.stringify(data)
    let strSecret = 'billiards'
    // 得到两个byte数组
    let buffer = Buffer.alloc(strJson.length, strJson)
    let bufferSecret = Buffer.alloc(strSecret.length, strSecret)
    // 俩数组去异或
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= bufferSecret[i % bufferSecret.length]
    }
    // 在最前面写入长度
    let lenBuffer = Buffer.alloc(4)
    lenBuffer.writeUInt8(buffer.length)
    let finalBuff = Buffer.concat([lenBuffer, buffer], lenBuffer.length + buffer.length)
    return finalBuff
  }

  static decode(msg: Buffer) {
    let bufferLen = Buffer.alloc(0);
    let bufferData = Buffer.alloc(0);
    for (let i = 0; i < msg.length; i++) {
      if (i < 4) {
        let b = Buffer.alloc(1, msg[i])
        bufferLen = Buffer.concat([bufferLen, b], bufferLen.length + b.length)
      } else {
        let b = Buffer.alloc(1, msg[i])
        bufferData = Buffer.concat([bufferData, b], bufferData.length + b.length)
      }
    }
    let strSecret = 'billiards'
    // 得到两个byte数组
    let bufferSecret = Buffer.alloc(strSecret.length, strSecret)
    // 俩数组去异或
    for (let i = 0; i < bufferData.length; i++) {
      bufferData[i] ^= bufferSecret[i % bufferSecret.length]
    }
    return JSON.parse(bufferData.toString())
  }
  static funcId = 0;
  static callMap = {};
  static sendMsg(data: DataServer) {
    return new Promise((rsv, rej) => {
      this.funcId++;
      let callName = `snooker28_${this.funcId}`
      data.kwargs['callback'] = callName
      console.log(data, '发送数据')
      this.callMap[callName] = e => {
        if (e.code == 0) {
          rsv(e.data)
        } else {
          rej(e)
        }
        this.callMap[callName] = []
        delete this.callMap[callName]
      };
      this.io.write(this.encode(data))
    })
  }
  static doHeart() {
    this.sendMsg({
      "method": "_heartbeat",
      "args": [],
      "kwargs": {
      }
    })
  }
  static async setUserTag(uid, flag) {
    let data = await this.sendMsg({
      "method": "_SetUserInfo",
      "args": [],
      "kwargs": {
        uid, flag
      }
    })
    console.log(data, 'setUserTag')
    return data;
  }
  static async getUserInfo(uid) {
    let data = await this.sendMsg({
      "method": "_GetUserInfo",
      "args": [],
      "kwargs": {
        uid
      }
    })
    console.log(data, 'getUserInfo')
    return data;
  }
  static async setUserInfo({ uid, type, gold, diamond, reason }) {
    let data = await this.sendMsg({
      "method": "_SetAssets",
      "args": [],
      "kwargs": { uid, type, gold, diamond, reason }
    })
    console.log(data, 'setUserInfo')
    return data
  }
  static async getAvatar(uid) {
    let data = await this.sendMsg({
      "method": "_GetAvatar",
      "args": [],
      "kwargs": {
        uid
      }
    })
    console.log(data, 'getAvatar')
    return data
  }
  static async getUserList(pageSize, page, userName) {
    let data = await this.sendMsg({
      "method": "_GetUsersInfo",
      "args": [],
      "kwargs": {
        pageSize, page, userName
      }
    })
    console.log(data, 'getUserList')
    return data
  }

  static getMsg(msg: Buffer) {
    let res: any = this.decode(msg)
    console.log(res, '收到数据')
    if (res.method) {
      let func = this.callMap[res.method]
      let data = res.kwargs;
      func && func(data)
    } else {

    }
  }
  static listen() {
    this.io.on("connect", this.onConnect);
  }
  static async onMessage(res, socket) {

  }
  static onDisconnect(socket) {
  }
  static onConnect(socket) {
  }
}
