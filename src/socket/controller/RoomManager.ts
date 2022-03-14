import Util from "../Util";
import socketManager from "..";
import _ from "lodash";
import PROTOCLE from "../config/PROTOCLE";
import ModelConfigRoom from "../../models/ModelConfigRoom";
import SocketServer from "../SocketServer";
// 游戏内玩家全部离线的房间，自动清除
export default class RoomManager {
  // 房间等级
  level = 1;
  roomId = 0;
  isPublic = true;
  // 0匹配阶段 1开始游戏
  step = 0;
  game: any = {
    count: 0,
    countInRound: 0,
    ballLeft: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    deskList: [],
    currentSeat: 0,
    chip: 20000,
    timeEnd: 0,
    round: 1
  };
  roundAllIn = {};
  maxRound = 15;

  // 存当前在游戏中的uid列表
  get uidList() {
    return this.userList.map(e => e.uid);
  }
  uidListLastRound = [];
  userList = [];

  constructor({ level }) {
    this.roomId = Util.getUniqId();
    this.level = level;

    this.step = 0;
    this.resetGameInfo();
  }

  showChat(uid, conf) {
    socketManager.sendMsgByUidList(this.uidList, 'CHAT', { uid, conf });

  }
  async initConfig() {
    let config = await ModelConfigRoom.findOne({ id: this.level });

    this.config = {
      name: config.name,
      id: config.id,
      basicChip: config.basicChip,
      chipList: JSON.parse(config.chipList),
      teaMoney: config.teaMoney,
      min: config.min,
      max: config.max
    };
  }
  doConnect(uid) {
    let user = this.userList.find(e => e.uid == uid);
    if (user && user.isDisConnected) {
      user.isDisConnected = false;
      socketManager.sendMsgByUidList(
        this.uidList,
        PROTOCLE.SERVER.ROOM_USER_UPDATE,
        {
          userList: this.userList
        }
      );
    }

  }
  userDisconnectInGame(uid) {
    let user = this.userList.find(e => e.uid == uid);
    if (user) {
      user.isDisConnected = true;
      socketManager.sendMsgByUidList(
        this.uidList,
        PROTOCLE.SERVER.ROOM_USER_UPDATE,
        {
          userList: this.userList
        }
      );
    }

  }
  // 玩家离开
  leave(uid) {
    if (this.step > 0) {
      this.userDisconnectInGame(uid)
      return;
    }
    clearTimeout(this.timerJoin[uid]);
    socketManager.sendMsgByUidList([uid], PROTOCLE.SERVER.GO_HALL, {});
    this.userList = this.userList.filter(user => user.uid != uid);
    socketManager.sendMsgByUidList(
      this.uidList,
      PROTOCLE.SERVER.ROOM_USER_UPDATE,
      {
        userList: this.userList
      }
    );
    this.checkCanStart();
  }
  timerJoin = {};
  // 玩家加入
  async join(userInfo) {
    if (userInfo.coin > this.config.max) {
      console.log(`${userInfo.uid}金币大于该房间上限，无法加入`)
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "金币大于该房间上限"
      });
      return;
    }
    if (userInfo.coin < this.config.min) {
      console.log(`${userInfo.uid}金币不足，无法加入`)
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "金币不足"
      });
      return;
    }
    if (this.uidList.indexOf(userInfo.uid) > -1) {
      console.log(`${userInfo.uid}已经在房间里，无法重复加入`)
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "玩家已经在房间内"
      });
      return;
    }
    let blankSeat = this.getBlankSeat();
    if (blankSeat == 0) {
      console.log(`房间已满员，${userInfo.uid}无法加入`)
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "房间已满"
      });
      return;
    }
    userInfo.seat = blankSeat;
    this.userList.push(userInfo);
    socketManager.sendMsgByUidList(
      this.uidList,
      PROTOCLE.SERVER.ROOM_USER_UPDATE,
      {
        userList: this.userList
      }
    );
    socketManager.sendMsgByUidList([userInfo.uid], PROTOCLE.SERVER.GO_GAME, {
      dataGame: this.getRoomInfo()
    });
    this.addTimerToLeave(userInfo.uid);
  }
  getBlankSeat() {
    for (let i = 1; i < 4; i++) {
      if (!this.userList.find(e => e.seat == i)) {
        return i;
      }
    }
    return 0;
  }

  checkInRoom(uid) {
    return this.uidList.indexOf(uid) > -1;
  }

  getUserById(uid) {
    return this.userList.find(e => e.uid == uid);
  }
  addTimerToLeave(uid) {
    // return
    this.timerJoin[uid] = setTimeout(() => {
      // 十秒内不准备，踢出房间
      console.log(`${uid}10s不准备，被t出房间`)
      this.leave(uid);
    }, 10000);
  }
  changeReady(uid, flag) {
    if (flag) {
      clearTimeout(this.timerJoin[uid]);
    } else {
      this.addTimerToLeave(uid);
    }
    let userInfo = this.getUserById(uid);
    if (userInfo) {
      userInfo.ready = flag;
      console.log(`${uid}切换准备态：`, flag)
      socketManager.sendMsgByUidList(
        this.uidList,
        PROTOCLE.SERVER.ROOM_USER_UPDATE,
        {
          userList: this.userList
        }
      );
    }
    this.checkCanStart();
  }
  checkCanStart() {
    // 如果都准备了 开始游戏
    if (
      !this.userList.find(e => !e.ready) &&
      this.userList.length >= 2 &&
      this.step == 0
    ) {
      this.step = 2;
      this.game.timeStart = new Date().getTime() + 5000;
      socketManager.sendMsgByUidList(this.uidList, "BEFORE_START", {
        timeStart: this.game.timeStart
      });
      setTimeout(() => {
        this.doStartGame();
      }, 5000);
    }
  }
  resetGameInfo() {
    clearTimeout(this.timerNext);
    this.flagCanDoAction = false;
    this.step = 0;
    this.roundAllIn = {};
    this.game = {
      count: 0,
      countInRound: this.userList.length,
      ballLeft: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      deskList: [],
      currentSeat: 0,
      chip: 0,
      timeEnd: 0,
      round: 1
    };
    this.userList.forEach(user => {
      user.ballList = [];
      user.ready = false;
      user.isLose = false;
      user.deskList = [];
      setTimeout(() => {
        this.addTimerToLeave(user.uid);
      }, 7000);
    });
  }
  config: any;
  async doStartGame() {
    await this.initConfig();
    this.game.countInRound = this.userList.length;
    this.ballsOpen = false;
    this.winner = {};
    // 重置游戏数据
    this.step = 1;
    // 分发私有球
    this.userList.forEach(userInfo => {
      if (!userInfo.ballList) {
        userInfo.ballList = [];
      }
      userInfo.ballList.push(Util.getRandomInt(1, 10));
    });
    this.game.chip = this.config.basicChip;

    console.log('开始游戏，当前游戏中玩家:', this.uidList)
    this.userList.forEach(e => {
      console.log(`${e.uid}当前金币数量:`, e.coin)
    })
    for (let i = 0; i < this.userList.length; i++) {
      let user = this.userList[i];
      this.changeMoney(user.uid, -this.config.teaMoney, 30002);
      console.log(`扣除${user.uid}茶水费${this.config.teaMoney}金币`)
    }
    // 随机开始座位
    socketManager.sendMsgByUidList(this.uidList, "START_GAME", {
      chip: this.config.basicChip,
      dataGame: this.getRoomInfo()
    });
    this.game.round = 2;
    setTimeout(() => {
      // 扣除底注
      for (let i = 0; i < this.userList.length; i++) {
        let user = this.userList[i];
        this.throwMoney(user.uid, this.config.basicChip, 5);
        console.log(`开始游戏，扣除${user.uid}底注${this.config.basicChip}金币`)
      }
      setTimeout(() => {
        this.flagCanDoAction = true;
        let idx = Util.getRandomInt(0, this.userList.length);
        this.callNextTurn(this.userList[idx].seat);
        socketManager.sendMsgByUidList(this.uidList, "ACTION", {
          dataGame: this.getRoomInfo()
        });
      }, 2000);
    }, 1000);
  }
  flagCanDoAction = true;
  async doAction(uid, type, data?) {
    let user = this.getUserById(uid);
    let chipBefore = this.game.chip;

    if (user.seat != this.game.currentSeat || !this.flagCanDoAction) {
      return;
    }
    this.flagCanDoAction = false;
    user.lastAction = type;
    socketManager.sendMsgByUidList(this.uidList, "ACTION_SOUND", {
      uid,
      type,
      data,
      chipBefore
    });
    await Util.delay(100);
    if (type == 1) {
      if (data.chip >= user.coin) {
        return;
      }
      // 加注
      this.game.chip = data.chip;
      this.throwMoney(uid, data.chip, 3);
    } else if (type == 2) {
      let isAdd = data.chip > this.game.chip
      this.game.chip = data.chip;
      if (this.game.ballLeft.length <= 0) {
        console.log(`${uid}请求要球，但是当前游戏没有剩余球了，失败`)
        return;
      }
      // 要球
      let ballIdx = Util.getRandomInt(0, this.game.ballLeft.length);

      if (user.tagCheat) {
        let p = Math.random() < 0.7;
        if (p) {
          // 高概率使现在的球相加=25至28
          for (let i = 0; i < this.game.ballLeft.length; i++) {
            let nn = this.game.ballLeft[i];
            let ss = Util.sum(user.ballList) + nn;
            if (ss <= 28 && ss >= 25) {
              ballIdx = i;
            }
          }
        }
        console.log(`${uid}执行要球，且有高概率标签`)
      } else {
        console.log(`${uid}执行要球，且无高概率标签`)
      }
      let ball = this.game.ballLeft.splice(ballIdx, 1)[0];
      user.ballList.push(ball);
      for (let i = 0; i < this.uidList.length; i++) {
        let uu = this.uidList[i]
        let listNew = user.ballList.concat();
        if (uu != uid) {
          listNew.forEach((num, idx) => {
            if (idx > 0) {
              listNew[idx] = 99
            }
          })
        }
        socketManager.sendMsgByUidList([uu], "GET_BALL", {
          ball,
          uid,
          listNew: listNew,
          ballLeft: this.game.ballLeft
        });
      }
      await Util.delay(600);
      console.log(`${uid}扣除要球消耗的金币${data.chip}`)
      this.throwMoney(uid, data.chip, isAdd ? 3 : 1);
      await Util.delay(200);
    } else if (type == 3) {
      let isAdd = data.chip > this.game.chip
      this.game.chip = data.chip;
      // 不要球
      console.log(`${uid}请求不要球`)
      this.throwMoney(uid, data.chip, isAdd ? 4 : 2);
      console.log(`${uid}扣除不要球消耗的金币${data.chip}，并执行不要球操作`)
    } else if (type == 4) {
      // 放弃
      console.log(`${uid}请求放弃`)
      user.isLose = true;
      socketManager.sendMsgByUidList(this.uidList, "GIVEUP", { uid });
      console.log(`${uid}执行放弃操作`)
    }
    this.game.count++;
    if (this.game.count >= this.game.countInRound) {
      this.game.count = 0;
      this.game.round++;
      this.game.countInRound = this.getUserCanPlay().length;
    }
    let turnFinish = this.game.count == 0;
    socketManager.sendMsgByUidList(this.uidList, "ACTION", {
      dataGame: this.getRoomInfo(),
      uid,
      type,
      data,
      chipBefore
    });
    if (type == 2) {
      await Util.delay(200);
    }
    this.callNextTurn(this.getNextSeat());
    let isFinish = await this.checkFinish(turnFinish);
    if (isFinish) {
    } else {
      await Util.delay(200);
      this.flagCanDoAction = true;
    }
  }
  uidsAutoGiveup = []
  callNextTurn(seat) {
    let timeCost = 15000;
    let timeEnd = new Date().getTime() + timeCost;
    clearTimeout(this.timerNext);
    this.game.currentSeat = seat;
    this.game.timeEnd = timeEnd;
    let user = this.userList.find(e => e.seat == this.game.currentSeat);
    this.timerNext = setTimeout(async () => {
      // 超时自动选择  第一轮自动要球 之后自动放弃
      if (user && user.isDisConnected) {
        console.log(`玩家${user.uid}操作超时时，正好掉线了，多等10s`)
        // 如果当时正好断线了，多等10s
        clearTimeout(this.timerNext);
        this.timerNext = setTimeout(() => {
          console.log(`玩家${user.uid}掉线后10s倒计时结束，自动放弃`)
          this.doAction(user.uid, 4, { chip: this.game.chip });
        }, 10 * 1000);
      } else {
        console.log(`玩家${user.uid}操作超时，自动放弃`)
        this.doAction(user.uid, 4, { chip: this.game.chip });
      }
    }, timeCost);
    if (user) {
      console.log(`轮转到${user.uid}执行操作`)
    }
    socketManager.sendMsgByUidList(this.uidList, "POWER", {
      timeEnd,
      currentSeat: this.game.currentSeat,
      chip: this.game.chip
    });
  }
  timestampNext = 0;
  timerNext = null;
  sort(list) {
    return list.sort((a, b) => {
      let sumA = this.getSumExpFirst(a.ballList);
      let sumB = this.getSumExpFirst(b.ballList);

      let funcCheck2 = () => {
        // B爆点或者认输了，继续比大小
        if (b.ballList.length > a.ballList.length) {
          // B球多 B大
          return 1;
        } else if (b.ballList.length == a.ballList.length) {
          // 一样多的球 第一个球谁大就谁大
          let maxB = Math.max(...b.ballList.slice(1, b.ballList.length));
          let maxA = Math.max(...a.ballList.slice(1, a.ballList.length));
          return maxB > maxA ? 1 : -1;
        } else {
          // B球少 B小
          return -1;
        }
      };
      let funcCheck1 = () => {
        // B没有公开球爆点或者认输
        if (totalB > totalA) {
          // 如果总和B大 B获胜
          return 1;
        } else if (totalB == totalA) {
          if (b.ballList.length > a.ballList.length) {
            return 1;
          } else if (b.ballList.length == a.ballList.length) {
            // 一样多的球 第一个球谁大就谁大
            let maxB = Math.max(...b.ballList.slice(1, b.ballList.length));
            let maxA = Math.max(...a.ballList.slice(1, a.ballList.length));
            return maxB > maxA ? 1 : -1;
          } else {
            return -1;
          }
        } else {
          return -1;
        }
      };
      let totalA = Util.sum(a.ballList);
      let totalB = Util.sum(b.ballList);
      if (sumA > 28 || a.isLose) {
        // A公开球爆点或者认输
        if (sumB < 28 && !b.isLose) {
          // B没有爆点或者认输,B大
          return 1;
        } else {
          return funcCheck2();
        }
      } else {
        // A没有公开求爆点或者认输
        if (sumB < 28 && !b.isLose) {
          if (totalA > 28) {
            // A总球数爆点
            if (totalB > 28) {
              // B总球数也爆点了
              return funcCheck2();
            } else {
              // B总球没有爆点 B大
              return 1;
            }
          } else {
            // A总球没有爆点
            if (totalB > 28) {
              // B总球爆点 A大
              return -1;
            } else {
              return funcCheck1();
            }
          }
        } else {
          return -1;
        }
      }
    });
  }
  getSumUntilRound(min, max) {
    let sum = 0;
    this.userList.forEach(user => {
      sum += Util.sum(user.deskList.slice(min, max));
    });
    return sum;
  }
  winner: any = {};
  ballsOpen = false;
  showBalls(uid) {
    if (uid != this.winner.uid || this.ballsOpen) {
      return;
    }
    this.ballsOpen = true;
    console.log(`${uid}亮球`)
    socketManager.sendMsgByUidList(this.uidListLastRound, "SHOW_BALLS", {
      winner: this.winner,
      dataGame: this.getRoomInfo()
    });
  }
  getDeskAll() {
    let sum = 0;
    this.userList.forEach(e => {
      sum += Util.sum(e.deskList);
    });
    return sum;
  }
  getUserCanPlay() {
    return this.userList.filter(
      e => !e.isLose && this.getSumExpFirst(e.ballList) < 28
    );
  }
  async checkFinish(turnFinish) {
    let isFinish = false;
    // 15轮结束
    let roundFinish = this.game.round > 15;
    let isLose =
      this.userList.filter(
        e => !e.isLose && this.getSumExpFirst(e.ballList) < 28
      ).length <= 1;
    let onlyOneNotAllin =
      turnFinish &&
      this.userList.filter(e => !this.roundAllIn[e.uid]).length <= 1;
    isFinish = roundFinish || isLose || onlyOneNotAllin;
    if (!isFinish) {
      return false;
    }
    if (roundFinish) {
      console.log('15轮结束，结算')
    } else if (isLose) {
      console.log('只剩一个人没有认输，结算')
    } else if (onlyOneNotAllin) {
      console.log('只剩一个人没有allin，结算')
    }
    this.uidListLastRound = [].concat(this.uidList);
    // 排除掉认输或者公开球爆点的
    let listSort = this.sort(
      this.userList.filter(e => {
        let sum = this.getSumExpFirst(e.ballList);
        return sum < 28 && !e.isLose;
      })
    );
    let winnerUser = listSort[0];
    let uu2 = listSort[1];
    let winner = {
      total: Util.sum(winnerUser.ballList),
      balls: winnerUser.ballList,
      uid: winnerUser.uid,
      mapGain: {}
    };
    this.winner = winner;
    console.log('最终球排序:', listSort);
    let roundAllIn1 = this.roundAllIn[winner.uid];
    let chipTotalInDesk = this.getDeskAll();
    if (roundAllIn1) {
      // 赢家allin 剩余两家大的拿剩下的钱
      let max1 = this.getSumUntilRound(0, roundAllIn1);
      let chipLeft = chipTotalInDesk - max1;
      // 先给赢家能拿的最大金额
      // 多出来的钱继续pk
      if (chipLeft > 0 && uu2) {
        // 如果有多的钱而且存在其他公开球不爆点且没认输的玩家
        winner.mapGain[winner.uid] = max1;
        winner.mapGain[uu2.uid] = chipLeft;
      } else {
        // 没有多的钱 或者 不存在其他公开球不爆点且没认输的玩家  直接给他钱
        winner.mapGain[winner.uid] = chipTotalInDesk;
      }
    } else {
      // 赢家没有allin过 直接给他钱
      winner.mapGain[winner.uid] = chipTotalInDesk;
    }
    if (roundFinish) {
      this.showBalls(winner.uid);
    }
    this.resetGameInfo();
    for (let uu in winner.mapGain) {
      this.changeMoney(uu, winner.mapGain[uu], 10000);
    }
    socketManager.sendMsgByUidList(this.uidListLastRound, "FINISH", {
      winner,
      dataGame: this.getRoomInfo()
    });
    this.userList.forEach(e => {
      console.log(`${e.uid}当前金币数量:`, e.coin)
    })
    return true;
  }
  async throwMoney(uid, num, tag) {
    let dataUser = this.userList.find(e => e.uid == uid);
    if (dataUser.coin == 0) {
      return;
    }
    let nn = num;
    if (dataUser.coin <= num) {
      nn = dataUser.coin;
      this.changeMoney(uid, -dataUser.coin, tag);
      this.roundAllIn[uid] = this.game.round;
    } else {
      this.changeMoney(uid, -num, tag);
    }
    let uu = this.getUserById(uid);
    if (!uu.deskList) {
      uu.deskList = [];
    }
    uu.deskList.push(nn);
    this.game.deskList.push(num);
    socketManager.sendMsgByUidList(this.uidList, "THROW_MONEY", {
      uid,
      num
    });
  }
  async changeMoney(uid, num, tag) {
    // 修改玩家金币
    let dataUser = this.userList.find(e => e.uid == uid);
    if (!dataUser) {
      console.log('异常：未查找到玩家信息', uid)
      return
    }
    dataUser.coin += num;
    if (dataUser.coin < 0) {
      // 二次防止金币扣成负数
      dataUser.coin = 0;
    }
    await SocketServer.setUserInfo({
      tag,
      uid: uid,
      type: num > 0 ? "add" : "sub",
      gold: Math.abs(num),
      diamond: 0,
      reason: "桌球28游戏"
    });
    let user = this.getUserById(uid);
    user.coin = dataUser.coin;
    socketManager.sendMsgByUidList(
      this.uidList,
      PROTOCLE.SERVER.ROOM_USER_UPDATE,
      {
        userList: this.userList
      }
    );
  }
  getNextSeat() {
    let userCurrent = this.userList.find(e => e.seat == this.game.currentSeat);
    let idx = this.userList.indexOf(userCurrent);
    let idxNext = (idx + 1) % this.userList.length;

    let user = this.userList[idxNext];
    // 爆点或者放弃的，跳过
    if (user.isLose || this.getSumExpFirst(user.ballList) >= 28) {
      idxNext = (idxNext + 1) % this.userList.length;
    }
    return this.userList[idxNext].seat;
  }
  getSumExpFirst(list: number[]) {
    let sum = 0;
    list.forEach((num, i) => {
      if (i != 0) {
        sum += num;
      }
    });
    return sum;
  }
  // 获取全服房间内游戏数据
  getRoomInfo() {
    let info: any = {
      isInRoom: true,
      gameInfo: {
        config: this.config,
        step: this.step,
        level: this.level,
        listUser: this.userList,
        gameInfo: this.game
      }
    };
    return info;
  }
}
