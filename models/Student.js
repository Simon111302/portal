const mongoose = require('mongoose');
const StudentSchema = new mongoose.Schema({email:String,password:String,name:String});
StudentSchema.index({email:1});
module.exports = mongoose.model('Student', StudentSchema);
