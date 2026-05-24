const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');

const adapter = new JSONFile(path.join(__dirname, '../db.json'));
const db = new Low(adapter, { keys: {} });

module.exports = db;