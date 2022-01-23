import Util from "../Util";
import socketManager from "..";
import _ from "lodash";
import PROTOCLE from "../config/PROTOCLE";
import ModelConfigRoom from "../../models/ModelConfigRoom";
import ModelUser from "../../models/ModelUser";
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
    timeEnd: 0
  }
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
    let dataUser = await ModelUser.findOne({ uid: userInfo.uid });
    if (dataUser.coin > this.config.max) {
      socketManager.sendErrByUidList([userInfo.uid], "match", {
        msg: "金币大于该房间上限"
      });
      return
    } if (dataUser.coin < this.config.min) {
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
    return
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
      setTimeout(() => {
        this.addTimerToLeave(user.uid)
      }, 7000);
    })
  }
  config: any;
  async doStartGame() {
    // 重置游戏数据
    this.step = 1;
    // 分发私有球
    for (let i = 1; i < this.userList.length + 1; i++) {
      let userInfo = this.userList.find(e => e.seat == i)
      if (!userInfo.ballList) {
        userInfo.ballList = []
      }
      userInfo.ballList.push(Util.getRandomInt(1, 15));
    }
    this.game.chip = this.config.basicChip;
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
    let userInDB = await ModelUser.findOne({ uid });
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
      if (this.game.ballLeft.length <= 0) {
        return
      }
      // 要球
      let ballIdx = Util.getRandomInt(0, this.game.ballLeft.length)

      if (userInDB.tagCheat) {
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
      this.throwMoney(uid, this.game.chip);
      await Util.delay(200);
    } else if (type == 3) {
      // 不要球
      this.throwMoney(uid, this.game.chip);
    } else if (type == 4) {
      // 放弃
      user.isLose = true;
      socketManager.sendMsgByUidList(
        this.uidList,
        'GIVEUP',
        { uid });
    }
    this.game.count++;
    this.callNextTurn(this.getNextSeat())
    socketManager.sendMsgByUidList(
      this.uidList,
      'ACTION',
      {
        dataGame: this.getRoomInfo(),
        uid, type, data
      });
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
      // 超时自动选择不要球
      let user = this.userList.find(e => e.seat == this.game.currentSeat)
      if (user) {
        this.doAction(user.uid, 3)
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
  checkFinish() {
    let isFinish = false;
    // 15轮结束
    let roundFinish = this.game.count >= 14 * this.userList.length;
    let allGiveup = this.userList.filter(e => !e.isLose).length <= 1;
    // 三人爆点
    let allBoom = this.userList.filter(e => this.getSumExpFirst(e.ballList) <= 28).length <= 1;
    isFinish = roundFinish || allGiveup || allBoom;
    let winner = { total: 0, balls: [], uid: 0, gain: 0 };
    this.userList
      .filter(e => !e.isLose)
      .forEach(user => {
        console.log(user, 'uuuu', winner)
        let total = Util.sum(user.ballList);
        let flag = false
        let isLonger = user.ballList.length > winner.balls.length;
        if (winner.balls.length == 0) {
          flag = true;
        } else if (winner.total > 28) {
          if (total <= 28) {
            flag = true
          } else {
            flag = isLonger
          }
        } else {
          if (total <= 28) {
            if (total > winner.total) {
              flag = true;
            } else if (total == winner.total) {
              if (user.ballList.length > winner.balls.length) {
                flag = true
              } else if (user.ballList.length == winner.balls.length) {
                let list1 = [].concat(winner.balls);
                list1.shift()
                let list2 = [].concat(user.ballList);
                list2.shift()
                let max1 = Math.max(...list1);
                let max2 = Math.max(...list2);
                flag = max2 > max1
              }
            }
          }
        }
        if (flag) {
          winner = {
            total,
            balls: user.ballList,
            uid: user.uid,
            gain: 0
          }
        }
      })
    winner.gain = Util.sum(this.game.deskList);
    if (isFinish) {
      this.resetGameInfo()
      this.changeMoney(winner.uid, winner.gain)
      socketManager.sendMsgByUidList(
        this.uidList,
        'FINISH',
        {
          winner,
          dataGame: this.getRoomInfo()
        });
    }
    return isFinish
  }
  async throwMoney(uid, num) {
    let dataUser = await ModelUser.findOne({ uid });
    if (dataUser.coin == 0) {
      return
    }
    if (dataUser.coin <= num) {
      this.changeMoney(uid, -dataUser.coin)
    } else {
      this.changeMoney(uid, -num)
    }
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
    let dataUser = await ModelUser.findOne({ uid });
    dataUser.coin += num;
    await ModelUser.updateOne({ uid }, { coin: dataUser.coin })
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
    if (user.isLose || this.getSumExpFirst(user.ballList) > 28) {
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
