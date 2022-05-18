import API from "../api/API";
import ModelConfigRoom from "../models/ModelConfigRoom";
import ModelUser from "../models/ModelUser";
import socketManager from "../socket";
import TrackingManager from "../socket/controller/TrackingManager";
import SocketServer from "../socket/SocketServer";
import axios from 'axios'
var settoken = require('../utils/token_vertify');

var express = require("express");
var router = express.Router();
/* GET home page. */

router.post('/login', async function (req, res, next) {
  let data = req.body;
  if (data.password == 'snooker123456' && data.username == 'snooker28_admin') {
    // 登录成功
    settoken.setToken(data.username, data._id).then((data) => {
      return res.json({ code: 0, data: { accessToken: data } });
    })
  } else {
    // 密码错误 登录失败
    return res.json({ code: 2000, msg: '密码错误，登录失败' });
  }
});

router.get("/user/track", async (req, res, next) => {
  let data = req.query;
  await TrackingManager.checkClearGain(data.uid)
  let userInfo: any = await ModelUser.findOne({ uid: data.uid });
  if (!userInfo) {
    await ModelUser.create({ uid: data.uid })
  }
  res.send({
    code: 0, data: userInfo
  });
});

router.post("/hall/check_in_game", async (req, res, next) => {
  let data = req.body;
  let gameId: any = await socketManager.checkInGame(data.uid);
  res.send({
    code: 0, data: { gameId }
  });
});
router.post("/server/socket/test", async (req, res, next) => {
  let data = req.body;
  let conf: any = await SocketServer.sendMsg(data);
  res.send({
    code: 0, data: conf
  });
});
router.post("/room/update", async (req, res, next) => {
  let data = req.body;
  let conf: any = await ModelConfigRoom.updateOne({ id: data.id }, data);
  res.send({
    code: 0, data: conf
  });
});
router.get("/room/list", async (req, res, next) => {
  let data = req.query;
  let conf: any = await ModelConfigRoom.find({});
  let listRes = []
  conf.forEach(e => {
    listRes.push({
      chipList: JSON.parse(e.chipList),
      name: e.name,
      id: e.id,
      basicChip: e.basicChip,
      teaMoney: e.teaMoney,
      min: e.min,
      max: e.max,
      count: socketManager.getCountByRoomLev(e.id)
    })
  });
  res.send({
    code: 0, data: listRes
  });
});

router.post("/user/kick", async (req, res, next) => {
  let { uid } = req.body;
  let rr = await socketManager.doKick(uid);
  res.send(rr);
});
router.get("/user/online/count", async (req, res, next) => {
  let num = await socketManager.getOnlineNum();
  res.send({
    code: 0,
    data: num
  });
});
router.post("/user/list", async (req, res, next) => {
  let { pageSize, page, userName } = req.body;
  let list: any = await SocketServer.getUserList(pageSize, page, userName)
  res.send({ code: 0, data: list });
});

router.post("/asset/rank", async (req, res, next) => {
  let { tag, date, timeType } = req.body;
  console.log(tag, date, timeType)
  let data = await SocketServer.sendMsg({
    method: "GetAssetRank",
    args: [],
    kwargs: {
      tag, date, timeType
    }
  });
  res.send({ code: 0, data: data });
});


router.post("/user/toggleCheat", async (req, res, next) => {
  let { uid, flag } = req.body;
  await SocketServer.setUserTag(uid, flag);
  res.send({ code: 0 });
});

router.get("/avatar", async (req, res, next) => {
  let data = req.query;
  try {

    let result = (await SocketServer.getAvatar(data.uid)) as any;
    res.send({ code: 0, data: { src: result } });
  } catch (e) {
    res.send({ code: 0, data: { src: '' } });
  }
});

router.post("/getIsOpen", async (req, res, next) => {
  let data = req.body;
  res.send({ code: 0, data: socketManager.isOpen });
});
router.post("/toggleOpen", async (req, res, next) => {
  let data = req.body;
  socketManager.isOpen = !!data.isOpen;
  res.send({ code: 0 });
});

module.exports = router;
