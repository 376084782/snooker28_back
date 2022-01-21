import { Schema, model } from 'mongoose';

const ModelUser = new Schema({
  // 拥有的金币
  coin: { type: Number, default: 100000 },
  // 累计收益
  gainTotal: { type: Number, default: 0 },
  // 是否加入小黑屋
  isInBlackRoom: { type: Boolean, default: false },
  // uid
  uid: { type: Number, default: 0 },
  // 玩家名称
  nickname: { type: String, default: '' },
  // 玩家头像
  avatar: { type: String, default: '' },
})

export default model('user', ModelUser);