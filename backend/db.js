const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/studentportal'; // Use Atlas URI from Compass

let client;
async function connectDB() {
  if (client) return client;
  client = new MongoClient(uri);
  await client.connect();
  console.log('MongoDB connected');
  return client.db('SIS');

module.exports = connectDB;
