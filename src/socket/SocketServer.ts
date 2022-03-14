import socketManager from ".";
import ModelUser from "../models/ModelUser";
import Util from "./Util";

// 1 引入模块
const net = require("net");
const readline = require("readline");
interface DataServer {
  method: String;
  args?: any;
  kwargs?: Object;
  call?: Function;
}
export default class SocketServer {
  static io;

  static init() {
    return new Promise(rsv => {
      // rsv(null)
      // return;

      this.io = new net.Socket();
      // 3 链接
      this.io.connect({ port: 8888, host: "212.129.234.189" });
      // this.io.connect({ port: 8884, host: "127.0.0.1" });

      this.io.setEncoding("utf8");
      this.io.on("ready", async () => {
        setInterval(e => {
          this.doHeart();
        }, 5000);
        // this.getUserList(100, 1, '')
        // this.getAvatar('115')
        // this.setUserTag('2wR0NEBo', true)
        // this.setUserInfo({
        //   uid: '2wR0NEBo', type: 'add', gold: 1, diamond: 0, reason: '测试接口'
        // })
        // this.getUserInfo('115')
        rsv(null);
      });
      this.listen();
    });
  }
  static listen() {
    this.io.on("connect", chunk => {
      console.log("SocketServer连接成功");
      this.sendMsg({
        method: 'RegisterService', kwargs: { name: 'Snooker28' }
      })
    });
    this.io.on("data", chunk => {
      let buffer = Buffer.alloc(chunk.length, chunk);
      this.bufferCache = Buffer.concat([this.bufferCache, buffer],
        this.bufferCache.length + buffer.length)
      while (this.doCheckData()) {
        console.log('========数据包长度足够，解包========')
      }
      console.log('========单次解包完成========')
    });
    this.io.on("error", e => {
      console.log("SocketServer连接出错", e.message);
    });
    this.io.on("drain", e => {
    });
    this.io.on("close", e => {
      console.log("SocketServer关闭");
    });
  }
  static bufferCache: Buffer = Buffer.alloc(0);
  static doCheckData() {
    if (this.bufferCache.length <= 8) {
      return false
    }
    let bufferLen = this.bufferCache.slice(0, 8);
    // 得到两个byte数组
    let bufferSecret = Buffer.alloc(this.strSecret.length, this.strSecret);
    // 俩数组去异或
    for (let i = 0; i < bufferLen.length; i++) {
      bufferLen[i] ^= bufferSecret[i % bufferSecret.length];
    }
    let len = +bufferLen.toString() - 4;
    let bufferData = this.bufferCache.slice(8, this.bufferCache.length)
    console.log(len, bufferData.length, '长度')
    if (bufferData.length >= len) {
      // 数据包长度足够
      console.log('数据包长度足够')
      this.getMsg(this.bufferCache.slice(0, len + 8));
      // 解码后清空缓存的长度和数据
      this.bufferCache = this.bufferCache.slice(len + 8, this.bufferCache.length);
      return true
    } else {
      return false
    }
  }
  static getBytesLength(str) {
    var totalLength = 0;
    var charCode;
    for (var i = 0; i < str.length; i++) {
      charCode = str.charCodeAt(i);
      if (charCode < 0x007f) {
        totalLength++;
      } else if (0x0080 <= charCode && charCode <= 0x07ff) {
        totalLength += 2;
      } else if (0x0800 <= charCode && charCode <= 0xffff) {
        totalLength += 3;
      } else {
        totalLength += 4;
      }
    }
    return totalLength;
  }

  static encode(data = {}, withLen = true) {
    let strJson = JSON.stringify(data);
    let strSecret = "billiards";
    // 得到两个byte数组
    let buffer = Buffer.alloc(this.getBytesLength(strJson), strJson);
    let bufferSecret = Buffer.alloc(this.getBytesLength(strSecret), strSecret);
    // 俩数组去异或
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= bufferSecret[i % bufferSecret.length];
    }
    // 在最前面写入长度
    if (withLen) {
      let lenBuffer = Buffer.alloc(4);
      lenBuffer.writeUInt32LE(buffer.length);
      let finalBuff = Buffer.concat(
        [lenBuffer, buffer],
        lenBuffer.length + buffer.length
      );
      return finalBuff;
    } else {
      return buffer;
    }
  }

  static strSecret = "billiards";
  static decode(bufferData: Buffer, withLen = true) {
    // 得到两个byte数组
    let bufferSecret = Buffer.alloc(this.strSecret.length, this.strSecret);
    // 俩数组去异或
    for (let i = 0; i < bufferData.length; i++) {
      bufferData[i] ^= bufferSecret[i % bufferSecret.length];
    }
    let str = bufferData.slice(withLen ? 8 : 0, bufferData.length);
    let res = {};
    try {
      res = JSON.parse(str.toString());
      return res;
    } catch (e) {
      console.warn("============JSON parse err=========================");
      console.warn(str.toString());
      // console.warn(e)
      return {};
    }
  }
  static timeMap = {}
  static callMap = {};
  static sendMsg(data: DataServer) {
    return new Promise((rsv, rej) => {
      if (!this.io) {
        rsv({ code: -1 })
        return
      }
      let callId = Util.getUniqId();
      let callName = `snooker28_${callId}`;
      this.timeMap[callName] = new Date().getTime()
      data.kwargs["callback"] = callName;
      if (data.method != "_heartbeat") {
        console.log(`请求SocketServer`, data,);
      }
      this.callMap[callName] = e => {
        if (e.code == 0) {
          rsv(e.data || e);
        } else {
          rej(e);
        }
        this.callMap[callName] = [];
        delete this.callMap[callName];
      };
      this.io.write(this.encode(data));
    });
  }
  static doLogin(data) {
    return this.sendMsg({
      method: "_H5DoLogin",
      args: [],
      kwargs: data
    });
  }
  static doHeart() {
    this.sendMsg({
      method: "_heartbeat",
      args: [],
      kwargs: {}
    });
  }
  static async setUserTag(uid, flag) {
    let data = await this.sendMsg({
      method: "_SetUserInfo",
      args: [],
      kwargs: {
        uid,
        flag
      }
    });
    return data;
  }
  static async getUserInfoAndFormat(uid) {
    if (!this.io) {
      let user: any = (await ModelUser.findOne({ uid })) || {};
      let data = {
        coin: user.coin,
        tagCheat: user.tagCheat,
        uid: user.uid,
        nickname: user.nickname,
        avatar: user.avatar
      };
      return data;
    }
    let data = (await this.sendMsg({
      method: "_GetUserInfo",
      args: [],
      kwargs: {
        uid
      }
    })) as any;
    if (!data || !data.assets) {
      return false;
    } else {
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
        avatar: data.avatar
      };

    }
  }
  static async getUserInfo(uid) {
    let data = await this.sendMsg({
      method: "_GetUserInfo",
      args: [],
      kwargs: {
        uid
      }
    });
    return data;
  }
  static async setUserInfo({ uid, type, gold, diamond, reason, tag }) {
    if (!this.io) {
      let user = await ModelUser.findOne({ uid });
      let data = await ModelUser.updateOne(
        { uid },
        { coin: type == "add" ? user.coin + gold : user.coin - gold }
      );
      return data;
    }
    let data = await this.sendMsg({
      method: "_SetAssets",
      args: [],
      kwargs: { uid, type, golds: gold, diamond, reason, tag }
    });
    return data;
  }
  static async getAvatar(uid) {
    let data = await this.sendMsg({
      method: "_GetAvatar",
      args: [],
      kwargs: {
        uid
      }
    });
    return data;
  }
  static async getUserList(pageSize, page, userName) {
    let data = await this.sendMsg({
      method: "_GetUsersInfo",
      args: [],
      kwargs: {
        pageSize,
        page,
        userName
      }
    });
    return data;
  }

  static getMsg(msg: Buffer) {
    let res: any = this.decode(msg);
    let timeStart = this.timeMap[res.method]
    console.log(`SocketServer返回,耗时${new Date().getTime() - timeStart}`, res);
    if (res.method) {
      let func = this.callMap[res.method];
      let data = res.kwargs;
      func && func(data);
      if (res.method == '_CheckUserInH5Game') {
        let { uid, client_id } = data;
        let roomId = socketManager.getInRoomByUid(uid);
        // 查询玩家是否在游戏中
        this.sendMsg({
          method: data.callback, kwargs: { name: roomId ? 'Snooker28' : '' }
        })
      }
    } else {
    }
  }
  static async onMessage(res, socket) { }
  static onDisconnect(socket) { }
  static onConnect(socket) { }
}
