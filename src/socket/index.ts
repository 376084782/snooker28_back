import RoomManager from "./controller/RoomManager";
import PROTOCLE from "./config/PROTOCLE";
import { PEOPLE_EACH_GAME_MAX } from "./config";
import Util from "./Util";
import ModelUser from "../models/ModelUser";


export default class socketManager {
  static io;
  static userSockets = {};
  static aliveRoomList: RoomManager[] = [];
  static async getRoomCanJoin({ level }) {
    // 检查当前已存在的房间中 公开的，人未满的,未开始游戏的
    let list = this.aliveRoomList.filter((roomCtr: RoomManager) => {
      return (
        roomCtr.level == level &&
        roomCtr.uidList.length < PEOPLE_EACH_GAME_MAX &&
        roomCtr.step == 0
      );
    });
    if (list.length == 0) {
      let roomNew = new RoomManager({ level });
      await roomNew.initConfig();
      this.aliveRoomList.push(roomNew);
      return roomNew;
    } else {
      let idx = Util.getRandomInt(0, list.length)
      return list[idx];
    }
  }
  static removeRoom(room: RoomManager) {
    this.aliveRoomList = this.aliveRoomList.filter((ctr: RoomManager) => ctr != room);
  }
  // 公共错误广播
  static sendErrByUidList(uidList: number[], protocle: string, data) {
    this.sendMsgByUidList(uidList, PROTOCLE.SERVER.ERROR, {
      protocle,
      data
    });
  }
  static sendMsgByUidList(userList: number[], type: string, data = {}) {
    userList.forEach(uid => {
      let socket = this.userSockets[uid];
      if (socket) {
        socket.emit("message", {
          type,
          data
        });
      }
    });
  }
  static init(io) {
    // console.log('======初始化io======')
    this.io = io;
    this.listen();

  }
  static getInRoomByUid(uid) {
    let ctrRoom = this.aliveRoomList.find(ctr => ctr.uidList.indexOf(uid) > -1)
    return ctrRoom && ctrRoom.roomId;
  }
  static listen() {
    this.io.on("connect", this.onConnect);
  }
  static getRoomCtrByRoomId(roomId): RoomManager {
    if (!!roomId) {
      return this.aliveRoomList.find(roomCtr => roomCtr.roomId == roomId);
    }
  }
  static async onMessage(res, socket) {
    // console.log("收到消息", res);
    // 公共头
    let uid = res.uid;
    if (!uid) {
      return;
    }
    let modelUser = await ModelUser.findOne({ uid: uid })
    let userInfo = {
      uid: uid,
      nickname: '测试玩家' + uid,
      avatar: '',
      coin: 0
    }
    if (modelUser) {
      userInfo = {
        nickname: modelUser.nickname,
        uid: modelUser.uid,
        avatar: modelUser.avatar,
        coin: modelUser.coin
      }
    } else {
      await ModelUser.create(userInfo);
    }
    let data = res.data;
    let type = res.type;
    if (this.userSockets[uid] && this.userSockets[uid] != socket) {
      // 已存在正在连接中的，提示被顶
      socketManager.sendErrByUidList([uid], "connect", {
        msg: "账号已被登录，请刷新或退出游戏"
      });
    }
    this.userSockets[uid] = socket;

    let roomId = this.getInRoomByUid(uid);
    let roomCtr = this.getRoomCtrByRoomId(roomId);

    switch (type) {
      case PROTOCLE.CLIENT.EXIT: {
        if (roomCtr) {
          roomCtr.leave(uid);
        }
        break;
      }
      case PROTOCLE.CLIENT.RECONNECT: {
        // 检测重连数据
        let dataGame: any = {
          isMatch: data.isMatch
        };

        if (roomCtr) {
          // 获取游戏数据并返回
          dataGame = roomCtr.getRoomInfo();
        }
        this.sendMsgByUidList([uid], PROTOCLE.SERVER.RECONNECT, {
          userInfo: userInfo,
          dataGame
        });
        break;
      }
      case PROTOCLE.CLIENT.MATCH: {
        // 参与或者取消匹配
        let { level, flag } = data;
        if (flag) {
          if (roomCtr && roomCtr.roomId != 0) {
            this.sendErrByUidList([uid], PROTOCLE.CLIENT.MATCH, {
              msg: "已经处于游戏中，无法匹配"
            });
            return;
          }

          let targetRoom: RoomManager;
          targetRoom = await this.getRoomCanJoin({ level });

          targetRoom.join(userInfo);
        } else {
          if (!roomCtr) {
            return;
          }
          roomCtr.leave(uid);
        }
        break;
      }
      case PROTOCLE.CLIENT.PING: {
        // 发回接收到的时间戳，计算ping
        this.sendMsgByUidList([uid], PROTOCLE.SERVER.PING, {
          timestamp: data.timestamp
        });
        break;
      }
      case 'READY': {
        if (!roomCtr) {
          return;
        }
        let { flag } = data;
        roomCtr.changeReady(uid, flag)
        break
      }
      case 'ACTION': {
        if (!roomCtr) {
          return;
        }
        let { type, extraData } = data
        roomCtr.doAction(uid, type, extraData)
        break
      }
    }
  }
  static onDisconnect(socket) {
    // 通过socket反查用户，将用户数据标记为断线
    for (let uid in this.userSockets) {
      if (this.userSockets[uid] == socket) {
        console.log('用户uid掉线,取消匹配')
        // 踢出用户
        let roomId = this.getInRoomByUid(uid);
        let roomCtr = this.getRoomCtrByRoomId(roomId);
        if (roomCtr) {
          roomCtr.leave(uid);
        }
      }
    }
  }
  static onConnect(socket) {
    socket.on('disconnect', () => {
      socketManager.onDisconnect(socket)
    });
    socket.on("message", res => {
      socketManager.onMessage(res, socket);
    });
  }
}
