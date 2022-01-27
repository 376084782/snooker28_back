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
    ballLeft: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    deskList: [],
    currentSeat: 0,
    chip: 20000,
    timeEnd: 0,
    round: 1
  }
  roundAllIn = {}
  maxRound = 15;

  // 存当前在游戏中的uid列表
  get uidList() {
    return this.userList.map(e => e.uid);
  }
  userList = [];

  constructor({ level }) {
    this.roomId = Util.getUniqId();
    this.level = level;

    this.step = 0;
    this.resetGameInfo()
  }
  async initConfig() {
    let config = await ModelConfigRoom.findOne({ id: this.level })

    this.config = {
      name: config.name,
      id: config.id,
      basicChip: config.basicChip,
      chipList: JSON.parse(config.chipList),
      teaMoney: config.teaMoney,
      min: config.min,
      max: config.max,

    }
  }


  // 玩家离开
  leave(uid) {
    if (this.step > 0) {
      return
    }
    clearTimeout(this.timerJoin[uid])
    socketManager.sendMsgByUidList([uid], PROTOCLE.SERVER.GO_HALL, {});
    this.userList = this.userList.filter(user => user.uid != uid);
    socketManager.sendMsgByUidList(this.uidList, PROTOCLE.SERVER.ROOM_USER_UPDATE, {
      userList: this.userList
    });
    this.checkCanStart()
  }
  timerJoin = {};
  // 玩家加入
  async join(userInfo) {
    if (userInfo.coin > this.config.max) {
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "金币大于该房间上限"
      });
      return
    } if (userInfo.coin < this.config.min) {
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "金币不足"
      });
      return
    }
    if (this.uidList.indexOf(userInfo.uid) > -1) {
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "玩家已经在房间内"
      });
      return
    }
    let blankSeat = this.getBlankSeat();
    if (blankSeat == 0) {
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "房间已满"
      });
      return
    }
    userInfo.seat = blankSeat
    this.userList.push(userInfo);
    socketManager.sendMsgByUidList(this.uidList, PROTOCLE.SERVER.ROOM_USER_UPDATE, {
      userList: this.userList
    });
    socketManager.sendMsgByUidList([userInfo.uid],
      PROTOCLE.SERVER.GO_GAME, {
      dataGame: this.getRoomInfo()
    });
    this.addTimerToLeave(userInfo.uid)
  }
  getBlankSeat() {
    for (let i = 1; i < 4; i++) {
      if (!this.userList.find(e => e.seat == i)) {
        return i
      }
    }
    return 0
  }

  checkInRoom(uid) {
    return this.uidList.indexOf(uid) > -1;
  }

  getUserById(uid) {
    return this.userList.find(e => e.uid == uid)
  }
  addTimerToLeave(uid) {
    // return
    this.timerJoin[uid] = setTimeout(() => {
      // 十秒内不准备，踢出房间
      this.leave(uid);
    }, 10000);
  }
  changeReady(uid, flag) {
    if (flag) {
      clearTimeout(this.timerJoin[uid])
    } else {
      this.addTimerToLeave(uid)
    }
    let userInfo = this.getUserById(uid);
    if (userInfo) {
      userInfo.ready = flag;
      socketManager.sendMsgByUidList(
        this.uidList,
        PROTOCLE.SERVER.ROOM_USER_UPDATE,
        {
          userList: this.userList
        });
    }
    this.checkCanStart()
  }
  checkCanStart() {
    // 如果都准备了 开始游戏
    if (!this.userList.find(e => !e.ready) && this.userList.length >= 2 && this.step == 0) {
      this.step = 2;
      this.game.timeStart = new Date().getTime() + 5000
      socketManager.sendMsgByUidList(this.uidList, 'BEFORE_START', {
        timeStart: this.game.timeStart
      });
      setTimeout(() => {
        this.doStartGame()
      }, 5000);
    }
  }
  resetGameInfo() {
    clearTimeout(this.timerNext)
    this.flagCanDoAction = false;
    this.step = 0;
    this.roundAllIn = {}
    this.game = {
      count: 0,
      ballLeft: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      deskList: [],
      currentSeat: 0,
      chip: 0,
      timeEnd: 0
    }
    this.userList.forEach(user => {
      user.ballList = []
      user.ready = false;
      user.isLose = false;
      user.deskList = []
      setTimeout(() => {
        this.addTimerToLeave(user.uid)
      }, 7000);
    })
  }
  config: any;
  async doStartGame() {
    await this.initConfig()
    this.ballsOpen = false;
    this.winner = {}
    // 重置游戏数据
    this.step = 1;
    // 分发私有球
    this.userList.forEach(userInfo => {
      if (!userInfo.ballList) {
        userInfo.ballList = []
      }
      userInfo.ballList.push(Util.getRandomInt(1, 10));
    })
    this.game.chip = this.config.basicChip;


    for (let i = 0; i < this.userList.length; i++) {
      let user = this.userList[i];
      this.changeMoney(user.uid, -this.config.teaMoney)
    }
    // 随机开始座位
    socketManager.sendMsgByUidList(
      this.uidList,
      'START_GAME',
      {
        chip: this.config.basicChip,
        dataGame: this.getRoomInfo()
      });
    this.game.count += this.userList.length;
    setTimeout(() => {
      // 扣除底注
      for (let i = 0; i < this.userList.length; i++) {
        let user = this.userList[i];
        this.throwMoney(user.uid, this.config.basicChip);
      }
      setTimeout(() => {
        this.flagCanDoAction = true;
        let idx = Util.getRandomInt(0, this.userList.length)
        this.callNextTurn(this.userList[idx].seat)
        socketManager.sendMsgByUidList(
          this.uidList,
          'ACTION',
          {
            dataGame: this.getRoomInfo(),
          });
      }, 2000);
    }, 1000);

  }
  flagCanDoAction = true;
  async doAction(uid, type, data?) {
    let user = this.getUserById(uid);
    let chipBefore = this.game.chip;

    if (user.seat != this.game.currentSeat || !this.flagCanDoAction) {
      return
    }
    this.flagCanDoAction = false

    user.lastAction = type;
    if (type == 1) {
      if (data.chip >= user.coin) {
        return
      }
      // 加注
      this.game.chip = data.chip;
      this.throwMoney(uid, data.chip);
    } else if (type == 2) {
      this.game.chip = data.chip;

      if (this.game.ballLeft.length <= 0) {
        return
      }
      // 要球
      let ballIdx = Util.getRandomInt(0, this.game.ballLeft.length)

      if (user.tagCheat) {
        let p = Math.random() < .7;
        if (p) {
          // 高概率使现在的球相加=25至28
          for (let i = 0; i < this.game.ballLeft.length; i++) {
            let nn = this.game.ballLeft[i]
            let ss = Util.sum(user.ballList) + nn
            if (ss <= 28 && ss >= 25) {
              ballIdx = i
            }
          }
        }
      }
      let ball = this.game.ballLeft.splice(ballIdx, 1)[0];
      user.ballList.push(ball);
      socketManager.sendMsgByUidList(
        this.uidList,
        'GET_BALL',
        {
          ball,
          uid,
          listNew: user.ballList,
          ballLeft: this.game.ballLeft
        });
      await Util.delay(600);
      this.throwMoney(uid, data.chip);
      await Util.delay(200);
    } else if (type == 3) {
      this.game.chip = data.chip;
      // 不要球
      this.throwMoney(uid, data.chip);
    } else if (type == 4) {
      // 放弃
      user.isLose = true;
      socketManager.sendMsgByUidList(
        this.uidList,
        'GIVEUP',
        { uid });
    }
    this.game.count++;
    socketManager.sendMsgByUidList(
      this.uidList,
      'ACTION',
      {
        dataGame: this.getRoomInfo(),
        uid, type, data, chipBefore
      });
    this.callNextTurn(this.getNextSeat())
    let isFinish = this.checkFinish();
    if (isFinish) {
    } else {
      await Util.delay(200);
      this.flagCanDoAction = true
    }
  }
  callNextTurn(seat) {
    let timeCost = 10000
    let timeEnd = new Date().getTime() + timeCost
    clearTimeout(this.timerNext);
    this.timerNext = setTimeout(() => {
      // 超时自动选择  第一轮自动要球 之后自动不要球
      let user = this.userList.find(e => e.seat == this.game.currentSeat)
      if (user) {
        this.doAction(user.uid, this.game.count <= this.userList.length ? 2 : 3, { chip: this.game.chip })
      }
    }, timeCost);
    this.game.currentSeat = seat;
    this.game.timeEnd = timeEnd
    socketManager.sendMsgByUidList(
      this.uidList,
      'POWER',
      {
        timeEnd,
        currentSeat: this.game.currentSeat,
        chip: this.game.chip
      });
  }
  timerNext = null;
  sort(list) {
    return list.sort((a, b) => {
      let sumA = this.getSumExpFirst(a.ballList);
      let sumB = this.getSumExpFirst(b.ballList);

      let funcCheck2 = () => {
        // B爆点或者认输了，继续比大小
        if (b.ballList.length > a.ballList.length) {
          // B球多 B大
          return 1
        } else if (b.ballList.length == a.ballList.length) {
          // 一样多的球 第一个球谁大就谁大
          return b.ballList[0] > a.ballList[0] ? 1 : -1
        } else {
          // B球少 B小
          return -1
        }
      }
      let funcCheck1 = () => {
        // B没有公开球爆点或者认输
        if (totalB > totalA) {
          // 如果总和B大 B获胜
          return 1
        } else if (totalB == totalA) {
          if (b.ballList.length > a.ballList.length) {
            return 1
          } else if (b.ballList.length == a.ballList.length) {
            return b.ballList[0] > a.ballList[0] ? 1 : -1
          } else {
            return -1
          }
        } else {
          return -1
        }
      }
      let totalA = Util.sum(a.ballList);
      let totalB = Util.sum(b.ballList);
      if (sumA > 28 || a.isLose) {
        // A公开球爆点或者认输
        if (sumB < 28 && !b.isLose) {
          // B没有爆点或者认输,B大
          return 1
        } else {
          return funcCheck2()
        }
      } else {
        // A没有公开求爆点或者认输
        if (sumB < 28 && !b.isLose) {
          if (totalA > 28) {
            // A总球数爆点
            if (totalB > 28) {
              // B总球数也爆点了
              return funcCheck2()
            } else {
              // B总球没有爆点 B大
              return 1
            }
          } else {
            // A总球没有爆点
            if (totalB > 28) {
              // B总球爆点 A大
              return -1
            } else {
              return funcCheck1()
            }
          }
        } else {
          return -1
        }
      }
    })
  }
  getSumUntilRound(min, max) {
    let sum = 0;
    this.userList.forEach(user => {
      sum += Util.sum(user.deskList.slice(min, max))
    })
    return sum
  }
  winner: any = {}
  ballsOpen = false;
  showBalls(uid) {
    if (uid != this.winner.uid || this.ballsOpen) {
      return
    }
    this.ballsOpen = true
    console.log('SHOW_BALLS')
    socketManager.sendMsgByUidList(
      this.uidList,
      'SHOW_BALLS',
      {
        winner: this.winner,
        dataGame: this.getRoomInfo()
      });
  }
  getDeskAll() {
    let sum = 0;
    this.userList.forEach(e => {
      sum += Util.sum(e.deskList)
    })
    return sum
  }
  checkFinish() {
    let isFinish = false;
    // 15轮结束
    let roundFinish = this.game.count >= 14 * this.userList.length;
    let isLose = this.userList.filter(e => !e.isLose && this.getSumExpFirst(e.ballList) < 28).length <= 1;
    let turnFinish = this.game.count % this.userList.length == 0;
    let onlyOneNotAllin = turnFinish && this.userList.filter(e => !this.roundAllIn[e.uid]).length <= 1
    isFinish = roundFinish || isLose || onlyOneNotAllin;
    if (!isFinish) {
      return false
    }

    // 排除掉认输或者公开球爆点的
    // let listSort = this.sort(this.userList.filter(e => {
    //   let sum = this.getSumExpFirst(e.ballList);
    //   return sum < 28 && !e.isLose
    // }))
    let listSort = this.sort(this.userList)
    let winnerUser = listSort[0]
    let uu2 = listSort[1];
    let winner = {
      total: Util.sum(winnerUser.ballList),
      balls: winnerUser.ballList,
      uid: winnerUser.uid,
      mapGain: {}
    }
    this.winner = winner
    console.log(listSort, 'listSort')

    let roundAllIn1 = this.roundAllIn[winner.uid]
    let chipTotalInDesk = this.getDeskAll()
    if (roundAllIn1) {
      // 赢家allin 剩余两家大的拿剩下的钱
      let max1 = this.getSumUntilRound(0, roundAllIn1 + 1)
      let chipLeft = chipTotalInDesk - max1
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
      winner.mapGain[winner.uid] = chipTotalInDesk
    }
    if (roundFinish) {
      this.showBalls(winner.uid)
    }
    this.resetGameInfo()
    for (let uu in winner.mapGain) {
      this.changeMoney(uu, winner.mapGain[uu])
    }
    socketManager.sendMsgByUidList(
      this.uidList,
      'FINISH',
      {
        winner,
        dataGame: this.getRoomInfo()
      });

    return true
  }
  async throwMoney(uid, num) {
    let dataUser = this.userList.find(e => e.uid == uid)
    if (dataUser.coin == 0) {
      return
    }
    let nn = num
    if (dataUser.coin <= num) {
      nn = dataUser.coin
      this.changeMoney(uid, -dataUser.coin)
      this.roundAllIn[uid] = Math.floor(this.game.count / this.userList.length)
    } else {
      this.changeMoney(uid, -num)
    }
    let uu = this.getUserById(uid);
    if (!uu.deskList) {
      uu.deskList = []
    }
    uu.deskList.push(nn)
    this.game.deskList.push(num);
    socketManager.sendMsgByUidList(
      this.uidList,
      'THROW_MONEY',
      {
        uid, num
      });
  }
  async changeMoney(uid, num) {
    // 修改玩家金币
    let dataUser = this.userList.find(e => e.uid == uid)
    dataUser.coin += num;
    await SocketServer.setUserInfo({
      uid: uid, type: num > 0 ? 'add' : 'sub', gold: Math.abs(num), diamond: 0, reason: '桌球28游戏'
    })
    let user = this.getUserById(uid);
    user.coin = dataUser.coin;
    socketManager.sendMsgByUidList(this.uidList, PROTOCLE.SERVER.ROOM_USER_UPDATE, {
      userList: this.userList
    });
  }
  getNextSeat() {
    let userCurrent = this.userList.find(e => e.seat == this.game.currentSeat)
    let idx = this.userList.indexOf(userCurrent)
    let idxNext = (idx + 1) % (this.userList.length);

    let user = this.userList[idxNext];
    // 爆点或者放弃的，跳过
    if (user.isLose || this.getSumExpFirst(user.ballList) >= 28) {
      idxNext = (idxNext + 1) % (this.userList.length);
    }
    return this.userList[idxNext].seat;
  }
  getSumExpFirst(list: number[]) {
    let sum = 0;
    list.forEach((num, i) => {
      if (i != 0) {
        sum += num
      }
    })
    return sum
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
      },
    };
    return info;
  }
}
