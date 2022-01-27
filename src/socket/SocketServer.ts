import ModelUser from "../models/ModelUser";
import Util from "./Util";

// 1 引入模块
const net = require('net');
const readline = require('readline');
interface DataServer {
  method: String, args?: any, kwargs?: Object, call?: Function,
}
export default class SocketServer {
  static io;

  static init() {
    return new Promise(rsv => {

      this.io = new net.Socket();
      // 3 链接
      this.io.connect({ port: 8888, host: '101.34.156.23' });

      this.io.setEncoding('utf8');
      this.io.on('ready', async () => {
        setInterval(e => { this.doHeart() }, 5000)
        // this.getUserList(10, 1, '')
        // this.getAvatar('2wR0NEBo2')
        // this.setUserTag('2wR0NEBo', true)
        // this.setUserInfo({
        //   uid: '2wR0NEBo', type: 'add', gold: 1, diamond: 0, reason: '测试接口'
        // })
        // this.getUserInfo('2wR0NEBo')
        rsv(null)
      })
      this.listen();
    })

  }
  static listen() {
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
  }

  static getBytesLength(str) {
    var totalLength = 0;
    var charCode;
    for (var i = 0; i < str.length; i++) {
      charCode = str.charCodeAt(i);
      if (charCode < 0x007f) {
        totalLength++;
      } else if ((0x0080 <= charCode) && (charCode <= 0x07ff)) {
        totalLength += 2;
      } else if ((0x0800 <= charCode) && (charCode <= 0xffff)) {
        totalLength += 3;
      } else {
        totalLength += 4;
      }
    }
    return totalLength;
  }
  static encode(data = {}) {
    let strJson = JSON.stringify(data)
    let strSecret = 'billiards'
    // 得到两个byte数组
    let buffer = Buffer.alloc(this.getBytesLength(strJson), strJson)
    let bufferSecret = Buffer.alloc(this.getBytesLength(strSecret), strSecret)
    // 俩数组去异或 
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= bufferSecret[i % bufferSecret.length]
    }
    // 在最前面写入长度
    let lenBuffer = Buffer.alloc(4)
    lenBuffer.writeUInt32LE(buffer.length)
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
    let res = {}
    try {
      res = JSON.parse(bufferData.toString())
      return res
    } catch (e) {
      console.log(bufferData.toString())
      console.log(e)
      return {}
    }
  }
  static callMap = {};
  static sendMsg(data: DataServer) {
    return new Promise((rsv, rej) => {
      let callName = `snooker28_${Util.getUniqId()}`
      data.kwargs['callback'] = callName
      if (data.method != '_heartbeat') {
        console.log(data, '发送数据')
      }
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
  static async getUserInfoAndFormat(uid) {
    if (!this.io) {
      let user: any = await ModelUser.findOne({ uid }) || {}
      let data = {
        coin: user.coin,
        tagCheat: user.tagCheat,
        uid: user.uid,
        nickname: user.nickname,
        avatar: user.avatar,
      }
      return data
    }
    let data = await this.sendMsg({
      "method": "_GetUserInfo",
      "args": [],
      "kwargs": {
        uid
      }
    }) as any
    return {
      // 拥有的金币
      coin: data.assets.golds,
      // 是否高概率获胜 25-28
      tagCheat: data.flag,
      // uid
      uid: data.id,
      // 玩家名称
      nickname: data.user_name,
      // 玩家头像
      avatar: data.avatar,

    }

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
    if (!this.io) {
      let user = await ModelUser.findOne({ uid })
      let data = await ModelUser.updateOne({ uid }, { coin: type == 'add' ? user.coin + gold : user.coin - gold })
      return data
    }
    let data = await this.sendMsg({
      "method": "_SetAssets",
      "args": [],
      "kwargs": { uid, type, gold, diamond, reason }
    })
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
  static async onMessage(res, socket) {

  }
  static onDisconnect(socket) {
  }
  static onConnect(socket) {
  }
}
