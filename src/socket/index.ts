import RoomManager from "./controller/RoomManager";
import PROTOCLE from "./config/PROTOCLE";
import { PEOPLE_EACH_GAME_MAX } from "./config";
import Util from "./Util";
import SocketServer from "./SocketServer";


export default class socketManager {
  static isTest = true;
  static isOpen = true;
  static io;
  static userSockets = {};
  static aliveRoomList: RoomManager[] = [];
  static userMap = {};
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
  static async init(io) {
    this.io = io;
    if (!socketManager.isTest) {
      await SocketServer.init()
    }
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
  static checkInGame(uid) {
    let roomId = this.getInRoomByUid(uid);
    let roomCtr = this.getRoomCtrByRoomId(roomId)
    let roomInfo = roomCtr.getRoomInfo();
    if (roomInfo && roomInfo.isInRoom) {
      return 1
    } else {
      return 0
    }
  }
  static async onMessage(res, socket) {
    // 公共头
    let uid = res.uid;
    if (!uid) {
      return;
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
        let userInfo = await SocketServer.getUserInfoAndFormat(uid)
        if (!userInfo) {
          return
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
          let userInfo = await SocketServer.getUserInfoAndFormat(uid)
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
      case 'SHOW_BALLS': {
        if (!roomCtr) {
          return;
        }
        roomCtr.showBalls(uid)
        break
      }
      case 'CHAT': {
        if (!roomCtr) {
          return;
        }
        roomCtr.showChat(uid, data.conf)
        break
      }
    }
  }
  static onDisconnect(socket) {
    // 通过socket反查用户，将用户数据标记为断线
    for (let uid in this.userSockets) {
      if (this.userSockets[uid] == socket) {
        console.log(`用户${uid}掉线`)
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
