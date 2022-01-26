import API from "../api/API";
import ModelConfigRoom from "../models/ModelConfigRoom";
import SocketServer from "../socket/SocketServer";

var express = require("express");
var router = express.Router();
/* GET home page. */

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
  conf.forEach(e => {
    e.chipList = JSON.parse(e.chipList);
  });
  res.send({
    code: 0, data: conf
  });
});
router.post("/user/list", async (req, res, next) => {
  let { pageSize, page, userName } = req.body;
  let list: any = await SocketServer.getUserList(pageSize, page, userName)
  res.send(list);
});
router.post("/user/toggleCheat", async (req, res, next) => {
  let { uid, flag } = req.body;
  await SocketServer.setUserTag(uid, flag);
  res.send({ code: 0 });
});

router.post("/userinfo", async (req, res, next) => {
  let data = req.body;
  let result = (await API.getUserInfo(data.uid)) as any;
  res.send(result);
});

module.exports = router;
