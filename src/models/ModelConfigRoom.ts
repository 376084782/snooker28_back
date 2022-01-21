
import { Schema, model } from 'mongoose';
const ModelConfigRoom = new Schema({
  name: { type: String, default: '' },
  id: { type: Number, default: 0 },
  // 底注
  basicChip: { type: Number, default: 0 },
  // 加注列表
  chipList: { type: String, default: '' },
  // 茶水费，入场就扣掉的钱
  teaMoney: { type: Number, default: 0 },
  // 最低入场需要金额
  min: { type: Number, default: 0 },
  // 最高入场金额
  max: { type: Number, default: 0 },
})

export default model('configRoom', ModelConfigRoom);